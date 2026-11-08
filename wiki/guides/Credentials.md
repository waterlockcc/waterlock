# Credentials

The gateway injects the real credential; the agent only holds a session token.

Static token:

```ts
gmail({ credentials: staticToken({ token: process.env.GMAIL_ACCESS_TOKEN! }) });
```

Refreshing OAuth token:

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
