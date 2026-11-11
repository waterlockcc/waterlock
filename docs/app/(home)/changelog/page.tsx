import type { Metadata } from 'next';
import { GitHubIcon, NpmIcon } from '@/components/brand-icons';
import { Dither } from '@/components/dither';
import { getMDXComponents } from '@/components/mdx';
import { button, container, heroBand } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { pageMetadata } from '@/lib/seo';
import { links } from '@/lib/shared';
import { getReleases, type Release } from '@/lib/source';

const intro = 'Every release of @waterlock/gateway: what was added, what changed, and how to move to it.';

export const metadata: Metadata = pageMetadata({ title: 'Changelog', description: intro, path: '/changelog' });

const releaseLink = 'pressable grid size-9 place-items-center border border-ink hover:bg-tint/50';

// Anchor per release: /changelog#v0-2-0
const anchor = (r: Release) => `v${r.version.replaceAll('.', '-')}`;

export default function ChangelogPage() {
  const releases = getReleases();
  const [latest] = releases;

  return (
    <>
      <section className={heroBand}>
        <div className={`${container} grid grid-cols-1 gap-10 pt-14 pb-20 sm:pt-20 sm:pb-28 lg:grid-cols-2 lg:items-end`}>
          <h1 className="brand-display text-[48px] leading-[50px] sm:text-[68px] sm:leading-[68px]">changelog</h1>
          <div>
            <p className="label opacity-80">/ Releases</p>
            <p className="mt-4 max-w-xl text-lg leading-6 font-medium">{intro}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={links.releases} className={button({ intent: 'inverse' })}>
                <Dither />
                GitHub releases
              </a>
              <a href={links.npm} className={button({ intent: 'outline-band' })}>
                <Dither />
                npm
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className={`${container} py-8 sm:py-12`}>
        {releases.map((release) => (
          <Entry key={release.version} release={release} latest={release === latest} />
        ))}
      </div>
    </>
  );
}

function Entry({ release, latest }: { release: Release; latest: boolean }) {
  const id = anchor(release);
  const Body = release.body;

  return (
    <article
      id={id}
      className="grid scroll-mt-28 grid-cols-1 gap-6 border-b border-line py-12 last:border-b-0 sm:py-16 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-12"
    >
      <header className="lg:sticky lg:top-28 lg:self-start">
        <a href={`#${id}`} className="group flex flex-wrap items-center gap-2">
          <span className="font-mono text-2xl font-medium tracking-tight group-hover:underline group-hover:underline-offset-4">
            v{release.version}
          </span>
          {latest && <span className="label bg-ink px-1.5 py-0.5 text-[10px] leading-none text-paper">Latest</span>}
        </a>
        <p className="label mt-2 opacity-60">
          <time dateTime={release.date}>{formatDate(release.date)}</time>
        </p>
        {/* Where this version was published. */}
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`${links.github}/releases/tag/v${release.version}`}
            className={releaseLink}
            aria-label={`v${release.version} on GitHub`}
            title={`v${release.version} on GitHub`}
          >
            <GitHubIcon className="size-4" />
          </a>
          <a
            href={`${links.npm}/v/${release.version}`}
            className={releaseLink}
            aria-label={`v${release.version} on npm`}
            title={`v${release.version} on npm`}
          >
            <NpmIcon className="size-4" />
          </a>
        </div>
      </header>

      <div className="min-w-0">
        <h2 className="display text-[28px] leading-[34px]">{release.title}</h2>
        <p className="mt-3 text-lg leading-7 opacity-75">{release.summary}</p>
        <div className="post-body prose mt-6 max-w-none min-w-0">
          <Body components={getMDXComponents()} />
        </div>
      </div>
    </article>
  );
}
