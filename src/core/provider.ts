import type { Credential, CredentialSource } from "./credentials.js";
import type { AnyRequest } from "./policy.js";
import type { GraphqlMatcher, OperationTable } from "./types.js";

/**
 * Extracts policy-relevant fields from a request body. Throwing denies the
 * request: if the gateway can't read what a call does, it doesn't forward it.
 */
export type Decoder = (input: {
  body: Uint8Array;
  contentType: string | null;
}) => object | Promise<object>;

/**
 * `R` is the request type rules see for this provider. Type-only: drives policy
 * autocomplete and checks.
 */
export interface ProviderDefinition<R extends AnyRequest = AnyRequest> {
  // New fields must be optional with a default: custom providers implement this
  // interface.
  id: string;
  /** Fixed upstream origin. The harness can never choose the host. */
  upstream: string;
  /**
   * REST operations, matched on method + path. Omit for GraphQL-only providers.
   */
  table?: OperationTable;
  /**
   * Spec-level query params (e.g. Google's `fields`, `alt`) allowed on every
   * call. Anything else unlisted is denied.
   */
  allowedGlobalQueryParams?: readonly string[];
  /**
   * GraphQL endpoint (e.g. `/graphql`). Requests to it are matched on the body:
   * the top-level field is the action. Build `matcher` with
   * `createGraphqlMatcher` from `@waterlock/gateway/graphql`.
   */
  graphql?: { endpoint: string; matcher: GraphqlMatcher };
  /**
   * Per-action body decoders (REST only). Only run on the standard route;
   * upload variants of decoded actions are denied.
   */
  decoders?: Partial<Record<string, Decoder>>;
  credentials: CredentialSource;
  /** Default: `Authorization: Bearer <token>`. */
  inject?: (input: { headers: Headers; credential: Credential }) => void;
  /** Type-only marker, never set at runtime. */
  readonly __request?: R;
}

/**
 * Typed helper for provider definitions. Use it for custom providers too:
 * methods added later (e.g. `withGroups`) arrive here without changing your
 * provider code.
 *
 * TODO(groups): named sets of actions, usable in rules as `r.in("gmail:send")`.
 *
 *   type Pattern = R["action"] | `${string}*${string}`;
 *   withGroups<const M extends Record<string, readonly Pattern[]>>(
 *     groups: M,
 *   ): Provider<
 *     R & { groups: readonly `${R["provider"]}:${keyof M & string}`[] }
 *   >;
 *
 *   - returns a new provider; names are prefixed with the provider id
 *     (`gmail:risky`)
 *   - values are action names or globs (`*` one dotted segment, `**` any
 *     number)
 *   - throw on a pattern matching no action and on invalid names; adding to an
 *     existing group extends it
 *   - gateway: build action -> groups once per provider, set `request.groups`
 *   - rules: `in(group)` on the rule input, typed from `groups` so typos fail
 *     typecheck
 *   - built-in providers ship curated defaults (gmail: read, compose, send,
 *     delete, forwarding...)
 */
export function createProvider<R extends AnyRequest>(
  def: ProviderDefinition<R>,
): ProviderDefinition<R> {
  return def;
}

/** Union of the request types of a list of providers. */
export type RequestOf<P extends readonly ProviderDefinition[]> =
  P[number] extends infer D
    ? D extends ProviderDefinition<infer R>
      ? R
      : never
    : never;
