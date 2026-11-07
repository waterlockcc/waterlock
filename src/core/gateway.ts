import { createMatcher, type MatchResult } from "./match.js";
import { evaluatePolicy, type Check, type CheckRecord, type Decision } from "./evaluate.js";
import { definePolicy, type AnyRequest, type Facts, type Policy, type PolicyRule } from "./policy.js";
import type { Credential } from "./credentials.js";
import type { ProviderDefinition, RequestOf } from "./provider.js";
import type { SessionClaims, Sessions } from "./session.js";

export interface DecisionEvent {
  at: string;
  sid: string | null;
  agent: string | null;
  provider: string;
  action: string | null;
  method: string;
  path: string;
  /** May gain members later: treat unknown values as deny. */
  effect: Decision["effect"] | "error";
  rules: string[];
  reason?: string;
  /** Dynamic checks (r.check) that ran for this request. */
  checks?: CheckRecord[];
  upstreamStatus?: number;
}

export interface GatewayOptions<P extends readonly ProviderDefinition[], F extends Facts> {
  providers: P;
  /**
   * `definePolicy(...)` result, or the rules array inline (typed from `providers`, no type argument).
   * Must cover every provider's requests: a Gmail-only policy on a Gmail + GitHub gateway won't compile.
   */
  policy: Policy<RequestOf<P>, F> | PolicyRule<RequestOf<P>, F>[];
  sessions: Sessions;
  /** Async fact lookup (counters, history, directory). Throwing denies. */
  enrich?: (req: RequestOf<P>) => F | Promise<F>;
  /** Answers `r.check("...")`, e.g. with your own AI SDK call. Absent = rules using checks deny. */
  check?: Check<RequestOf<P>>;
  /** Per-check timeout. Default 60s. */
  checkTimeoutMs?: number;
  onDecision?: (event: DecisionEvent) => void;
  /** Route prefix: `/p/<provider>/<upstream path>`. Default `/p`. */
  basePath?: string;
  maxBodyBytes?: number;
  /** Override for tests. */
  upstreamFetch?: typeof fetch;
}

/** Only these request headers reach upstream. Everything else (cookies, method overrides, the session token) is dropped. */
const FORWARD_REQUEST_HEADERS = ["accept", "accept-language", "content-type", "if-match", "if-none-match", "user-agent", "x-goog-api-client"];
/** Some APIs honor these and would let a POST act as a DELETE. Reject outright. */
const METHOD_OVERRIDE_HEADERS = ["x-http-method-override", "x-http-method", "x-method-override"];
const DROP_RESPONSE_HEADERS = ["set-cookie", "content-encoding", "content-length", "transfer-encoding", "connection", "keep-alive"];

export function createGateway<const P extends readonly ProviderDefinition[], F extends Facts = Facts>(
  opts: GatewayOptions<P, F>,
) {
  const policy = Array.isArray(opts.policy) ? definePolicy(opts.policy) : opts.policy;
  const basePath = (opts.basePath ?? "/p").replace(/\/$/, "");
  const maxBody = opts.maxBodyBytes ?? 10 * 1024 * 1024;
  const upstreamFetch = opts.upstreamFetch ?? fetch;
  const providers = new Map(
    opts.providers.map((p) => [
      p.id,
      { def: p, matcher: createMatcher(p.table, { allowedGlobalQueryParams: p.allowedGlobalQueryParams }) },
    ]),
  );

  /**
   * Two routing modes:
   *  - prefix: `/p/gmail/gmail/v1/...` (SDKs that keep base-URL paths)
   *  - bare:   `/gmail/v1/...` — provider whose generated table matches the path.
   *    Needed for googleapis, which keeps only the origin of `rootUrl`.
   *    Ambiguous matches across providers are refused.
   */
  type Entry = NonNullable<ReturnType<typeof providers.get>>;
  function resolveProvider(pathname: string): { entry: Entry; upstreamPath: string } | { status: 400 | 404; error: string } {
    const m = pathname.match(new RegExp(`^${escapeRe(basePath)}/([^/]+)(/.*)$`));
    const prefixed = m ? providers.get(m[1]!) : undefined;
    if (m && prefixed) return { entry: prefixed, upstreamPath: m[2]! };

    const hits = [...providers.values()].filter((p) => p.matcher.matchesPath(pathname));
    if (hits.length === 1) return { entry: hits[0]!, upstreamPath: pathname };
    if (hits.length > 1) return { status: 400, error: `path matches several providers: ${hits.map((h) => h.def.id).join(", ")}` };
    return { status: 404, error: "no provider matches this path" };
  }

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const event: DecisionEvent = {
      at: new Date().toISOString(),
      sid: null,
      agent: null,
      provider: "",
      action: null,
      method,
      path: url.pathname,
      effect: "deny",
      rules: [],
    };
    const finish = (res: Response, patch: Partial<DecisionEvent>) => {
      opts.onDecision?.({ ...event, ...patch });
      return res;
    };

    // 1. Route to provider. Upstream host is fixed by config; the harness only picks which provider.
    const route = resolveProvider(url.pathname);
    if ("error" in route) return finish(fail(route.status, "not_found", route.error), { effect: "error", reason: route.error });
    const { entry, upstreamPath } = route;
    event.provider = entry.def.id;
    event.path = upstreamPath;

    // 2. Authenticate the session token.
    const auth = await authenticate(req, opts.sessions);
    if ("error" in auth) {
      return finish(fail(401, "unauthenticated", "missing or invalid session token"), { reason: `unauthenticated: ${auth.error}` });
    }
    const session = auth.claims;
    event.sid = session.sid;
    event.agent = session.agent;

    const override = METHOD_OVERRIDE_HEADERS.find((h) => req.headers.has(h));
    if (override) return finish(fail(400, "bad_request", `header ${override} not allowed`), { reason: override });

    // 3. Match against the generated operation table.
    const matched: MatchResult = entry.matcher.match(method, upstreamPath, url.searchParams);
    if (!matched.ok) return finish(fail(matched.status, "policy_denied", matched.reason), { reason: matched.reason });
    const { op } = matched;
    event.action = op.action;

    // 4. Read body once: decode it for policy, forward the same bytes.
    const body = await readBody(req, maxBody);
    if (body === "too_large") return finish(fail(413, "bad_request", "body too large"), { reason: "body too large" });

    let context: object = {};
    const decoder = entry.def.decoders?.[op.action];
    if (decoder) {
      if (op.variant !== "standard") {
        const reason = `${op.variant} route for ${op.action} not supported: body can't be inspected`;
        return finish(deny(op.action, [], reason), { reason });
      }
      try {
        context = decoder({ body, contentType: req.headers.get("content-type") });
      } catch (err) {
        const reason = `could not decode request body: ${err instanceof Error ? err.message : String(err)}`;
        return finish(deny(op.action, [], reason), { reason });
      }
    }

    // Built from the provider's own table and decoder, so it matches that provider's request type.
    const policyReq = {
      provider: entry.def.id,
      action: op.action,
      groups: op.groups,
      params: matched.params,
      context,
      session,
    } satisfies AnyRequest as RequestOf<P>;

    // 5. Facts, then policy.
    let facts: F;
    try {
      facts = opts.enrich ? await opts.enrich(policyReq) : ({} as F);
    } catch (err) {
      const reason = `enrich failed: ${err instanceof Error ? err.message : String(err)}`;
      return finish(deny(op.action, [], reason), { reason });
    }

    const decision: Decision = await evaluatePolicy(policy, policyReq, facts, {
      ...(opts.check
        ? { check: (input: Parameters<NonNullable<typeof opts.check>>[0]) => opts.check!({ ...input, ...(opts.sessions.store ? { store: opts.sessions.store } : {}) }) }
        : {}),
      ...(opts.checkTimeoutMs ? { checkTimeoutMs: opts.checkTimeoutMs } : {}),
    });
    const audit = { rules: decision.rules, reason: decision.reason, ...(decision.checks.length ? { checks: decision.checks } : {}) };
    if (decision.effect === "deny") {
      return finish(deny(op.action, decision.rules, decision.reason), { effect: "deny", ...audit });
    }

    // 6. Forward with the real credential.
    const headers = new Headers();
    for (const h of FORWARD_REQUEST_HEADERS) {
      const v = req.headers.get(h);
      if (v !== null) headers.set(h, v);
    }
    let credential: Credential;
    try {
      credential = await entry.def.credentials({ session });
    } catch {
      return finish(fail(502, "upstream_auth", "could not obtain upstream credential", op.action), { effect: "error", reason: "credential" });
    }
    (entry.def.inject ?? bearer)({ headers, credential });

    const upstreamUrl = entry.def.upstream.replace(/\/$/, "") + upstreamPath + url.search;
    let upstream: Response;
    try {
      upstream = await upstreamFetch(upstreamUrl, {
        method,
        headers,
        body: body.length > 0 && method !== "GET" ? (body as BodyInit) : undefined,
        redirect: "manual",
      });
    } catch {
      return finish(fail(502, "upstream_unreachable", "upstream request failed", op.action), { effect: "error", reason: "upstream" });
    }

    const resHeaders = new Headers(upstream.headers);
    for (const h of DROP_RESPONSE_HEADERS) resHeaders.delete(h);
    return finish(new Response(upstream.body, { status: upstream.status, headers: resHeaders }), {
      effect: "allow",
      ...audit,
      upstreamStatus: upstream.status,
    });
  }

  return { fetch: handle };
}

async function authenticate(req: Request, sessions: Sessions): Promise<{ claims: SessionClaims } | { error: string }> {
  const header = req.headers.get("authorization");
  const token = header?.match(/^Bearer (\S+)$/i)?.[1];
  return token ? sessions.verify({ token }) : { error: "missing" };
}

async function readBody(req: Request, max: number): Promise<Uint8Array | "too_large"> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) return "too_large";
  if (!req.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of req.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > max) return "too_large";
    chunks.push(chunk);
  }
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function bearer({ headers, credential }: { headers: Headers; credential: Credential }): void {
  headers.set("authorization", `Bearer ${credential.token}`);
}

function deny(action: string, rules: string[], reason: string): Response {
  return fail(403, "policy_denied", reason, action, rules);
}

function fail(status: number, code: string, message: string, action?: string, rules?: string[]): Response {
  return Response.json({ error: { code, message, ...(action ? { action } : {}), ...(rules?.length ? { rules } : {}) } }, { status });
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
