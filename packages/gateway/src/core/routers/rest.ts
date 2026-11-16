import { readBody } from "../body.js";
import { createMatcher } from "../match.js";
import type { Decoder, GatewayError } from "../provider.js";
import type { Router } from "../router.js";
import type { OperationTable } from "../types.js";

/**
 * REST: matched on method + path against the operation table, then the body
 * is read once, decoded for policy, and the same bytes forwarded.
 */
export function restRouter(opts: {
  table: OperationTable;
  allowedGlobalQueryParams?: readonly string[];
  decoders?: Partial<Record<string, Decoder>>;
}): Router {
  const matcher = createMatcher(opts.table, {
    allowedGlobalQueryParams: opts.allowedGlobalQueryParams ?? [],
  });

  return {
    formatError: restError,

    async route({ method, url, headers, body, maxBodyBytes }) {
      const matched = matcher.match(method, url.pathname, url.searchParams);
      if (!matched.ok)
        return { ok: false, status: matched.status, reason: matched.reason };
      const { op } = matched;

      const bytes = await readBody(body, headers, maxBodyBytes);
      if (bytes === "too_large")
        return {
          ok: false,
          status: 413,
          code: "bad_request",
          reason: "body too large",
        };

      let context: object = {};
      const decoder = opts.decoders?.[op.action];
      if (decoder) {
        if (op.variant !== "standard")
          return {
            ok: false,
            status: 403,
            reason: `${op.variant} route for ${op.action} not supported: body can't be inspected`,
            action: op.action,
          };
        try {
          context = await decoder({
            body: bytes,
            contentType: headers.get("content-type"),
          });
        } catch (err) {
          return {
            ok: false,
            status: 403,
            reason: `could not decode request body: ${err instanceof Error ? err.message : String(err)}`,
            action: op.action,
          };
        }
      }

      return {
        ok: true,
        action: op.action,
        params: matched.params,
        context,
        body: bytes.length > 0 && method !== "GET" ? bytes : null,
      };
    },
  };
}

/** `{ error: { code, message, action?, rules? } }`. */
export function restError({ status, ...error }: GatewayError): Response {
  return Response.json({ error }, { status });
}
