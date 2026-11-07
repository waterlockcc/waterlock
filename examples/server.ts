/**
 * Trusted side. Run as its own process — never inside the agent harness.
 *
 *   GMAIL_ACCESS_TOKEN=ya29... AS_SIGNING_KEY=$(openssl rand -hex 32) pnpm example
 *
 * Harness side then uses a stock googleapis client:
 *
 *   const oauth = new auth.OAuth2();
 *   oauth.setCredentials({ access_token: process.env.AS_SESSION });
 *   const api = gmail({ version: "v1", auth: oauth, rootUrl: "http://127.0.0.1:8787/" });
 */
import { serve } from "@hono/node-server";
import { createGateway, createSessions, staticToken } from "../src/index.js";
import { gmail } from "../src/providers/gmail/index.js";
import { policy, type Facts } from "./policy.js";

const signingKey = process.env.AS_SIGNING_KEY;
const gmailToken = process.env.GMAIL_ACCESS_TOKEN;
if (!signingKey || !gmailToken) throw new Error("set AS_SIGNING_KEY and GMAIL_ACCESS_TOKEN");

const sessions = createSessions({ signingKey });
const sends = new Map<string, number[]>();

const gw = createGateway({
  // Production: oauth2Refresh({ tokenUrl, clientId, clientSecret, refreshToken: (s) => vault.get(s.onBehalfOf) })
  providers: [gmail({ credentials: staticToken({ token: gmailToken }) })],
  policy,
  sessions,
  enrich: (req) => {
    const hourAgo = Date.now() - 3_600_000;
    const recent = (sends.get(req.session.agent) ?? []).filter((t) => t > hourAgo);
    if (req.groups.includes("gmail:send")) sends.set(req.session.agent, [...recent, Date.now()]);
    return { sendsLastHour: recent.length };
  },
  onDecision: (e) => console.log(JSON.stringify(e)),
});

const port = Number(process.env.PORT ?? 8787);
serve({ fetch: gw.fetch, port, hostname: "127.0.0.1" }, async () => {
  // The launcher would do this per agent run and pass the token into the harness env.
  const { token } = await sessions.mint({ agent: "inbox-assistant", onBehalfOf: "user_123", ttlSeconds: 1800 });
  console.log(`gateway on http://127.0.0.1:${port}`);
  console.log(`AS_SESSION=${token}`);
});
