import type { HttpMethod, OperationVariant, ParamSpec } from "../core/types.js";

/** Spec-format-neutral view of an API. Discovery and OpenAPI both normalize into this. */
export interface NormalizedSpec {
  kind: "discovery" | "openapi";
  title: string;
  version: string;
  revision?: string;
  globalQueryParams: ParamSpec[];
  operations: SpecOperation[];
}

export interface SpecOperation {
  action: string;
  method: HttpMethod;
  description?: string;
  hasBody: boolean;
  params: ParamSpec[];
  routes: { variant: OperationVariant; path: string }[];
}
