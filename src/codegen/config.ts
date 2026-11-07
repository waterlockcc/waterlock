export interface CodegenConfig {
  /** Provider id, e.g. `gmail`. */
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
}

export const defineCodegenConfig = (c: CodegenConfig): CodegenConfig => c;
