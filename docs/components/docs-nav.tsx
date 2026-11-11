'use client';
import { clsx } from 'clsx';
import type * as PageTree from 'fumadocs-core/page-tree';
import { AnchorProvider, useActiveAnchors, type TOCItemType } from 'fumadocs-core/toc';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { ChevronDown, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

/** Square search button that opens the docs search (also ⌘K). */
export function SearchButton({ className }: { className?: string }) {
  const { setOpenSearch } = useSearchContext();
  return (
    <button
      type="button"
      onClick={() => setOpenSearch(true)}
      className={clsx('label pressable flex h-10 w-full items-center gap-2 border border-ink px-3 hover:bg-tint/50', className)}
    >
      <Search className="size-4" aria-hidden />
      Search
      <kbd className="ms-auto font-mono text-xs opacity-60">⌘K</kbd>
    </button>
  );
}

/**
 * Sidebar: version picker, search, then `/ SECTION` labels with pages under
 * them and a teal bar on the open page. `nodes` is one version's tree.
 */
export function DocsSidebar({ nodes, versionSelect }: { nodes: PageTree.Node[]; versionSelect?: ReactNode }) {
  return (
    <nav aria-label="Docs" className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        {versionSelect}
        <SearchButton />
      </div>
      <Nodes nodes={nodes} />
    </nav>
  );
}

function Nodes({ nodes }: { nodes: PageTree.Node[] }) {
  const pages: ReactNode[] = [];
  const out: ReactNode[] = [];
  const flush = () => {
    if (pages.length) out.push(<ul key={`p${out.length}`} className="flex flex-col">{pages.splice(0)}</ul>);
  };
  for (const node of nodes) {
    if (node.type === 'page') pages.push(<PageLink key={node.url} node={node} />);
    else if (node.type === 'folder') {
      flush();
      out.push(
        <div key={node.$id ?? String(node.name)}>
          <p className="label mb-3 opacity-60">/ {node.name}</p>
          <ul className="flex flex-col">
            {node.index && <PageLink node={node.index} />}
            {node.children.map((child) =>
              child.type === 'page' ? <PageLink key={child.url} node={child} /> : null,
            )}
          </ul>
        </div>,
      );
    } else {
      flush();
      if (node.name) out.push(<p key={`s${out.length}`} className="label opacity-60">/ {node.name}</p>);
    }
  }
  flush();
  return <>{out}</>;
}

function PageLink({ node }: { node: PageTree.Item }) {
  const active = usePathname() === node.url;
  return (
    <li>
      <Link
        href={node.url}
        aria-current={active ? 'page' : undefined}
        className={clsx(
          'flex items-center gap-2 border-l-2 py-1.5 ps-3 text-[15px] leading-5',
          active ? 'border-brand font-medium text-brand' : 'border-line hover:border-ink',
        )}
      >
        {node.icon}
        {node.name}
      </Link>
    </li>
  );
}

/** On phones the sidebar folds into a menu above the page. */
export function MobileDocsNav({
  nodes,
  current,
  versionSelect,
}: {
  nodes: PageTree.Node[];
  current: string;
  versionSelect?: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();
  // Close after navigating.
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);
  return (
    <details ref={ref} className="group border border-ink lg:hidden">
      <summary className="label flex h-11 cursor-pointer list-none items-center gap-2 px-3">
        <span className="opacity-60">/ Docs</span>
        <span className="truncate normal-case">{current}</span>
        <ChevronDown className="ms-auto size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="border-t border-ink p-4">
        <DocsSidebar nodes={nodes} versionSelect={versionSelect} />
      </div>
    </details>
  );
}

/** "On this page", highlighting the headings in view. */
export function DocsToc({ toc }: { toc: TOCItemType[] }) {
  if (toc.length === 0) return null;
  return (
    <AnchorProvider toc={toc}>
      <TocList toc={toc} />
    </AnchorProvider>
  );
}

function TocList({ toc }: { toc: TOCItemType[] }) {
  const active = useActiveAnchors();
  return (
    <nav aria-label="On this page">
      <p className="label mb-3 opacity-60">/ On this page</p>
      <ul className="flex flex-col">
        {toc.map((item) => {
          const on = active.includes(item.url.slice(1));
          return (
            <li key={item.url}>
              <a
                href={item.url}
                className={clsx(
                  'block border-l-2 py-1 text-sm leading-5',
                  item.depth > 2 ? 'ps-6' : 'ps-3',
                  on ? 'border-brand text-brand' : 'border-line opacity-75 hover:opacity-100',
                )}
              >
                {item.title}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
