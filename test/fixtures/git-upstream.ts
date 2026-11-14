import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { serve } from "@hono/node-server";

/**
 * Environment for every git process in tests: no user or system config (so no
 * credential helpers or keychains), never prompt.
 */
export function gitEnv(home: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: home,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(home, ".gitconfig"),
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "agent",
    GIT_AUTHOR_EMAIL: "agent@example.com",
    GIT_COMMITTER_NAME: "agent",
    GIT_COMMITTER_EMAIL: "agent@example.com",
  };
}

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs git; never throws on a non-zero exit. */
export function runGit(
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd: opts.cwd, env: opts.env, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) =>
        resolve({
          code: err ? ((err as { code?: number }).code ?? 1) : 0,
          stdout,
          stderr,
        }),
    );
  });
}

export interface SeenGitRequest {
  method: string;
  /** Path + query. */
  path: string;
  headers: Record<string, string>;
}

/**
 * A real git host on localhost: `git http-backend` (CGI) over bare repos, one
 * commit on `main` each. Push is enabled; push options are advertised.
 */
export async function gitUpstream(repos: string[]) {
  const dir = await mkdtemp(join(tmpdir(), "waterlock-git-"));
  const root = join(dir, "repos");
  const env = gitEnv(dir);
  await writeFile(join(dir, ".gitconfig"), "");
  const git = async (args: string[], cwd = dir) => {
    const r = await runGit(args, { cwd, env });
    if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
    return r.stdout.trim();
  };

  const seed = join(dir, "seed");
  await mkdir(seed);
  await git(["init", "-q", "-b", "main"], seed);
  await writeFile(join(seed, "README.md"), "hello\n");
  await git(["add", "."], seed);
  await git(["commit", "-q", "-m", "seed"], seed);
  for (const repo of repos) {
    const bare = join(root, `${repo}.git`);
    await git(["init", "-q", "--bare", "-b", "main", bare]);
    await git(["config", "receive.advertisePushOptions", "true"], bare);
    await git(["push", "-q", bare, "main"], seed);
  }

  const seen: SeenGitRequest[] = [];
  const server = serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (req) => {
      const url = new URL(req.url);
      seen.push({
        method: req.method,
        path: url.pathname + url.search,
        headers: Object.fromEntries(req.headers),
      });
      return cgi(req, url);
    },
  });
  await once(server, "listening");

  async function cgi(req: Request, url: URL): Promise<Response> {
    const h = (name: string) => req.headers.get(name) ?? undefined;
    const child = spawn("git", ["http-backend"], {
      env: {
        ...env,
        GIT_PROJECT_ROOT: root,
        GIT_HTTP_EXPORT_ALL: "1",
        // Enables receive-pack, like an authenticated user on a real host.
        REMOTE_USER: "upstream-user",
        REMOTE_ADDR: "127.0.0.1",
        REQUEST_METHOD: req.method,
        PATH_INFO: url.pathname,
        QUERY_STRING: url.search.slice(1),
        CONTENT_TYPE: h("content-type"),
        CONTENT_LENGTH: h("content-length"),
        HTTP_CONTENT_ENCODING: h("content-encoding"),
        HTTP_GIT_PROTOCOL: h("git-protocol"),
      },
    });
    if (req.body)
      Readable.fromWeb(req.body as import("node:stream/web").ReadableStream)
        .pipe(child.stdin)
        .on("error", () => {});
    else child.stdin.end();
    const out: Buffer[] = [];
    for await (const chunk of child.stdout) out.push(chunk as Buffer);
    const raw = Buffer.concat(out);
    const split = raw.indexOf("\r\n\r\n");
    const head = raw.subarray(0, split).toString("latin1");
    const headers = new Headers();
    let status = 200;
    for (const line of head.split("\r\n")) {
      const colon = line.indexOf(":");
      const name = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (name.toLowerCase() === "status") status = parseInt(value, 10);
      else headers.append(name, value);
    }
    return new Response(raw.subarray(split + 4), { status, headers });
  }

  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    seen,
    /** `git rev-parse <rev>` in an upstream bare repo. */
    revParse: (repo: string, rev: string) =>
      runGit(["rev-parse", "--verify", "-q", rev], {
        cwd: join(root, `${repo}.git`),
        env,
      }).then((r) => (r.code === 0 ? r.stdout.trim() : undefined)),
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}
