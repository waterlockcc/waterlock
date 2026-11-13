import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { docs, latestRelease } from './source';
import { nextFolder } from './versions';

export type Change = 'new' | 'updated';

const read = (path: string) => {
  try {
    return readFileSync(join(process.cwd(), 'content/docs', path), 'utf8');
  } catch {
    return undefined;
  }
};

let cache: Record<string, Change> | undefined;

/**
 * Pages in next/ that differ from the same page in the latest release, by URL.
 * Compares the files, not git history: builds may clone without tags.
 */
export function nextChanges(): Record<string, Change> {
  if (cache) return cache;
  const out: Record<string, Change> = {};
  for (const page of docs.getPages()) {
    if (page.slugs[0] !== nextFolder) continue;
    const released = read(`${latestRelease}/${page.path.slice(nextFolder.length + 1)}`);
    if (released === undefined) out[page.url] = 'new';
    else if (released !== read(page.path)) out[page.url] = 'updated';
  }
  return (cache = out);
}
