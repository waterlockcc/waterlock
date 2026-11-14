import { readBody } from "../body.js";
import type { GatewayError } from "../provider.js";
import type { Router } from "../router.js";
import type { GraphqlMatcher } from "../types.js";

/**
 * GraphQL: POST to one endpoint, matched on the body. The top-level field is
 * the action; the parsed document is re-printed and forwarded, so upstream
 * runs exactly what was checked.
 */
export function graphqlRouter(opts: {
  /** Provider id, for error messages. */
  provider: string;
  /** e.g. `/graphql`. Any other path is refused. */
  endpoint: string;
  /** Build with `createGraphqlMatcher` from `@waterlock/gateway/graphql`. */
  matcher: GraphqlMatcher;
}): Router {
  return {
    formatError: graphqlError,

    async route({ method, url, headers, body, maxBodyBytes }) {
      if (url.pathname !== opts.endpoint)
        return {
          ok: false,
          status: 404,
          reason: `no ${opts.provider} operation matches path`,
        };
      if (method !== "POST")
        return {
          ok: false,
          status: 405,
          reason: "GraphQL requests must be POST",
        };
      if (url.search)
        return {
          ok: false,
          status: 400,
          reason: "query string not allowed on the GraphQL endpoint",
        };
      if (
        !/^application\/json\s*(;|$)/i.test(headers.get("content-type") ?? "")
      )
        return {
          ok: false,
          status: 400,
          code: "bad_request",
          reason: "content-type must be application/json",
        };

      const bytes = await readBody(body, headers, maxBodyBytes);
      if (bytes === "too_large")
        return {
          ok: false,
          status: 413,
          code: "bad_request",
          reason: "body too large",
        };
      const matched = opts.matcher.match(bytes);
      if (!matched.ok)
        return { ok: false, status: matched.status, reason: matched.reason };

      return {
        ok: true,
        action: matched.action,
        params: matched.params,
        context: {},
        body: matched.body,
        setHeaders: { "content-type": "application/json" },
      };
    },
  };
}

/**
 * GraphQL-style body, so GraphQL clients surface the message:
 * `{ errors: [{ message, extensions: { code, ... } }] }`.
 */
export function graphqlError({
  status,
  message,
  ...extensions
}: GatewayError): Response {
  return Response.json({ errors: [{ message, extensions }] }, { status });
}
