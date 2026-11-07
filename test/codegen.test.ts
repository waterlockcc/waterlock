import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fromDiscovery, fromOpenAPI, generate, type DiscoveryDoc } from "../src/codegen/index.js";
import config from "../src/providers/gmail/gmail.config.js";

const specUrl = new URL("../src/providers/gmail/spec.json", import.meta.url);
const generatedUrl = new URL("../src/providers/gmail/generated.ts", import.meta.url);

describe("gmail codegen", async () => {
  const doc = JSON.parse(await readFile(specUrl, "utf8")) as DiscoveryDoc;
  const result = generate(fromDiscovery(doc), config);
  const byAction = (a: string) => result.table.operations.filter((o) => o.action === a);

  it("committed generated.ts matches spec + config (run pnpm gen:gmail if this fails)", async () => {
    expect(await readFile(generatedUrl, "utf8")).toBe(result.code);
  });

  it("emits every upload route for send as the same action", () => {
    expect(byAction("gmail.users.messages.send").map((o) => [o.variant, o.path])).toEqual([
      ["standard", "/gmail/v1/users/{userId}/messages/send"],
      ["upload", "/upload/gmail/v1/users/{userId}/messages/send"],
      ["resumable", "/resumable/upload/gmail/v1/users/{userId}/messages/send"],
    ]);
  });

  it("emits actions and params only: no groups in the generated table", () => {
    expect(result.code).not.toContain("Group");
    expect(Object.keys(result.table.operations[0]!)).not.toContain("groups");
  });

  it("types query params", () => {
    expect(result.code).toContain(`"maxResults"?: number;`);
    expect(result.code).toContain(`"labelIds"?: string[];`);
  });
});

describe("openapi codegen", () => {
  const doc = {
    openapi: "3.0.3",
    info: { title: "Tiny", version: "1" },
    components: { parameters: { Limit: { name: "limit", in: "query", schema: { type: "integer" } } } },
    paths: {
      "/repos/{owner}/{repo}/issues": {
        parameters: [
          { name: "owner", in: "path", required: true, schema: { type: "string" } },
          { name: "repo", in: "path", required: true, schema: { type: "string" } },
        ],
        get: { operationId: "issues/list", parameters: [{ $ref: "#/components/parameters/Limit" }] },
        post: { operationId: "issues/create", requestBody: {} },
      },
      "/repos/{owner}/{repo}": { delete: { operationId: "repos/delete", parameters: [] } },
    },
  };

  it("normalizes operations and types params", () => {
    const result = generate(fromOpenAPI(doc, { provider: "tiny" }), {
      provider: "tiny",
      typePrefix: "Tiny",
      source: { kind: "openapi", file: "unused" },
      out: "unused",
    });
    expect(result.table.operations.map((o) => [o.action, o.method])).toEqual([
      ["tiny.issues/create", "POST"],
      ["tiny.issues/list", "GET"],
      ["tiny.repos/delete", "DELETE"],
    ]);
    expect(result.code).toContain(`"limit"?: number;`);
  });
});
