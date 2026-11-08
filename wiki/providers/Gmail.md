# Gmail

```ts
import { gmail } from "@waterlock/gateway/providers/gmail";

gmail({ credentials });
```

- Actions: Gmail API method ids, e.g. `gmail.users.messages.send`. See [Actions](Actions).
- `r.context` on `messages.send`, `drafts.create`, `drafts.update`: `recipients`, `subject`, `text`, `html`, `attachments`, decoded from the message.
- Harness: stock `@googleapis/gmail` with `rootUrl` set to the gateway. See [Quickstart](Quickstart).
