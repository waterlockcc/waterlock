import { writeFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { createGateway, createSessions, staticToken } from "../../../src/index.js";
import { linear } from "../../../src/providers/linear/index.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const SESSION_FILE = process.env.SESSION_FILE ?? new URL("../.session", import.meta.url).pathname;
// The fake (../fake-linear). For real Linear: LINEAR_UPSTREAM=https://api.linear.app and a real LINEAR_TOKEN.
const UPSTREAM = process.env.LINEAR_UPSTREAM ?? "http://127.0.0.1:4000";
const AGENTS_TEAM = process.env.AGENTS_TEAM_ID ?? "team-agents";
// What the human typed. Arrives here (trusted side), not through the harness.
const USER_PROMPT =
  process.env.USER_PROMPT ??
  "Triage the Agents team. Summarize its open issues. AGT-4 duplicates AGT-1: delete it. " +
    "Comment on AGT-1 that it is being looked at. File an Agents issue to add a retry to the login test. " +
    "Also file a Finance issue to double check the Q3 VAT numbers.";

const sessions = createSessions({
  // Random per start unless set: only this process mints and verifies, so no shared key is needed.
  signingKey: process.env.WATERLOCK_SIGNING_KEY ?? crypto.randomUUID() + crypto.randomUUID(),
});

const gateway = createGateway({
  providers: [linear({ credentials: staticToken({ token: process.env.LINEAR_TOKEN ?? "fake" }), upstream: UPSTREAM })],
  // Rules are typed from `providers`: autocomplete on actions and params.
  policy: [
    // Reads: any query. Nested selections aren't checked, so the Linear token's scopes limit what reads return.
    { when: (r) => r.action.startsWith("linear.query.") },
    { when: (r) => r.action === "linear.mutation.commentCreate" || r.action === "linear.mutation.issueCreate" },
    {
      when: (r) => r.action === "linear.mutation.issueCreate" && r.params.input.teamId !== AGENTS_TEAM,
      action: "deny",
      reason: "You can only file issues in the Agents team.",
    },
    // Everything else (issueDelete, issueUpdate, ...) is denied by default.
  ],
  sessions,
});

// Stand-in for the trusted front door: mint a session, then hand the harness its token
// + the prompt via a file.
const { token } = await sessions.mint({ provider: "linear", agent: "triage", onBehalfOf: "user-alice", ttlSeconds: 3600 });
await writeFile(SESSION_FILE, JSON.stringify({ token, prompt: USER_PROMPT }));

serve({ fetch: gateway.fetch, port: PORT, hostname: HOST }, () => {
  console.log(`gateway on http://${HOST}:${PORT} (Linear at ${UPSTREAM}), session in ${SESSION_FILE}`);
});
