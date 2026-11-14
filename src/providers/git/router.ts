import type { Router, RouteResult } from "../../core/router.js";
import { gitError, pushRejected } from "./errors.js";
import { readPushCommands, type GitRefUpdate } from "./pktline.js";

/** Rule context for `git.fetch`. */
export type GitFetchContext =
  /** `GET info/refs?service=git-upload-pack`: list refs. */
  | { phase: "advertise" }
  /** `POST git-upload-pack`: negotiate and download objects. */
  | { phase: "rpc" };

/** Rule context for `git.push`. */
export type GitPushContext =
  /**
   * `GET info/refs?service=git-receive-pack`: the first request of every
   * push. Denying it stops a push before any objects are sent.
   */
  | { phase: "advertise" }
  /** `POST git-receive-pack`: the ref updates, then the pack. */
  | {
      phase: "rpc";
      updates: GitRefUpdate[];
      /** `git push -o <option>` values. */
      push_options: string[];
      /** `git push --atomic`: all updates apply, or none. */
      atomic: boolean;
    };

/**
 * Smart HTTP (gitprotocol-http): `<repo>/info/refs`, `<repo>/git-upload-pack`
 * and `<repo>/git-receive-pack`. Dumb HTTP and LFS paths don't match.
 */
const PATH = /^\/(.+)\/(info\/refs|git-upload-pack|git-receive-pack)$/;
const ACTIONS = {
  "git-upload-pack": "git.fetch",
  "git-receive-pack": "git.push",
} as const;

export function gitRouter(opts: { caseInsensitive: boolean }): Router {
  return {
    formatError: gitError,

    unauthenticated(url, error) {
      if (!PATH.test(url.pathname)) return undefined;
      const res = gitError(error);
      // git sends Basic credentials (the session token as password) only
      // after a challenge.
      res.headers.set("www-authenticate", 'Basic realm="waterlock"');
      return res;
    },

    async route({ method, url, headers, body, maxBodyBytes }) {
      const fail = (
        status: number,
        reason: string,
        code?: string,
      ): RouteResult => ({ ok: false, status, reason, ...(code && { code }) });
      const m = PATH.exec(url.pathname);
      if (!m)
        return fail(
          404,
          "not a git smart HTTP path (dumb HTTP and LFS are not supported)",
        );
      const repo = repoName(m[1]!, opts.caseInsensitive);
      if (!repo) return fail(400, "ambiguous repository path");
      const params = { repo };

      if (m[2] === "info/refs") {
        if (method !== "GET") return fail(405, "info/refs must be GET");
        const service = url.search.match(
          /^\?service=(git-upload-pack|git-receive-pack)$/,
        )?.[1] as keyof typeof ACTIONS | undefined;
        if (!service)
          return fail(
            400,
            "info/refs needs exactly ?service=git-upload-pack or git-receive-pack",
          );
        return {
          ok: true,
          action: ACTIONS[service],
          params,
          context: { phase: "advertise" },
          body: null,
          forwardHeaders: ["git-protocol"],
        };
      }

      const service = m[2] as keyof typeof ACTIONS;
      if (method !== "POST") return fail(405, `${service} must be POST`);
      if (url.search)
        return fail(400, `query string not allowed on ${service}`);
      if (headers.get("content-type") !== `application/x-${service}-request`)
        return fail(
          400,
          `content-type must be application/x-${service}-request`,
          "bad_request",
        );
      if (!body) return fail(400, "request body missing");

      if (service === "git-upload-pack")
        // Wants and haves only: nothing to check, forwarded as it arrives.
        // git gzips large ones, so content-encoding goes along.
        return {
          ok: true,
          action: "git.fetch",
          params,
          context: { phase: "rpc" },
          body: limit(body, maxBodyBytes),
          forwardHeaders: ["git-protocol", "content-encoding"],
        };

      // git never compresses a push; the commands must be readable as sent.
      const encoding = headers.get("content-encoding");
      if (encoding && encoding !== "identity")
        return fail(
          400,
          "compressed push requests are not supported",
          "bad_request",
        );
      let read: Awaited<ReturnType<typeof readPushCommands>>;
      try {
        read = await readPushCommands(body, maxBodyBytes);
      } catch (err) {
        return {
          ok: false,
          status: 400,
          code: "bad_request",
          reason: `could not read push: ${err instanceof Error ? err.message : String(err)}`,
          action: "git.push",
        };
      }
      const { commands, forward } = read;
      const context: GitPushContext = {
        phase: "rpc",
        updates: commands.updates,
        push_options: commands.pushOptions,
        atomic: commands.capabilities.includes("atomic"),
      };
      return {
        ok: true,
        action: "git.push",
        params,
        context,
        // The pack is forwarded as it arrives, never buffered.
        body: forward,
        forwardHeaders: ["git-protocol"],
        formatError: pushRejected(
          commands.updates.map((u) => u.ref),
          commands.capabilities,
        ),
      };
    },
  };
}

/**
 * The repo as rules see it: path without the leading slash and `.git`,
 * lowercased when the host treats paths case-insensitively. Undefined for
 * anything a host could read differently: percent-encoding, empty or dot
 * segments, control characters.
 */
function repoName(raw: string, caseInsensitive: boolean): string | undefined {
  if (/[%\\\x00-\x20\x7f]/.test(raw)) return undefined;
  const name = raw.endsWith(".git") ? raw.slice(0, -4) : raw;
  const parts = name.split("/");
  if (parts.some((p) => !p || p === "." || p === "..")) return undefined;
  return caseInsensitive ? name.toLowerCase() : name;
}

/** Errors the stream (failing the upstream request) past `max` bytes. */
function limit(
  body: ReadableStream<Uint8Array>,
  max: number,
): ReadableStream<Uint8Array> {
  let size = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, c) {
        size += chunk.length;
        if (size > max) c.error(new Error("body too large"));
        else c.enqueue(chunk);
      },
    }),
  );
}
