import { describe, expect, it } from "vitest";
import { globToRegExp } from "../src/core/groups.js";
import { createGateway, createSessions, definePolicy, staticToken, type RequestOf } from "../src/index.js";
import { gmail } from "../src/providers/gmail/index.js";

const credentials = staticToken({ token: "t" });

describe("default Gmail groups", () => {
  const groups = gmail({ credentials }).groups!;

  it("curation beats the HTTP method", () => {
    expect(groups.delete).toContain("gmail.users.messages.batchDelete"); // POST, but destructive
    expect(groups.organize).toContain("gmail.users.messages.trash"); // POST, reversible
    expect(groups.forwarding).toContain("gmail.users.settings.updateAutoForwarding"); // PUT that routes mail out
    expect(groups.settings).toContain("gmail.users.settings.updateAutoForwarding");
    expect(groups.compose).toContain("gmail.users.drafts.delete");
    expect(groups.delete).not.toContain("gmail.users.drafts.delete");
  });
});

describe("withGroups", () => {
  it("adds custom groups, expands globs, extends existing groups, returns a new provider", () => {
    const base = gmail({ credentials });
    const mine = base.withGroups({
      risky: ["gmail.users.messages.send", "gmail.users.settings.*AutoForwarding"],
      read: ["gmail.users.settings.getVacation"],
    });
    expect(mine.groups!.risky).toEqual([
      "gmail.users.messages.send",
      "gmail.users.settings.getAutoForwarding",
      "gmail.users.settings.updateAutoForwarding",
    ]);
    expect(mine.groups!.read).toContain("gmail.users.settings.getVacation");
    expect(mine.groups!.read).toContain("gmail.users.messages.list");
    expect(base.groups!.risky).toBeUndefined(); // original untouched
  });

  it("rejects patterns that match nothing and bad names", () => {
    const base = gmail({ credentials });
    expect(() => base.withGroups({ x: ["gmail.users.nothing.*"] })).toThrow(/matches no action/);
    expect(() => base.withGroups({ "a b": ["gmail.users.messages.send"] })).toThrow(/invalid group name/);
  });

  it("custom groups reach rules as r.in(...)", async () => {
    const sessions = createSessions({ signingKey: "x".repeat(32) });
    const provider = gmail({ credentials }).withGroups({ risky: ["gmail.users.messages.send"] });
    const gateway = createGateway({
      providers: [provider],
      policy: [{ rule: (r) => !r.in("gmail:risky") }],
      sessions,
      upstreamFetch: async () => Response.json({}),
    });
    const { token } = await sessions.mint({ agent: "a", onBehalfOf: "u" });
    const call = (path: string, init: RequestInit = {}) =>
      gateway.fetch(new Request(`http://gw${path}`, { ...init, headers: { authorization: `Bearer ${token}`, ...init.headers } }));

    expect((await call("/gmail/v1/users/me/messages")).status).toBe(200);
    const raw = Buffer.from("To: u\r\n\r\nhi").toString("base64url");
    const send = await call("/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ raw }),
    });
    expect(send.status).toBe(403);
  });
});

describe("globToRegExp", () => {
  it("* is one segment, ** is many", () => {
    expect(globToRegExp("gmail.users.*.trash").test("gmail.users.messages.trash")).toBe(true);
    expect(globToRegExp("gmail.users.*.trash").test("gmail.users.a.b.trash")).toBe(false);
    expect(globToRegExp("gmail.users.settings.**").test("gmail.users.settings.cse.keypairs.get")).toBe(true);
    expect(globToRegExp("gmail.users.settings.*AutoForwarding").test("gmail.users.settings.updateAutoForwarding")).toBe(true);
  });
});

// Compile-time checks: these must fail typecheck.
function _types() {
  const provider = gmail({ credentials }).withGroups({ risky: ["gmail.users.messages.send"] });
  type Req = RequestOf<[typeof provider]>;
  definePolicy<Req>([
    { rule: (r) => r.in("gmail:risky") || r.in("gmail:read") }, // custom + default groups autocomplete
    // @ts-expect-error unknown group
    { rule: (r) => r.in("gmail:riskyy") },
  ]);
  // @ts-expect-error typo in action name
  gmail({ credentials }).withGroups({ bad: ["gmail.users.mesages.send"] });
}
