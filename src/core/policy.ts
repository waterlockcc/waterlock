import type { SessionClaims } from "./session.js";

/** What a rule sees. Providers narrow this with literal action/group/param types (autocomplete only). */
export interface ProviderRequest<
  P extends string = string,
  A extends string = string,
  G extends string = string,
  Params extends object = object,
  Ctx extends object = object,
> {
  provider: P;
  action: A;
  groups: readonly G[];
  /** Typed path + query params, parsed by the matcher. */
  params: Params;
  /** Fields extracted from the body by a provider decoder (e.g. Gmail recipients). */
  context: Ctx;
  session: SessionClaims;
}

export type AnyRequest = ProviderRequest;
export type Facts = Record<string, unknown>;

type GroupOf<R> = R extends { groups: readonly (infer G)[] } ? G : never;

export type RuleInput<R extends AnyRequest, F extends Facts> = R & {
  /** Facts computed by the gateway's `enrich` hook. Never supplied by the agent. */
  facts: F;
  in(group: GroupOf<R>): boolean;
  /**
   * Dynamic condition in plain language, e.g. "The email contains billing information".
   * The gateway evaluates it with its configured checker (e.g. an LLM) and returns the answer.
   */
  check(condition: string): boolean;
};

export interface PolicyRule<R extends AnyRequest = AnyRequest, F extends Facts = Facts> {
  /** Sync predicate. Mix static logic with `r.check("...")` for dynamic conditions. */
  rule: (r: RuleInput<R, F>) => boolean;
  /** Effect when the rule matches. Default "allow". May gain members later (e.g. "approve"). */
  action?: "allow" | "deny";
  /** Context for the calling agent when this rule decides the outcome. */
  reason?: string;
}

export interface Policy<R extends AnyRequest = AnyRequest, F extends Facts = Facts> {
  readonly rules: readonly PolicyRule<R, F>[];
}

/**
 * A policy is a list of rules. The gateway evaluates it:
 *   - any matching "deny" rule  -> deny
 *   - any matching "allow" rule -> allow
 *   - otherwise                 -> deny (default deny)
 */
export function definePolicy<R extends AnyRequest = AnyRequest, F extends Facts = Facts>(
  rules: PolicyRule<R, F>[],
): Policy<R, F> {
  return { rules: Object.freeze([...rules]) };
}
