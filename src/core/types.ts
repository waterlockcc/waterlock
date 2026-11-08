/** May gain members later (e.g. "HEAD"). */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export const HTTP_METHODS: readonly HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export type ParamType = "string" | "integer" | "number" | "boolean";

export interface ParamSpec {
  name: string;
  in: "path" | "query";
  type: ParamType;
  required?: boolean;
  repeated?: boolean;
  enum?: readonly string[];
  /** `{+name}` template: value may span multiple path segments. */
  multiSegment?: boolean;
}

/**
 * Same action can be reachable through several routes. Google APIs expose
 * `/upload/...` and `/resumable/upload/...` twins for media methods — each is
 * a separate route to the same action and must be governed the same way.
 */
export type OperationVariant = "standard" | "upload" | "resumable"; // may gain members later

export interface Operation {
  action: string;
  method: HttpMethod;
  path: string;
  variant: OperationVariant;
  params: readonly ParamSpec[];
  hasBody: boolean;
}

export interface OperationTable {
  provider: string;
  source: {
    kind: "discovery" | "openapi";
    title: string;
    version: string;
    revision?: string;
    url?: string;
  };
  globalQueryParams: readonly ParamSpec[];
  operations: readonly Operation[];
}

/** GraphQL type in SDL notation, e.g. `"[String!]!"`. */
export type GraphqlTypeRef = string;

export interface GraphqlInputValue {
  type: GraphqlTypeRef;
  /** Schema default, applied when the value is absent (as upstream does). */
  default?: unknown;
}

/** One top-level `query` or `mutation` field: the GraphQL equivalent of an `Operation`. */
export interface GraphqlField {
  action: string;
  operation: "query" | "mutation";
  name: string;
  args: Readonly<Record<string, GraphqlInputValue>>;
}

export interface GraphqlTable {
  provider: string;
  source: { kind: "graphql"; title: string; url?: string };
  /** Root type names, e.g. `{ query: "Query", mutation: "Mutation" }`. */
  roots: { query: string; mutation?: string };
  fields: readonly GraphqlField[];
  /** Input object and enum types reachable from top-level field arguments. Other names are custom scalars. */
  inputs: Readonly<Record<string, { fields: Readonly<Record<string, GraphqlInputValue>>; oneOf?: boolean }>>;
  enums: Readonly<Record<string, readonly string[]>>;
}

export type GraphqlMatchResult =
  | {
      ok: true;
      action: string;
      /** Arguments of the top-level field, variables filled in and coerced to the schema. */
      params: Record<string, unknown>;
      /** JSON body to forward: the parsed document re-printed, so upstream runs exactly what was checked. */
      body: string;
    }
  | { ok: false; status: 400 | 404; reason: string };

export interface GraphqlMatcher {
  match(body: Uint8Array): GraphqlMatchResult;
}
