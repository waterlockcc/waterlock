import type { SessionClaims } from "./session.js";

/** What a rule sees. Providers narrow this with literal action/param types (autocomplete only). */
export interface ProviderRequest<
  P extends string = string,
  A extends string = string,
  Params extends object = object,
  Ctx extends object = object,
> {
  provider: P;
  action: A;
  /** Typed path + query params, parsed by the matcher. */
  params: Params;
  /** Fields extracted from the body by a provider decoder (e.g. Gmail recipients). */
  context: Ctx;
  session: SessionClaims;
}

export type AnyRequest = ProviderRequest;

/**
 * One policy row. `when` is either:
 *   - a sync function over the request (static), allow or deny, or
 *   - a plain-language condition answered by the gateway's `check` (e.g. an LLM). These
 *     rows can only deny: a model can narrow what's allowed, never grant it.
 */
export type PolicyRule<R extends AnyRequest = AnyRequest> =
  | {
      when: (r: R) => boolean;
      /** Effect when the rule matches. Default "allow". May gain members later (e.g. "approve"). */
      action?: "allow" | "deny";
      /** Context for the calling agent when this rule decides the outcome. */
      reason?: string;
    }
  | {
      /** e.g. "The email contains billing information" */
      when: string;
      action: "deny";
      /** Shown to the agent on deny. Default: the check's explanation. */
      reason?: string;
    };

export interface Policy<R extends AnyRequest = AnyRequest> {
  readonly rules: readonly PolicyRule<R>[];
}

/**
 * A policy is a list of rows. The gateway evaluates it:
 *   - any matching "deny" row          -> deny
 *   - no matching "allow" row          -> deny (default deny)
 *   - otherwise                        -> allow
 * Plain-language rows only run once the function rows would allow.
 */
export function definePolicy<R extends AnyRequest = AnyRequest>(
  rules: PolicyRule<R>[],
): Policy<R> {
  return { rules: Object.freeze([...rules]) };
}
