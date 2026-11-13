import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  // Static site: out/ can go on GitHub Pages or any static host.
  output: 'export',
  // No image server in a static export; MDX images are served as-is.
  images: { unoptimized: true },
  // The repo root has its own lockfile; this app is separate from it.
  turbopack: { root: import.meta.dirname },
  reactStrictMode: true,
};

export default withMDX(config);
