import type { Credential, CredentialSource } from "./credentials.js";
import type { AnyRequest } from "./policy.js";
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
  /** Type-only marker, never set at runtime. */
  readonly __request?: R;
}

/** Union of the request types of a list of providers. */
export type RequestOf<P extends readonly ProviderDefinition[]> = P[number] extends infer D
  ? D extends ProviderDefinition<infer R>
    ? R
    : never
  : never;
