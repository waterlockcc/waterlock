import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { auth, gmail } from "@googleapis/gmail";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeUpstream, type SeenRequest } from "./fixtures/fake-upstream.js";
import { policy } from "./fixtures/gmail-policy.js";
import { createGateway, createSessions, staticToken } from "../src/index.js";
import { gmail as gmailProvider } from "../src/providers/gmail/index.js";

const REAL_TOKEN = "ya29.REAL-GOOGLE-TOKEN";
const sessions = createSessions({ signingKey: "test-signing-key-0123456789abcdef" });
let up: Awaited<ReturnType<typeof fakeUpstream>>;
let upstream: SeenRequest[];
let server: ServerType;
let base: string;

beforeAll(async () => {
  up = await fakeUpstream(({ path }) => Response.json(path.split("?")[0]!.endsWith("/send") ? { id: "sent-1" } : { messages: [{ id: "m1", threadId: "t1" }] }));
  upstream = up.seen;
  const gw = createGateway({
    providers: [gmailProvider({ credentials: staticToken({ token: REAL_TOKEN }), upstream: up.url })],
    policy,
    sessions,
  });
  await new Promise<void>((resolve) => {
    server = serve({ fetch: gw.fetch, port: 0, hostname: "127.0.0.1" }, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await up.close();
});
beforeEach(() => {
  upstream.length = 0;
});

/** The harness side: stock googleapis client. Only `auth` and `rootUrl` differ from normal use. */
async function client(agent = "inbox-assistant") {
  const { token } = await sessions.mint({ provider: "gmail", agent, onBehalfOf: "user_123" });
  const oauth = new auth.OAuth2();
  oauth.setCredentials({ access_token: token });
  return { api: gmail({ version: "v1", auth: oauth, rootUrl: `${base}/` }), token };
}

const raw = (headers: string) => Buffer.from(`${headers}\r\nSubject: hi\r\n\r\nbody`).toString("base64url");

async function denied(p: Promise<unknown>): Promise<{ status: number; code: string; message: string; rules?: string[] }> {
  try {
    await p;
  } catch (err) {
    const res = (err as { response?: { status: number; data: { error: { code: string; message: string; rules?: string[] } } } }).response;
    if (res) return { status: res.status, ...res.data.error };
    throw err;
  }
  throw new Error("expected request to be denied");
}

describe("gateway with real googleapis client", () => {
  it("allowed read: real token injected, session token never forwarded", async () => {
    const { api, token } = await client();
    const res = await api.users.messages.list({ userId: "me", maxResults: 10, q: "invoice" });

    expect(res.status).toBe(200);
    expect(res.data.messages?.[0]?.id).toBe("m1");
    expect(upstream).toHaveLength(1);
    expect(upstream[0]!.path).toBe("/gmail/v1/users/me/messages?maxResults=10&q=invoice");
    expect(upstream[0]!.headers.authorization).toBe(`Bearer ${REAL_TOKEN}`);
    expect(JSON.stringify(upstream[0]!.headers)).not.toContain(token);
  });

  it("param-level forbid: maxResults over 50", async () => {
    const { api } = await client();
    const err = await denied(api.users.messages.list({ userId: "me", maxResults: 500 }));
    expect(err).toMatchObject({ status: 403, code: "policy_denied", message: "List at most 50 messages per page." });
    expect(upstream).toHaveLength(0);
  });

  it("internal send is forwarded byte-for-byte", async () => {
    const { api } = await client();
    const message = raw("To: Alice <alice@acme.com>\r\nCc: bob@acme.com");
    const res = await api.users.messages.send({ userId: "me", requestBody: { raw: message } });

    expect(res.data.id).toBe("sent-1");
    expect(JSON.parse(upstream[0]!.body)).toEqual({ raw: message });
  });

  it("send with an external Bcc is denied", async () => {
    const { api } = await client();
    const err = await denied(
      api.users.messages.send({ userId: "me", requestBody: { raw: raw("To: alice@acme.com\r\nBcc: x@evil.com") } }),
    );
    expect(err).toMatchObject({ status: 403, code: "policy_denied", message: "Email can only go to acme.com addresses." });
    expect(upstream).toHaveLength(0);
  });

  it("forbidden group: delete", async () => {
    const { api } = await client();
    expect(await denied(api.users.messages.delete({ userId: "me", id: "m1" }))).toMatchObject({ status: 403, message: "Deleting mail is not allowed." });
  });

  it("forbidden group: auto-forwarding", async () => {
    const { api } = await client();
    const err = await denied(
      api.users.settings.updateAutoForwarding({ userId: "me", requestBody: { enabled: true, emailAddress: "x@evil.com" } }),
    );
    expect(err).toMatchObject({ status: 403, message: "Changing forwarding settings is not allowed." });
  });

  it("drafts.send is denied (recipients unknown)", async () => {
    const { api } = await client();
    const err = await denied(api.users.drafts.send({ userId: "me", requestBody: { id: "r-1" } }));
    expect(err).toMatchObject({ status: 403, code: "policy_denied", message: "Sending stored drafts is not allowed." });
  });

  it("another agent's session gets nothing", async () => {
    const { api } = await client("random-agent");
    expect(await denied(api.users.messages.list({ userId: "me", maxResults: 10 }))).toMatchObject({ status: 403 });
  });
});

describe("gateway with hostile raw requests", () => {
  const call = async (path: string, init: RequestInit & { token?: string | null } = {}) => {
    const token = init.token === undefined ? (await sessions.mint({ provider: "gmail", agent: "inbox-assistant", onBehalfOf: "u" })).token : init.token;
    const headers = new Headers(init.headers);
    if (token) headers.set("authorization", `Bearer ${token}`);
    return fetch(`${base}${path}`, { ...init, headers });
  };

  it("no token / forged token / real Google token -> 401", async () => {
    expect((await call("/gmail/v1/users/me/messages", { token: null })).status).toBe(401);
    const { token } = await sessions.mint({ provider: "gmail", agent: "inbox-assistant", onBehalfOf: "u" });
    const forged = token.slice(0, -4) + "AAAA";
    expect((await call("/gmail/v1/users/me/messages", { token: forged })).status).toBe(401);
    expect((await call("/gmail/v1/users/me/messages", { token: REAL_TOKEN })).status).toBe(401);
  });

  it("expired token -> 401", async () => {
    const past = createSessions({ signingKey: "test-signing-key-0123456789abcdef", now: () => Date.now() - 3_600_000 });
    const { token } = await past.mint({ provider: "gmail", agent: "inbox-assistant", onBehalfOf: "u", ttlSeconds: 60 });
    expect((await call("/gmail/v1/users/me/messages", { token })).status).toBe(401);
  });

  it("method override header -> 400", async () => {
    const res = await call("/gmail/v1/users/me/messages/m1/trash", {
      method: "POST",
      headers: { "x-http-method-override": "DELETE" },
    });
    expect(res.status).toBe(400);
  });

  it("upload route for send is denied (body not inspectable)", async () => {
    const res = await call("/upload/gmail/v1/users/me/messages/send?uploadType=media", {
      method: "POST",
      headers: { "content-type": "message/rfc822" },
      body: "To: x@evil.com\r\n\r\nhi",
    });
    expect(res.status).toBe(400); // uploadType not an allowed global param
    const res2 = await call("/upload/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "content-type": "message/rfc822" },
      body: "To: x@evil.com\r\n\r\nhi",
    });
    expect(res2.status).toBe(403);
    expect(((await res2.json()) as { error: { message: string } }).error.message).toMatch(/upload route/);
  });

  it("batch endpoint is unknown -> 404", async () => {
    expect((await call("/batch/gmail/v1", { method: "POST", body: "x" })).status).toBe(404);
  });

  it("cookies and credentials-in-query never reach upstream", async () => {
    const res = await call("/gmail/v1/users/me/messages?maxResults=5&key=abc", { headers: { cookie: "SID=x" } });
    expect(res.status).toBe(400);
    const ok = await call("/gmail/v1/users/me/messages?maxResults=5", { headers: { cookie: "SID=x" } });
    expect(ok.status).toBe(200);
    expect(upstream.at(-1)!.headers.cookie).toBeUndefined();
  });

  it("undecodable send body is denied", async () => {
    const res = await call("/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw: "!!!not base64!!!" }),
    });
    expect(res.status).toBe(403);
    expect(upstream).toHaveLength(0);
  });
});
