import type { Metadata } from 'next';
import { appName } from './shared';

// Per-page metadata for search and link previews: canonical URL, Open Graph
// and Twitter card, all with the same social image. Next replaces a parent's
// `openGraph` object wholesale, so every page builds the full set here.
const image = { url: '/og.png', width: 1280, height: 640, alt: 'waterlock: a credential gateway for AI agents' };

export function pageMetadata({
  title,
  description,
  path,
  type = 'website',
  noindex,
}: {
  /** The page title, without the site name (the layout's template adds it). */
  title: string;
  description?: string;
  /** The page's path, e.g. `/docs/concepts/actions`. */
  path: string;
  type?: 'website' | 'article';
  noindex?: boolean;
}): Metadata {
  return {
    title,
    ...(noindex ? { robots: { index: false } } : {}),
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: appName, type, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  };
}
