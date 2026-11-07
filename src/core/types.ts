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
