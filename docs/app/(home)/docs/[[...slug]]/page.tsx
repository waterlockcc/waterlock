import { findNeighbour, findPath } from 'fumadocs-core/page-tree';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DocsSidebar, DocsToc, MobileDocsNav } from '@/components/docs-nav';
import { MeetsArt } from '@/components/meets-art';
import { getMDXComponents } from '@/components/mdx';
import { isProvider } from '@/components/provider-icons';
import { container, heroBand } from '@/components/ui';
import { VersionSelect } from '@/components/version-select';
import { docs } from '@/lib/source';
import { getVersions, versionOf, versionTree } from '@/lib/versions';

export default async function DocsPage(props: PageProps<'/docs/[[...slug]]'>) {
  const { slug } = await props.params;
  const page = docs.getPage(slug);
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
            <DocsSidebar nodes={nodes} versionSelect={picker} />
          </div>
        </aside>

        <div className="min-w-0">
          <MobileDocsNav nodes={nodes} current={title} versionSelect={picker} />
          {!version.latest && (
            <p className="mt-8 border border-ink bg-tint/50 px-4 py-3 lg:mt-0 lg:mb-8">
              You&apos;re reading the docs for <strong>{version.label}</strong>.{' '}
              <Link href={latest.url} className="font-medium text-brand underline underline-offset-4">
                Go to the latest ({latest.label})
              </Link>
            </p>
          )}
          <article className="post-body prose max-w-none min-w-0 max-lg:mt-8">
            <Body components={getMDXComponents({ a: createRelativeLink(docs, page) })} />
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

export function generateStaticParams() {
  return docs.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const { slug } = await props.params;
  const page = docs.getPage(slug);
  if (!page) notFound();
  return { title: page.data.title, description: page.data.description };
}
