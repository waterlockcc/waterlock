/** `*` = one dotted segment, `**` = any number of segments. Everything else literal. */
export function globToRegExp(glob: string): RegExp {
  const body = glob
    .split(/(\*\*|\*)/)
    .map((part) => (part === "**" ? ".*" : part === "*" ? "[^.]+" : part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${body}$`);
}
