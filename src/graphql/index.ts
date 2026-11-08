import {
  buildSchema,
  getArgumentValues,
  getVariableValues,
  Kind,
  parse,
  print,
  validate,
  type DocumentNode,
  type FieldNode,
  type FragmentDefinitionNode,
  type GraphQLSchema,
  type SelectionSetNode,
} from "graphql";
import type { GraphqlMatcher, GraphqlMatchResult } from "../core/types.js";

export type { GraphqlMatcher, GraphqlMatchResult } from "../core/types.js";

export interface GraphqlMatcherOptions {
  /** Provider id: actions are named `<provider>.<query|mutation>.<field>`. */
  provider: string;
  /** The upstream schema, or its SDL. */
  schema: GraphQLSchema | string;
  /** Parser token cap. Default 50k. */
  maxTokens?: number;
}

/**
 * Matches a GraphQL request body the way the REST matcher matches a URL: one request is one
 * action, named after its top-level field (`linear.mutation.issueCreate`). Arguments, coerced
 * by graphql-js exactly as the upstream server does, become `params`. Nested selections are not
 * policy: they only shape the response, so reads reachable from an allowed field are limited
 * by the upstream token's scopes, not by rules.
 *
 * Rejected rather than guessed at: anything that fails schema validation, batches, several
 * operations or top-level fields in one request, subscriptions, persisted queries (no query text).
 */
export function createGraphqlMatcher(opts: GraphqlMatcherOptions): GraphqlMatcher {
  const schema = typeof opts.schema === "string" ? buildSchema(opts.schema) : opts.schema;
  const maxTokens = opts.maxTokens ?? 50_000;
  const bad = (reason: string): GraphqlMatchResult => ({ ok: false, status: 400, reason });
  const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

  return {
    match(raw) {
      try {
        return match(raw);
      } catch (err) {
        // Fail closed on anything unexpected (e.g. stack overflow on pathological documents).
        return bad(`could not process GraphQL request: ${message(err)}`);
      }
    },
  };

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
      return bad(`invalid GraphQL: ${message(err)}`);
    }
    let invalid: readonly Error[];
    try {
      invalid = validate(schema, doc, undefined, { maxErrors: 1 });
    } catch (err) {
      // graphql 17.0.2 overflows the stack on some fragment cycles instead of reporting them.
      return bad(`invalid GraphQL: ${err instanceof RangeError ? "document too deeply nested or cyclic" : message(err)}`);
    }
    if (invalid.length) return bad(`invalid GraphQL: ${invalid[0]!.message}`);

    const ops = doc.definitions.filter((d) => d.kind === Kind.OPERATION_DEFINITION);
    if (ops.length !== 1) return bad(`send exactly one operation per request (got ${ops.length})`);
    const op = ops[0]!;
    if (operationName && op.name?.value !== operationName) return bad(`operationName "${operationName}" not in document`);
    if (op.operation === "subscription") return bad("subscriptions not supported");
    const root = schema.getRootType(op.operation);
    if (!root) return { ok: false, status: 404, reason: `${opts.provider} has no ${op.operation} type` };

    const fragments = new Map(
      doc.definitions.filter((d) => d.kind === Kind.FRAGMENT_DEFINITION).map((d) => [d.name.value, d] as const),
    );
    const roots: FieldNode[] = [];
    const err = collectRootFields(op.selectionSet, root.name, fragments, roots);
    if (err) return bad(err);
    const real = roots.filter((f) => f.name.value !== "__typename");
    if (real.length !== 1) {
      const names = real.map((f) => f.name.value).join(", ");
      return bad(`send one top-level field per request (got ${real.length}${names ? `: ${names}` : ""})`);
    }
    const node = real[0]!;
    const field = root.getFields()[node.name.value]; // introspection fields (__schema, __type) aren't here: denied
    if (!field) return { ok: false, status: 404, reason: `no ${opts.provider} ${op.operation} field "${node.name.value}"` };

    const vars = getVariableValues(schema, op.variableDefinitions ?? [], (variables as Record<string, unknown> | null) ?? {}, { maxErrors: 1 });
    if (vars.errors) return bad(vars.errors[0]!.message);
    let params: Record<string, unknown>;
    try {
      params = getArgumentValues(field, node, vars.variableValues);
    } catch (err) {
      return bad(message(err));
    }

    // Forward what was parsed, not the original text: no room for the two parsers to disagree.
    const body = JSON.stringify({
      query: print(doc),
      ...(variables != null ? { variables } : {}),
      ...(operationName ? { operationName } : {}),
    });
    return { ok: true, action: `${opts.provider}.${op.operation}.${field.name}`, params, body };
  }
}

/**
 * Top-level fields of an operation, including those inside fragments on the root type. Fields
 * under `@skip`/`@include` count as present. Validation already rejected unknown and cyclic fragments.
 */
function collectRootFields(
  set: SelectionSetNode,
  rootType: string,
  fragments: Map<string, FragmentDefinitionNode>,
  out: FieldNode[],
): string | undefined {
  for (const sel of set.selections) {
    if (sel.kind === Kind.FIELD) {
      out.push(sel);
      continue;
    }
    const frag = sel.kind === Kind.INLINE_FRAGMENT ? sel : fragments.get(sel.name.value)!;
    const on = frag.typeCondition?.name.value;
    if (on !== undefined && on !== rootType) return `top-level fragment on ${on}, expected ${rootType}`;
    const err = collectRootFields(frag.selectionSet, rootType, fragments, out);
    if (err) return err;
  }
  return undefined;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
