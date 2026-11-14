import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve, type ServerType } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, createSessions, staticToken } from "../src/index.js";
import { git } from "../src/providers/git/index.js";
import {
  gitEnv,
  gitUpstream,
  runGit,
  type GitResult,
} from "./fixtures/git-upstream.js";

const REAL_TOKEN = "real-git-host-token";
const PREFIX = "Error for waterlock proxy: ";
const sessions = createSessions({ signingKey: "x".repeat(32) });

let up: Awaited<ReturnType<typeof gitUpstream>>;
let server: ServerType;
let base: string;
let home: string;
let env: NodeJS.ProcessEnv;

beforeAll(async () => {
  up = await gitUpstream(["acme/app", "acme/secret"]);
  const gw = createGateway({
    providers: [
      git({
        upstream: up.url,
        credentials: staticToken({ token: REAL_TOKEN }),
      }),
    ],
    policy: [
      { when: (r) => r.action === "git.fetch" && r.params.repo === "acme/app" },
      {
        when: (r) =>
          r.action === "git.push" &&
          r.params.repo === "acme/app" &&
          r.session.agent !== "reader",
      },
      {
        when: (r) =>
          r.action === "git.push" &&
          r.context.phase === "rpc" &&
          r.context.updates.some((u) => !u.ref.startsWith("refs/heads/agent/")),
        action: "deny",
        reason: "Agents push only to agent/* branches.",
      },
      {
        when: (r) =>
          r.action === "git.push" &&
          r.context.phase === "rpc" &&
          r.context.updates.some((u) => u.kind === "delete"),
        action: "deny",
        reason: "No deleting branches.",
      },
      {
        when: (r) =>
          r.action === "git.push" &&
          r.context.phase === "rpc" &&
          r.context.push_options.includes("ci.skip"),
        action: "deny",
        reason: "CI must run.",
      },
    ],
    sessions,
    // Small on purpose: pushes stream, so a bigger pack still goes through.
    maxBodyBytes: 64 * 1024,
  });
  await new Promise<void>((resolve) => {
    server = serve({ fetch: gw.fetch, port: 0, hostname: "127.0.0.1" }, () =>
      resolve(),
    );
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  home = await mkdtemp(join(tmpdir(), "waterlock-agent-"));
  await writeFile(join(home, ".gitconfig"), "");
  env = gitEnv(home);
});

afterAll(async () => {
  server.close();
  await up.close();
  await rm(home, { recursive: true, force: true });
});

const token = async (agent = "coder") =>
  (await sessions.mint({ provider: "git", agent, onBehalfOf: "user_1" })).token;

/** The agent's git, sending the session token as a Bearer header. */
async function agentGit(args: string[], cwd = home, agent = "coder") {
  return runGit(
    [
      "-c",
      `http.extraHeader=Authorization: Bearer ${await token(agent)}`,
      ...args,
    ],
    { cwd, env },
  );
}

let n = 0;
async function clone(repo = "acme/app", agent = "coder") {
  const dir = join(home, `clone-${n++}`);
  const r = await agentGit(
    ["clone", "-q", `${base}/${repo}.git`, dir],
    home,
    agent,
  );
  return { dir, r };
}

async function commit(dir: string, file: string, content: string | Buffer) {
  await writeFile(join(dir, file), content);
  expect((await runGit(["add", "."], { cwd: dir, env })).code).toBe(0);
  expect(
    (await runGit(["commit", "-q", "-m", file], { cwd: dir, env })).code,
  ).toBe(0);
}

const ok = (r: GitResult) => expect(r, r.stderr).toMatchObject({ code: 0 });

describe("git provider: fetch", () => {
  it("clones an allowed repo; upstream gets the real token, never the session token", async () => {
    up.seen.length = 0;
    const { r } = await clone();
    ok(r);
    expect(up.seen.map((s) => `${s.method} ${s.path}`)).toEqual([
      "GET /acme/app.git/info/refs?service=git-upload-pack",
      "POST /acme/app.git/git-upload-pack",
      ...(up.seen.length > 2 ? ["POST /acme/app.git/git-upload-pack"] : []),
    ]);
    const basic = `Basic ${Buffer.from(`x-access-token:${REAL_TOKEN}`).toString("base64")}`;
    for (const s of up.seen) {
      expect(s.headers.authorization).toBe(basic);
      expect(JSON.stringify(s.headers)).not.toContain("as1.");
    }
  });

  it("protocol v2: the Git-Protocol header reaches upstream", async () => {
    up.seen.length = 0;
    const dir = join(home, `clone-${n++}`);
    ok(
      await agentGit([
        "-c",
        "protocol.version=2",
        "clone",
        "-q",
        `${base}/acme/app.git`,
        dir,
      ]),
    );
    expect(up.seen[0]!.headers["git-protocol"]).toBe("version=2");
  });

  it("a repo the policy doesn't allow: git shows the reason", async () => {
    up.seen.length = 0;
    const { r } = await clone("acme/secret");
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain(`remote: ${PREFIX}no allow rule matched`);
    expect(up.seen).toHaveLength(0);
  });

  it("repo case is normalized: ACME/App is acme/app, ACME/Secret still denied", async () => {
    ok((await clone("ACME/App")).r);
    const { r } = await clone("ACME/Secret");
    expect(r.code).not.toBe(0);
  });

  it("session token as the Basic auth password (credential helper style)", async () => {
    const dir = join(home, `clone-${n++}`);
    const url = new URL(`${base}/acme/app.git`);
    url.username = "agent";
    url.password = await token();
    ok(await runGit(["clone", "-q", url.href, dir], { cwd: home, env }));
  });

  it("no token: 401 with a Basic challenge; git fails without prompting", async () => {
    const r = await runGit(
      ["clone", "-q", `${base}/acme/app.git`, join(home, `clone-${n++}`)],
      { cwd: home, env },
    );
    expect(r.code).not.toBe(0);
    const res = await fetch(
      `${base}/acme/app.git/info/refs?service=git-upload-pack`,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe('Basic realm="waterlock"');
    expect(await res.text()).toBe(
      `${PREFIX}missing or invalid session token\n`,
    );
  });

  it("dumb HTTP and LFS paths are refused", async () => {
    const auth = { authorization: `Bearer ${await token()}` };
    for (const path of [
      "/acme/app.git/info/refs",
      "/acme/app.git/HEAD",
      "/acme/app.git/objects/info/packs",
      "/acme/app.git/info/lfs/objects/batch",
      "/acme/app.git/info/refs?service=git-upload-pack&x=1",
      "/acme%2Fapp.git/info/refs?service=git-upload-pack",
    ]) {
      const res = await fetch(`${base}${path}`, { headers: auth });
      expect(res.status, path).toBeGreaterThanOrEqual(400);
      expect(await res.text(), path).toMatch(new RegExp(`^${PREFIX}`));
    }
  });
});

describe("git provider: push", () => {
  it("push to an agent/* branch goes through", async () => {
    const { dir } = await clone();
    await commit(dir, "a.txt", "a\n");
    ok(
      await agentGit(["push", "-q", "origin", "HEAD:refs/heads/agent/a"], dir),
    );
    expect(await up.revParse("acme/app", "refs/heads/agent/a")).toBe(
      (await runGit(["rev-parse", "HEAD"], { cwd: dir, env })).stdout.trim(),
    );
  });

  it("push to main is rejected per ref, with the policy's reason", async () => {
    const before = await up.revParse("acme/app", "main");
    const { dir } = await clone();
    await commit(dir, "b.txt", "b\n");
    const r = await agentGit(["push", "origin", "HEAD:main"], dir);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain(
      `! [remote rejected] HEAD -> main (${PREFIX}Agents push only to agent/* branches.)`,
    );
    expect(await up.revParse("acme/app", "main")).toBe(before);
  });

  it("one denied ref rejects the whole push", async () => {
    const { dir } = await clone();
    await commit(dir, "c.txt", "c\n");
    const r = await agentGit(
      ["push", "origin", "HEAD:refs/heads/agent/c", "HEAD:main"],
      dir,
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain("[remote rejected] HEAD -> agent/c");
    expect(await up.revParse("acme/app", "refs/heads/agent/c")).toBeUndefined();
  });

  it("deleting a branch is denied", async () => {
    const { dir } = await clone();
    await commit(dir, "d.txt", "d\n");
    ok(
      await agentGit(["push", "-q", "origin", "HEAD:refs/heads/agent/d"], dir),
    );
    const r = await agentGit(["push", "origin", ":refs/heads/agent/d"], dir);
    expect(r.stderr).toContain(`(${PREFIX}No deleting branches.)`);
    expect(await up.revParse("acme/app", "refs/heads/agent/d")).toBeDefined();
  });

  it("push options reach the rules", async () => {
    const { dir } = await clone();
    await commit(dir, "e.txt", "e\n");
    const r = await agentGit(
      ["push", "-o", "ci.skip", "origin", "HEAD:refs/heads/agent/e"],
      dir,
    );
    expect(r.stderr).toContain(`(${PREFIX}CI must run.)`);
    ok(
      await agentGit(
        [
          "push",
          "-q",
          "-o",
          "notify=none",
          "origin",
          "HEAD:refs/heads/agent/e",
        ],
        dir,
      ),
    );
  });

  it("a read-only agent is stopped before sending anything", async () => {
    const { dir } = await clone();
    await commit(dir, "f.txt", "f\n");
    up.seen.length = 0;
    const r = await agentGit(
      ["push", "origin", "HEAD:refs/heads/agent/f"],
      dir,
      "reader",
    );
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain(`remote: ${PREFIX}`);
    expect(up.seen).toHaveLength(0);
  });

  it("a pack bigger than maxBodyBytes streams through", async () => {
    const { dir } = await clone();
    await commit(dir, "big.bin", randomBytes(512 * 1024));
    ok(
      await agentGit(
        ["push", "-q", "origin", "HEAD:refs/heads/agent/big"],
        dir,
      ),
    );
    expect(await up.revParse("acme/app", "refs/heads/agent/big")).toBeDefined();
  });
});
