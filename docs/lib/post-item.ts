import type { ArtStyle } from '@/components/cover-art';

// Client-safe: no imports from the content source, so client components can
// use these without pulling MDX into the browser bundle.
export const categories = ['Engineering', 'Product', 'News'] as const;
export type Category = (typeof categories)[number];

// What the client components get: plain data, no MDX body.
export type PostItem = {
  url: string;
  title: string;
  description: string;
  author: string;
  category: Category;
  date: string;
  art?: ArtStyle;
  image?: string;
};
