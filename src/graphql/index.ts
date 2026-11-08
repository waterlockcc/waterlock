import {
  Kind,
  parse,
  print,
  valueFromASTUntyped,
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type SelectionSetNode,
} from "graphql";
import type { GraphqlField, GraphqlInputValue, GraphqlMatcher, GraphqlMatchResult, GraphqlTable } from "../core/types.js";

export type { GraphqlField, GraphqlInputValue, GraphqlMatcher, GraphqlMatchResult, GraphqlTable, GraphqlTypeRef } from "../core/types.js";

/**
 * Matches a GraphQL request body the way the REST matcher matches a URL: one request is one
 * action, named after its top-level field (`linear.mutation.issueCreate`). Arguments become
 * `params`. Nested selections are not inspected: they only shape the response, so reads
 * reachable from an allowed field are not limited by policy (the upstream token's scopes are).
 *
 * Rejected rather than guessed at: batches, several operations or top-level fields in one
 * request, subscriptions, persisted queries (no query text), unknown fields or arguments.
 */
export function createGraphqlMatcher(table: GraphqlTable, opts: { maxTokens?: number } = {}): GraphqlMatcher {
  const maxTokens = opts.maxTokens ?? 50_000;
  const fields = new Map(table.fields.map((f) => [`${f.operation}.${f.name}`, f]));
  const bad = (reason: string): GraphqlMatchResult => ({ ok: false, status: 400, reason });

  return { match };

  function match(raw: Uint8Array): GraphqlMatchResult {
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    } catch {
      return bad("body must be JSON");
    }
    if (Array.isArray(json)) return bad("batched requests not supported: send one operation per request");
    if (!isObject(json)) return bad("body must be a JSON object");
    const { query, variables, operationName } = json;
    if (typeof query !== "string") return bad("body.query must be the GraphQL document (persisted queries not supported)");
    if (variables != null && !isObject(variables)) return bad("body.variables must be an object");
    if (operationName != null && typeof operationName !== "string") return bad("body.operationName must be a string");

    let doc: DocumentNode;
    try {
      doc = parse(query, { maxTokens, noLocation: true });
    } catch (err) {
      return bad(`invalid GraphQL: ${err instanceof Error ? err.message : String(err)}`);
    }

    const fragments = new Map<string, FragmentDefinitionNode>();
    const ops = [];
    for (const def of doc.definitions) {
      if (def.kind === Kind.OPERATION_DEFINITION) ops.push(def);
      else if (def.kind === Kind.FRAGMENT_DEFINITION) {
        if (fragments.has(def.name.value)) return bad(`fragment ${def.name.value} defined twice`);
        fragments.set(def.name.value, def);
      } else return bad(`unexpected ${def.kind} in request document`);
    }
    if (ops.length !== 1) return bad(`send exactly one operation per request (got ${ops.length})`);
    const op = ops[0]!;
    if (operationName && op.name?.value !== operationName) return bad(`operationName "${operationName}" not in document`);
    if (op.operation === "subscription") return bad("subscriptions not supported");

    const rootType = table.roots[op.operation];
    if (!rootType) return { ok: false, status: 404, reason: `${table.provider} has no ${op.operation} type` };

    const roots: FieldNode[] = [];
    const err = collectRootFields(op.selectionSet, rootType, fragments, new Set(), roots);
    if (err) return bad(err);
    const real = roots.filter((f) => f.name.value !== "__typename");
    if (real.length !== 1) {
      const names = real.map((f) => f.name.value).join(", ");
      return bad(`send one top-level field per request (got ${real.length}${names ? `: ${names}` : ""})`);
    }
    const node = real[0]!;
    const field = fields.get(`${op.operation}.${node.name.value}`);
    if (!field) return { ok: false, status: 404, reason: `no ${table.provider} ${op.operation} field "${node.name.value}"` };

    // Variable values as upstream sees them: given value, else the declared default.
    const vars: Record<string, unknown> = Object.create(null);
    for (const v of op.variableDefinitions ?? []) {
      const name = v.variable.name.value;
      const given = variables != null && Object.hasOwn(variables, name) ? variables[name] : undefined;
      if (given !== undefined) vars[name] = given;
      else if (v.defaultValue) vars[name] = valueFromASTUntyped(v.defaultValue);
    }

    const given = new Map<string, unknown>();
    for (const arg of node.arguments ?? []) {
      const name = arg.name.value;
      if (given.has(name)) return bad(`argument "${name}" given twice`);
      if (!Object.hasOwn(field.args, name)) return bad(`argument "${name}" not allowed for ${field.action}`);
      given.set(name, valueFromASTUntyped(arg.value, vars));
    }
    const params: Record<string, unknown> = {};
    for (const [name, spec] of Object.entries(field.args)) {
      const v = coerceInput(table, spec, given.get(name), name);
      if (!v.ok) return bad(v.reason);
      if (v.value !== undefined) params[name] = v.value;
    }

    // Forward what was parsed, not the original text: no room for the two parsers to disagree.
    const body = JSON.stringify({
      query: print(doc),
      ...(variables != null ? { variables } : {}),
      ...(operationName ? { operationName } : {}),
    });
    return { ok: true, action: field.action, params, body };
  }
}

/** Top-level fields of an operation, including those inside fragments on the root type. */
function collectRootFields(
  set: SelectionSetNode,
  rootType: string,
  fragments: Map<string, FragmentDefinitionNode>,
  seen: Set<string>,
  out: FieldNode[],
): string | undefined {
  for (const sel of set.selections) {
    if (sel.kind === Kind.FIELD) {
      out.push(sel);
      continue;
    }
    let inner: SelectionSetNode;
    let on: string | undefined;
    if (sel.kind === Kind.INLINE_FRAGMENT) {
      inner = sel.selectionSet;
      on = sel.typeCondition?.name.value;
    } else {
      const name = sel.name.value;
      const def = fragments.get(name);
      if (!def) return `unknown fragment ${name}`;
      if (seen.has(name)) return `fragment ${name} spreads itself`;
      inner = def.selectionSet;
      on = def.typeCondition.name.value;
      seen = new Set(seen).add(name);
    }
    if (on !== undefined && on !== rootType) return `top-level fragment on ${on}, expected ${rootType}`;
    const err = collectRootFields(inner, rootType, fragments, seen, out);
    if (err) return err;
  }
  return undefined;
}

type Coerced = { ok: true; value: unknown } | { ok: false; reason: string };

/**
 * GraphQL input coercion, as the upstream server does it: defaults filled in, a single value
 * wrapped into a list, unknown input fields rejected. Rules see the same values upstream uses.
 * `undefined` means absent.
 */
function coerceInput(table: GraphqlTable, spec: GraphqlInputValue, value: unknown, path: string): Coerced {
  if (value === undefined && spec.default !== undefined) value = spec.default;
  return coerceType(table, spec.type, value, path);
}

function coerceType(table: GraphqlTable, type: string, value: unknown, path: string): Coerced {
  const fail = (what: string): Coerced => ({ ok: false, reason: `"${path}" ${what}` });
  const nonNull = type.endsWith("!");
  const t = nonNull ? type.slice(0, -1) : type;
  if (value === undefined || value === null) {
    if (nonNull) return fail("is required");
    return { ok: true, value };
  }

  if (t.startsWith("[")) {
    const item = t.slice(1, -1);
    if (!Array.isArray(value)) {
      const one = coerceType(table, item, value, path);
      return one.ok ? { ok: true, value: [one.value] } : one;
    }
    const out: unknown[] = [];
    for (let i = 0; i < value.length; i++) {
      const v = coerceType(table, item, value[i], `${path}[${i}]`);
      if (!v.ok) return v;
      out.push(v.value);
    }
    return { ok: true, value: out };
  }

  switch (t) {
    case "String":
      return typeof value === "string" ? { ok: true, value } : fail("must be a string");
    case "Boolean":
      return typeof value === "boolean" ? { ok: true, value } : fail("must be a boolean");
    case "Int":
      return Number.isInteger(value) && Math.abs(value as number) <= 2 ** 31 - 1 ? { ok: true, value } : fail("must be a 32-bit integer");
    case "Float":
      return typeof value === "number" && Number.isFinite(value) ? { ok: true, value } : fail("must be a number");
    case "ID":
      if (typeof value === "string") return { ok: true, value };
      return Number.isInteger(value) ? { ok: true, value: String(value) } : fail("must be a string or integer");
  }

  const values = table.enums[t];
  if (values) return typeof value === "string" && values.includes(value) ? { ok: true, value } : fail(`must be one of ${values.join(", ")}`);

  const input = table.inputs[t];
  if (!input) return { ok: true, value }; // custom scalar (DateTime, JSON, ...): upstream validates

  if (!isObject(value)) return fail("must be an object");
  for (const key of Object.keys(value)) {
    if (!Object.hasOwn(input.fields, key)) return fail(`has unknown field "${key}"`);
  }
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(input.fields)) {
    const v = coerceInput(table, spec, value[key], `${path}.${key}`);
    if (!v.ok) return v;
    if (v.value !== undefined) out[key] = v.value;
  }
  if (input.oneOf) {
    const set = Object.keys(out);
    if (set.length !== 1 || out[set[0]!] === null) return fail("must set exactly one field");
  }
  return { ok: true, value: out };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
