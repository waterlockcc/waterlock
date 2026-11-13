import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/shared';
import { docs, getPosts, getReleases } from '@/lib/source';
import { nextFolder, versionTag } from '@/lib/versions';

export const dynamic = 'force-static';

// Every page, generated from the content, so new posts and docs pages are
// listed without touching this file.
export default function sitemap(): MetadataRoute.Sitemap {
  const url = (path: string) => `${siteUrl}${path}`;
  const posts = getPosts();
  const [latest] = getReleases();
  return [
    { url: url('/'), priority: 1 },
    { url: url('/blog'), lastModified: posts[0]?.data.date },
    ...posts.map((post) => ({ url: url(post.url), lastModified: post.data.date })),
    // Unreleased docs (next) are noindex, so they're left out.
    ...docs
      .getPages()
      .filter((page) => versionTag(page.url) !== nextFolder)
      .map((page) => ({ url: url(page.url) })),
    { url: url('/changelog'), lastModified: latest?.date },
  ];
}
