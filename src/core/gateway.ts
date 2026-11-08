import { createMatcher, type MatchResult } from "./match.js";
import { evaluatePolicy, type Check, type Decision } from "./evaluate.js";
import {
  definePolicy,
  type AnyRequest,
  type Policy,
  type PolicyRule,
} from "./policy.js";
import type { Credential } from "./credentials.js";
import type { ProviderDefinition, RequestOf } from "./provider.js";
import type { SessionClaims, Sessions } from "./session.js";

export interface GatewayOptions<P extends readonly ProviderDefinition[]> {
  providers: P;
  /**
   * `definePolicy(...)` result, or the rules array inline (typed from `providers`, no type argument).
   * Must cover every provider's requests: a Gmail-only policy on a Gmail + GitHub gateway won't compile.
   */
  policy: Policy<RequestOf<P>> | PolicyRule<RequestOf<P>>[];
  sessions: Sessions;
  /** Answers plain-language `when` rows, e.g. with your own AI SDK call. Absent = those rows deny. */
  check?: Check<RequestOf<P>>;
  /** Per-check timeout. Default 60s. */
  checkTimeoutMs?: number;
  maxBodyBytes?: number;
}

/** Only these request headers reach upstream. Everything else (cookies, method overrides, the session token) is dropped. */
const FORWARD_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "if-match",
  "if-none-match",
  "user-agent",
  "x-goog-api-client",
];
/** Some APIs honor these and would let a POST act as a DELETE. Reject outright. */
const METHOD_OVERRIDE_HEADERS = [
  "x-http-method-override",
  "x-http-method",
  "x-method-override",
];
const DROP_RESPONSE_HEADERS = [
  "set-cookie",
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
];

export function createGateway<const P extends readonly ProviderDefinition[]>(
  opts: GatewayOptions<P>,
) {
  const policy = Array.isArray(opts.policy)
    ? definePolicy(opts.policy)
    : opts.policy;
  const maxBody = opts.maxBodyBytes ?? 10 * 1024 * 1024;
  const ids = opts.providers.map((p) => p.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup) throw new Error(`provider "${dup}" is configured twice`);
  const providers = new Map(
    opts.providers.map((p) => {
      if (!p.table && !p.graphql)
        throw new Error(
          `provider "${p.id}" has neither a REST table nor a GraphQL endpoint`,
        );
      const matcher =
        p.table &&
        createMatcher(p.table, {
          allowedGlobalQueryParams: p.allowedGlobalQueryParams ?? [],
        });
      return [p.id, { def: p, matcher }];
    }),
  );

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    // 1. Authenticate. The signed token names the provider; the agent can't pick another.
    const auth = await authenticate(req, opts.sessions);
    if ("error" in auth) {
      return failRest(
        401,
        "unauthenticated",
        "missing or invalid session token",
      );
    }
    const session = auth.claims;
    const entry = providers.get(session.provider);
    if (!entry)
      return failRest(
        403,
        "unknown_provider",
        `this gateway has no provider "${session.provider}"`,
      );
    // The upstream host is fixed by config; the path is forwarded as-is.
    const upstreamPath = url.pathname;

    const override = METHOD_OVERRIDE_HEADERS.find((h) => req.headers.has(h));
    if (override)
      return failRest(400, "bad_request", `header ${override} not allowed`);

    // 2. Match: the GraphQL endpoint on the body, everything else against the REST operation table.
    const gql =
      entry.def.graphql && upstreamPath === entry.def.graphql.endpoint
        ? entry.def.graphql
        : undefined;
    const fail = gql ? failGraphql : failRest;
    const deny = (action: string, rules: string[], reason: string) =>
      fail(403, "policy_denied", reason, action, rules);
    let action: string;
    let params: Record<string, unknown>;
    let context: object = {};
    let forwardBody: Uint8Array | string;
    const contentType = req.headers.get("content-type");

    if (gql) {
      if (method !== "POST")
        return fail(405, "policy_denied", "GraphQL requests must be POST");
      if (url.search)
        return fail(
          400,
          "policy_denied",
          "query string not allowed on the GraphQL endpoint",
        );
      if (!/^application\/json\s*(;|$)/i.test(contentType ?? ""))
        return fail(
          400,
          "bad_request",
          "content-type must be application/json",
        );
      const body = await readBody(req, maxBody);
      if (body === "too_large")
        return fail(413, "bad_request", "body too large");
      const matched = gql.matcher.match(body);
      if (!matched.ok)
        return fail(matched.status, "policy_denied", matched.reason);
      ({ action, params } = matched);
      forwardBody = matched.body;
    } else {
      if (!entry.matcher)
        return fail(
          404,
          "policy_denied",
          `no ${entry.def.id} operation matches path`,
        );
      const matched: MatchResult = entry.matcher.match(
        method,
        upstreamPath,
        url.searchParams,
      );
      if (!matched.ok)
        return fail(matched.status, "policy_denied", matched.reason);
      const { op } = matched;
      action = op.action;
      params = matched.params;

      // 3. Read body once: decode it for policy, forward the same bytes.
      const body = await readBody(req, maxBody);
      if (body === "too_large")
        return fail(413, "bad_request", "body too large");
      forwardBody = body;

      const decoder = entry.def.decoders?.[op.action];
      if (decoder) {
        if (op.variant !== "standard") {
          const reason = `${op.variant} route for ${op.action} not supported: body can't be inspected`;
          return deny(op.action, [], reason);
        }
        try {
          context = await decoder({ body, contentType });
        } catch (err) {
          const reason = `could not decode request body: ${err instanceof Error ? err.message : String(err)}`;
          return deny(op.action, [], reason);
        }
      }
    }

    // Built from the provider's own table and decoder, so it matches that provider's request type.
    const policyReq = {
      provider: entry.def.id,
      action,
      params,
      context,
      session,
    } satisfies AnyRequest as RequestOf<P>;

    // 4. Policy.
    const decision: Decision = await evaluatePolicy(policy, policyReq, {
      ...(opts.check
        ? {
            check: (input: Parameters<NonNullable<typeof opts.check>>[0]) =>
              opts.check!({
                ...input,
                ...(opts.sessions.store ? { store: opts.sessions.store } : {}),
              }),
          }
        : {}),
      ...(opts.checkTimeoutMs ? { checkTimeoutMs: opts.checkTimeoutMs } : {}),
    });
    if (decision.effect === "deny") {
      return deny(action, decision.rules, decision.reason);
    }

    // 5. Forward with the real credential.
    const headers = new Headers();
    for (const h of FORWARD_REQUEST_HEADERS) {
      const v = req.headers.get(h);
      if (v !== null) headers.set(h, v);
    }
    if (gql) headers.set("content-type", "application/json");
    let credential: Credential;
    try {
      credential = await entry.def.credentials({ session });
    } catch {
      return fail(
        502,
        "upstream_auth",
        "could not obtain upstream credential",
        action,
      );
    }
    (entry.def.inject ?? bearer)({ headers, credential });

    const upstreamUrl =
      entry.def.upstream.replace(/\/$/, "") + upstreamPath + url.search;
    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        method,
        headers,
        body:
          forwardBody.length > 0 && method !== "GET"
            ? (forwardBody as BodyInit)
            : undefined,
        redirect: "manual",
      });
    } catch {
      return fail(
        502,
        "upstream_unreachable",
        "upstream request failed",
        action,
      );
    }

    const resHeaders = new Headers(upstream.headers);
    for (const h of DROP_RESPONSE_HEADERS) resHeaders.delete(h);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  }

  return { fetch: handle };
}

async function authenticate(
  req: Request,
  sessions: Sessions,
): Promise<{ claims: SessionClaims } | { error: string }> {
  const header = req.headers.get("authorization");
  const token = header?.match(/^Bearer (\S+)$/i)?.[1];
  return token ? sessions.verify({ token }) : { error: "missing" };
}

async function readBody(
  req: Request,
  max: number,
): Promise<Uint8Array | "too_large"> {
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

function bearer({
  headers,
  credential,
}: {
  headers: Headers;
  credential: Credential;
}): void {
  headers.set("authorization", `Bearer ${credential.token}`);
}

function failRest(
  status: number,
  code: string,
  message: string,
  action?: string,
  rules?: string[],
): Response {
  return Response.json(
    { error: errorFields(code, message, action, rules) },
    { status },
  );
}

/** GraphQL-style body, so GraphQL clients surface the message: `{ errors: [{ message, extensions: { code, ... } }] }`. */
function failGraphql(
  status: number,
  code: string,
  message: string,
  action?: string,
  rules?: string[],
): Response {
  const { message: _, ...extensions } = errorFields(
    code,
    message,
    action,
    rules,
  );
  return Response.json({ errors: [{ message, extensions }] }, { status });
}

function errorFields(
  code: string,
  message: string,
  action?: string,
  rules?: string[],
) {
  return {
    code,
    message,
    ...(action ? { action } : {}),
    ...(rules?.length ? { rules } : {}),
  };
}
