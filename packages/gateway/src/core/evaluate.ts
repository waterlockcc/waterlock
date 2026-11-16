import type { AnyRequest, Policy, PolicyRule } from "./policy.js";
import type { SessionStore } from "./store.js";

/**
 * Answers one natural-language `when` condition. You write it: call the AI SDK
 * (or anything) however you like. Helpers for the prompt and output schema live
 * in `@waterlock/gateway/checks`.
 */
export type Check<R extends AnyRequest = AnyRequest> = (input: {
  condition: string;
  request: R;
  /**
   * The gateway's session store (if configured). Read context from it, e.g.
   * user messages for `request.session`. `checkPrompt` does this for you.
   */
  store?: SessionStore;
  /**
   * Aborted once the decision is made elsewhere. Pass it on, e.g.
   * `generateText({ abortSignal: signal })`.
   */
  signal: AbortSignal;
}) => Promise<{ result: boolean; explanation?: string }>;

export interface CheckOptions<R extends AnyRequest = AnyRequest> {
  check?: Check<R>;
  /** Per-check timeout. Default 60s. */
  checkTimeoutMs?: number;
}

type Verdict = { result: boolean; explanation?: string };

export interface Decision {
  /** May gain members later (e.g. "approve"): treat unknown values as deny. */
  effect: "allow" | "deny";
  /** Rules that decided the outcome, as `#<index>`. */
  rules: string[];
  reason: string;
}

/**
 * 1. Function rules run (sync). Any error or non-boolean denies.
 * 2. A function deny rule matched: deny (its reason). No checks run.
 * 3. No allow rule matched: deny (allow-rule reasons as hints). No checks run.
 * 4. Policy has no natural-language rows: allow (nothing left to ask a model).
 * 5. Natural-language deny rules run in parallel. The first `true` denies and
 *    aborts the rest; all `false` allows. Errors, timeouts and malformed
 *    answers deny.
 */
export async function evaluatePolicy<R extends AnyRequest>(
  policy: Policy<R>,
  req: R,
  opts: CheckOptions<R> = {},
): Promise<Decision> {
  const rules = policy.rules.map((rule, i) => ({
    id: `#${i}`,
    rule,
    action: rule.action ?? "allow",
  }));
  const deny = (ids: string[], reason: string): Decision => ({
    effect: "deny",
    rules: ids,
    reason,
  });

  // Rules can't mutate what later rules see.
  const input = Object.freeze({ ...req });
  const matched: typeof rules = [];
  for (const r of rules) {
    if (typeof r.rule.when !== "function") continue;
    let value: unknown;
    try {
      value = r.rule.when(input);
    } catch (err) {
      return deny(
        [r.id],
        `rule ${r.id} threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (typeof value !== "boolean")
      return deny(
        [r.id],
        `rule ${r.id} returned ${describe(value)}, expected boolean`,
      );
    if (value) matched.push(r);
  }

  const staticDeny = matched.find((r) => r.action === "deny");
  if (staticDeny)
    return deny(
      [staticDeny.id],
      staticDeny.rule.reason ?? `denied by ${staticDeny.id}`,
    );

  const allowed = matched.filter((r) => r.action === "allow");
  if (!allowed.length) {
    const hints = rules
      .filter((r) => r.action === "allow" && r.rule.reason)
      .map((r) => r.rule.reason!);
    return deny([], hints.length ? hints.join(" ") : "no allow rule matched");
  }

  const dynamic = rules.filter((r) => typeof r.rule.when === "string");
  const allow: Decision = {
    effect: "allow",
    rules: allowed.map((r) => r.id),
    reason: `allowed by ${allowed.map((r) => r.id).join(", ")}`,
  };
  if (!dynamic.length) return allow;

  return runChecks(dynamic, req, opts, allow);
}

async function runChecks<R extends AnyRequest>(
  dynamic: { id: string; rule: PolicyRule<R> }[],
  request: R,
  opts: CheckOptions<R>,
  allow: Decision,
): Promise<Decision> {
  const check = opts.check;
  if (!check)
    return {
      effect: "deny",
      rules: [],
      reason:
        "policy has natural-language rules but the gateway has no check function",
    };

  const timeoutMs = opts.checkTimeoutMs ?? 60_000;
  const controller = new AbortController();
  // The same condition in two rows runs once.
  const asked = new Map<string, Promise<Verdict>>();

  const ask = (condition: string) => {
    let p = asked.get(condition);
    if (!p) {
      p = withTimeout(
        check({ condition, request, signal: controller.signal }),
        timeoutMs,
      ).then((out) => {
        const o = out as { result?: unknown; explanation?: unknown } | null;
        if (typeof o?.result !== "boolean")
          throw new Error("returned a malformed result");
        return {
          result: o.result,
          ...(typeof o.explanation === "string"
            ? { explanation: o.explanation }
            : {}),
        } as Verdict;
      });
      asked.set(condition, p);
    }
    return p;
  };

  return new Promise<Decision>((resolve) => {
    let remaining = dynamic.length;
    let settled = false;
    const settle = (d: Decision) => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve(d);
    };

    for (const { id, rule } of dynamic) {
      const condition = rule.when as string;
      ask(condition).then(
        (record) => {
          if (record.result)
            settle({
              ...allow,
              effect: "deny",
              rules: [id],
              reason: rule.reason ?? record.explanation ?? `denied by ${id}`,
            });
          else if (--remaining === 0) settle(allow);
        },
        (err: unknown) =>
          settle({
            ...allow,
            effect: "deny",
            rules: [id],
            reason: `check "${condition}" failed: ${err instanceof Error ? err.message : String(err)}`,
          }),
      );
    }
  });
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function describe(v: unknown): string {
  if (
    v instanceof Promise ||
    (typeof v === "object" && v !== null && "then" in v)
  )
    return "a Promise (rules must be sync)";
  return v === null ? "null" : typeof v;
}
