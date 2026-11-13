// Release the docs in next/ as a version: pnpm docs:release
//
// Run it in the release PR, after bumping the package version. It copies
// content/docs/next to content/docs/vX.Y, where X.Y is the version being
// released, and lists it in content/docs/meta.json. The newest vX.Y folder is
// the latest release, served at /docs/...; the one before moves to
// /docs/vX.Y/... . next/ stays as it is and keeps collecting changes for the
// following release. Links need no rewriting: /docs/... links resolve to the
// version they're read in (lib/versions.ts).
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const docs = join(root, 'content/docs');
const { version } = JSON.parse(readFileSync(join(root, '../package.json'), 'utf8'));
const [major, minor] = version.split('.');
const name = `v${major}.${minor}`;
const target = join(docs, name);

if (existsSync(target)) {
  console.error(`${name} already exists in content/docs. Bump the version first?`);
  process.exit(1);
}

cpSync(join(docs, 'next'), target, { recursive: true });

// Its meta.json: same page order, titled with the version.
const metaPath = join(target, 'meta.json');
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
writeFileSync(metaPath, JSON.stringify({ ...meta, title: name, root: true }, null, 2) + '\n');

// List it in the top-level meta.json so it is part of the page tree.
const topPath = join(docs, 'meta.json');
const top = JSON.parse(readFileSync(topPath, 'utf8'));
if (!top.pages.includes(name)) top.pages.push(name);
writeFileSync(topPath, JSON.stringify(top, null, 2) + '\n');

console.log(`Released content/docs/next as ${name}: now the latest, served at /docs.`);
