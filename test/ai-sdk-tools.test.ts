import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { auth, gmail } from "@googleapis/gmail";
import { generateText, stepCountIs } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createGateway, createSessions, staticToken } from "../src/index.js";
import { gmail as gmailProvider } from "../src/providers/gmail/index.js";
import { fakeUpstream } from "./fixtures/fake-upstream.js";
import { mockCheckModel, modelCheck } from "./fixtures/mock-check-model.js";
import { selfSendPolicy } from "./fixtures/self-send-policy.js";
import { createSendEmailTools } from "./fixtures/send-email-tool.js";

const SELF = "alice@acme.com";
const sessions = createSessions({ signingKey: "test-signing-key-0123456789abcdef" });
let up: Awaited<ReturnType<typeof fakeUpstream>>;
let server: ServerType;
let rootUrl: string;

beforeAll(async () => {
  up = await fakeUpstream(() => Response.json({ id: `msg-${up.seen.length}` }));
  const gateway = createGateway({
    providers: [gmailProvider({ credentials: staticToken({ token: "real-google-token" }), upstream: up.url })],
    policy: selfSendPolicy,
    check: modelCheck(mockCheckModel()),
    sessions,
  });
  server = serve({ fetch: gateway.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise((r) => server.once("listening", r));
  rootUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
});
afterAll(async () => {
  server.close();
  await up.close();
});

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const call = (id: string, to: string, body: string) => ({
  type: "tool-call" as const,
  toolCallId: id,
  toolName: "sendEmail",
  input: JSON.stringify({ to, subject: "hi", body }),
});

describe("AI SDK tools through the gateway", () => {
  it("allowed calls succeed, denied calls come back to the model as tool errors", async () => {
    const { token } = await sessions.mint({ provider: "gmail", agent: "assistant", onBehalfOf: SELF });
    const oauth = new auth.OAuth2();
    oauth.setCredentials({ access_token: token });
    const api = gmail({ version: "v1", auth: oauth, rootUrl });

    // Step 1: model calls sendEmail three times. Step 2: model replies with text.
    const model = new MockLanguageModelV4({
      doGenerate: [
        {
          content: [
            call("1", SELF, "buy milk"),
            call("2", "bob@acme.com", "hi"),
            call("3", SELF, "update billing address"),
          ],
          finishReason: { unified: "tool-calls", raw: undefined },
          usage,
          warnings: [],
        },
        { content: [{ type: "text", text: "done" }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] },
      ],
    });

    const { steps } = await generateText({ model, tools: createSendEmailTools(api), stopWhen: stepCountIs(5), prompt: "go" });
    const parts = steps[0]!.content;

    expect(parts.filter((p) => p.type === "tool-result").map((p) => p.output)).toEqual([{ id: "msg-1" }]);
    expect(parts.filter((p) => p.type === "tool-error").map((p) => String(p.error))).toEqual([
      expect.stringContaining("You can only send email to yourself."),
      expect.stringContaining("The email mentions billing."),
    ]);
    expect(up.seen).toHaveLength(1);

    // The model's second turn received the denial text as tool output.
    const secondPrompt = JSON.stringify(model.doGenerateCalls[1]!.prompt);
    expect(secondPrompt).toContain("The email mentions billing.");
  });
});
