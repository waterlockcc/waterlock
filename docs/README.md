# waterlock blog

Fumadocs (Next.js, static export). Posts are MDX files in `content/blog`; the file name is the URL slug.

```sh
pnpm i
pnpm dev     # http://localhost:3000/blog, add ?data=worst to stress-test the post list
pnpm build   # static site in out/
```
