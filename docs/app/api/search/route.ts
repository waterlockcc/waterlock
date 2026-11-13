import { createFromSource } from 'fumadocs-core/search/server';
import { docs } from '@/lib/source';
import { versionTag } from '@/lib/versions';

// Built once at export time into a static index the browser searches. Each
// page is tagged with its version, so search stays within the one you read.
export const revalidate = false;

export const { staticGET: GET } = createFromSource(docs, {
  language: 'english',
  buildIndex: (page) => ({
    id: page.url,
    url: page.url,
    title: page.data.title,
    description: page.data.description,
    structuredData: page.data.structuredData,
    tag: versionTag(page.url),
  }),
});
