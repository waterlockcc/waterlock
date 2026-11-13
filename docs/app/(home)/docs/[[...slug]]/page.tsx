import { findNeighbour, findPath } from 'fumadocs-core/page-tree';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChangeTag, DocsSidebar, DocsToc, MobileDocsNav } from '@/components/docs-nav';
import { MeetsArt } from '@/components/meets-art';
import { getMDXComponents } from '@/components/mdx';
import { isProvider } from '@/components/provider-icons';
import { container, heroBand } from '@/components/ui';
import { VersionSelect } from '@/components/version-select';
import { nextChanges } from '@/lib/changes';
import { pageMetadata } from '@/lib/seo';
import { docsRoute } from '@/lib/shared';
import { docs } from '@/lib/source';
import { getVersions, versionHref, versionOf, versionTree } from '@/lib/versions';

/**
 * The page at /docs/<slug>. Looked up by URL, not slugs: the latest release's
 * pages are served without their vX.Y folder name.
 */
const byUrl = new Map(docs.getPages().map((page) => [page.url, page]));
const pageAt = (slug: string[] = []) => byUrl.get([docsRoute, ...slug].join('/'));

export default async function DocsPage(props: PageProps<'/docs/[[...slug]]'>) {
  const { slug } = await props.params;
  const page = pageAt(slug);
  if (!page) notFound();
  const tree = docs.getPageTree();
  const { title, description, toc, icon, body: Body } = page.data;

  // This page's version, and only that version's pages in the sidebar and
  // the previous / next links.
  const versions = getVersions(tree);
  const version = versionOf(page.url, versions);
  const latest = versions.find((v) => v.latest)!;
  const nodes = versionTree(tree, version);
  const picker = <VersionSelect versions={versions} pages={docs.getPages().map((p) => p.url)} />;
  // In next: pages that differ from the latest release.
  const changes = version.next ? nextChanges() : {};
  const RelativeLink = createRelativeLink(docs, page);

  // The section this page sits in, for the band's label.
  const section = findPath(nodes, (node) => node.type === 'page' && node.url === page.url)?.find(
    (node) => node.type === 'folder',
  )?.name;
  const { previous, next } = findNeighbour({ name: 'docs', children: nodes }, page.url);

  return (
    <>
      <section className={heroBand}>
        <div
          className={`${container} grid grid-cols-1 items-center gap-10 pt-12 pb-14 sm:pt-16 sm:pb-20 ${isProvider(icon) ? 'lg:grid-cols-2' : ''}`}
        >
          <div>
            <p className="label opacity-80">
              / Docs / <span className="normal-case">{version.label}</span>
              {section ? <> / {section}</> : null}
              {changes[page.url] && <ChangeTag change={changes[page.url]!} since={latest.label} className="ms-3 align-middle" />}
            </p>
            <h1 className="display mt-4 text-[40px] leading-[46px] sm:text-5xl sm:leading-[56px]">{title}</h1>
            {description && <p className="mt-4 max-w-2xl text-lg leading-6 font-medium">{description}</p>}
          </div>
          {/* Provider pages: "waterlock meets <provider>". */}
          {isProvider(icon) && (
            <div className="art dots aspect-video border border-ink bg-[var(--art-bg)] text-ink shadow-[8px_8px_0_rgb(0_0_0/0.3)]">
              <MeetsArt provider={icon} />
            </div>
          )}
        </div>
      </section>

      <div className={`${container} grid grid-cols-1 gap-10 py-10 sm:py-14 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_200px] lg:gap-12`}>
        <aside className="hidden lg:block">
          <div className="sticky top-28 max-h-[calc(100vh-8rem)] overflow-y-auto pb-8">
            <DocsSidebar nodes={nodes} versionSelect={picker} changes={changes} />
          </div>
        </aside>

        <div className="min-w-0">
          <MobileDocsNav nodes={nodes} current={title} versionSelect={picker} changes={changes} />
          {!version.latest && (
            <div className="mt-8 border border-ink bg-tint/50 px-4 py-3 lg:mt-0 lg:mb-8">
              <p>
                {version.next ? (
                  <>
                    You&apos;re reading <strong>unreleased</strong> docs: changes on main since {latest.label}.{' '}
                  </>
                ) : (
                  <>
                    You&apos;re reading the docs for <strong>{version.label}</strong>.{' '}
                  </>
                )}
                <Link href={latest.url} className="font-medium text-brand underline underline-offset-4">
                  Go to the latest ({latest.label})
                </Link>
              </p>
              {/* On next's first page: what changed since the latest release. */}
              {version.next && page.url === version.url && (
                <ChangedList changes={changes} since={latest.label} />
              )}
            </div>
          )}
          <article className="post-body prose max-w-none min-w-0 max-lg:mt-8">
            <Body
              components={getMDXComponents({
                a: (props) => <RelativeLink {...props} href={versionHref(props.href, version)} />,
              })}
            />
          </article>

          {(previous || next) && (
            <nav aria-label="Pagination" className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {previous ? <Neighbour node={previous} dir="previous" /> : <span />}
              {next && <Neighbour node={next} dir="next" />}
            </nav>
          )}
        </div>

        <aside className="hidden xl:block">
          <div className="sticky top-28">
            <DocsToc toc={toc} />
          </div>
        </aside>
      </div>
    </>
  );
}

function Neighbour({ node, dir }: { node: { url: string; name: React.ReactNode }; dir: 'previous' | 'next' }) {
  const next = dir === 'next';
  return (
    <Link
      href={node.url}
      className={`card pressable flex flex-col gap-2 border border-ink p-4 hover:bg-tint/40 ${next ? 'items-end text-end sm:col-start-2' : ''}`}
    >
      <span className="label flex items-center gap-1.5 opacity-60">
        {!next && <ArrowLeft className="size-3.5" aria-hidden />}
        {next ? 'Next' : 'Previous'}
        {next && <ArrowRight className="size-3.5" aria-hidden />}
      </span>
      <span className="card-title text-lg font-medium">{node.name}</span>
    </Link>
  );
}

/** What changed in next since the latest release, linked. */
function ChangedList({ changes, since }: { changes: Record<string, 'new' | 'updated'>; since: string }) {
  const pages = docs.getPages().filter((p) => changes[p.url]);
  if (pages.length === 0) return <p className="mt-2">No pages have changed since {since} yet.</p>;
  return (
    <>
      <p className="mt-3 font-medium">Changed since {since}:</p>
      <ul className="mt-2 flex flex-col gap-1.5">
        {pages.map((p) => (
          <li key={p.url} className="flex items-center gap-2">
            <Link href={p.url} className="text-brand underline underline-offset-4">
              {p.data.title}
            </Link>
            <ChangeTag change={changes[p.url]!} since={since} />
          </li>
        ))}
      </ul>
    </>
  );
}

export function generateStaticParams() {
  return docs.getPages().map((page) => ({ slug: page.url.slice(docsRoute.length).split('/').filter(Boolean) }));
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const page = pageAt(slug);
  if (!page) notFound();
  const version = versionOf(page.url, getVersions(docs.getPageTree()));
  // An older release's page sends its rank to the same page in the latest
  // docs, so the two don't compete in search. One the latest docs no longer
  // have stays out of search.
  const old = !version.latest && !version.next;
  const current = old ? byUrl.get(docsRoute + page.url.slice(version.url.length)) : undefined;
  return pageMetadata({
    title: page.data.title,
    description: page.data.description,
    path: page.url,
    canonical: current?.url,
    // Unreleased docs stay out of search engines; /docs is the version to find.
    noindex: version.next || (old && !current),
  });
}
