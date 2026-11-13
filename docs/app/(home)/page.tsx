import { highlight } from 'fumadocs-core/highlight';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CopyCommand } from '@/components/copy-command';
import { Dither } from '@/components/dither';
import { ProviderIcon, type ProviderId } from '@/components/provider-icons';
import { button, container, heroBand } from '@/components/ui';
import { pageMetadata } from '@/lib/seo';
import { links, siteUrl } from '@/lib/shared';

const pitch =
  'Agents call your APIs through waterlock with a short-lived token. It holds the real keys, checks every call against rules you write, and forwards only what you allow.';

export const metadata: Metadata = {
  ...pageMetadata({ title: 'waterlock: a policy gateway for AI agents', description: pitch, path: '/' }),
  title: { absolute: 'waterlock: a policy gateway for AI agents' },
};

// Structured data: tells search engines this is an open-source library.
const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareSourceCode',
  name: 'waterlock',
  description: pitch,
  url: siteUrl,
  codeRepository: links.github,
  programmingLanguage: 'TypeScript',
  runtimePlatform: 'Node.js',
  license: 'https://opensource.org/licenses/MIT',
};

const steps = [
  {
    title: 'The agent gets a token',
    body: 'A short-lived, signed session token for one provider. No API key ever reaches the agent.',
    href: `${links.docs}/concepts/sessions`,
  },
  {
    title: 'You write the rules',
    body: 'Rules in TypeScript decide what is allowed, default deny. Rules in natural language, answered by your model, can only take away.',
    href: `${links.docs}/concepts/policies`,
  },
  {
    title: 'The gateway holds the key',
    body: 'The real credential is added on the way out, after the call is allowed. Anything else gets a 403 with the reason.',
    href: `${links.docs}/concepts/credentials`,
  },
];

const providers: { id: ProviderId; kind: string }[] = [
  { id: 'gmail', kind: 'REST · Discovery' },
  { id: 'linear', kind: 'GraphQL' },
];

// The demo's gateway policy (the video below), trimmed of comments.
const rules = `policy: [
  { when: (r) => r.action.startsWith("linear.query.") },
  { when: (r) => r.action === "linear.mutation.issueCreate" },
  { when: (r) => r.action === "linear.mutation.issueUpdate" },
  {
    when: (r) =>
      r.action === "linear.mutation.issueUpdate" &&
      r.params.input.teamId !== undefined &&
      r.params.input.teamId !== AGENTS_TEAM,
    action: "deny",
    reason: "Issues can't be moved to another team.",
  },
  {
    when: "The issue contains billing or payment information",
    action: "deny",
  },
],`;

export default async function Home() {
  const code = await highlight(rules, {
    lang: 'ts',
    themes: { light: 'min-light', dark: 'min-dark' },
    // CSS variables only (no inline colours), so the dark theme applies in
    // dark mode, as in the docs' code blocks.
    defaultColor: false,
  });

  return (
    <>
      <script
        type="application/ld+json"
        // Our own constant object, serialised; no user input reaches it.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }}
      />
      <section className={heroBand}>
        <div className={`${container} grid grid-cols-1 gap-10 pt-14 pb-20 sm:pt-24 sm:pb-32 lg:grid-cols-2 lg:items-end`}>
          <h1 className="brand-display text-[48px] leading-[50px] sm:text-[76px] sm:leading-[76px]">
            your agent never sees the key
          </h1>
          <div>
            <h2 className="label opacity-80">/ Open-source policy gateway for AI agents · MIT</h2>
            <p className="mt-4 max-w-xl text-lg leading-7 font-medium">{pitch}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CopyCommand />
              <Link href={links.docs} className={button({ intent: 'outline-band' })}>
                <Dither />
                Read the docs
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className={`${container} py-20 sm:py-28`}>
        <p className="label opacity-60">/ How it works</p>
        <ol className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="flex">
              <Link href={step.href} className="card group flex w-full flex-col border border-ink p-6 hover:bg-tint/40">
                <span className="label opacity-60">{String(i + 1).padStart(2, '0')}</span>
                <h2 className="card-title display mt-6 text-2xl">{step.title}</h2>
                <p className="mt-3 leading-7 opacity-75">{step.body}</p>
                <span className="label mt-auto flex items-center gap-1.5 pt-8 text-brand">
                  Learn more <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* The rules, and them working. On wide screens a two-row grid: text
          in row 1, code and video in row 2, so both blocks start on the same
          line and share a height. On phones: text, code, text, video. */}
      <section className="border-y border-line bg-tint/30">
        <div
          className={`${container} grid grid-cols-1 gap-x-12 gap-y-8 py-20 sm:py-28 lg:grid-cols-2 lg:grid-rows-[auto_1fr]`}
        >
          <div className="min-w-0 lg:col-start-1 lg:row-start-1">
            <p className="label opacity-60">/ The rules</p>
            <h2 className="display mt-4 text-[32px] leading-9">Rules in code, or in natural language</h2>
            <p className="mt-3 max-w-lg leading-7 opacity-75">
              Reading, creating and updating issues are allowed. Moving one to another team is denied in
              TypeScript, and billing details are kept out with one sentence.
            </p>
          </div>
          <div className="landing-code min-w-0 overflow-x-auto border border-ink text-[13px] leading-6 lg:col-start-1 lg:row-start-2">
            {code}
          </div>

          <div className="min-w-0 max-lg:mt-8 lg:col-start-2 lg:row-start-1">
            <p className="label opacity-60">/ On a real Linear workspace</p>
            <h2 className="display mt-4 text-[32px] leading-9">Two allowed, two blocked</h2>
            <p className="mt-3 max-w-lg leading-7 opacity-75">
              An AI SDK agent files an issue and raises its priority. Moving it is blocked by a TypeScript rule;
              a refund with a card number, by a natural-language rule.
            </p>
          </div>
          <div className="grid min-w-0 place-items-center border border-ink bg-black lg:col-start-2 lg:row-start-2">
            <video
              src="/demo.mp4"
              poster="/demo-poster.jpg"
              controls
              muted
              playsInline
              preload="metadata"
              aria-label="An AI SDK agent works on a real Linear workspace through the waterlock gateway"
              className="aspect-[5/3] w-full"
            />
          </div>
        </div>
      </section>

      {/* Providers */}
      <section className={`${container} py-20 sm:py-28`}>
        <p className="label opacity-60">/ Providers</p>
        <ul className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
          {providers.map(({ id, kind }) => (
            <li key={id} className="flex">
              <Link
                href={`${links.docs}/providers/${id}`}
                className="card group flex w-full items-center gap-4 border border-ink p-5 hover:bg-tint/40"
              >
                <span className="grid size-12 shrink-0 place-items-center border border-ink bg-paper">
                  <ProviderIcon id={id} className="size-6 text-brand" />
                </span>
                <span className="flex flex-col">
                  <span className="card-title text-lg font-medium capitalize">{id}</span>
                  <span className="label text-xs opacity-60">{kind}</span>
                </span>
              </Link>
            </li>
          ))}
          <li className="flex">
            <a
              href={links.newIssue}
              className="group flex w-full items-center gap-4 border border-dashed border-ink p-5 hover:bg-tint/40"
            >
              <span className="grid size-12 shrink-0 place-items-center border border-dashed border-ink">
                <ArrowUpRight className="size-5" aria-hidden />
              </span>
              <span className="flex flex-col">
                <span className="text-lg font-medium group-hover:underline group-hover:underline-offset-4">
                  Request a provider
                </span>
                <span className="label text-xs opacity-60">Open an issue</span>
              </span>
            </a>
          </li>
        </ul>
      </section>
    </>
  );
}
