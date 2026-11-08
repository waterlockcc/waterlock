# ai-sdk-linear-triage

AI SDK agent (harness) triaging Linear issues through the gateway. Claude Code runs the tools. Linear is `fake-linear/`: real GraphQL on Linear's schema, seed data in `fake-linear/seed.ts`.

Docker (token from `claude setup-token` in `harness/.env` as `CLAUDE_CODE_OAUTH_TOKEN=...`):

```sh
docker compose --env-file harness/.env up --build --abort-on-container-exit --exit-code-from harness
```

Local (uses your Claude Code login), three terminals:

```sh
cd fake-linear && npm run dev   # npm run check: SDK straight at the fake
cd gateway && npm run dev
cd harness && npm run dev
```
