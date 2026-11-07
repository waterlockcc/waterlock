# ai-sdk-send-email

AI SDK agent (harness) sending Gmail through the gateway. Claude Code runs the tools.

Docker (token from `claude setup-token` in `harness/.env` as `CLAUDE_CODE_OAUTH_TOKEN=...`):

```sh
docker compose --env-file harness/.env up --build --abort-on-container-exit --exit-code-from harness
```

Local (uses your Claude Code login), two terminals:

```sh
cd gateway && npm run dev
cd harness && npm run dev
```
