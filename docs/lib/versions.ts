import type * as PageTree from 'fumadocs-core/page-tree';
import { docsRoute } from './shared';

// Docs versions. The latest lives at /docs/... and is labelled with the
// package version, so a release bump relabels it. Older versions are
// snapshots in content/docs/vX.Y (made by `pnpm docs:snapshot`), served at
// /docs/vX.Y/...; versions from before the docs site link out instead.

export type Version = {
  label: string; // v0.2
  url: string; // where the version's docs start
  latest?: boolean;
  external?: boolean; // docs that live elsewhere (no pages here)
};

// From the repo's package.json, via next.config.mjs.
const [major, minor] = (process.env.GATEWAY_VERSION ?? '0.0.0').split('.');
export const latestLabel = `v${major}.${minor}`;

// Before the docs existed: v0.1 was documented in the README.
const external: Version[] = [
  { label: 'v0.1', url: 'https://github.com/waterlockcc/waterlock/tree/v0.1.1#readme', external: true },
];

/** Snapshot folders are root folders named vX.Y at the top of the tree. */
export const isSnapshot = (node: PageTree.Node): node is PageTree.Folder =>
  node.type === 'folder' && !!node.root && typeof node.name === 'string' && /^v\d+\.\d+$/.test(node.name);

export function getVersions(tree: PageTree.Root): Version[] {
  const snapshots = tree.children.filter(isSnapshot).map((folder) => ({
    label: String(folder.name),
    url: `${docsRoute}/${folder.name}`,
  }));
  const byNewest = (a: Version, b: Version) =>
    b.label.localeCompare(a.label, undefined, { numeric: true });
  return [
    { label: latestLabel, url: docsRoute, latest: true },
    ...[...snapshots, ...external].sort(byNewest),
  ];
}

/** The version a docs URL belongs to: its vX.Y prefix, or the latest. */
export function versionOf(url: string, versions: Version[]): Version {
  return (
    versions.find((v) => !v.latest && !v.external && (url === v.url || url.startsWith(`${v.url}/`))) ??
    versions.find((v) => v.latest)!
  );
}

/** The sidebar's nodes for a version: its folder, or the latest's top level. */
export function versionTree(tree: PageTree.Root, version: Version): PageTree.Node[] {
  if (version.latest) return tree.children.filter((node) => !isSnapshot(node));
  const folder = tree.children.find((node) => isSnapshot(node) && node.name === version.label) as
    | PageTree.Folder
    | undefined;
  return folder ? [...(folder.index ? [folder.index] : []), ...folder.children] : [];
}
