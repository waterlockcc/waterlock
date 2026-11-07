import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { generateText, Output } from "ai";
import { claudeCode } from "ai-sdk-provider-claude-code";
import { checkPrompt, checkSystemPrompt, verdictSchema } from "../../src/checks/index.js";
import { auth, gmail } from "@googleapis/gmail";
import { createGateway, createSessions, staticToken } from "../../src/index.js";
import { gmail as gmailProvider } from "../../src/providers/gmail/index.js";
import { policy } from "./policy.js";

const SELF = "alice@acme.com";

// Gateway (trusted). Fake upstream stands in for gmail.googleapis.com.
// Claude Code as a plain model: no tools, no MCP, no claude.ai connectors (they'd reach your
// real accounts). This provider takes the system prompt as a setting, not via generateText.
const checkModel = claudeCode("haiku", {
  systemPrompt: checkSystemPrompt,
  tools: [],
  strictMcpConfig: true,
  settings: { disableClaudeAiConnectors: true },
});

const sessions = createSessions({ signingKey: crypto.randomUUID() + crypto.randomUUID() });
const gateway = createGateway({
  providers: [gmailProvider({ credentials: staticToken({ token: "real-google-token" }) })],
  policy,
  // r.check() handler: our own AI SDK call, using the lib's prompt + schema.
  check: async ({ condition, request, store }) => {
    const { output } = await generateText({
      model: checkModel,
      output: Output.object({ schema: verdictSchema }),
      prompt: await checkPrompt({ condition, request, store }),
    });
    return output;
  },
  sessions,
  upstreamFetch: async () => Response.json({ id: "msg-1" }),
});
const server = serve({ fetch: gateway.fetch, port: 0, hostname: "127.0.0.1" });
await new Promise((r) => server.once("listening", r));

// Harness (untrusted). Holds only the session token.
const { token } = await sessions.mint({ agent: "assistant", onBehalfOf: SELF });
const oauth = new auth.OAuth2();
oauth.setCredentials({ access_token: token });
const api = gmail({ version: "v1", auth: oauth, rootUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/` });

async function sendEmail(to: string, subject: string, body: string): Promise<string> {
  const raw = Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`).toString("base64url");
  try {
    await api.users.messages.send({ userId: "me", requestBody: { raw } });
    return "ALLOWED";
  } catch (err) {
    return `DENIED  ${(err as { response: { data: { error: { message: string } } } }).response.data.error.message}`;
  }
}

console.log("to self         ", await sendEmail(SELF, "Reminder", "Buy milk"));
console.log("to someone else ", await sendEmail("bob@acme.com", "Reminder", "Buy milk"));
console.log("billing in body ", await sendEmail(SELF, "Reminder", "Update billing address"));

server.close();
