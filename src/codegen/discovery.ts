import {
  HTTP_METHODS,
  type HttpMethod,
  type ParamSpec,
  type ParamType,
} from "../core/types.js";
import type { NormalizedSpec, SpecOperation } from "./model.js";

/** Google API Discovery document (subset we use). */
export interface DiscoveryDoc extends DiscoveryResource {
  name: string;
  version: string;
  title?: string;
  revision?: string;
  rootUrl: string;
  servicePath: string;
  parameters?: Record<string, DiscoveryParam>;
}

interface DiscoveryResource {
  methods?: Record<string, DiscoveryMethod>;
  resources?: Record<string, DiscoveryResource>;
}

interface DiscoveryMethod {
  id: string;
  httpMethod: string;
  path: string;
  description?: string;
  parameters?: Record<string, DiscoveryParam>;
  request?: unknown;
  mediaUpload?: {
    protocols?: {
      simple?: { path: string };
      resumable?: { path: string };
    };
  };
}

interface DiscoveryParam {
  type?: string;
  location?: string;
  required?: boolean;
  repeated?: boolean;
  enum?: string[];
}

export function fromDiscovery(doc: DiscoveryDoc): NormalizedSpec {
  const operations: SpecOperation[] = [];
  walk(doc, (m) => operations.push(toOperation(doc, m)));
  operations.sort((a, b) => a.action.localeCompare(b.action));

  return {
    kind: "discovery",
    title: doc.title ?? doc.name,
    version: doc.version,
    revision: doc.revision,
    globalQueryParams: Object.entries(doc.parameters ?? {}).map(([name, p]) =>
      toParam(name, p, false),
    ),
    operations,
  };
}

function walk(r: DiscoveryResource, visit: (m: DiscoveryMethod) => void): void {
  for (const m of Object.values(r.methods ?? {})) visit(m);
  for (const sub of Object.values(r.resources ?? {})) walk(sub, visit);
}

function toOperation(doc: DiscoveryDoc, m: DiscoveryMethod): SpecOperation {
  const method = m.httpMethod.toUpperCase() as HttpMethod;
  if (!HTTP_METHODS.includes(method))
    throw new Error(`${m.id}: unsupported HTTP method ${m.httpMethod}`);

  const path = joinPath(doc.servicePath, m.path);
  const multiSegment = new Set(
    [...path.matchAll(/\{\+([^}]+)\}/g)].map((x) => x[1]!),
  );
  const params = Object.entries(m.parameters ?? {})
    .filter(([, p]) => p.location === "path" || p.location === "query")
    .map(([name, p]) => toParam(name, p, multiSegment.has(name)))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Every template variable must be a declared path param, or the matcher can't type it.
  for (const [, name] of path.matchAll(/\{\+?([^}]+)\}/g)) {
    if (!params.some((p) => p.in === "path" && p.name === name)) {
      throw new Error(
        `${m.id}: path variable {${name}} has no matching path parameter`,
      );
    }
  }

  const routes: SpecOperation["routes"] = [{ variant: "standard", path }];
  const media = m.mediaUpload?.protocols;
  if (media?.simple)
    routes.push({ variant: "upload", path: media.simple.path });
  if (media?.resumable)
    routes.push({ variant: "resumable", path: media.resumable.path });

  return {
    action: m.id,
    method,
    description: m.description,
    hasBody: m.request !== undefined,
    params,
    routes,
  };
}

function toParam(
  name: string,
  p: DiscoveryParam,
  multiSegment: boolean,
): ParamSpec {
  const spec: ParamSpec = {
    name,
    in: p.location === "path" ? "path" : "query",
    type: mapType(p.type),
  };
  if (p.required) spec.required = true;
  if (p.repeated) spec.repeated = true;
  if (p.enum?.length) spec.enum = p.enum;
  if (multiSegment) spec.multiSegment = true;
  return spec;
}

function mapType(t: string | undefined): ParamType {
  // Discovery encodes int64 as type "string", which is what we want (no precision loss).
  if (t === "integer" || t === "number" || t === "boolean") return t;
  return "string";
}

function joinPath(servicePath: string, path: string): string {
  if (path.startsWith("/")) return path;
  return ("/" + servicePath + "/" + path).replace(/\/{2,}/g, "/");
}
