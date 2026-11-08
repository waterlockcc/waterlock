## Install

```sh
pnpm add @waterlock/gateway
pnpm add zod      # only if you use @waterlock/gateway/checks
pnpm add graphql  # only for GraphQL providers (Linear)
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

## Actions

Every call is one action. Rules match `r.action` and `r.params`.

| Spec | Action | `r.params` |
|---|---|---|
| Discovery (Google) | method id: `gmail.users.messages.send` | path + query params |
| OpenAPI | `<provider>.<operationId>` | path + query params |
| GraphQL | top-level field: `linear.mutation.issueCreate` | field arguments, schema defaults filled in |

**GraphQL limitation:** only the top-level field is checked, not nested selections.

- Mutations: the selection only shapes the response, so the action covers the write.
- Queries: an allowed query can read anything reachable from its field, e.g. `issue { team { members { email } } }`. Reads are limited by the upstream token's scopes, not by policy.
- One operation and one top-level field per request. Batches, subscriptions and persisted queries are rejected.

## Linear (GraphQL)

```ts
import { linear } from "@waterlock/gateway/providers/linear";

linear({ credentials: staticToken({ token: process.env.LINEAR_TOKEN! }) }); // auth: "apiKey" for a personal API key

// rule
{ when: (r) => r.action === "linear.mutation.issueCreate" && r.params.input.teamId === TEAM_ID }

// harness: stock SDK, gateway as apiUrl, session token as accessToken
new LinearClient({ accessToken: token, apiUrl: "http://127.0.0.1:8787/graphql" });
```
