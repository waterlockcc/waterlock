# waterlock site

Blog and docs, on fumadocs (Next.js, static export). Blog posts are MDX in `content/blog` (file name is the slug); docs pages are MDX in `content/docs`, ordered by the `meta.json` files there.

```sh
pnpm i
pnpm dev     # http://localhost:3000/blog and /docs; add ?data=worst on /blog to stress-test the cards
pnpm build   # static site in out/
```

Before bumping the gateway's version for a release, `pnpm docs:snapshot` freezes the current docs at `/docs/vX.Y`; `/docs` stays the latest.
