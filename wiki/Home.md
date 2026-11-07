## Install

```sh
pnpm add @waterlock/gateway
pnpm add zod   # only if you use @waterlock/gateway/checks
```

Node 24+.

## Use

**1. Gateway** (trusted side, holds the Gmail credential):

```ts
import { serve } from "@hono/node-server";
import { createGateway, createSessions, staticToken } from "@waterlock/gateway";
import { gmail } from "@waterlock/gateway/providers/gmail";

const sessions = createSessions({ signingKey: process.env.WATERLOCK_SIGNING_KEY! }); // >= 32 bytes

const gateway = createGateway({
  providers: [gmail({ credentials: staticToken({ token: process.env.GMAIL_ACCESS_TOKEN! }) })],
  // Default deny: a call goes through only if an allow row matches and no deny row does.
  policy: [
    {
      when: (r) =>
        r.action === "gmail.users.messages.send" &&
        r.context.recipients.length > 0 &&
        r.context.recipients.every((addr) => addr === r.session.onBehalfOf),
      reason: "You can only send email to yourself.",
    },
  ],
  sessions,
});

serve({ fetch: gateway.fetch, port: 8787 }); // gateway.fetch is (Request) => Response
```

**2. Session token** for the agent, minted on the trusted side:

```ts
const { token } = await sessions.mint({ provider: "gmail", agent: "assistant", onBehalfOf: "alice@acme.com", ttlSeconds: 3600 });
```

**3. Harness** uses a stock client: gateway as base URL, session token as bearer.

```ts
import { auth, gmail } from "@googleapis/gmail";

const oauth = new auth.OAuth2();
oauth.setCredentials({ access_token: token });
const api = gmail({ version: "v1", auth: oauth, rootUrl: "http://127.0.0.1:8787/" });

await api.users.messages.send({ userId: "me", requestBody: { raw } });
// denied -> 403 { error: { code: "policy_denied", message: "You can only send email to yourself." } }
```

**Plain-language rules** (deny only) are answered by your own model via `check`:

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

**Refreshing credentials** instead of a static token:

```ts
import { oauth2Refresh } from "@waterlock/gateway";

gmail({
  credentials: oauth2Refresh({
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientId,
    clientSecret,
    refreshToken: (session) => lookupRefreshToken(session.onBehalfOf),
  }),
});
```

Full runnable example: [examples/ai-sdk-send-email](https://github.com/waterlockcc/waterlock/tree/main/examples/ai-sdk-send-email).
