import { concat } from "../../core/body.js";

/**
 * Git's framing (gitprotocol-common): 4 hex digits of total length, then the
 * data. `0000` is a flush. Lengths 1-3 are special in protocol v2 (`0001`
 * delim, `0002` response end) and never part of a push request.
 */
const MAX_PKT = 65520;
const enc = new TextEncoder();
const utf8 = new TextDecoder("utf-8", { fatal: true });

export const FLUSH = enc.encode("0000");

export function pktLine(data: string | Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  const len = bytes.length + 4;
  if (len > MAX_PKT) throw new Error("pkt-line too long");
  return concat([enc.encode(len.toString(16).padStart(4, "0")), bytes]);
}

/**
 * Side-band channel 1 (gitprotocol-pack): `data` cut into pkt-lines that each
 * start with the band byte, then a flush.
 */
export function sideband(
  data: Uint8Array,
  maxPkt: number,
): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [];
  const room = maxPkt - 5;
  for (let off = 0; off < data.length; off += room)
    parts.push(
      pktLine(concat([Uint8Array.of(1), data.subarray(off, off + room)])),
    );
  return concat([...parts, FLUSH]);
}

export interface GitRefUpdate {
  /** Full ref name, e.g. `refs/heads/main`, `refs/tags/v1`. */
  ref: string;
  /** Object id the client says the ref has now. All zeros on create. */
  old: string;
  /** Object id the ref should point to. All zeros on delete. */
  new: string;
  kind: "create" | "update" | "delete";
}

export interface PushCommands {
  updates: GitRefUpdate[];
  /** `git push -o <option>` values, in order. */
  pushOptions: string[];
  /** What the client asked for, e.g. `report-status`, `side-band-64k`. */
  capabilities: string[];
}

/**
 * Reads the command section of a receive-pack request (gitprotocol-pack):
 *
 *   *shallow  command-list  [push-options]  [packfile]
 *
 * Only the commands are read; the pack is not. Returns the commands and a
 * stream that replays everything read so far, then the rest of the body, so
 * upstream gets the request byte for byte. Throws on anything malformed or
 * unsupported (signed pushes), and when the commands exceed `max` bytes.
 */
export async function readPushCommands(
  body: ReadableStream<Uint8Array>,
  max: number,
): Promise<{ commands: PushCommands; forward: ReadableStream<Uint8Array> }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let read: Uint8Array = new Uint8Array();
  for (;;) {
    const parsed = parsePushCommands(read);
    if (parsed) {
      const head = read;
      const forward = new ReadableStream<Uint8Array>({
        start(c) {
          if (head.length) c.enqueue(head);
        },
        async pull(c) {
          const { done, value } = await reader.read();
          if (done) c.close();
          else c.enqueue(value);
        },
        cancel: (reason) => reader.cancel(reason),
      });
      return { commands: parsed, forward };
    }
    if (read.length > max) throw new Error("push commands too large");
    const { done, value } = await reader.read();
    if (done) throw new Error("push request ended before its commands did");
    chunks.push(value);
    read = concat(chunks);
  }
}

/** Undefined while `buf` doesn't hold the whole command section yet. */
export function parsePushCommands(buf: Uint8Array): PushCommands | undefined {
  let off = 0;
  /** Next pkt-line's text, "flush", or undefined when incomplete. */
  const next = (): string | "flush" | undefined => {
    if (buf.length < off + 4) return undefined;
    const hex = String.fromCharCode(...buf.subarray(off, off + 4));
    if (!/^[0-9a-f]{4}$/.test(hex)) throw new Error("malformed pkt-line");
    const len = parseInt(hex, 16);
    if (len === 0) {
      off += 4;
      return "flush";
    }
    if (len < 5 || len > MAX_PKT) throw new Error(`bad pkt-line length ${len}`);
    if (buf.length < off + len) return undefined;
    const text = utf8.decode(buf.subarray(off + 4, off + len));
    off += len;
    return text.endsWith("\n") ? text.slice(0, -1) : text;
  };

  const updates: GitRefUpdate[] = [];
  let capabilities: string[] = [];
  let shallowAllowed = true;
  for (;;) {
    const line = next();
    if (line === undefined) return undefined;
    if (line === "flush") break;
    if (shallowAllowed && /^shallow [0-9a-f]{40}([0-9a-f]{24})?$/.test(line))
      continue;
    shallowAllowed = false;
    let command = line;
    if (updates.length === 0) {
      const nul = line.indexOf("\0");
      if (line.startsWith("push-cert"))
        throw new Error("signed pushes are not supported");
      if (nul === -1) throw new Error("first command has no capabilities");
      command = line.slice(0, nul);
      capabilities = line
        .slice(nul + 1)
        .split(" ")
        .filter(Boolean);
    }
    updates.push(parseCommand(command));
  }
  if (updates.length === 0) throw new Error("push request has no commands");
  const refs = updates.map((u) => u.ref);
  const dup = refs.find((r, i) => refs.indexOf(r) !== i);
  if (dup) throw new Error(`ref ${dup} updated twice`);

  const pushOptions: string[] = [];
  if (capabilities.includes("push-options")) {
    for (;;) {
      const line = next();
      if (line === undefined) return undefined;
      if (line === "flush") break;
      pushOptions.push(line);
    }
  }
  return { updates, pushOptions, capabilities };
}

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function parseCommand(command: string): GitRefUpdate {
  const [old, next, ref, ...extra] = command.split(" ");
  if (extra.length || !old || !next || !ref)
    throw new Error("malformed push command");
  if (!OID.test(old) || !OID.test(next) || old.length !== next.length)
    throw new Error("malformed object id in push command");
  if (!validRef(ref))
    throw new Error(`invalid ref name ${JSON.stringify(ref)}`);
  const zero = (oid: string) => /^0+$/.test(oid);
  if (zero(old) && zero(next)) throw new Error(`no-op command for ${ref}`);
  return {
    ref,
    old,
    new: next,
    kind: zero(old) ? "create" : zero(next) ? "delete" : "update",
  };
}

/**
 * A subset of git-check-ref-format, strict on purpose: a ref policy can't be
 * fooled by a name upstream would read differently.
 */
function validRef(ref: string): boolean {
  if (!ref.startsWith("refs/") || ref.length > 1024) return false;
  if (/[\x00-\x20\x7f~^:?*[\\]|\.\.|\/\/|@\{/.test(ref)) return false;
  if (ref.endsWith("/") || ref.endsWith(".") || ref.endsWith(".lock"))
    return false;
  return ref.split("/").every((part) => part && !part.startsWith("."));
}
