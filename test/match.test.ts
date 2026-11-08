import { describe, expect, it } from "vitest";
import { createMatcher } from "../src/core/match.js";
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

  it("prefers literal route over template", () => {
    expect(
      match("POST", "/gmail/v1/users/me/messages/send", q()),
    ).toMatchObject({ ok: true, op: { action: "gmail.users.messages.send" } });
    expect(
      match("GET", "/gmail/v1/users/me/messages/abc123", q()),
    ).toMatchObject({
      ok: true,
      op: { action: "gmail.users.messages.get" },
      params: { id: "abc123" },
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
