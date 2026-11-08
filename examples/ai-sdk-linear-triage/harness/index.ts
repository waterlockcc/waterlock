import { readFile } from "node:fs/promises";
import { LinearClient } from "@linear/sdk";
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

// Stock Linear client. Only differences: session token instead of a Linear token, gateway as apiUrl.
const api = new LinearClient({ accessToken: SESSION, apiUrl: new URL("graphql", GATEWAY_URL).href });
const tools = createTools(api);

// Claude Code runs the loop and executes the AI SDK tools (as MCP). Uses your local Claude Code login.
const { text, content } = await generateText({
  model: claudeCode(process.env.CLAUDE_MODEL ?? "sonnet", {
    // Own prompt instead of the Claude Code preset, which carries your account details.
    systemPrompt: "You are a triage assistant for Linear. Use the tools to do what the user asks. If a tool call is denied, say so and move on.",
    mcpServers: { linear: createAiSdkMcpServer("linear", tools) },
    allowedTools: Object.keys(tools).map((name) => `mcp__linear__${name}`),
    tools: [], // no built-in Bash/Read/Edit: only our tools
    // Only our MCP server. Without these, your claude.ai connectors (real Linear, etc.)
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
