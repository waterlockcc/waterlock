import {
  HTTP_METHODS,
  type HttpMethod,
  type ParamSpec,
  type ParamType,
} from "../core/types.js";
import type { NormalizedSpec, SpecOperation } from "./model.js";

/** OpenAPI 3.x document (subset we use). */
export interface OpenAPIDoc {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, Record<string, unknown>>;
  components?: { parameters?: Record<string, OpenAPIParam> };
}

interface OpenAPIParam {
  $ref?: string;
  name: string;
  in: string;
  required?: boolean;
  schema?: OpenAPISchema;
}

interface OpenAPISchema {
  type?: string;
  enum?: unknown[];
  items?: OpenAPISchema;
}

interface OpenAPIOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: OpenAPIParam[];
  requestBody?: unknown;
}

/**
 * Action name = `${provider}.${operationId}`. Specs without operationIds get a
 * synthesized name from method + path, which is stable but ugly — curate those.
 */
export function fromOpenAPI(
  doc: OpenAPIDoc,
  opts: { provider: string },
): NormalizedSpec {
  const operations: SpecOperation[] = [];

  for (const [path, item] of Object.entries(doc.paths)) {
    const shared = (item.parameters as OpenAPIParam[] | undefined) ?? [];
    for (const [verb, raw] of Object.entries(item)) {
      const method = verb.toUpperCase() as HttpMethod;
      if (!HTTP_METHODS.includes(method)) continue;
      const op = raw as OpenAPIOperation;

      const byKey = new Map<string, ParamSpec>();
      for (const p of [...shared, ...(op.parameters ?? [])]) {
        const resolved = resolveParam(doc, p);
        if (resolved.in !== "path" && resolved.in !== "query") continue;
        // Op-level overrides path-level.
        byKey.set(`${resolved.in}:${resolved.name}`, toParam(resolved));
      }

      operations.push({
        action: `${opts.provider}.${op.operationId ?? synthesizeId(method, path)}`,
        method,
        description: op.summary ?? op.description,
        hasBody: op.requestBody !== undefined,
        params: [...byKey.values()].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
        routes: [{ variant: "standard", path }],
      });
    }
  }

  operations.sort((a, b) => a.action.localeCompare(b.action));
  const dupes = operations.filter(
    (o, i) => i > 0 && operations[i - 1]!.action === o.action,
  );
  if (dupes.length)
    throw new Error(
      `duplicate actions: ${dupes.map((d) => d.action).join(", ")}`,
    );

  return {
    kind: "openapi",
    title: doc.info.title,
    version: doc.info.version,
    globalQueryParams: [],
    operations,
  };
}

function resolveParam(doc: OpenAPIDoc, p: OpenAPIParam): OpenAPIParam {
  if (!p.$ref) return p;
  const name = p.$ref.replace("#/components/parameters/", "");
  const target = doc.components?.parameters?.[name];
  if (!target) throw new Error(`unresolved parameter ref ${p.$ref}`);
  return target;
}

function toParam(p: OpenAPIParam): ParamSpec {
  const isArray = p.schema?.type === "array";
  const schema = isArray ? p.schema?.items : p.schema;
  const spec: ParamSpec = {
    name: p.name,
    in: p.in as "path" | "query",
    type: mapType(schema?.type),
  };
  if (p.required || p.in === "path") spec.required = true;
  if (isArray) spec.repeated = true;
  if (schema?.enum?.length) spec.enum = schema.enum.map(String);
  return spec;
}

function mapType(t: string | undefined): ParamType {
  if (t === "integer" || t === "number" || t === "boolean") return t;
  return "string";
}

function synthesizeId(method: string, path: string): string {
  const parts = path
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/[{}]/g, ""));
  return [method.toLowerCase(), ...parts].join("_");
}
