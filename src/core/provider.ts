import type { Credential, CredentialSource } from "./credentials.js";
import { globToRegExp } from "./groups.js";
import type { AnyRequest, ProviderRequest } from "./policy.js";
import type { OperationTable } from "./types.js";

/**
 * Extracts policy-relevant fields from a request body. Throwing denies the
 * request: if the gateway can't read what a call does, it doesn't forward it.
 */
export type Decoder = (input: { body: Uint8Array; contentType: string | null }) => object;

/** `R` is the request type rules see for this provider. Type-only: drives policy autocomplete and checks. */
export interface ProviderDefinition<R extends AnyRequest = AnyRequest> {
  // New fields must be optional with a default: custom providers implement this interface.
  id: string;
  /** Fixed upstream origin. The harness can never choose the host. */
  upstream: string;
  table: OperationTable;
  /** Spec-level query params (e.g. Google's `fields`, `alt`) allowed on every call. Anything else unlisted is denied. */
  allowedGlobalQueryParams: readonly string[];
  /** Per-action body decoders. Only run on the standard route; upload variants of decoded actions are denied. */
  decoders?: Partial<Record<string, Decoder>>;
  credentials: CredentialSource;
  /** Default: `Authorization: Bearer <token>`. */
  inject?: (input: { headers: Headers; credential: Credential }) => void;
  /** Group name (without provider prefix) -> action names. Set via `withGroups`, not by hand. */
  groups?: Readonly<Record<string, readonly string[]>>;
  /** Type-only marker, never set at runtime. */
  readonly __request?: R;
}

/** An action name, or a glob over action names (`*` one segment, `**` any number). */
export type GroupPattern<R extends AnyRequest> = R["action"] | `${string}*${string}`;

/** Group name -> actions or globs. Values are arrays so they can widen to objects later. */
export type GroupSpec<R extends AnyRequest> = Record<string, readonly GroupPattern<R>[]>;

/** R with extra group names added to every action's `groups`. */
export type AddGroups<R extends AnyRequest, G extends string> =
  R extends ProviderRequest<infer P, infer A, infer Old, infer Params extends object, infer Ctx extends object>
    ? ProviderRequest<P, A, Old | G, Params, Ctx>
    : never;

/** A provider definition you can extend with groups. */
export interface Provider<R extends AnyRequest = AnyRequest> extends ProviderDefinition<R> {
  /**
   * Returns a new provider with these groups added (names are prefixed with the provider
   * id: `gmail:risky`). Usable in rules via `r.in("gmail:risky")`. Adding to an existing
   * group extends it. A pattern that matches no action throws.
   */
  withGroups<const M extends GroupSpec<R>>(groups: M): Provider<AddGroups<R, `${R["provider"]}:${keyof M & string}`>>;
}

/** Wraps a provider definition so it gets `withGroups`. Use it for custom providers too. */
export function createProvider<R extends AnyRequest>(def: ProviderDefinition<R>): Provider<R> {
  return {
    ...def,
    withGroups(spec) {
      const actions = [...new Set(def.table.operations.map((o) => o.action))];
      const groups: Record<string, string[]> = {};
      for (const [name, list] of Object.entries(def.groups ?? {})) groups[name] = [...list];
      for (const [name, patterns] of Object.entries(spec as GroupSpec<AnyRequest>)) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(name)) throw new Error(`${def.id}.withGroups: invalid group name "${name}"`);
        const members = new Set(groups[name]);
        for (const pattern of patterns) {
          const re = pattern.includes("*") ? globToRegExp(pattern) : null;
          const hits = re ? actions.filter((a) => re.test(a)) : actions.filter((a) => a === pattern);
          if (!hits.length) throw new Error(`${def.id}.withGroups: "${name}" pattern "${pattern}" matches no action`);
          for (const h of hits) members.add(h);
        }
        groups[name] = [...members].sort();
      }
      return createProvider({ ...def, groups }) as never;
    },
  };
}

/** Union of the request types of a list of providers. */
export type RequestOf<P extends readonly ProviderDefinition[]> = P[number] extends infer D
  ? D extends ProviderDefinition<infer R>
    ? R
    : never
  : never;
