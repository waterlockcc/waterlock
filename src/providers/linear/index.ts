import type { CredentialSource } from "../../core/credentials.js";
import type { ProviderRequest } from "../../core/policy.js";
import { createProvider } from "../../core/provider.js";
import { createGraphqlMatcher } from "../../graphql/index.js";
import { linearGraphqlTable, type LinearAction, type LinearParams } from "./generated.js";

export type * from "./generated.js";
export { linearGraphqlTable } from "./generated.js";

/**
 * What Linear rules see. Narrow on `action` to get typed params, e.g.
 * `r.action === "linear.mutation.issueCreate" && r.params.input.teamId === TEAM`.
 */
export type LinearRequest = {
  [A in LinearAction]: ProviderRequest<"linear", A, LinearParams[A], Record<string, never>>;
}[LinearAction];

export function linear(opts: {
  credentials: CredentialSource;
  /** `oauth` (default) sends `Authorization: Bearer <token>`; `apiKey` sends a personal API key as-is. */
  auth?: "oauth" | "apiKey";
  upstream?: string;
}) {
  return createProvider<LinearRequest>({
    id: "linear",
    upstream: opts.upstream ?? "https://api.linear.app",
    graphql: { endpoint: "/graphql", matcher: createGraphqlMatcher(linearGraphqlTable) },
    credentials: opts.credentials,
    ...(opts.auth === "apiKey" ? { inject: ({ headers, credential }) => headers.set("authorization", credential.token) } : {}),
  });
}
