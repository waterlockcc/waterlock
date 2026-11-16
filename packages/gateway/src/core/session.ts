import type { SessionRef, SessionStore, UserMessage } from "./store.js";

/**
 * Session tokens: the only credential the harness ever holds. Format:
 * `as1.<base64url(claims)>.<base64url(hmac-sha256)>`. HMAC via WebCrypto
 * (constant-time verify). Base64 via Buffer: Node/Bun/Deno, Workers need
 * nodejs_compat.
 */
export interface SessionClaims {
  sid: string;
  /**
   * Provider id this token is for. The gateway routes by it, so paths may
   * collide across providers.
   */
  provider: string;
  agent: string;
  onBehalfOf: string;
  /**
   * Task the session was minted for. Set by the trusted launcher, not the
   * agent.
   */
  intent?: string;
  iat: number;
  exp: number;
}

export interface MintInput {
  /** Provider id this token is for, e.g. `gmail`. One token per provider. */
  provider: string;
  /**
   * Reuse an existing session id, e.g. to issue a second provider's token for
   * the same session so both share one store entry (user messages). Default: a
   * new id.
   */
  sid?: string;
  agent: string;
  onBehalfOf: string;
  intent?: string;
  ttlSeconds?: number;
}

/** Why a token was rejected. May gain members later (e.g. "revoked"). */
export type VerifyError = "malformed" | "bad_signature" | "expired";

export interface Sessions {
  mint(input: MintInput): Promise<{ token: string; claims: SessionClaims }>;
  verify(input: {
    token: string;
  }): Promise<{ claims: SessionClaims } | { error: VerifyError }>;
  /** The configured store, if any. */
  readonly store: SessionStore | undefined;
  /**
   * Trusted code only: record what the human said. Throws if the store can't
   * hold messages.
   */
  addUserMessage(input: {
    session: SessionRef;
    message: UserMessage;
  }): Promise<void>;
}

const PREFIX = "as1";
const enc = new TextEncoder();

export function createSessions(opts: {
  signingKey: string | Uint8Array;
  defaultTtlSeconds?: number;
  now?: () => number;
  /**
   * Optional storage: `memoryStore()`, your own adapter, or omit for stateless
   * tokens.
   */
  store?: SessionStore;
}): Sessions {
  const keyBytes =
    typeof opts.signingKey === "string"
      ? enc.encode(opts.signingKey)
      : opts.signingKey;
  if (keyBytes.length < 32)
    throw new Error("session signingKey must be at least 32 bytes");
  const now = opts.now ?? (() => Date.now());
  const defaultTtl = opts.defaultTtlSeconds ?? 900;
  const key = crypto.subtle.importKey(
    "raw",
    keyBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  return {
    store: opts.store,

    async addUserMessage(input) {
      if (!opts.store?.addUserMessage)
        throw new Error("session store does not support addUserMessage");
      await opts.store.addUserMessage(input);
    },

    async mint(input) {
      const iat = Math.floor(now() / 1000);
      const claims: SessionClaims = {
        sid: input.sid ?? crypto.randomUUID(),
        provider: input.provider,
        agent: input.agent,
        onBehalfOf: input.onBehalfOf,
        ...(input.intent ? { intent: input.intent } : {}),
        iat,
        exp: iat + (input.ttlSeconds ?? defaultTtl),
      };
      const payload = `${PREFIX}.${b64url(enc.encode(JSON.stringify(claims)))}`;
      const sig = new Uint8Array(
        await crypto.subtle.sign("HMAC", await key, enc.encode(payload)),
      );
      return { token: `${payload}.${b64url(sig)}`, claims };
    },

    async verify({ token }) {
      const parts = token.split(".");
      if (parts.length !== 3 || parts[0] !== PREFIX)
        return { error: "malformed" };
      let sig: Uint8Array;
      let claims: SessionClaims;
      try {
        sig = fromB64url(parts[2]!);
        const ok = await crypto.subtle.verify(
          "HMAC",
          await key,
          sig as BufferSource,
          enc.encode(`${parts[0]}.${parts[1]}`),
        );
        if (!ok) return { error: "bad_signature" };
        claims = JSON.parse(
          new TextDecoder().decode(fromB64url(parts[1]!)),
        ) as SessionClaims;
      } catch {
        return { error: "malformed" };
      }
      if (typeof claims.exp !== "number" || typeof claims.provider !== "string")
        return { error: "malformed" };
      if (claims.exp * 1000 <= now()) return { error: "expired" };
      return { claims };
    },
  };
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function fromB64url(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error("bad base64url");
  return new Uint8Array(Buffer.from(s, "base64url"));
}
