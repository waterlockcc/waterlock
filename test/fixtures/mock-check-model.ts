import { generateText, Output, type LanguageModel } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { checkPrompt, checkSystemPrompt, verdictSchema } from "../../src/checks/index.js";
import type { Check } from "../../src/index.js";

/** The same check function the examples write, against any (mock) AI SDK model. */
export const modelCheck = (model: LanguageModel): Check => async ({ condition, request, store, signal }) => {
  const { output } = await generateText({
    model,
    abortSignal: signal,
    system: checkSystemPrompt,
    output: Output.object({ schema: verdictSchema }),
    prompt: await checkPrompt({ condition, request, ...(store ? { store } : {}) }),
  });
  return output;
};

type Decide = (condition: string, request: string) => boolean;
const mentionsBilling: Decide = (condition, request) => /billing/i.test(condition) && /billing/i.test(request);

/**
 * AI SDK mock model for `modelCheck`. Answers each condition with `decide`, records the
 * conditions it was asked. `fail` makes every call throw (or hang, with "hang").
 */
export function mockCheckModel(opts: { decide?: Decide; explanation?: string; fail?: "throw" | "hang" | "malformed" } = {}) {
  const conditions: string[] = [];
  const decide = opts.decide ?? mentionsBilling;
  const model = new MockLanguageModelV4({
    doGenerate: async (call) => {
      const text = call.prompt
        .flatMap((m) => (typeof m.content === "string" ? [m.content] : m.content.flatMap((c) => (c.type === "text" ? [c.text] : []))))
        .join("\n");
      const condition = text.match(/Condition: (.*)\n/)?.[1] ?? "";
      const request = text.slice(text.indexOf("<request>"));
      conditions.push(condition);
      if (opts.fail === "throw") throw new Error("model down");
      if (opts.fail === "hang") return new Promise(() => {});
      const result = decide(condition, request);
      const answer = opts.fail === "malformed"
        ? { result: "yes" }
        : { result, explanation: opts.explanation ?? (result ? "The email mentions billing." : "No billing information.") };
      return {
        content: [{ type: "text", text: JSON.stringify(answer) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        warnings: [],
      };
    },
  });
  return Object.assign(model, { conditions });
}
