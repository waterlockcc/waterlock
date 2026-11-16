import { gmail_v1 } from "@googleapis/gmail";
import { LinearDocument } from "@linear/sdk";
import {
  buildSchema,
  getNamedType,
  isEnumType,
  isInputObjectType,
  isLeafType,
  isListType,
  isNonNullType,
  isScalarType,
  Kind,
  parse,
  typeFromAST,
  type GraphQLInputType,
  type OperationDefinitionNode,
} from "graphql";
import { describe, expect, it } from "vitest";
import { createMatcher } from "../src/core/match.js";
import type { ParamSpec } from "../src/core/types.js";
import { createGraphqlMatcher } from "../src/graphql/index.js";
import { gmailTable } from "../src/providers/gmail/generated.js";
import { linearSdl } from "../src/providers/linear/generated.js";

// Reverse lookup: a concrete request must resolve to the action it was built
// from. The table round-trips catch routes the matcher resolves to another
// row (shadowing, ties). The SDK checks catch table bugs: the real client
// decides the request, so a wrong route-to-action mapping can't pass by
// agreeing with itself.

const gmail = createMatcher(gmailTable, {
  allowedGlobalQueryParams: ["alt", "uploadType"],
});
const schema = buildSchema(linearSdl);
const linear = createGraphqlMatcher({ provider: "linear", schema });
const enc = (body: unknown) => new TextEncoder().encode(JSON.stringify(body));

describe("gmail routes", () => {
  const sample = (p: ParamSpec) =>
    p.enum?.[0] ??
    (p.type === "string" ? `v-${p.name}` : p.type === "boolean" ? "true" : "7");
  // Every literal segment, tried as every path param: `/messages/{id}` with
  // id=send must still be messages.get, not shadowed by a literal route.
  const literals = new Set(
    gmailTable.operations.flatMap((o) =>
      o.path.split("/").filter((s) => s && !s.includes("{")),
    ),
  );

  it("every table route resolves to its own action and variant", () => {
    const mismatches: string[] = [];
    for (const op of gmailTable.operations) {
      const query = new URLSearchParams();
      for (const p of op.params)
        if (p.in === "query" && p.required) query.set(p.name, sample(p));
      const fill = (value: (p: ParamSpec) => string) =>
        op.path.replace(/\{\+?([^}]+)\}/g, (_, name: string) => {
          const p = op.params.find((x) => x.in === "path" && x.name === name)!;
          return encodeURIComponent(value(p));
        });
      const paths = [fill(sample)];
      if (op.path.includes("{"))
        for (const l of literals) paths.push(fill(() => l));
      for (const path of paths) {
        const r = gmail.match(op.method, path, query);
        const got = r.ok ? `${r.op.action} ${r.op.variant}` : r.reason;
        if (got !== `${op.action} ${op.variant}`)
          mismatches.push(`${op.method} ${path}: ${got}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("every @googleapis/gmail method's request resolves to its id", async () => {
    const client = new gmail_v1.Gmail({});
    const actions = new Set(gmailTable.operations.map((o) => o.action));
    const mismatches: string[] = [];
    for (const action of actions) {
      const ops = gmailTable.operations.filter((o) => o.action === action);
      const params: Record<string, unknown> = {};
      for (const p of ops[0]!.params)
        if (p.required) params[p.name] = sample(p);
      const media = { mimeType: "message/rfc822", body: "hi" };
      const calls = ops.some((o) => o.variant === "upload")
        ? [params, { ...params, media }]
        : [params];
      // gmail.users.messages.send -> client.users.messages.send(...)
      const keys = action.split(".").slice(1);
      const owner = keys
        .slice(0, -1)
        .reduce<Record<string, unknown>>(
          (o, k) => o[k] as Record<string, unknown>,
          client as never,
        );
      const method = owner[keys.at(-1)!] as (
        p: unknown,
        o: unknown,
      ) => Promise<unknown>;
      for (const p of calls) {
        let sent: { method: string; url: URL } | undefined;
        await method.call(owner, p, {
          adapter: async (opts: { method?: string; url: string }) => {
            sent = { method: opts.method ?? "GET", url: new URL(opts.url) };
            return { data: {}, status: 200, headers: {}, config: opts };
          },
        });
        const r = gmail.match(
          sent!.method,
          sent!.url.pathname,
          sent!.url.searchParams,
        );
        const got = r.ok ? r.op.action : r.reason;
        if (got !== action)
          mismatches.push(`${action}: ${sent!.method} ${sent!.url} -> ${got}`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});

describe("linear routes", () => {
  const scalars: Record<string, unknown> = {
    Int: 1,
    Float: 1.5,
    Boolean: true,
  };
  // Smallest valid value: required fields only, first enum value, first
  // @oneOf member.
  const sample = (t: GraphQLInputType): unknown => {
    if (isNonNullType(t)) return sample(t.ofType);
    if (isListType(t)) return [sample(t.ofType)];
    if (isEnumType(t)) return t.getValues()[0]!.name;
    if (isScalarType(t)) return scalars[t.name] ?? "x";
    const fields = Object.values(t.getFields());
    if (t.isOneOf) return { [fields[0]!.name]: sample(fields[0]!.type) };
    return Object.fromEntries(
      fields
        .filter((f) => isNonNullType(f.type) && f.defaultValue === undefined)
        .map((f) => [f.name, sample(f.type)]),
    );
  };

  it("every root field resolves to its own action", () => {
    const mismatches: string[] = [];
    for (const kind of ["query", "mutation"] as const) {
      for (const f of Object.values(schema.getRootType(kind)!.getFields())) {
        const req = f.args.filter(
          (a) => isNonNullType(a.type) && a.defaultValue === undefined,
        );
        const decl = req.map((a) => `$${a.name}: ${String(a.type)}`);
        const args = req.map((a) => `${a.name}: $${a.name}`);
        const query =
          kind +
          (decl.length ? `(${decl.join(", ")})` : "") +
          ` { ${f.name}` +
          (args.length ? `(${args.join(", ")})` : "") +
          (isLeafType(getNamedType(f.type)) ? "" : " { __typename }") +
          " }";
        const variables = Object.fromEntries(
          req.map((a) => [a.name, sample(a.type)]),
        );
        const r = linear.match(enc({ query, variables }));
        const want = `linear.${kind}.${f.name}`;
        const got = r.ok ? r.action : r.reason;
        if (got !== want) mismatches.push(`${want}: ${got}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("every @linear/sdk document is accepted as its top-level field", () => {
    const docs = Object.entries(LinearDocument).filter(([k]) =>
      k.endsWith("Document"),
    );
    expect(docs.length).toBeGreaterThan(500);
    const mismatches: string[] = [];
    for (const [name, doc] of docs) {
      const query = String(doc);
      const op = parse(query).definitions.find(
        (d): d is OperationDefinitionNode =>
          d.kind === Kind.OPERATION_DEFINITION,
      )!;
      const variables: Record<string, unknown> = {};
      for (const v of op.variableDefinitions ?? []) {
        const t = typeFromAST(schema, v.type) as GraphQLInputType | undefined;
        if (t && isNonNullType(t) && !v.defaultValue)
          variables[v.variable.name.value] = sample(t);
      }
      const field = op.selectionSet.selections.find(
        (s) => s.kind === Kind.FIELD,
      )!;
      const want = `linear.${op.operation}.${field.kind === Kind.FIELD ? field.name.value : ""}`;
      const r = linear.match(enc({ query, variables }));
      const got = r.ok ? r.action : r.reason;
      if (got !== want) mismatches.push(`${name}: ${got}`);
    }
    expect(mismatches).toEqual([]);
  });

  it("SDK relation calls are their parent's action", () => {
    const query = String(LinearDocument.Issue_CommentsDocument);
    const r = linear.match(enc({ query, variables: { id: "ABC-1" } }));
    expect(r).toMatchObject({ ok: true, action: "linear.query.issue" });
  });
});
