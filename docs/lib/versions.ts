import type * as PageTree from 'fumadocs-core/page-tree';
import { docsRoute } from './shared';

// Docs versions, one root folder each in content/docs:
// - next/: unreleased changes on main, served at /docs/next/...
// - vX.Y/: released docs. The newest is the latest release and is served at
//   /docs/..., so links to /docs always show the current SDK. Older ones are
//   served at /docs/vX.Y/... .
// Versions from before the docs site link out instead.

export type Version = {
  label: string; // v0.2, next
  url: string; // where the version's docs start
  latest?: boolean;
  next?: boolean; // unreleased
  external?: boolean; // docs that live elsewhere (no pages here)
};

export const nextFolder = 'next';
const isRelease = (name: string) => /^v\d+\.\d+$/.test(name);
const newestFirst = (a: string, b: string) => b.localeCompare(a, undefined, { numeric: true });

// Before the docs existed: v0.1 was documented in the README.
const external: Version[] = [
  { label: 'v0.1', url: 'https://github.com/waterlockcc/waterlock/tree/v0.1.1#readme', external: true },
];

/** The newest vX.Y among the top-level folders: the latest release. */
export function newestRelease(folders: string[]): string {
  const [latest] = [...new Set(folders)].filter(isRelease).sort(newestFirst);
  if (!latest) throw new Error('content/docs needs at least one vX.Y folder');
  return latest;
}

/** A page's URL from its slugs: the latest release drops its folder name. */
export function docsUrl(slugs: string[], latest: string): string {
  const rest = slugs[0] === latest ? slugs.slice(1) : slugs;
  return [docsRoute, ...rest].join('/');
}

/** Search tag for a docs URL, so search stays within the version you read. */
export function versionTag(url: string): string {
  const [first] = url.slice(docsRoute.length + 1).split('/');
  return first === nextFolder || (first && isRelease(first)) ? first : 'latest';
}

/** Version folders: root folders named next or vX.Y, top of the tree. */
const isVersionFolder = (node: PageTree.Node): node is PageTree.Folder =>
  node.type === 'folder' &&
  !!node.root &&
  typeof node.name === 'string' &&
  (node.name === nextFolder || isRelease(node.name));

/** Next first, then releases newest first. */
export function getVersions(tree: PageTree.Root): Version[] {
  const names = tree.children.filter(isVersionFolder).map((folder) => String(folder.name));
  const latest = newestRelease(names);
  const releases: Version[] = names.filter(isRelease).map((name) =>
    name === latest ? { label: name, url: docsRoute, latest: true } : { label: name, url: `${docsRoute}/${name}` },
  );
  return [
    ...(names.includes(nextFolder) ? [{ label: nextFolder, url: `${docsRoute}/${nextFolder}`, next: true }] : []),
    ...[...releases, ...external].sort((a, b) => newestFirst(a.label, b.label)),
  ];
}

/** A docs URL's version: its next or vX.Y prefix, or the latest. */
export function versionOf(url: string, versions: Version[]): Version {
  return (
    versions.find((v) => !v.latest && !v.external && (url === v.url || url.startsWith(`${v.url}/`))) ??
    versions.find((v) => v.latest)!
  );
}

/** The sidebar's nodes for a version: its folder's index and pages. */
export function versionTree(tree: PageTree.Root, version: Version): PageTree.Node[] {
  const folder = tree.children.find((node) => isVersionFolder(node) && node.name === version.label) as
    | PageTree.Folder
    | undefined;
  return folder ? [...(folder.index ? [folder.index] : []), ...folder.children] : [];
}

/**
 * Docs links in MDX are written as /docs/...; inside an older version or next
 * they point at that version's copy of the page.
 */
export function versionHref(href: string | undefined, version: Version): string | undefined {
  if (!href || version.latest || version.external) return href;
  const isDocs = href === docsRoute || /^\/docs[/#?]/.test(href);
  const versioned = href.startsWith(`${docsRoute}/${nextFolder}`) || /^\/docs\/v\d+\.\d+(?=[/#?]|$)/.test(href);
  return isDocs && !versioned ? version.url + href.slice(docsRoute.length) : href;
}
