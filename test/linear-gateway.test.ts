import type { AddressInfo } from "node:net";
import { serve, type ServerType } from "@hono/node-server";
import { LinearClient } from "@linear/sdk";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeUpstream, type SeenRequest } from "./fixtures/fake-upstream.js";
import { createGateway, createSessions, staticToken } from "../src/index.js";
import { linear } from "../src/providers/linear/index.js";

const REAL_TOKEN = "lin_oauth_REAL-LINEAR-TOKEN";
const TEAM = "team-agents";
const sessions = createSessions({
  signingKey: "test-signing-key-0123456789abcdef", // gitleaks:allow
});
let up: Awaited<ReturnType<typeof fakeUpstream>>;
let upstream: SeenRequest[];
const servers: ServerType[] = [];

async function gatewayUrl(
  provider: ReturnType<typeof linear>,
): Promise<string> {
  const gw = createGateway({
    providers: [provider],
    policy: [
      {
        when: (r) =>
          r.action === "linear.query.issue" ||
          r.action === "linear.query.viewer",
      },
      {
        when: (r) =>
          r.action === "linear.mutation.issueCreate" &&
          r.params.input.teamId === TEAM,
        reason: "Issues only in the agents team.",
      },
    ],
    sessions,
  });
  const server = await new Promise<ServerType>((resolve) => {
    const s = serve({ fetch: gw.fetch, port: 0, hostname: "127.0.0.1" }, () =>
      resolve(s),
    );
  });
  servers.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

let base: string;
beforeAll(async () => {
  up = await fakeUpstream(({ body }) => {
    const { query } = JSON.parse(body) as { query: string };
    if (query.includes("issueCreate"))
      return Response.json({
        data: {
          issueCreate: { success: true, lastSyncId: 1, issue: { id: "I1" } },
        },
      });
    return Response.json({ data: { issue: { id: "I1", title: "Hello" } } });
  });
  upstream = up.seen;
  base = await gatewayUrl(
    linear({
      credentials: staticToken({ token: REAL_TOKEN }),
      upstream: up.url,
    }),
  );
});
afterAll(async () => {
  for (const s of servers) s.close();
  await up.close();
});
beforeEach(() => {
  upstream.length = 0;
});

/**
 * The harness side: stock Linear SDK. Only `apiUrl` and the token differ from
 * normal use.
 */
async function client(url = base) {
  const { token } = await sessions.mint({
    provider: "linear",
    agent: "triage",
    onBehalfOf: "user_123",
  });
  return {
    api: new LinearClient({ accessToken: token, apiUrl: `${url}/graphql` }),
    token,
  };
}

describe("gateway with the stock Linear SDK", () => {
  it("allowed mutation: real token injected, re-printed document forwarded", async () => {
    const { api, token } = await client();
    const res = await api.createIssue({
      teamId: TEAM,
      title: "From the agent",
    });

    expect(res.success).toBe(true);
    expect(upstream).toHaveLength(1);
    const seen = upstream[0]!;
    expect(seen).toMatchObject({ method: "POST", path: "/graphql" });
    expect(seen.headers.authorization).toBe(`Bearer ${REAL_TOKEN}`);
    expect(seen.headers["content-type"]).toBe("application/json");
    expect(JSON.stringify(seen)).not.toContain(token);
    const body = JSON.parse(seen.body) as { query: string; variables: unknown };
    expect(body.variables).toEqual({
      input: { teamId: TEAM, title: "From the agent" },
    });
    expect(body.query).toMatch(
      /^mutation createIssue\(\$input: IssueCreateInput!\) \{\n  issueCreate\(input: \$input\)/,
    );
  });

  it("denied mutation: GraphQL-shaped error the SDK surfaces, nothing forwarded", async () => {
    const { api } = await client();
    const err = (await api
      .createIssue({ teamId: "team-finance", title: "x" })
      .catch((e: unknown) => e)) as Error & { status?: number };
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(403);
    expect(err.message).toContain("Issues only in the agents team.");
    expect(upstream).toHaveLength(0);
  });

  it("reads under an allowed query are not limited", async () => {
    const { api } = await client();
    const res = await api.client.rawRequest(
      `query { issue(id: "I1") { id title team { members { nodes { email } } } } }`,
    );
    expect(res.status).toBe(200);
    expect(upstream).toHaveLength(1);
  });

  it("unlisted action is default-denied", async () => {
    const { api } = await client();
    const err = (await api
      .deleteIssue("I1")
      .catch((e: unknown) => e)) as Error & { status?: number };
    expect(err.status).toBe(403);
    expect(upstream).toHaveLength(0);
  });

  it("only POST application/json to the GraphQL endpoint; other paths 404", async () => {
    const { token } = await client();
    const auth = { authorization: `Bearer ${token}` };
    const errors = async (res: Response) => ({
      status: res.status,
      message: ((await res.json()) as { errors: { message: string }[] })
        .errors[0]!.message,
    });

    expect(
      await errors(
        await fetch(`${base}/graphql?query=%7Bviewer%7Bid%7D%7D`, {
          headers: auth,
        }),
      ),
    ).toEqual({ status: 405, message: "GraphQL requests must be POST" });
    expect(
      await errors(
        await fetch(`${base}/graphql`, {
          method: "POST",
          headers: { ...auth, "content-type": "application/graphql" },
          body: "{ viewer { id } }",
        }),
      ),
    ).toEqual({
      status: 400,
      message: "content-type must be application/json",
    });
    const rest = await fetch(`${base}/v1/issues`, { headers: auth });
    expect(rest.status).toBe(404);
    expect(
      ((await rest.json()) as { error: { message: string } }).error.message,
    ).toBe("no linear operation matches path");
    expect(upstream).toHaveLength(0);
  });

  it("auth: 'apiKey' sends the personal API key without Bearer", async () => {
    const url = await gatewayUrl(
      linear({
        credentials: staticToken({ token: "lin_api_KEY" }),
        auth: "apiKey",
        upstream: up.url,
      }),
    );
    const { api } = await client(url);
    await api.client.rawRequest(`{ viewer { id } }`);
    expect(upstream[0]!.headers.authorization).toBe("lin_api_KEY");
  });
});
