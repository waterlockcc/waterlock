import { describe, expect, it, onTestFinished } from "vitest";
import {
  createGateway,
  createProvider,
  createSessions,
  staticToken,
  type ProviderRequest,
  type Router,
} from "../src/index.js";
import { fakeUpstream } from "./fixtures/fake-upstream.js";

/**
 * A custom router: every POST to /echo is `custom.echo`, the body is forwarded
 * as a stream without being read, and only /echo paths answer 401s.
 */
const echoRouter: Router = {
  async route({ method, url, body }) {
    if (method !== "POST" || url.pathname !== "/echo")
      return { ok: false, status: 404, reason: "only POST /echo" };
    return {
      ok: true,
      action: "custom.echo",
      params: {},
      context: {},
      body,
      forwardHeaders: ["x-echo"],
    };
  },
  formatError: (e) => new Response(e.message, { status: e.status }),
  unauthenticated: (url, e) =>
    url.pathname === "/echo"
      ? new Response(e.message, {
          status: 401,
          headers: { "www-authenticate": 'Basic realm="echo"' },
        })
      : undefined,
};

async function setup() {
  const sessions = createSessions({ signingKey: "x".repeat(32) });
  const up = await fakeUpstream(() => new Response("upstream ok"));
  onTestFinished(up.close);
  const gateway = createGateway({
    providers: [
      createProvider<ProviderRequest<"custom", "custom.echo">>({
        id: "custom",
        upstream: up.url,
        router: echoRouter,
        credentials: staticToken({ token: "real-secret" }),
      }),
    ],
    policy: [
      { when: (r) => r.session.agent === "trusted" },
      { when: (r) => r.session.agent === "blocked", action: "deny" },
    ],
    sessions,
    maxBodyBytes: 8,
  });
  const token = async (agent = "trusted") =>
    (await sessions.mint({ provider: "custom", agent, onBehalfOf: "u" })).token;
  return { gateway, up, token };
}

const basic = (user: string, pass: string) =>
  `Basic ${btoa(`${user}:${pass}`)}`;

/** A request body sent as a stream, in several chunks. */
const streamed = (...parts: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(new TextEncoder().encode(p));
      c.close();
    },
  });

const post = (
  path: string,
  headers: Record<string, string>,
  body: BodyInit = "hi",
) =>
  new Request(`http://gw${path}`, {
    method: "POST",
    headers,
    body,
    duplex: "half",
  } as RequestInit);

describe("custom router", () => {
  it("routes every request and forwards a streamed body as-is", async () => {
    const { gateway, up, token } = await setup();
    const res = await gateway.fetch(
      post(
        "/echo",
        { authorization: `Bearer ${await token()}`, "x-echo": "1" },
        // Over maxBodyBytes: the router doesn't read it, so no 413.
        streamed("first chunk, ", "second chunk"),
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("upstream ok");
    expect(up.seen).toEqual([
      expect.objectContaining({
        path: "/echo",
        body: "first chunk, second chunk",
        headers: expect.objectContaining({
          authorization: "Bearer real-secret",
          "x-echo": "1",
        }),
      }),
    ]);
  });

  it("router refusals and denies use the router's error shape", async () => {
    const { gateway, up, token } = await setup();
    const refused = await gateway.fetch(
      post("/other", { authorization: `Bearer ${await token()}` }),
    );
    expect(refused.status).toBe(404);
    expect(await refused.text()).toBe(
      "Error for waterlock proxy: only POST /echo",
    );

    const denied = await gateway.fetch(
      post(
        "/echo",
        { authorization: `Bearer ${await token("blocked")}` },
        streamed("pack ", "data"),
      ),
    );
    expect(denied.status).toBe(403);
    expect(await denied.text()).toMatch(/^Error for waterlock proxy: /);
    expect(up.seen).toHaveLength(0);
  });
});

describe("authentication", () => {
  it("accepts the session token as the Basic auth password", async () => {
    const { gateway, up, token } = await setup();
    const res = await gateway.fetch(
      post("/echo", { authorization: basic("any-user", await token()) }),
    );
    expect(res.status).toBe(200);
    expect(up.seen[0]!.headers.authorization).toBe("Bearer real-secret");
  });

  it("Basic auth with a wrong or missing password -> 401", async () => {
    const { gateway, up } = await setup();
    for (const authorization of [
      basic("user", "not-a-token"),
      `Basic ${btoa("no-colon")}`,
      "Basic !!!",
    ]) {
      const res = await gateway.fetch(post("/echo", { authorization }));
      expect(res.status).toBe(401);
    }
    expect(up.seen).toHaveLength(0);
  });

  it("401s use a router's response only for paths it recognizes", async () => {
    const { gateway } = await setup();
    const mine = await gateway.fetch(post("/echo", {}));
    expect(mine.status).toBe(401);
    expect(mine.headers.get("www-authenticate")).toBe('Basic realm="echo"');

    const other = await gateway.fetch(post("/other", {}));
    expect(other.status).toBe(401);
    expect(other.headers.get("www-authenticate")).toBeNull();
    expect(await other.json()).toEqual({
      error: {
        code: "unauthenticated",
        message: "Error for waterlock proxy: missing or invalid session token",
      },
    });
  });
});
