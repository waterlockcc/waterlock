import type { Metadata } from 'next';
import { appName } from './shared';

// Per-page metadata for search and link previews: canonical URL, Open Graph
// and Twitter card, with the site's social image unless the page has its
// own. Next replaces a parent's `openGraph` object wholesale, so every page
// builds the full set here.
const siteImage = { url: '/og.png', width: 1280, height: 640, alt: 'waterlock: a credential gateway for AI agents' };

export function pageMetadata({
  title,
  description,
  path,
  canonical = path,
  type = 'website',
  noindex,
  image,
}: {
  /** The page title, without the site name (the layout's template adds it). */
  title: string;
  description?: string;
  /** The page's path, e.g. `/docs/concepts/actions`. */
  path: string;
  /** The URL search engines should rank for this page. Default: `path`. */
  canonical?: string;
  type?: 'website' | 'article';
  noindex?: boolean;
  /** The page's own social image, a file in public/ (e.g. a post cover). */
  image?: string;
}): Metadata {
  const card = image ? { url: image, alt: title } : siteImage;
  return {
    title,
    ...(noindex ? { robots: { index: false } } : {}),
    description,
    alternates: { canonical },
    openGraph: { title, description, url: path, siteName: appName, type, images: [card] },
    twitter: { card: 'summary_large_image', title, description, images: [card.url] },
  };
}
