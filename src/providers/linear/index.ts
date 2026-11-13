import type { CredentialSource } from "../../core/credentials.js";
import type { ProviderRequest } from "../../core/policy.js";
import { createProvider } from "../../core/provider.js";
import { buildSchema, type GraphQLSchema } from "graphql";
import { createGraphqlMatcher } from "../../graphql/index.js";
import { linearError } from "./errors.js";
import {
  linearSdl,
  type LinearAction,
  type LinearParams,
} from "./generated.js";

export type * from "./generated.js";
export { linearSdl } from "./generated.js";

// Built once (~100ms), on the first linear() call.
let schema: GraphQLSchema | undefined;

/**
 * What Linear rules see. Narrow on `action` to get typed params, e.g.
 *
 *   r.action === "linear.mutation.issueCreate" &&
 *     r.params.input.teamId === TEAM
 */
export type LinearRequest = {
  [A in LinearAction]: ProviderRequest<
    "linear",
    A,
    LinearParams[A],
    Record<string, never>
  >;
}[LinearAction];

export function linear(opts: {
  credentials: CredentialSource;
  /**
   * `oauth` (default) sends `Authorization: Bearer <token>`; `apiKey` sends a
   * personal API key as-is.
   */
  auth?: "oauth" | "apiKey";
  upstream?: string;
}) {
  return createProvider<LinearRequest>({
    id: "linear",
    upstream: opts.upstream ?? "https://api.linear.app",
    graphql: {
      endpoint: "/graphql",
      matcher: createGraphqlMatcher({
        provider: "linear",
        schema: (schema ??= buildSchema(linearSdl)),
      }),
    },
    credentials: opts.credentials,
    formatError: linearError,
    ...(opts.auth === "apiKey"
      ? {
          inject: ({ headers, credential }) =>
            headers.set("authorization", credential.token),
        }
      : {}),
  });
}
