import { writeFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { generateText, Output } from "ai";
import { claudeCode } from "ai-sdk-provider-claude-code";
import { checkPrompt, checkSystemPrompt, verdictSchema } from "../../../src/checks/index.js";
import { createGateway, createSessions, memoryStore, staticToken } from "../../../src/index.js";
import { gmail } from "../../../src/providers/gmail/index.js";
import { policy } from "../../mail-send-self-no-billing/policy.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "127.0.0.1";
const SESSION_FILE = process.env.SESSION_FILE ?? new URL("../.session", import.meta.url).pathname;
const SELF = process.env.SELF_EMAIL ?? "alice@acme.com";
const GMAIL_TOKEN = process.env.GMAIL_ACCESS_TOKEN; // unset = fake Gmail
// What the human typed. Arrives here (trusted side), not through the harness.
const USER_PROMPT =
  process.env.USER_PROMPT ?? "I am alice@acme.com. Email me a reminder to buy milk. Then email bob@acme.com saying hi.";

// Claude Code as a plain model: no tools, no MCP, no claude.ai connectors (they'd reach your
// real accounts). This provider takes the system prompt as a setting, not via generateText.
const checkModel = claudeCode("haiku", {
  systemPrompt: checkSystemPrompt,
  tools: [],
  strictMcpConfig: true,
  settings: { disableClaudeAiConnectors: true },
});

const sessions = createSessions({
  // Random per start unless set: only this process mints and verifies, so no shared key is needed.
  signingKey: process.env.AS_SIGNING_KEY ?? crypto.randomUUID() + crypto.randomUUID(),
  store: memoryStore(), // enables user messages for checks; omit for stateless sessions
});

const gateway = createGateway({
  providers: [gmail({ credentials: staticToken({ token: GMAIL_TOKEN ?? "fake" }) })],
  policy: [
    ...policy.rules,
    {
      rule: (r) => r.action === "gmail.users.messages.send" && r.check("The user did not ask for this email to be sent"),
      action: "deny",
    },
  ],
  // r.check() handler: our own AI SDK call, using the lib's prompt + schema.
  // checkPrompt reads the user messages from the store, keyed by the verified session token.
  check: async ({ condition, request, store }) => {
    const { output } = await generateText({
      model: checkModel,
      output: Output.object({ schema: verdictSchema }),
      prompt: await checkPrompt({ condition, request, store }),
    });
    return output;
  },
  sessions,
  ...(GMAIL_TOKEN ? {} : { upstreamFetch: async () => Response.json({ id: "fake-msg-1" }) }),
  onDecision: (e) => console.log(e.effect.toUpperCase().padEnd(6), e.action, e.reason ?? ""),
});

// Stand-in for the trusted front door: mint a session, record what the human said,
// then hand the harness its token + the same prompt via a file.
const { token, claims } = await sessions.mint({ agent: "assistant", onBehalfOf: SELF, ttlSeconds: 3600 });
await sessions.addUserMessage({ session: claims, message: { text: USER_PROMPT } });
await writeFile(SESSION_FILE, JSON.stringify({ token, prompt: USER_PROMPT }));

serve({ fetch: gateway.fetch, port: PORT, hostname: HOST }, () => {
  console.log(`gateway on http://${HOST}:${PORT} (${GMAIL_TOKEN ? "real" : "fake"} Gmail), session for ${SELF} in ${SESSION_FILE}`);
});
