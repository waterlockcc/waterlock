import type { Operation, OperationTable, ParamSpec } from "./types.js";

export type MatchResult =
  | { ok: true; op: Operation; params: Record<string, unknown> }
  | { ok: false; status: 400 | 404 | 405; reason: string };

interface CompiledOp {
  op: Operation;
  re: RegExp;
  names: string[];
  literalChars: number;
}

/**
 * Paths the upstream might interpret differently than we do. Rejected rather
 * than normalized: whatever we match must be exactly what we forward.
 * (WHATWG URL parsing already resolves `.`/`..` segments before we see the path.)
 */
const AMBIGUOUS_PATH = /\/\/|%2f|%5c|\\|%00|%2e/i;

export interface Matcher {
  match(method: string, path: string, query: URLSearchParams): MatchResult;
}

export function createMatcher(table: OperationTable, opts: { allowedGlobalQueryParams: readonly string[] }): Matcher {
  const compiled = table.operations.map(compileOp);
  const allowedGlobals = new Set(opts.allowedGlobalQueryParams);

  return { match };

  function match(method: string, path: string, query: URLSearchParams): MatchResult {
    if (AMBIGUOUS_PATH.test(path)) return { ok: false, status: 400, reason: "ambiguous path encoding" };

    const byPath = compiled.filter((c) => c.re.test(path));
    if (byPath.length === 0) return { ok: false, status: 404, reason: `no ${table.provider} operation matches path` };
    const candidates = byPath.filter((c) => c.op.method === method);
    if (candidates.length === 0) return { ok: false, status: 405, reason: `method ${method} not allowed on path` };

    // Prefer the most specific template: `/messages/send` beats `/messages/{id}`.
    candidates.sort((a, b) => b.literalChars - a.literalChars);
    const best = candidates[0]!;
    const tie = candidates.find((c) => c !== best && c.literalChars === best.literalChars && c.op.action !== best.op.action);
    if (tie) return { ok: false, status: 400, reason: `ambiguous route: ${best.op.action} vs ${tie.op.action}` };

    const params: Record<string, unknown> = {};
    const m = best.re.exec(path)!;
    for (let i = 0; i < best.names.length; i++) {
      const spec = best.op.params.find((p) => p.in === "path" && p.name === best.names[i])!;
      let raw: string;
      try {
        raw = decodeURIComponent(m[i + 1]!);
      } catch {
        return { ok: false, status: 400, reason: `bad encoding in path param ${spec.name}` };
      }
      const v = coerce(spec, raw);
      if (!v.ok) return { ok: false, status: 400, reason: v.reason };
      params[spec.name] = v.value;
    }

    for (const key of new Set(query.keys())) {
      const spec = best.op.params.find((p) => p.in === "query" && p.name === key);
      if (!spec) {
        if (allowedGlobals.has(key)) continue;
        return { ok: false, status: 400, reason: `query param "${key}" not allowed for ${best.op.action}` };
      }
      const values = query.getAll(key);
      if (!spec.repeated && values.length > 1) {
        return { ok: false, status: 400, reason: `query param "${key}" given ${values.length} times` };
      }
      const parsed: unknown[] = [];
      for (const raw of values) {
        const v = coerce(spec, raw);
        if (!v.ok) return { ok: false, status: 400, reason: v.reason };
        parsed.push(v.value);
      }
      params[key] = spec.repeated ? parsed : parsed[0];
    }

    const missing = best.op.params.find((p) => p.in === "query" && p.required && !(p.name in params));
    if (missing) return { ok: false, status: 400, reason: `missing required query param "${missing.name}"` };

    return { ok: true, op: best.op, params };
  }
}

function compileOp(op: Operation): CompiledOp {
  const names: string[] = [];
  let literalChars = 0;
  const pattern = op.path.replace(/\{(\+?)([^}]+)\}|[^{]+/g, (whole, plus: string | undefined, name: string | undefined) => {
    if (name === undefined) {
      literalChars += whole.length;
      return whole.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
    names.push(name);
    return plus ? "(.+)" : "([^/]+)";
  });
  return { op, re: new RegExp(`^${pattern}$`), names, literalChars };
}

function coerce(spec: ParamSpec, raw: string): { ok: true; value: unknown } | { ok: false; reason: string } {
  const bad = (what: string) => ({ ok: false as const, reason: `param "${spec.name}" ${what}` });
  if (spec.enum && !spec.enum.includes(raw)) return bad(`must be one of ${spec.enum.join(", ")}`);
  switch (spec.type) {
    case "integer":
      return /^-?\d+$/.test(raw) ? { ok: true, value: Number(raw) } : bad("must be an integer");
    case "number": {
      const n = Number(raw);
      return raw.trim() !== "" && Number.isFinite(n) ? { ok: true, value: n } : bad("must be a number");
    }
    case "boolean":
      return raw === "true" || raw === "false" ? { ok: true, value: raw === "true" } : bad("must be true or false");
    case "string":
      return { ok: true, value: raw };
  }
}
