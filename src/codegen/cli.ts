#!/usr/bin/env -S npx tsx
/**
 * waterlock codegen
 *
 *   tsx src/codegen/cli.ts <config.ts> [--fetch] [--check]
 *
 *   --fetch  download the spec from `source.url` and overwrite the pinned file first
 *   --check  fail if generated output differs from what's on disk (for CI)
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CodegenConfig } from "./config.js";
import { fromDiscovery, type DiscoveryDoc } from "./discovery.js";
import { generate } from "./generate.js";
import { fromOpenAPI, type OpenAPIDoc } from "./openapi.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const configPath = args.find((a) => !a.startsWith("--"));
  if (!configPath) throw new Error("usage: waterlock-gen <config.ts> [--fetch] [--check]");

  const absConfig = resolve(configPath);
  const config = ((await import(pathToFileURL(absConfig).href)) as { default: CodegenConfig }).default;
  const dir = dirname(absConfig);
  const specFile = resolve(dir, config.source.file);

  if (args.includes("--fetch")) {
    if (!config.source.url) throw new Error("--fetch needs source.url in config");
    const res = await fetch(config.source.url);
    if (!res.ok) throw new Error(`fetch ${config.source.url}: ${res.status}`);
    await writeFile(specFile, JSON.stringify(await res.json(), null, 2) + "\n");
    console.log(`pinned spec updated: ${specFile}`);
  }

  const doc = JSON.parse(await readFile(specFile, "utf8"));
  const spec =
    config.source.kind === "discovery"
      ? fromDiscovery(doc as DiscoveryDoc)
      : fromOpenAPI(doc as OpenAPIDoc, { provider: config.provider });

  const { code, report, table } = generate(spec, config);
  const outFile = resolve(dir, config.out);
  const reportFile = config.report ? resolve(dir, config.report) : undefined;

  if (args.includes("--check")) {
    const current = await readFile(outFile, "utf8").catch(() => "");
    if (current !== code) {
      console.error(`${outFile} is stale. Run codegen and commit the result.`);
      process.exit(1);
    }
    console.log("generated output up to date");
    return;
  }

  await writeFile(outFile, code);
  if (reportFile) await writeFile(reportFile, report);

  const fallback = report.match(/- (\d+) actions grouped by fallback/)?.[1];
  const unused = report.match(/- (\d+) curated patterns matched nothing/)?.[1];
  console.log(
    `${config.provider}: ${spec.operations.length} actions, ${table.operations.length} routes -> ${outFile}`,
  );
  console.log(`  ${fallback} actions on fallback grouping, ${unused} unused patterns`);
  if (reportFile) console.log(`  review: ${reportFile}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
