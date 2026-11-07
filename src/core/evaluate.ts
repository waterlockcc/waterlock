import type { AnyRequest, Policy, PolicyRule, RuleInput } from "./policy.js";
import type { SessionStore } from "./store.js";

/**
 * Answers one `r.check("...")` condition. You write it: call the AI SDK (or anything)
 * however you like. Helpers for the prompt and output schema live in `@waterlock/gateway/checks`.
 */
export type Check<R extends AnyRequest = AnyRequest> = (input: {
  condition: string;
  request: R;
  /**
   * The gateway's session store (if configured). Read context from it, e.g. user messages
   * for `request.session`. `checkPrompt` does this for you.
   */
  store?: SessionStore;
}) => Promise<{ result: boolean; explanation?: string }>;

export interface CheckOptions<R extends AnyRequest = AnyRequest> {
  check?: Check<R>;
  /** Per-check timeout. Default 60s. */
  checkTimeoutMs?: number;
}

export interface CheckRecord {
  condition: string;
  result: boolean;
  explanation?: string;
}

export interface Decision {
  /** May gain members later (e.g. "approve"): treat unknown values as deny. */
  effect: "allow" | "deny";
  /** Rules that decided the outcome, as `#<index>`. */
  rules: string[];
  reason: string;
  /** Dynamic checks that ran, for audit. */
  checks: CheckRecord[];
}

/** Thrown by `r.check()` when the answer isn't known yet. The rule is re-run once it is. */
class PendingCheck {
  constructor(readonly condition: string) {}
}

type RunResult = { value: boolean; used: string[] } | { pending: string } | { error: string };

const MAX_ROUNDS = 8;

/**
 * Rules are sync and pure, so `r.check()` suspends: the first unanswered check in a
 * rule throws PendingCheck, the engine resolves all pending checks in parallel, then
 * re-runs. Static guards (`r.action === ... && r.check(...)`) short-circuit, so checks
 * only run where they can change the outcome. Any error, timeout or malformed result denies.
 */
export async function evaluatePolicy<R extends AnyRequest>(
  policy: Policy<R>,
  req: R,
  opts: CheckOptions<R> = {},
): Promise<Decision> {
  const answers = new Map<string, CheckRecord>();
  const deny = (rules: string[], reason: string): Decision => ({ effect: "deny", rules, reason, checks: [...answers.values()] });
  const rules = policy.rules.map((rule, i) => ({ id: `#${i}`, rule, action: rule.action ?? "allow" }));

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const results = rules.map((r) => ({ ...r, result: run(r.rule, req, answers) }));

    const failed = results.find((r) => "error" in r.result);
    if (failed) return deny([failed.id], `rule ${failed.id} ${(failed.result as { error: string }).error}`);

    const matched = (action: string) => results.filter((r) => r.action === action && "value" in r.result && r.result.value);
    const pending = (action: string) => results.filter((r) => r.action === action && "pending" in r.result);

    const denied = matched("deny");
    if (denied.length) {
      return deny(
        denied.map((r) => r.id),
        reasonFor(denied, answers) ?? `denied by ${denied.map((r) => r.id).join(", ")}`,
      );
    }

    const allowed = matched("allow");
    const pendingAllow = pending("allow");
    const pendingDeny = pending("deny");

    // Nothing can allow: deny without spending checks on deny rules.
    if (!allowed.length && !pendingAllow.length) {
      const hints = rules.filter((r) => r.action === "allow" && r.rule.reason).map((r) => r.rule.reason!);
      return deny([], hints.length ? hints.join(" ") : "no allow rule matched");
    }
    if (allowed.length && !pendingDeny.length) {
      return { effect: "allow", rules: allowed.map((r) => r.id), reason: `allowed by ${allowed.map((r) => r.id).join(", ")}`, checks: [...answers.values()] };
    }

    // Resolve only checks that can still change the outcome.
    const needed = [...pendingDeny, ...(allowed.length ? [] : pendingAllow)];
    const conditions = [...new Set(needed.map((r) => (r.result as { pending: string }).pending))];
    const err = await resolve(conditions, req, answers, opts);
    if (err) return deny([], err);
  }
  return deny([], `policy needed more than ${MAX_ROUNDS} rounds of checks`);
}

function run<R extends AnyRequest>(rule: PolicyRule<R>, req: R, answers: Map<string, CheckRecord>): RunResult {
  const used: string[] = [];
  const groups = new Set<string>(req.groups);
  const input = Object.freeze({
    ...req,
    in: (g: string) => groups.has(g),
    check: (condition: string) => {
      const answer = answers.get(condition);
      if (!answer) throw new PendingCheck(condition);
      used.push(condition);
      return answer.result;
    },
  }) as unknown as RuleInput<R>;

  let value: unknown;
  try {
    value = rule.rule(input);
  } catch (err) {
    if (err instanceof PendingCheck) return { pending: err.condition };
    return { error: `threw: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (typeof value !== "boolean") return { error: `returned ${describe(value)}, expected boolean` };
  return { value, used };
}

async function resolve<R extends AnyRequest>(
  conditions: string[],
  request: R,
  answers: Map<string, CheckRecord>,
  opts: CheckOptions<R>,
): Promise<string | null> {
  const check = opts.check;
  if (!check) return `rule uses r.check() but the gateway has no check function configured`;
  const timeoutMs = opts.checkTimeoutMs ?? 60_000;
  const results = await Promise.all(
    conditions.map(async (condition) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
        });
        const out: unknown = await Promise.race([check({ condition, request }), timeout]);
        const o = out as { result?: unknown; explanation?: unknown } | null;
        if (typeof o?.result !== "boolean") return `check "${condition}" returned a malformed result`;
        answers.set(condition, {
          condition,
          result: o.result,
          ...(typeof o.explanation === "string" ? { explanation: o.explanation } : {}),
        });
        return null;
      } catch (err) {
        return `check "${condition}" failed: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  return results.find((r) => r !== null) ?? null;
}

/** Rule's own reason, else explanations from the checks it used. */
function reasonFor(
  decided: { rule: { reason?: string | undefined }; result: RunResult }[],
  answers: Map<string, CheckRecord>,
): string | undefined {
  const reasons = decided.flatMap((d) => {
    if (d.rule.reason) return [d.rule.reason];
    const used = "used" in d.result ? d.result.used : [];
    return used.flatMap((c) => (answers.get(c)?.explanation ? [answers.get(c)!.explanation!] : []));
  });
  return reasons.length ? reasons.join(" ") : undefined;
}

function describe(v: unknown): string {
  if (v instanceof Promise || (typeof v === "object" && v !== null && "then" in v)) return "a Promise (rules must be sync)";
  return v === null ? "null" : typeof v;
}
