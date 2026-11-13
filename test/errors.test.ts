import { describe, expect, it, onTestFinished } from "vitest";
import {
  createGateway,
  createProvider,
  createSessions,
  staticToken,
  type GatewayError,
  type ProviderRequest,
} from "../src/index.js";
import type { OperationTable } from "../src/core/types.js";
import { fakeUpstream } from "./fixtures/fake-upstream.js";

const table: OperationTable = {
  provider: "acme",
  source: { kind: "openapi", title: "acme", version: "1" },
  globalQueryParams: [],
  operations: [
    {
      action: "acme.items.delete",
      method: "DELETE",
      path: "/items",
      variant: "standard",
      params: [],
      hasBody: false,
    },
  ],
};

async function setup(formatError?: (e: GatewayError) => Response) {
  const sessions = createSessions({ signingKey: "x".repeat(32) });
  const up = await fakeUpstream();
  onTestFinished(up.close);
  const gateway = createGateway({
    providers: [
      createProvider<ProviderRequest<"acme", "acme.items.delete">>({
        id: "acme",
        upstream: up.url,
        table,
        credentials: staticToken({ token: "acme-secret" }),
        ...(formatError ? { formatError } : {}),
      }),
    ],
    policy: [{ when: () => false, reason: "No deleting." }],
    sessions,
  });
  const { token } = await sessions.mint({
    provider: "acme",
    agent: "x",
    onBehalfOf: "u",
  });
  const call = (path = "/items", t = token) =>
    gateway.fetch(
      new Request(`http://gw${path}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${t}` },
      }),
    );
  return { call, up };
}

describe("error format", () => {
  it("provider without formatError: generic REST body, prefixed message", async () => {
    const { call, up } = await setup();
    const res = await call();
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: {
        code: "policy_denied",
        message: "Error for waterlock proxy: No deleting.",
        action: "acme.items.delete",
      },
    });
    expect(up.seen).toHaveLength(0);
  });

  it("provider formatError writes every error after the token is verified", async () => {
    const seen: GatewayError[] = [];
    const { call } = await setup((e) => {
      seen.push(e);
      return Response.json({ fault: e.message }, { status: e.status });
    });
    const denied = await call();
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({
      fault: "Error for waterlock proxy: No deleting.",
    });
    const unmatched = await call("/nope");
    expect(unmatched.status).toBe(404);
    expect(seen.map((e) => e.code)).toEqual(["policy_denied", "policy_denied"]);
  });

  it("before the token is verified: generic REST body", async () => {
    const { call } = await setup(() => new Response("custom", { status: 418 }));
    const res = await call("/items", "not-a-token");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      error: {
        code: "unauthenticated",
        message: "Error for waterlock proxy: missing or invalid session token",
      },
    });
  });
});
