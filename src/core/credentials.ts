import type { SessionClaims } from "./session.js";

/** Upstream credential. An object so it can gain fields (expiresAt, type, headers...) later. */
export interface Credential {
  token: string;
}

/** Returns the real upstream credential for this session. Runs only inside the gateway. */
export type CredentialSource = (input: { session: SessionClaims }) => Promise<Credential>;

export function staticToken(opts: { token: string }): CredentialSource {
  return async () => ({ token: opts.token });
}

/**
 * OAuth2 refresh-token flow. Access tokens are cached per refresh token and
 * never leave the gateway. `refreshToken` can be resolved per user.
 */
export function oauth2Refresh(opts: {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string | ((session: SessionClaims) => string | Promise<string>);
  skewSeconds?: number;
  fetch?: typeof fetch;
}): CredentialSource {
  const doFetch = opts.fetch ?? fetch;
  const skew = (opts.skewSeconds ?? 60) * 1000;
  const cache = new Map<string, { token: string; expiresAt: number }>();
  const inflight = new Map<string, Promise<string>>();

  return async ({ session }) => {
    const refreshToken =
      typeof opts.refreshToken === "string" ? opts.refreshToken : await opts.refreshToken(session);
    const hit = cache.get(refreshToken);
    if (hit && hit.expiresAt - skew > Date.now()) return { token: hit.token };

    const pending = inflight.get(refreshToken);
    if (pending) return { token: await pending };

    const p = (async () => {
      const res = await doFetch(opts.tokenUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: opts.clientId,
          client_secret: opts.clientSecret,
        }),
      });
      if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
      const body = (await res.json()) as { access_token: string; expires_in?: number };
      cache.set(refreshToken, { token: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 });
      return body.access_token;
    })().finally(() => inflight.delete(refreshToken));

    inflight.set(refreshToken, p);
    return { token: await p };
  };
}
