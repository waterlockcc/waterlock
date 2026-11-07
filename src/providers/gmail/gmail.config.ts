import { defineCodegenConfig } from "../../codegen/config.js";

/**
 * Codegen config for the Gmail Discovery doc. Groups live in groups.ts, applied at
 * runtime with withGroups. Review codegen-report.md after any change to spec.json.
 */
export default defineCodegenConfig({
  provider: "gmail",
  typePrefix: "Gmail",
  source: {
    kind: "discovery",
    file: "./spec.json",
    url: "https://gmail.googleapis.com/$discovery/rest?version=v1",
  },
  out: "./generated.ts",
  report: "./codegen-report.md",
  typesImport: "../../core/types.js",
});
