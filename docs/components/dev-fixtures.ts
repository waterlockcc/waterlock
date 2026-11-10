import type { PostItem } from '@/lib/post-item';

// Realistic worst cases for the blog index (see the break-ui skill). Each row
// carries a different failure, the way real data mixes them.
const worst: PostItem[] = [
  {
    url: '/blog/worst-1',
    category: 'Engineering',
    title:
      'How a GraphQL alias let our triage agent slip past a naive allowlist, and the three rules we wrote afterwards',
    description:
      'Short version: match on the operation, never on the field name the client chose.',
    author: 'Aleksandra Wiśniewska-Kowalczyk',
    date: '2027-01-05', // scheduled post, dated in the future
  },
  {
    url: '/blog/worst-2',
    category: 'Product',
    image: '/blog/agent-keys-v2.png', // typo'd path: a 404
    title:
      'Upgrading to @waterlock/gateway@0.3.0-beta.12 with ai-sdk-provider-claude-code@3.4.1',
    description:
      'The 0.3 line changes how sessions are minted, how plain-language checks receive their input, and how denials are reported back to the agent. ' +
      'This post walks through every breaking change, with before and after code for the gateway, the agent and the tests, ' +
      'and ends with a checklist you can paste into your upgrade PR. If you run more than one gateway, read the section on key rotation first, ' +
      'because tokens minted by an old gateway are rejected by a new one until both share a key list.',
    author: 'Jo',
    date: '2026-11-11',
  },
  {
    url: '/blog/worst-3',
    category: 'Engineering',
    title: 'Why <script> tags & **markdown** in issue bodies never reach the check model',
    description: 'Escaping happens once, at the gateway, before the prompt is built.',
    author: 'نور الهدى عبد الرحمن',
    date: '2026-01-01',
  },
  {
    url: '/blog/worst-4',
    category: 'News',
    image: '/logo.svg', // square image in a 16:9 frame
    title: 'Hi',
    description: 'x',
    author: 'Christopher Alexander Montgomery III, Senior Product Design Engineer, Platform Infrastructure',
    date: '2025-12-31',
  },
  {
    url: '/blog/worst-5',
    category: 'News',
    title: 'Release notes',
    description: 'Benachrichtigungseinstellungen-Konfigurationsdateien are now validated.',
    author: '王秀英',
    date: '2025-06-30',
  },
  {
    url: '/blog/worst-6',
    category: 'News',
    title: 'Release notes',
    description: 'Same title as the post above: only the date tells them apart.',
    author: 'Đặng Thị Ngọc Hân',
    date: '2025-06-01',
  },
];

export const fixtures = {
  worst: () => worst,
  empty: () => [],
  one: (real: PostItem[]) => real.slice(0, 1),
  many: (real: PostItem[]) =>
    Array.from({ length: 200 }, (_, i) => {
      const day = new Date(Date.UTC(2026, 10, 11 - i * 3));
      return {
        ...(real[i % real.length] ?? worst[0]!),
        url: `/blog/many-${i}`,
        title: `Release notes 0.${200 - i}.0`,
        date: day.toISOString().slice(0, 10),
      };
    }),
} satisfies Record<string, (real: PostItem[]) => PostItem[]>;

export type Fixture = keyof typeof fixtures;
