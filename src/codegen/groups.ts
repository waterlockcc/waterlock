import type { CodegenConfig } from "./config.js";
import type { SpecOperation } from "./model.js";

/** `*` = one dotted segment, `**` = any number of segments. Everything else literal. */
export function globToRegExp(glob: string): RegExp {
  const body = glob
    .split(/(\*\*|\*)/)
    .map((part) => (part === "**" ? ".*" : part === "*" ? "[^.]+" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${body}$`);
}

export interface GroupAssignment {
  groups: string[];
  source: "curated" | "fallback";
}

export interface GroupResult {
  byAction: Map<string, GroupAssignment>;
  /** Globs that matched nothing — usually means the spec changed under the curation. */
  unusedPatterns: { group: string; pattern: string }[];
}

export function assignGroups(ops: SpecOperation[], config: CodegenConfig): GroupResult {
  const prefix = (g: string) => `${config.provider}:${g}`;
  const compiled = Object.entries(config.groups).flatMap(([group, patterns]) =>
    patterns.map((pattern) => ({ group, pattern, re: globToRegExp(pattern), hits: 0 })),
  );

  const byAction = new Map<string, GroupAssignment>();
  for (const op of ops) {
    const curated = new Set<string>();
    for (const c of compiled) {
      if (c.re.test(op.action)) {
        c.hits++;
        curated.add(c.group);
      }
    }
    if (curated.size > 0) {
      byAction.set(op.action, { groups: [...curated].sort().map(prefix), source: "curated" });
    } else {
      const fb = config.fallback({ action: op.action, method: op.method });
      byAction.set(op.action, { groups: [fb].flat().sort().map(prefix), source: "fallback" });
    }
  }

  return {
    byAction,
    unusedPatterns: compiled.filter((c) => c.hits === 0).map(({ group, pattern }) => ({ group, pattern })),
  };
}
