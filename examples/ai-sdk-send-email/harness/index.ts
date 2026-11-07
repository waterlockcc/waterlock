import { readFile } from "node:fs/promises";
import { auth, gmail } from "@googleapis/gmail";
import { generateText } from "ai";
import { claudeCode, createAiSdkMcpServer } from "ai-sdk-provider-claude-code";
import { createTools } from "./tools.js";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://127.0.0.1:8787/";
// Token + prompt come from the trusted front door (here: a file the gateway writes).
const { token: SESSION, prompt: PROMPT } = JSON.parse(
  await readFile(process.env.SESSION_FILE ?? new URL("../.session", import.meta.url), "utf8").catch(() => {
    throw new Error("no session: start the gateway first (cd ../gateway && npm run dev)");
  }),
) as { token: string; prompt: string };

// Stock Gmail client. Only differences: session token instead of a Google token, gateway as rootUrl.
const oauth = new auth.OAuth2();
oauth.setCredentials({ access_token: SESSION });
const api = gmail({ version: "v1", auth: oauth, rootUrl: GATEWAY_URL });

// Claude Code runs the loop and executes the AI SDK tools (as MCP). Uses your local Claude Code login.
const { text, content } = await generateText({
  model: claudeCode(process.env.CLAUDE_MODEL ?? "sonnet", {
    // Own prompt instead of the Claude Code preset, which carries your account details.
    systemPrompt: "You are an email assistant. Use the sendEmail tool to send the emails the user asks for.",
    mcpServers: { gmail: createAiSdkMcpServer("gmail", createTools(api)) },
    allowedTools: ["mcp__gmail__sendEmail"],
    tools: [], // no built-in Bash/Read/Edit: only our tool
    // Only our MCP server. Without these, your claude.ai connectors (real Gmail, etc.)
    // join the session a few seconds in and bypass the gateway.
    strictMcpConfig: true,
    settings: { disableClaudeAiConnectors: true },
  }),
  prompt: PROMPT,
});

for (const part of content) {
  if (part.type === "tool-call") console.log("CALL   ", part.toolName, JSON.stringify(part.input));
  if (part.type === "tool-result") console.log("ALLOWED", JSON.stringify(part.output));
  if (part.type === "tool-error") console.log("DENIED ", String(part.error));
}
console.log("\n" + text);
