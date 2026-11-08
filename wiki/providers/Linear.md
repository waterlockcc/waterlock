# Linear

GraphQL. See the [GraphQL limitation](Actions#graphql-limitation).

```ts
import { linear } from "@waterlock/gateway/providers/linear";

linear({ credentials: staticToken({ token: process.env.LINEAR_TOKEN! }) }); // auth: "apiKey" for a personal API key

// rule
{ when: (r) => r.action === "linear.mutation.issueCreate" && r.params.input.teamId === TEAM_ID }

// harness: stock SDK, gateway as apiUrl, session token as accessToken
new LinearClient({ accessToken: token, apiUrl: "http://127.0.0.1:8787/graphql" });
```
