import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve, type ServerType } from "@hono/node-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, createSessions, staticToken } from "../src/index.js";
import { git } from "../src/providers/git/index.js";
import { gitEnv, runGit } from "./fixtures/git-upstream.js";

/**
 * Real-world run against github.com. Skipped unless WATERLOCK_GIT_E2E_TOKEN is
 * set (a token with push access to the repo). Pushes one `agent/e2e-*` branch
 * and deletes it afterwards with the token directly.
 *
 *   WATERLOCK_GIT_E2E_TOKEN=$(gh auth token) pnpm vitest run git-github
 */
const TOKEN = process.env.WATERLOCK_GIT_E2E_TOKEN;
const REPO =
  process.env.WATERLOCK_GIT_E2E_REPO ?? "waterlockcc/test-git-access";
const PREFIX = "Error for waterlock proxy: ";
const BRANCH = `agent/e2e-${Date.now()}`;

describe.skipIf(!TOKEN)(`git provider against github.com/${REPO}`, () => {
  const sessions = createSessions({ signingKey: "x".repeat(32) });
  let server: ServerType;
  let base: string;
  let home: string;
  let env: NodeJS.ProcessEnv;
  let work: string;

  beforeAll(async () => {
    const gw = createGateway({
      providers: [
        git({
          id: "github",
          upstream: "https://github.com",
          credentials: staticToken({ token: TOKEN! }),
        }),
      ],
      policy: [
        { when: (r) => r.params.repo === REPO.toLowerCase() },
        {
          when: (r) =>
            r.action === "git.push" &&
            r.context.phase === "rpc" &&
            r.context.updates.some(
              (u) => !u.ref.startsWith("refs/heads/agent/"),
            ),
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
      ],
      sessions,
    });
    await new Promise<void>((resolve) => {
      server = serve({ fetch: gw.fetch, port: 0, hostname: "127.0.0.1" }, () =>
        resolve(),
      );
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    home = await mkdtemp(join(tmpdir(), "waterlock-e2e-"));
    await writeFile(join(home, ".gitconfig"), "");
    env = gitEnv(home);
    work = join(home, "work");
  });

  afterAll(async () => {
    // Clean up with the real token, not through the gateway.
    await fetch(
      `https://api.github.com/repos/${REPO}/git/refs/heads/${BRANCH}`,
      { method: "DELETE", headers: { authorization: `Bearer ${TOKEN}` } },
    );
    server?.close();
    if (home) await rm(home, { recursive: true, force: true });
  });

  const agentGit = async (args: string[], cwd = home) => {
    const { token } = await sessions.mint({
      provider: "github",
      agent: "e2e",
      onBehalfOf: "e2e",
    });
    return runGit(
      ["-c", `http.extraHeader=Authorization: Bearer ${token}`, ...args],
      { cwd, env },
    );
  };

  it("clones through the gateway", async () => {
    const r = await agentGit(["clone", "-q", `${base}/${REPO}.git`, work]);
    expect(r, r.stderr).toMatchObject({ code: 0 });
  });

  it("other repos are denied", async () => {
    const r = await agentGit([
      "ls-remote",
      `${base}/waterlockcc/waterlock.git`,
    ]);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain(`remote: ${PREFIX}`);
  });

  it("repo case doesn't matter on GitHub, and the policy agrees", async () => {
    const r = await agentGit(["ls-remote", `${base}/${REPO.toUpperCase()}`]);
    expect(r, r.stderr).toMatchObject({ code: 0 });
    expect(r.stdout).toContain("refs/heads/main");
  });

  it("pushes an agent/* branch", async () => {
    await writeFile(join(work, "e2e.txt"), `${BRANCH}\n`);
    await runGit(["add", "."], { cwd: work, env });
    await runGit(["commit", "-q", "-m", `e2e ${BRANCH}`], { cwd: work, env });
    const r = await agentGit(
      ["push", "origin", `HEAD:refs/heads/${BRANCH}`],
      work,
    );
    expect(r, r.stderr).toMatchObject({ code: 0 });
    const remote = await agentGit(["ls-remote", "origin", BRANCH], work);
    const head = (
      await runGit(["rev-parse", "HEAD"], { cwd: work, env })
    ).stdout.trim();
    expect(remote.stdout).toContain(head);
  });

  it("push to main is rejected with the reason", async () => {
    const r = await agentGit(["push", "origin", "HEAD:main"], work);
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain(
      `! [remote rejected] HEAD -> main (${PREFIX}Agents push only to agent/* branches.)`,
    );
  });

  it("deleting the branch is rejected", async () => {
    const r = await agentGit(["push", "origin", `:refs/heads/${BRANCH}`], work);
    expect(r.stderr).toContain(`(${PREFIX}No deleting branches.)`);
  });
});
