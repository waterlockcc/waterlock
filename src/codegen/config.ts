export interface CodegenConfig {
  /** Provider id, e.g. `gmail`. */
  provider: string;
  /** Prefix for emitted TS types: `Gmail` -> `GmailAction`, `GmailParams`, ... */
  typePrefix: string;
  /**
   * Paths are relative to the config file. `file` is the pinned spec (JSON, or SDL text for
   * `graphql`); `url` is used by `--fetch`. `title` names a GraphQL schema in generated comments.
   */
  source: { kind: "discovery" | "openapi" | "graphql"; file: string; url?: string; title?: string };
  /** Output file for generated TS, relative to the config file. */
  out: string;
  /** Markdown report for reviewers, relative to the config file. */
  report?: string;
  /** Import specifier for `OperationTable` / `GraphqlTable` in the generated file. */
  typesImport?: string;
  /** GraphQL only: TS types for custom scalars, e.g. `{ DateTime: "string" }`. Unlisted ones are `unknown`. */
  scalars?: Record<string, string>;
}

export const defineCodegenConfig = (c: CodegenConfig): CodegenConfig => c;
