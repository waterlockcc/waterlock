# waterlock site

Blog and docs, on fumadocs (Next.js, static export). Blog posts are MDX in `content/blog` (file name is the slug). Docs are MDX in `content/docs`, one folder per version, ordered by the `meta.json` files there:

- `next/`: unreleased changes on main, at `/docs/next`. New behavior goes here.
- `vX.Y/`: released docs. The newest is the latest, at `/docs`. Fixes to released behavior go here, and in `next/` too.

```sh
pnpm i
pnpm dev     # http://localhost:3000
pnpm build   # static site in out/
```

In the release PR, after bumping the gateway's version:

1. `pnpm docs:release` copies `next/` to `vX.Y/`, which becomes the latest at `/docs`.
2. Add `content/changelog/<version>.mdx` (the `update-changelog` skill in `.claude/skills` has the rules).
