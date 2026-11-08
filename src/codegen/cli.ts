#!/usr/bin/env -S npx tsx
/**
 * waterlock codegen
 *
 *   tsx src/codegen/cli.ts <config.ts> [--fetch] [--check]
 *
 *   --fetch  download the spec from `source.url`, overwrite the pinned file
 *   --check  fail if generated output differs from what's on disk (for CI)
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CodegenConfig } from "./config.js";
import { fromDiscovery, type DiscoveryDoc } from "./discovery.js";
import { generate } from "./generate.js";
import { generateGraphql } from "./graphql.js";
import { fromOpenAPI, type OpenAPIDoc } from "./openapi.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const configPath = args.find((a) => !a.startsWith("--"));
  if (!configPath)
    throw new Error("usage: waterlock-gen <config.ts> [--fetch] [--check]");

  const absConfig = resolve(configPath);
  const config = (
    (await import(pathToFileURL(absConfig).href)) as { default: CodegenConfig }
  ).default;
  const dir = dirname(absConfig);
  const specFile = resolve(dir, config.source.file);

  if (args.includes("--fetch")) {
    if (!config.source.url)
      throw new Error("--fetch needs source.url in config");
    const res = await fetch(config.source.url);
    if (!res.ok) throw new Error(`fetch ${config.source.url}: ${res.status}`);
    const text =
      config.source.kind === "graphql"
        ? await res.text()
        : JSON.stringify(await res.json(), null, 2) + "\n";
    await writeFile(specFile, text);
    console.log(`pinned spec updated: ${specFile}`);
  }

  const source = await readFile(specFile, "utf8");
  let code: string;
  let report: string;
  let summary: string;
  if (config.source.kind === "graphql") {
    const result = generateGraphql(source, config);
    ({ code, report } = result);
    summary = `${result.actions.length} actions`;
  } else {
    const doc = JSON.parse(source);
    const spec =
      config.source.kind === "discovery"
        ? fromDiscovery(doc as DiscoveryDoc)
        : fromOpenAPI(doc as OpenAPIDoc, { provider: config.provider });
    const result = generate(spec, config);
    ({ code, report } = result);
    summary = `${spec.operations.length} actions, ${result.table.operations.length} routes`;
  }
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

  console.log(`${config.provider}: ${summary} -> ${outFile}`);
  if (reportFile) console.log(`  review: ${reportFile}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
