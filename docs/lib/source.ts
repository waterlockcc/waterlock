import { loader } from 'fumadocs-core/source';
import { pageSchema } from 'fumadocs-core/source/schema';
import { defineCollections } from 'fumadocs-mdx/macro';
import { z } from 'zod';
import { blogRoute } from './shared';

// One MDX file per post in content/blog. The file name is the URL slug.
const posts = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  schema: pageSchema.extend({
    description: z.string(),
    author: z.string(),
    // Same list as `categories` in post-item.ts (toItem fails to typecheck
    // if they drift). Inline: the macro only sees package imports.
    category: z.enum(['Engineering', 'Product', 'News']),
    // Card cover: generated from the logo, seeded by the slug. `art` picks
    // the style; `image` (a file in public/) replaces the art entirely.
    art: z.enum(['exploded', 'stack', 'tiles', 'lock']).optional(),
    image: z.string().optional(),
    // YAML reads an unquoted 2026-11-11 as a Date; keep it as a string.
    date: z.coerce.date().transform((d) => d.toISOString().slice(0, 10)),
  }),
});

export const blog = loader({
  baseUrl: blogRoute,
  source: posts.toFumadocsSource(),
});

export type Post = ReturnType<typeof blog.getPages>[number];

/** Newest first. */
export function getPosts(): Post[] {
  return blog
    .getPages()
    .sort((a, b) => b.data.date.localeCompare(a.data.date));
}
