import type { HttpMethod } from "../core/types.js";

export interface CodegenConfig {
  /** Provider id. Prefixes group names: `gmail:read`. */
  provider: string;
  /** Prefix for emitted TS types: `Gmail` -> `GmailAction`, `GmailParams`, ... */
  typePrefix: string;
  /** Paths are relative to the config file. `file` is the pinned spec; `url` is used by `--fetch`. */
  source: { kind: "discovery" | "openapi"; file: string; url?: string };
  /** Output file for generated TS, relative to the config file. */
  out: string;
  /** Markdown report for reviewers, relative to the config file. */
  report?: string;
  /** Import specifier for `OperationTable` in the generated file. */
  typesImport?: string;
  /**
   * Curated groups. Keys are group names (without provider prefix), values are
   * action globs: `*` matches one dotted segment, `**` matches any number.
   * An action can be in several groups.
   */
  groups: Record<string, string[]>;
  /** Applied to actions that no curated glob matched. Report lists every one of these for review. */
  fallback: (op: { action: string; method: HttpMethod }) => string | string[];
}

export const defineCodegenConfig = (c: CodegenConfig): CodegenConfig => c;
