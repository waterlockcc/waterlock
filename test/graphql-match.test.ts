import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { generateGraphql } from "../src/codegen/index.js";
import { createGraphqlMatcher } from "../src/graphql/index.js";
import config from "../src/providers/linear/linear.config.js";
import { linearGraphqlTable } from "../src/providers/linear/generated.js";

const m = createGraphqlMatcher(linearGraphqlTable);
const enc = (body: unknown) => new TextEncoder().encode(typeof body === "string" ? body : JSON.stringify(body));
const match = (query: string, variables?: unknown, extra: object = {}) => m.match(enc({ query, variables, ...extra }));
const reason = (r: ReturnType<typeof match>) => (r.ok ? "ok" : `${r.status} ${r.reason}`);

describe("graphql matcher: top-level field is the action", () => {
  it("mutation with variables: action + coerced params", () => {
    const r = match(`mutation Create($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id } } }`, {
      input: { teamId: "T1", title: "Bug", labelIds: "L1" },
    });
    expect(r).toMatchObject({ ok: true, action: "linear.mutation.issueCreate" });
    // single value wrapped into a list, as upstream coerces it
    expect(r.ok && r.params).toEqual({ input: { teamId: "T1", title: "Bug", labelIds: ["L1"] } });
  });

  it("inline literals and variable defaults", () => {
    const r = match(`query($id: String! = "ABC-1") { issue(id: $id) { id } }`);
    expect(r.ok && r.params).toEqual({ id: "ABC-1" });
    const lit = match(`{ issue(id: "ABC-2") { id } }`);
    expect(lit).toMatchObject({ ok: true, action: "linear.query.issue", params: { id: "ABC-2" } });
  });

  it("schema defaults are filled in for args and nested input fields", () => {
    expect(match(`{ releaseSearch(term: "x") { nodes { id } } }`)).toMatchObject({ ok: true, params: { term: "x", first: 20 } });
    const r = match(`{ issues(sort: [{ assignee: { order: Ascending } }]) { nodes { id } } }`);
    expect(r.ok && r.params).toEqual({ sort: [{ assignee: { order: "Ascending", nulls: "last" } }] });
  });

  it("aliases don't rename the action", () => {
    expect(match(`mutation { safe: issueDelete(id: "I1") { success } }`)).toMatchObject({ ok: true, action: "linear.mutation.issueDelete" });
  });

  it("top-level fields inside fragments count", () => {
    const spread = match(`mutation { ...F } fragment F on Mutation { issueDelete(id: "I1") { success } }`);
    expect(spread).toMatchObject({ ok: true, action: "linear.mutation.issueDelete" });
    const inline = match(`mutation { ... on Mutation { issueDelete(id: "I1") { success } } }`);
    expect(inline).toMatchObject({ ok: true, action: "linear.mutation.issueDelete" });
    const hidden = match(`mutation { issueArchive(id: "I1") { success } ...F } fragment F on Mutation { issueDelete(id: "I1") { success } }`);
    expect(reason(hidden)).toBe("400 send one top-level field per request (got 2: issueArchive, issueDelete)");
  });

  it("nested selections are not inspected: reads reachable from an allowed field pass", () => {
    const r = match(`{ issue(id: "I1") { team { issues { nodes { title } } members { nodes { email } } } } }`);
    expect(r).toMatchObject({ ok: true, action: "linear.query.issue", params: { id: "I1" } });
  });

  it("__typename alongside the field is ignored", () => {
    expect(match(`{ __typename issue(id: "I1") { id } }`)).toMatchObject({ ok: true, action: "linear.query.issue" });
  });

  it.each([
    ["two top-level fields", `mutation { a: issueDelete(id: "1") { success } b: issueDelete(id: "2") { success } }`, "400 send one top-level field per request (got 2: issueDelete, issueDelete)"],
    ["no field", `{ __typename }`, "400 send one top-level field per request (got 0)"],
    ["two operations", `query A { issue(id: "1") { id } } query B { issue(id: "2") { id } }`, "400 send exactly one operation per request (got 2)"],
    ["subscription", `subscription { issueCreated { id } }`, "400 subscriptions not supported"],
    ["unknown field", `mutation { nope(id: "1") { id } }`, `404 no linear mutation field "nope"`],
    ["introspection", `{ __schema { types { name } } }`, `404 no linear query field "__schema"`],
    ["unknown argument", `{ issue(id: "1", extra: 1) { id } }`, `400 argument "extra" not allowed for linear.query.issue`],
    ["prototype-named argument", `{ issue(id: "1", constructor: 1) { id } }`, `400 argument "constructor" not allowed for linear.query.issue`],
    ["duplicate argument", `{ issue(id: "1", id: "2") { id } }`, `400 argument "id" given twice`],
    ["missing required argument", `{ issue { id } }`, `400 "id" is required`],
    ["unknown input field", `mutation { issueCreate(input: { teamId: "T", sneaky: 1 }) { success } }`, `400 "input" has unknown field "sneaky"`],
    ["wrong scalar type", `mutation { issueCreate(input: { teamId: 5 }) { success } }`, `400 "input.teamId" must be a string`],
    ["bad enum", `{ issues(sort: [{ assignee: { order: Sideways } }]) { nodes { id } } }`, `400 "sort[0].assignee.order" must be one of Ascending, Descending`],
    ["fragment on another type", `mutation { ...F } fragment F on Issue { id }`, "400 top-level fragment on Issue, expected Mutation"],
    ["self-spreading fragment", `mutation { ...F } fragment F on Mutation { ...F }`, "400 fragment F spreads itself"],
    ["unknown fragment", `mutation { ...F }`, "400 unknown fragment F"],
    ["syntax error", `mutation {`, "400 invalid GraphQL: Syntax Error: Expected Name, found <EOF>."],
  ])("rejects %s", (_, query, expected) => {
    expect(reason(match(query))).toBe(expected);
  });

  it("rejects batches, persisted queries, bad bodies, operationName mismatches", () => {
    expect(reason(m.match(enc([{ query: "{ viewer { id } }" }])))).toMatch(/^400 batched requests not supported/);
    expect(reason(m.match(enc({ extensions: { persistedQuery: { sha256Hash: "abc" } } })))).toMatch(/^400 body.query must be/);
    expect(reason(m.match(enc("not json")))).toBe("400 body must be JSON");
    expect(reason(m.match(enc({ query: "{ viewer { id } }", variables: [1] })))).toBe("400 body.variables must be an object");
    expect(reason(match(`query A { viewer { id } }`, undefined, { operationName: "B" }))).toBe(`400 operationName "B" not in document`);
  });

  it("forwards the re-printed document, not the original text", () => {
    const r = match(`# comment\nmutation   { issueDelete(id: "I1") { success } }`, { unused: 1 }, { extensions: { x: 1 } });
    expect(r.ok && JSON.parse(r.body)).toEqual({ query: `mutation {\n  issueDelete(id: "I1") {\n    success\n  }\n}`, variables: { unused: 1 } });
  });

  it("caps document size by token count", () => {
    const small = createGraphqlMatcher(linearGraphqlTable, { maxTokens: 10 });
    expect(reason(small.match(enc({ query: `{ issue(id: "1") { id title description team { id } } }` })))).toBe("400 invalid GraphQL: Syntax Error: Document contains more than 10 tokens. Parsing aborted.");
  });
});

describe("graphql codegen", () => {
  it("committed linear generated.ts matches schema + config (run pnpm gen:linear if this fails)", async () => {
    const sdl = await readFile(new URL("../src/providers/linear/schema.graphql", import.meta.url), "utf8");
    const { code } = await generateGraphql(sdl, config);
    expect(await readFile(new URL("../src/providers/linear/generated.ts", import.meta.url), "utf8")).toBe(code);
  });

  const tiny = `
    scalar DateTime
    enum Color { RED GREEN }
    input Pick @oneOf { id: ID name: String }
    input Opts { color: Color = RED tags: [String!] at: DateTime }
    type Thing { id: ID! }
    type Query { thing(pick: Pick!): Thing  things(opts: Opts, first: Int = 10): [Thing!]! }
    type Mutation { thingDelete(id: ID!): Boolean! }
    type Subscription { thingChanged: Thing }
  `;

  it("one action per top-level query/mutation field, subscriptions skipped", async () => {
    const { table, code } = await generateGraphql(tiny, { ...config, provider: "tiny", typePrefix: "Tiny", scalars: {} });
    expect(table.fields.map((f) => f.action)).toEqual(["tiny.mutation.thingDelete", "tiny.query.thing", "tiny.query.things"]);
    expect(table.inputs.Pick).toEqual({ fields: { id: { type: "ID" }, name: { type: "String" } }, oneOf: true });
    expect(code).toContain(`"tiny.query.things": { opts?: TinyOpts | null; first: number | null; };`);
    expect(code).toContain(`export interface TinyOpts { color: TinyColor | null; tags?: string[] | null; at?: unknown; }`);
  });

  it("oneOf inputs need exactly one field; ID accepts integers", async () => {
    const { table } = await generateGraphql(tiny, { ...config, provider: "tiny", typePrefix: "Tiny", scalars: {} });
    const tm = createGraphqlMatcher(table);
    const q = (pick: string) => tm.match(enc({ query: `{ thing(pick: ${pick}) { id } }` }));
    expect(q(`{ id: 7 }`)).toMatchObject({ ok: true, params: { pick: { id: "7" } } });
    expect(reason(q(`{ id: 7, name: "x" }`))).toBe(`400 "pick" must set exactly one field`);
    expect(reason(q(`{}`))).toBe(`400 "pick" must set exactly one field`);
  });
});
