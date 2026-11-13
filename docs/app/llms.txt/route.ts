import { siteUrl } from '@/lib/shared';
import { docs, getPosts } from '@/lib/source';
import { versionTag } from '@/lib/versions';

// /llms.txt (llmstxt.org): a plain-text index for AI search tools. What
// waterlock is, then the latest docs and the posts, generated from the
// content so new pages are listed without touching this file.
export const dynamic = 'force-static';

type Entry = { url: string; data: { title: string; description?: string } };

const line = ({ url, data }: Entry) =>
  `- [${data.title}](${siteUrl}${url})${data.description ? `: ${data.description}` : ''}`;

export function GET() {
  const body = [
    '# waterlock',
    '',
    '> Open-source policy gateway for AI agents. Agents call APIs through waterlock with a short-lived token; it holds the real keys, checks every call against rules in TypeScript or natural language, and forwards only what you allow. npm: @waterlock/gateway. MIT license.',
    '',
    '## Docs',
    '',
    ...docs
      .getPages()
      .filter((page) => versionTag(page.url) === 'latest')
      .map(line),
    '',
    '## Blog',
    '',
    ...getPosts().map(line),
    '',
    '## Optional',
    '',
    `- [Changelog](${siteUrl}/changelog): release notes`,
    '- [Source on GitHub](https://github.com/waterlockcc/waterlock)',
    '',
  ].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
