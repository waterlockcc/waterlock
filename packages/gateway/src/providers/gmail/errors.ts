import type { GatewayError } from "../../core/provider.js";

/** HTTP status to the canonical `google.rpc.Code` name. */
const GOOGLE_STATUS: Record<number, string> = {
  400: "INVALID_ARGUMENT",
  401: "UNAUTHENTICATED",
  403: "PERMISSION_DENIED",
  404: "NOT_FOUND",
  405: "UNIMPLEMENTED",
  413: "INVALID_ARGUMENT",
  502: "UNAVAILABLE",
};

const DOMAIN = "waterlock.cc";

/**
 * Google's error body (AIP-193, https://google.aip.dev/193), as
 * `@googleapis/gmail` parses it: `err.code` is the numeric `code` and
 * `err.message` is joined from `errors[].message`. The gateway code is the
 * `reason` in `errors[]` (camelCase, like Gmail's own `rateLimitExceeded`) and
 * in an `ErrorInfo` detail (UPPER_SNAKE_CASE, as AIP-193 asks).
 */
export function googleError(error: GatewayError): Response {
  const { status, code, message, action, rules } = error;
  const metadata: Record<string, string> = {
    ...(action ? { action } : {}),
    ...(rules ? { rules: rules.join(",") } : {}),
  };
  return Response.json(
    {
      error: {
        code: status,
        message,
        status: GOOGLE_STATUS[status] ?? "UNKNOWN",
        errors: [{ message, domain: DOMAIN, reason: camelCase(code) }],
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: code.toUpperCase(),
            domain: DOMAIN,
            metadata,
          },
        ],
      },
    },
    { status },
  );
}

function camelCase(code: string): string {
  return code.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}
