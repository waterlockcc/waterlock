import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { fromDiscovery, fromOpenAPI, generate, globToRegExp, type DiscoveryDoc } from "../src/codegen/index.js";
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

  it("curation beats the method heuristic", () => {
    expect(byAction("gmail.users.messages.batchDelete")[0]!.groups).toEqual(["gmail:delete"]); // POST, but destructive
    expect(byAction("gmail.users.messages.trash")[0]!.groups).toEqual(["gmail:organize"]);
    expect(byAction("gmail.users.settings.updateAutoForwarding")[0]!.groups).toEqual(["gmail:forwarding", "gmail:settings"]);
    expect(byAction("gmail.users.drafts.delete")[0]!.groups).toEqual(["gmail:compose"]);
  });

  it("nothing left on fallback, no stale patterns", () => {
    expect(result.report).toContain("- 0 actions grouped by fallback heuristic");
    expect(result.report).toContain("- 0 curated patterns matched nothing");
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

  it("normalizes, groups by fallback, and reports stale patterns", () => {
    const spec = fromOpenAPI(doc, { provider: "tiny" });
    const result = generate(spec, {
      provider: "tiny",
      typePrefix: "Tiny",
      source: { kind: "openapi", file: "unused" },
      out: "unused",
      groups: { danger: ["tiny.repos/delete"], gone: ["tiny.pulls/*"] },
      fallback: (op) => (op.method === "GET" ? "read" : "write"),
    });

    const groups = Object.fromEntries(result.table.operations.map((o) => [o.action, o.groups]));
    expect(groups).toEqual({
      "tiny.issues/create": ["tiny:write"],
      "tiny.issues/list": ["tiny:read"],
      "tiny.repos/delete": ["tiny:danger"],
    });
    expect(result.code).toContain(`"limit"?: number;`);
    expect(result.report).toContain("`gone`: `tiny.pulls/*`");
    expect(result.report).toContain("- 2 actions grouped by fallback heuristic");
  });
});

describe("globToRegExp", () => {
  it("* is one segment, ** is many", () => {
    expect(globToRegExp("gmail.users.*.trash").test("gmail.users.messages.trash")).toBe(true);
    expect(globToRegExp("gmail.users.*.trash").test("gmail.users.a.b.trash")).toBe(false);
    expect(globToRegExp("gmail.users.settings.**").test("gmail.users.settings.cse.keypairs.get")).toBe(true);
    expect(globToRegExp("gmail.users.settings.*AutoForwarding").test("gmail.users.settings.updateAutoForwarding")).toBe(true);
  });
});
