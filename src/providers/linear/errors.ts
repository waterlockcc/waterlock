import type { GatewayError } from "../../core/provider.js";

/**
 * HTTP status to the `extensions.type` strings `@linear/sdk` maps to its error
 * classes (`errorMap` in its `error.ts`).
 */
function linearType(status: number): string {
  if (status === 403) return "forbidden";
  if (status === 401) return "authentication error";
  if (status >= 500) return "network error";
  return "invalid input";
}

/**
 * GraphQL errors as `@linear/sdk` parses them: `extensions.type` picks the
 * error class (403 is a `ForbiddenLinearError`) and `userPresentableMessage`
 * is the message it shows. The gateway's own fields stay in `extensions`.
 */
export function linearError(error: GatewayError): Response {
  const { status, message, ...rest } = error;
  return Response.json(
    {
      errors: [
        {
          message,
          extensions: {
            type: linearType(status),
            userPresentableMessage: message,
            ...rest,
          },
        },
      ],
    },
    { status },
  );
}
