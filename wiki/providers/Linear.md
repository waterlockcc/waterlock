# Linear

GraphQL. See the [GraphQL limitation](Actions#graphql-limitation). All actions: [codegen-report.md](https://github.com/waterlockcc/waterlock/blob/main/src/providers/linear/codegen-report.md).

SDK relation calls are nested selections: `issue.comments()` sends `issue(id) { comments }`, so it is `linear.query.issue`, not `linear.query.comments`. Allowing `linear.query.issue` allows reading the issue's comments, attachments and history.

```ts
import { linear } from "@waterlock/gateway/providers/linear";

linear({ credentials: staticToken({ token: process.env.LINEAR_TOKEN! }) }); // auth: "apiKey" for a personal API key

// rule
{ when: (r) => r.action === "linear.mutation.issueCreate" && r.params.input.teamId === TEAM_ID }

// harness: stock SDK, gateway as apiUrl, session token as accessToken
new LinearClient({ accessToken: token, apiUrl: "http://127.0.0.1:8787/graphql" });
```

Runnable example against a fake Linear with seed data: [examples/ai-sdk-linear-triage](https://github.com/waterlockcc/waterlock/tree/main/examples/ai-sdk-linear-triage).

Demo against a real Linear workspace (create allowed, team move and billing info blocked): [video](https://github.com/waterlockcc/waterlock/blob/main/assets/demo.mp4).
