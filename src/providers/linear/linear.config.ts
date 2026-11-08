import { defineCodegenConfig } from "../../codegen/config.js";

/**
 * Codegen config for Linear's public GraphQL schema. Review codegen-report.md after any change to schema.graphql.
 */
export default defineCodegenConfig({
  provider: "linear",
  typePrefix: "Linear",
  source: {
    kind: "graphql",
    title: "Linear API",
    file: "./schema.graphql",
    url: "https://raw.githubusercontent.com/linear/linear/master/packages/sdk/src/schema.graphql",
  },
  out: "./generated.ts",
  report: "./codegen-report.md",
  typesImport: "../../core/types.js",
  scalars: {
    DateTime: "string",
    DateTimeOrDuration: "string",
    Duration: "string",
    TimelessDate: "string",
    TimelessDateOrDuration: "string",
    UUID: "string",
    JSON: "unknown",
    JSONObject: "Record<string, unknown>",
  },
});
