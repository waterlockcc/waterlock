# Policies

A policy is a list of rows. Default deny: a call goes through only if an allow row matches and no deny row does.

```ts
policy: [
  { when: (r) => r.action === "gmail.users.messages.list" }, // allow
  {
    when: (r) => r.action === "gmail.users.messages.list" && (r.params.maxResults ?? 0) > 50,
    action: "deny",
    reason: "List at most 50 messages per page.",
  },
]
```

`when` functions are sync and get `r.provider`, `r.action`, `r.params`, `r.context`, `r.session`. A throw denies.

## Plain-language rules

Deny only. Answered by your own model via `check`, and only run once the function rows would allow. `@waterlock/gateway/checks` needs `zod` (the AI SDK already requires it).

```ts
import { generateText, Output } from "ai";
import { checkPrompt, checkSystemPrompt, verdictSchema } from "@waterlock/gateway/checks";

createGateway({
  // ...
  policy: [
    // ...allow rows
    { when: "The email contains billing information", action: "deny" },
  ],
  check: async ({ condition, request, store, signal }) => {
    const { output } = await generateText({
      model,
      system: checkSystemPrompt,
      abortSignal: signal,
      output: Output.object({ schema: verdictSchema }),
      prompt: await checkPrompt({ condition, request, store }),
    });
    return output;
  },
});
```
