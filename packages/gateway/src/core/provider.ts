import type { Credential, CredentialSource } from "./credentials.js";
import type { AnyRequest } from "./policy.js";
import type { Router } from "./router.js";

/**
 * Extracts policy-relevant fields from a request body. Throwing denies the
 * request: if the gateway can't read what a call does, it doesn't forward it.
 */
export type Decoder = (input: {
  body: Uint8Array;
  contentType: string | null;
}) => object | Promise<object>;

/** A call the gateway refused, before it is written as a response. */
export interface GatewayError {
  /** HTTP status, e.g. 403. */
  status: number;
  /** Gateway error code, e.g. `policy_denied`. */
  code: string;
  /**
   * The reason with a fixed prefix, so the agent can tell the gateway refused
   * the call and not the provider: `Error for waterlock proxy: <reason>`.
   */
  message: string;
  action?: string;
  /** Ids of the rules that denied the call. */
  rules?: string[];
}

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
   * Turns requests into actions for policy: `restRouter` (an operation table),
   * `graphqlRouter` (one GraphQL endpoint), or your own for other protocols.
   */
  router: Router;
  credentials: CredentialSource;
  /** Default: `Authorization: Bearer <token>`. */
  inject?: (input: { headers: Headers; credential: Credential }) => void;
  /**
   * Writes gateway errors in the shape the provider's own SDK parses, so its
   * usual error class, code and message come through. Default: the router's
   * (generic REST or GraphQL body).
   */
  formatError?: (error: GatewayError) => Response;
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
