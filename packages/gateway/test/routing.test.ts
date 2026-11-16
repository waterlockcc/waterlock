import { describe, expect, it, onTestFinished } from "vitest";
import {
  createGateway,
  createProvider,
  createSessions,
  restRouter,
  staticToken,
  type ProviderRequest,
} from "../src/index.js";
import type { OperationTable } from "../src/core/types.js";
import { fakeUpstream } from "./fixtures/fake-upstream.js";

/**
 * Two providers with the same route: the session token decides which one a
 * request is for.
 */
const graphql = (id: string): OperationTable => ({
  provider: id,
  source: { kind: "openapi", title: id, version: "1" },
  globalQueryParams: [],
  operations: [
    {
      action: `${id}.graphql`,
      method: "POST",
      path: "/graphql",
      variant: "standard",
      params: [],
      hasBody: true,
    },
  ],
});

const provider = (id: string, upstream = `https://${id}.example`) =>
  createProvider<ProviderRequest<string, `${string}.graphql`>>({
    id,
    upstream,
    router: restRouter({ table: graphql(id) }),
    credentials: staticToken({ token: `${id}-secret` }),
  });

async function setup() {
  const sessions = createSessions({ signingKey: "x".repeat(32) });
  const alpha = await fakeUpstream();
  const beta = await fakeUpstream();
  onTestFinished(alpha.close);
  onTestFinished(beta.close);
  const gateway = createGateway({
    providers: [provider("alpha", alpha.url), provider("beta", beta.url)],
    policy: [
      {
        when: (r) =>
          r.action !== "beta.graphql" || r.session.agent === "trusted",
      },
    ],
    sessions,
  });
  const call = (token: string) =>
    gateway.fetch(
      new Request("http://gw/graphql", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        body: "{}",
      }),
    );
  return { sessions, alpha, beta, call };
}

describe("routing by token", () => {
  it("same path goes to the provider named in the token", async () => {
    const { sessions, alpha, beta, call } = await setup();
    const a = await sessions.mint({
      provider: "alpha",
      agent: "x",
      onBehalfOf: "u",
    });
    const b = await sessions.mint({
      provider: "beta",
      agent: "trusted",
      onBehalfOf: "u",
    });

    expect((await call(a.token)).status).toBe(200);
    expect((await call(b.token)).status).toBe(200);
    expect(alpha.seen.map((s) => [s.path, s.headers.authorization])).toEqual([
      ["/graphql", "Bearer alpha-secret"],
    ]);
    expect(beta.seen.map((s) => [s.path, s.headers.authorization])).toEqual([
      ["/graphql", "Bearer beta-secret"],
    ]);
  });

  it("policy sees the token's provider", async () => {
    const { sessions, beta, call } = await setup();
    const b = await sessions.mint({
      provider: "beta",
      agent: "x",
      onBehalfOf: "u",
    });
    expect((await call(b.token)).status).toBe(403);
    expect(beta.seen).toHaveLength(0);
  });

  it("token for a provider this gateway doesn't have -> 403", async () => {
    const { sessions, call } = await setup();
    const { token } = await sessions.mint({
      provider: "gamma",
      agent: "x",
      onBehalfOf: "u",
    });
    const res = await call(token);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "unknown_provider",
    );
  });

  it("tokens for several providers can share one session id", async () => {
    const sessions = createSessions({ signingKey: "x".repeat(32) });
    const a = await sessions.mint({
      provider: "alpha",
      agent: "x",
      onBehalfOf: "u",
    });
    const b = await sessions.mint({
      provider: "beta",
      agent: "x",
      onBehalfOf: "u",
      sid: a.claims.sid,
    });
    expect(b.claims.sid).toBe(a.claims.sid);
    expect(b.token).not.toBe(a.token);
  });

  it("duplicate provider ids fail at startup", () => {
    const sessions = createSessions({ signingKey: "x".repeat(32) });
    expect(() =>
      createGateway({
        providers: [provider("alpha"), provider("alpha")],
        policy: [],
        sessions,
      }),
    ).toThrow(/configured twice/);
  });
});
