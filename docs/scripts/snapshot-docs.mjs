// Freeze the current docs as a version: pnpm docs:snapshot
//
// Run it just before bumping the package version for a release. It copies
// content/docs (minus older snapshots) to content/docs/vX.Y, where X.Y is
// the version being released from, marks that folder as a version root,
// and points its /docs/... links at /docs/vX.Y/... . The latest docs keep
// /docs/... and get the new version's label once package.json is bumped.
import { cpSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const docs = join(root, 'content/docs');
const { version } = JSON.parse(readFileSync(join(root, '../package.json'), 'utf8'));
const [major, minor] = version.split('.');
const name = `v${major}.${minor}`;
const target = join(docs, name);
const isSnapshot = (entry) => /^v\d+\.\d+$/.test(entry);

if (existsSync(target)) {
  console.error(`${name} already exists in content/docs. Bump the version first?`);
  process.exit(1);
}

// Copy everything but other snapshots.
for (const entry of readdirSync(docs)) {
  if (isSnapshot(entry)) continue;
  cpSync(join(docs, entry), join(target, entry), { recursive: true });
}

// Its meta.json: same page order, now a version root.
const metaPath = join(target, 'meta.json');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
writeFileSync(metaPath, JSON.stringify({ title: name, root: 'version', ...meta, title: name }, null, 2) + '\n');

// Links inside the snapshot stay inside the snapshot.
const walk = (dir) =>
  readdirSync(dir).flatMap((e) => (statSync(join(dir, e)).isDirectory() ? walk(join(dir, e)) : [join(dir, e)]));
for (const file of walk(target).filter((f) => f.endsWith('.mdx') || f.endsWith('.md'))) {
  const text = readFileSync(file, 'utf8');
  writeFileSync(file, text.replace(/\]\(\/docs(?=[/)#])(?!\/v\d+\.\d+)/g, `](/docs/${name}`));
}

// List it in the top-level meta.json so it is part of the page tree.
const topPath = join(docs, 'meta.json');
const top = JSON.parse(readFileSync(topPath, 'utf8'));
if (!top.pages.includes(name)) top.pages.push(name);
writeFileSync(topPath, JSON.stringify(top, null, 2) + '\n');

console.log(`Snapshot: content/docs/${name} (served at /docs/${name}). Now bump the version.`);
