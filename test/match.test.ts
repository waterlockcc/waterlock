import { describe, expect, it } from "vitest";
import { createMatcher } from "../src/core/match.js";
import type { Operation } from "../src/core/types.js";
import { gmailTable } from "../src/providers/gmail/generated.js";

const { match } = createMatcher(gmailTable, {
  allowedGlobalQueryParams: ["alt", "fields", "prettyPrint"],
});
const q = (s = "") => new URLSearchParams(s);

describe("matcher", () => {
  it("matches and types params", () => {
    const r = match(
      "GET",
      "/gmail/v1/users/me/messages",
      q(
        "maxResults=10&labelIds=INBOX&labelIds=UNREAD&q=invoice&fields=messages",
      ),
    );
    expect(r).toMatchObject({
      ok: true,
      op: { action: "gmail.users.messages.list" },
      params: {
        userId: "me",
        maxResults: 10,
        labelIds: ["INBOX", "UNREAD"],
        q: "invoice",
      },
    });
  });

  it("prefers the most literal route; equal ones are ambiguous", () => {
    // Gmail has no same-method routes that overlap, so use a tiny table.
    const op = (action: string, path: string): Operation => ({
      action,
      method: "GET",
      path,
      variant: "standard",
      hasBody: false,
      params: [...path.matchAll(/\{([^}]+)\}/g)].map((m) => ({
        name: m[1]!,
        in: "path",
        type: "string",
        required: true,
      })),
    });
    const { match } = createMatcher(
      {
        ...gmailTable,
        operations: [
          op("t.items.get", "/items/{id}"),
          op("t.items.latest", "/items/latest"),
          op("t.a", "/x/{p}/y"),
          op("t.b", "/x/y/{p}"),
        ],
      },
      { allowedGlobalQueryParams: [] },
    );
    expect(match("GET", "/items/latest", q())).toMatchObject({
      op: { action: "t.items.latest" },
    });
    expect(match("GET", "/items/abc", q())).toMatchObject({
      op: { action: "t.items.get" },
      params: { id: "abc" },
    });
    expect(match("GET", "/x/y/y", q())).toMatchObject({
      ok: false,
      status: 400,
      reason: "ambiguous route: t.a vs t.b",
    });
  });

  it("matches upload variants as the same action", () => {
    expect(
      match("POST", "/upload/gmail/v1/users/me/messages/send", q()),
    ).toMatchObject({
      ok: true,
      op: { action: "gmail.users.messages.send", variant: "upload" },
    });
  });

  it.each([
    ["encoded slash", "GET", "/gmail/v1/users/me/messages/a%2Fb", "", 400],
    ["encoded dot", "GET", "/gmail/v1/users/me/messages/%2e%2e", "", 400],
    ["double slash", "GET", "/gmail/v1/users/me//messages", "", 400],
    ["unknown path (batch)", "POST", "/batch/gmail/v1", "", 404],
    ["wrong method", "PUT", "/gmail/v1/users/me/messages", "", 405],
    ["unknown query param", "GET", "/gmail/v1/users/me/messages", "foo=1", 400],
    [
      "credential in URL",
      "GET",
      "/gmail/v1/users/me/messages",
      "access_token=x",
      400,
    ],
    [
      "duplicated scalar param",
      "GET",
      "/gmail/v1/users/me/messages",
      "maxResults=1&maxResults=500",
      400,
    ],
    [
      "non-integer",
      "GET",
      "/gmail/v1/users/me/messages",
      "maxResults=1e3",
      400,
    ],
    [
      "bad boolean",
      "GET",
      "/gmail/v1/users/me/messages",
      "includeSpamTrash=yes",
      400,
    ],
  ])("rejects %s", (_name, method, path, query, status) => {
    expect(match(method, path, q(query))).toMatchObject({ ok: false, status });
  });
});
