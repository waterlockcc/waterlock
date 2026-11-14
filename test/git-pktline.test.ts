import { describe, expect, it } from "vitest";
import { pushRejected } from "../src/providers/git/errors.js";
import {
  FLUSH,
  parsePushCommands,
  pktLine,
  readPushCommands,
} from "../src/providers/git/pktline.js";
import { concat } from "../src/core/body.js";

const A = "a".repeat(40);
const B = "b".repeat(40);
const Z = "0".repeat(40);
const CAPS = "\0 report-status side-band-64k push-options agent=git/2.50";

const req = (...lines: (string | "flush")[]) =>
  concat(lines.map((l) => (l === "flush" ? FLUSH : pktLine(l))));

describe("parsePushCommands", () => {
  it("reads updates, kinds, capabilities and push options", () => {
    const parsed = parsePushCommands(
      req(
        `${A} ${B} refs/heads/main${CAPS}`,
        `${Z} ${B} refs/heads/new`,
        `${A} ${Z} refs/tags/old\n`,
        "flush",
        "ci.skip",
        "flush",
      ),
    );
    expect(parsed).toEqual({
      updates: [
        { ref: "refs/heads/main", old: A, new: B, kind: "update" },
        { ref: "refs/heads/new", old: Z, new: B, kind: "create" },
        { ref: "refs/tags/old", old: A, new: Z, kind: "delete" },
      ],
      pushOptions: ["ci.skip"],
      capabilities: [
        "report-status",
        "side-band-64k",
        "push-options",
        "agent=git/2.50",
      ],
    });
  });

  it("skips shallow lines before the commands; accepts sha256 ids", () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    expect(
      parsePushCommands(
        req(`shallow ${A}`, `${a} ${b} refs/heads/x\0 report-status`, "flush"),
      )?.updates,
    ).toEqual([{ ref: "refs/heads/x", old: a, new: b, kind: "update" }]);
  });

  it("is undefined until the whole command section has arrived", () => {
    const full = req(`${A} ${B} refs/heads/main${CAPS}`, "flush", "o", "flush");
    for (let i = 0; i < full.length; i++)
      expect(parsePushCommands(full.subarray(0, i))).toBeUndefined();
    expect(parsePushCommands(full)).toBeDefined();
  });

  it.each([
    ["no commands", req("flush")],
    ["signed push", req(`push-cert${CAPS}`, "flush")],
    [
      "first command without capabilities",
      req(`${A} ${B} refs/heads/m`, "flush"),
    ],
    ["bad object id", req(`${A} xyz refs/heads/m${CAPS}`, "flush")],
    [
      "mixed id lengths",
      req(`${A} ${"b".repeat(64)} refs/heads/m${CAPS}`, "flush"),
    ],
    ["both ids zero", req(`${Z} ${Z} refs/heads/m${CAPS}`, "flush")],
    ["extra field", req(`${A} ${B} refs/heads/m extra${CAPS}`, "flush")],
    ["ref outside refs/", req(`${A} ${B} HEAD${CAPS}`, "flush")],
    ["ref with ..", req(`${A} ${B} refs/heads/a..b${CAPS}`, "flush")],
    ["ref with //", req(`${A} ${B} refs/heads//main${CAPS}`, "flush")],
    ["ref ending .lock", req(`${A} ${B} refs/heads/m.lock${CAPS}`, "flush")],
    ["ref with @{", req(`${A} ${B} refs/heads/m@{1}${CAPS}`, "flush")],
    [
      "ref component starting with .",
      req(`${A} ${B} refs/heads/.x${CAPS}`, "flush"),
    ],
    [
      "same ref twice",
      req(`${A} ${B} refs/heads/m${CAPS}`, `${B} ${A} refs/heads/m`, "flush"),
    ],
    ["v2 delim packet", new TextEncoder().encode("0001")],
    ["non-hex length", new TextEncoder().encode("00zz")],
  ])("throws on %s", (_, buf) => {
    expect(() => parsePushCommands(buf)).toThrow();
  });
});

describe("readPushCommands", () => {
  const stream = (chunks: Uint8Array[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const chunk of chunks) c.enqueue(chunk);
        c.close();
      },
    });

  it("reads across chunks and replays the body byte for byte", async () => {
    const commands = req(`${A} ${B} refs/heads/main${CAPS}`, "flush", "flush");
    const pack = new TextEncoder().encode("PACK....rest of the pack");
    const body = concat([commands, pack]);
    const chunks = [
      body.subarray(0, 7),
      body.subarray(7, 60),
      body.subarray(60),
    ];
    const { commands: parsed, forward } = await readPushCommands(
      stream(chunks),
      1024,
    );
    expect(parsed.updates[0]!.ref).toBe("refs/heads/main");
    expect(new Uint8Array(await new Response(forward).arrayBuffer())).toEqual(
      body,
    );
  });

  it("throws when the commands exceed the limit or the body ends early", async () => {
    const commands = req(`${A} ${B} refs/heads/main${CAPS}`, "flush");
    await expect(
      readPushCommands(
        stream([commands.subarray(0, 50), commands.subarray(50)]),
        10,
      ),
    ).rejects.toThrow("too large");
    await expect(
      readPushCommands(stream([commands.subarray(0, 50)]), 1024),
    ).rejects.toThrow("ended");
  });
});

describe("pushRejected", () => {
  const error = {
    status: 403,
    code: "policy_denied",
    message: "Error for waterlock proxy: no\nnewlines",
  };
  const body = async (res: Response) =>
    new TextDecoder().decode(await res.arrayBuffer());

  it("report-status with ng for every ref, inside side-band-64k", async () => {
    const res = pushRejected(
      ["refs/heads/a", "refs/heads/b"],
      ["report-status", "side-band-64k"],
    )(error);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/x-git-receive-pack-result",
    );
    const inner = await body(
      new Response(
        concat([
          pktLine("unpack ok\n"),
          pktLine("ng refs/heads/a Error for waterlock proxy: no newlines\n"),
          pktLine("ng refs/heads/b Error for waterlock proxy: no newlines\n"),
          FLUSH,
        ]),
      ),
    );
    const text = await body(res);
    expect(text.slice(4, 5)).toBe("\x01");
    expect(text.slice(5, -4)).toBe(inner);
    expect(text.endsWith("0000")).toBe(true);
  });

  it("plain report without side-band; plain text without report-status", async () => {
    expect(
      await body(pushRejected(["refs/heads/a"], ["report-status"])(error)),
    ).toMatch(/^000eunpack ok\n.*ng refs\/heads\/a /s);
    const plain = pushRejected(["refs/heads/a"], [])(error);
    expect(plain.status).toBe(403);
    expect(await body(plain)).toBe(`${error.message}\n`);
  });
});
