import { readFileSync } from 'node:fs';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

// The gateway's version labels the latest docs. Read here because the app
// can't import files outside docs/.
const gateway = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** @type {import('next').NextConfig} */
const config = {
  // Static site: out/ can go on GitHub Pages or any static host.
  output: 'export',
  // No image server in a static export; MDX images are served as-is.
  images: { unoptimized: true },
  // The repo root has its own lockfile; this app is separate from it.
  turbopack: { root: import.meta.dirname },
  reactStrictMode: true,
  env: { GATEWAY_VERSION: gateway.version },
};

export default withMDX(config);
