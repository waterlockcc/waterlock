import { createFromSource } from 'fumadocs-core/search/server';
import { docs } from '@/lib/source';

// Built once at export time into a static index the browser searches.
export const revalidate = false;

export const { staticGET: GET } = createFromSource(docs, {
  language: 'english',
});
