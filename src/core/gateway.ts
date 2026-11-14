import { drain } from "./body.js";
import { gatewayError } from "./errors.js";
import { evaluatePolicy, type Check, type Decision } from "./evaluate.js";
import {
  definePolicy,
  type AnyRequest,
  type Policy,
  type PolicyRule,
} from "./policy.js";
import type { Credential } from "./credentials.js";
import type { ProviderDefinition, RequestOf } from "./provider.js";
import type { RouteResult, Router } from "./router.js";
import { graphqlRouter } from "./routers/graphql.js";
import { restError, restRouter } from "./routers/rest.js";
import type { SessionClaims, Sessions } from "./session.js";

export interface GatewayOptions<P extends readonly ProviderDefinition[]> {
  providers: P;
  /**
   * `definePolicy(...)` result, or the rules array inline (typed from
   * `providers`, no type argument). Must cover every provider's requests: a
   * Gmail-only policy on a Gmail + GitHub gateway won't compile.
   */
  policy: Policy<RequestOf<P>> | PolicyRule<RequestOf<P>>[];
  sessions: Sessions;
  /**
   * Answers plain-language `when` rows, e.g. with your own AI SDK call. Without
   * it, those rows deny.
   */
  check?: Check<RequestOf<P>>;
  /** Per-check timeout. Default 60s. */
  checkTimeoutMs?: number;
  maxBodyBytes?: number;
}

/**
 * Only these request headers reach upstream, plus any a router adds.
 * Everything else (cookies, method overrides, the session token) is dropped.
 */
const FORWARD_REQUEST_HEADERS = [
  "accept",
  "accept-language",
  "content-type",
  "if-match",
  "if-none-match",
  "user-agent",
  "x-goog-api-client",
];
/**
 * Some APIs honor these and would let a POST act as a DELETE. Reject outright.
 */
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
    opts.providers.map((p) => [p.id, { def: p, routerFor: routing(p) }]),
  );

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    // 1. Authenticate. The signed token names the provider; the agent can't
    //    pick another.
    const auth = await authenticate(req, opts.sessions);
    // Until the token is verified the provider is unknown, so these two use
    // the generic REST body, unless a router recognizes the path.
    if ("error" in auth) {
      const error = gatewayError(
        401,
        "unauthenticated",
        "missing or invalid session token",
      );
      for (const p of opts.providers) {
        const res = p.router?.unauthenticated?.(url, error);
        if (res) return res;
      }
      return restError(error);
    }
    const session = auth.claims;
    const entry = providers.get(session.provider);
    if (!entry)
      return restError(
        gatewayError(
          403,
          "unknown_provider",
          `this gateway has no provider "${session.provider}"`,
        ),
      );

    // From here on, errors use the provider's own shape when it has one,
    // else the protocol's.
    const router = entry.routerFor(url.pathname);
    let format = entry.def.formatError ?? router?.formatError ?? restError;
    const fail = (
      status: number,
      code: string,
      reason: string,
      action?: string,
      rules?: string[],
    ) => format(gatewayError(status, code, reason, action, rules));

    if (!router)
      return fail(
        404,
        "policy_denied",
        `no ${entry.def.id} operation matches path`,
      );
    const override = METHOD_OVERRIDE_HEADERS.find((h) => req.headers.has(h));
    if (override)
      return fail(400, "bad_request", `header ${override} not allowed`);

    // 2. Route: the provider's protocol turns the request into an action,
    //    params and context, and says what to forward.
    let routed: RouteResult;
    try {
      routed = await router.route({
        method,
        url,
        headers: req.headers,
        body: req.body,
        maxBodyBytes: maxBody,
      });
    } catch (err) {
      return fail(
        400,
        "bad_request",
        `could not read request: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (!routed.ok)
      return fail(
        routed.status,
        routed.code ?? "policy_denied",
        routed.reason,
        routed.action,
      );
    if (routed.formatError) format = routed.formatError;
    const { action, params, context } = routed;

    // Built by the provider's own router, so it matches that provider's
    // request type.
    const policyReq = {
      provider: entry.def.id,
      action,
      params,
      context,
      session,
    } satisfies AnyRequest as RequestOf<P>;

    // 3. Policy.
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
      await drain(routed.body);
      return fail(
        403,
        "policy_denied",
        decision.reason,
        action,
        decision.rules,
      );
    }

    // 4. Forward with the real credential.
    const headers = new Headers();
    for (const h of [
      ...FORWARD_REQUEST_HEADERS,
      ...(routed.forwardHeaders ?? []),
    ]) {
      const v = req.headers.get(h);
      if (v !== null) headers.set(h, v);
    }
    for (const [h, v] of Object.entries(routed.setHeaders ?? {}))
      headers.set(h, v);
    let credential: Credential;
    try {
      credential = await entry.def.credentials({ session });
    } catch {
      await drain(routed.body);
      return fail(
        502,
        "upstream_auth",
        "could not obtain upstream credential",
        action,
      );
    }
    (entry.def.inject ?? bearer)({ headers, credential });

    const upstreamUrl =
      entry.def.upstream.replace(/\/$/, "") + url.pathname + url.search;
    const stream = routed.body instanceof ReadableStream;
    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        method,
        headers,
        body: routed.body ?? undefined,
        redirect: "manual",
        // Node requires this to send a stream as the body.
        ...(stream ? { duplex: "half" } : {}),
      } as RequestInit);
    } catch {
      await drain(routed.body);
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

/**
 * Which router handles a path. A custom router takes every request; otherwise
 * the GraphQL endpoint goes to GraphQL and everything else to the REST table.
 * Undefined: nothing in this provider matches the path.
 */
function routing(
  def: ProviderDefinition,
): (path: string) => Router | undefined {
  if (def.router) {
    const router = def.router;
    return () => router;
  }
  if (!def.table && !def.graphql)
    throw new Error(
      `provider "${def.id}" has no REST table, GraphQL endpoint or router`,
    );
  const rest =
    def.table &&
    restRouter({
      table: def.table,
      ...(def.allowedGlobalQueryParams
        ? { allowedGlobalQueryParams: def.allowedGlobalQueryParams }
        : {}),
      ...(def.decoders ? { decoders: def.decoders } : {}),
    });
  const graphql = def.graphql && {
    endpoint: def.graphql.endpoint,
    router: graphqlRouter({ matcher: def.graphql.matcher }),
  };
  return (path) =>
    graphql && path === graphql.endpoint ? graphql.router : rest;
}

/**
 * The session token, as `Authorization: Bearer <token>` or as the password of
 * Basic auth (for clients like git that only speak Basic).
 */
async function authenticate(
  req: Request,
  sessions: Sessions,
): Promise<{ claims: SessionClaims } | { error: string }> {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.match(/^Bearer (\S+)$/i)?.[1];
  const basic = header.match(/^Basic ([A-Za-z0-9+/]+={0,2})$/i)?.[1];
  let token = bearer;
  if (!token && basic) {
    let decoded: string;
    try {
      decoded = atob(basic);
    } catch {
      return { error: "malformed" };
    }
    const colon = decoded.indexOf(":");
    token = colon === -1 ? undefined : decoded.slice(colon + 1);
  }
  return token ? sessions.verify({ token }) : { error: "missing" };
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
