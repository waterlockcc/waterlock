import { loader } from 'fumadocs-core/source';
import { metaSchema, pageSchema } from 'fumadocs-core/source/schema';
import { applyMdxPreset } from 'fumadocs-mdx/config';
import convert from 'npm-to-yarn';
import { defineCollections, defineDocs } from 'fumadocs-mdx/macro';
import { createElement } from 'react';
import { z } from 'zod';
import { isProvider, ProviderIcon } from '@/components/provider-icons';
import { blogRoute, docsRoute } from './shared';

// One MDX file per post in content/blog. The file name is the URL slug.
const posts = defineCollections({
  type: 'doc',
  dir: 'content/blog',
  // Code blocks: Min, light and dark. A ```npm block becomes npm /
  // pnpm / bun tabs, npm first (the default); the pick is saved in
  // localStorage and shared by every block. Repeated per collection: the
  // macro only sees package imports, not local constants.
  mdxOptions: applyMdxPreset({
    rehypeCodeOptions: { themes: { light: 'min-light', dark: 'min-dark' } },
    remarkNpmOptions: {
      persist: { id: 'package-manager' },
      packageManagers: [
        { name: 'npm', command: (cmd) => cmd },
        { name: 'pnpm', command: (cmd) => cmd.split('\n').map((l) => convert(l, 'pnpm')).join('\n') },
        { name: 'bun', command: (cmd) => cmd.split('\n').map((l) => convert(l, 'bun')).join('\n') },
      ],
    },
  }),
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
    // A day (2026-11-11) or a UTC time (2026-11-11T15:00:00Z) when two
    // posts share a day; the time only orders them, pages show the day.
    // YAML reads either unquoted as a Date; keep it as an ISO string.
    date: z.coerce.date().transform((d) => d.toISOString()),
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

// Docs: content/docs, ordered and grouped by the meta.json files there.
const docsCollection = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema,
    // Code blocks: Min, light and dark. A ```npm block becomes npm /
    // pnpm / bun tabs, npm first (the default); the pick is saved in
    // localStorage and shared by every block. Repeated per collection: the
    // macro only sees package imports, not local constants.
    mdxOptions: applyMdxPreset({
      rehypeCodeOptions: { themes: { light: 'min-light', dark: 'min-dark' } },
      remarkNpmOptions: {
        persist: { id: 'package-manager' },
        packageManagers: [
          { name: 'npm', command: (cmd) => cmd },
          { name: 'pnpm', command: (cmd) => cmd.split('\n').map((l) => convert(l, 'pnpm')).join('\n') },
          { name: 'bun', command: (cmd) => cmd.split('\n').map((l) => convert(l, 'bun')).join('\n') },
        ],
      },
    }),
  },
  meta: { schema: metaSchema },
});

export const docs = loader({
  baseUrl: docsRoute,
  source: docsCollection.toFumadocsSource(),
  // `icon: "gmail"` in a page's frontmatter shows that provider's mark in
  // the sidebar.
  icon: (icon) => (isProvider(icon) ? createElement(ProviderIcon, { id: icon, className: 'size-4 shrink-0' }) : undefined),
});

// Changelog: one file per release in content/changelog (`0.2.0.mdx`),
// written at release time. See .claude/skills/update-changelog.
const releases = defineCollections({
  type: 'doc',
  dir: 'content/changelog',
  mdxOptions: applyMdxPreset({
    rehypeCodeOptions: { themes: { light: 'min-light', dark: 'min-dark' } },
  }),
  schema: pageSchema.extend({
    version: z.string(),
    summary: z.string(),
    date: z.coerce.date().transform((d) => d.toISOString().slice(0, 10)),
  }),
});

export type Release = (typeof releases.entries)[number];

/** Newest version first. */
export function getReleases(): Release[] {
  return [...releases.entries].sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true }),
  );
}
