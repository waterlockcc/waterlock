# waterlock
Be water, my friend

Policy gateway for agent tool calls. Harness holds a session token; gateway holds the real credential, checks policy, forwards.

```sh
pnpm add @waterlock/gateway
```

```sh
pnpm gen:gmail      # spec -> src/providers/gmail/generated.ts
pnpm test
pnpm build          # -> dist/
```

Release: bump `version` in package.json, merge, then publish a GitHub release tagged `v<version>`.
