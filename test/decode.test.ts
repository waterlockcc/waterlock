import { describe, expect, it } from "vitest";
import { decodeDraftSend, decodeMessageSend, parseAddressList } from "../src/providers/gmail/decode.js";

const send = (mime: string) =>
  decodeMessageSend(new TextEncoder().encode(JSON.stringify({ raw: Buffer.from(mime).toString("base64url") })));

describe("gmail decoder", () => {
  it("collects To, Cc, Bcc including repeated and folded headers", () => {
    const ctx = send(
      [
        "From: me@acme.com",
        "To: Alice <alice@acme.com>, bob@acme.com",
        "Cc: ops@acme.com,",
        "  later@partner.io",
        "To: second-to@acme.com",
        "Bcc: hidden@evil.com",
        "Subject: Q3 numbers",
        "",
        "body To: notaheader@evil.com",
      ].join("\r\n"),
    );
    expect(ctx.recipients).toEqual([
      "alice@acme.com",
      "bob@acme.com",
      "second-to@acme.com",
      "ops@acme.com",
      "later@partner.io",
      "hidden@evil.com",
    ]);
    expect(ctx.recipient_domains).toEqual(["acme.com", "partner.io", "evil.com"]);
    expect(ctx.subject).toBe("Q3 numbers");
  });

  it("is not fooled by display names that look like addresses", () => {
    expect(parseAddressList(`"ceo@acme.com, cfo@acme.com" <attacker@evil.com>`)).toEqual(["attacker@evil.com"]);
    expect(parseAddressList(`attacker@evil.com (CEO ceo@acme.com)`)).toEqual(["attacker@evil.com"]);
  });

  it("handles group syntax", () => {
    expect(parseAddressList("Team: a@acme.com, b@acme.com;, c@acme.com")).toEqual(["a@acme.com", "b@acme.com", "c@acme.com"]);
  });

  it.each([
    [`<"a@b"@evil.com>`],
    [`a@acme.com <b@evil.com> <c@evil.com>`],
    [`"unterminated <x@acme.com>`],
    [`not-an-address`],
  ])("fails closed on %s", (v) => {
    expect(() => parseAddressList(v)).toThrow();
  });

  it("rejects missing raw", () => {
    expect(() => decodeMessageSend(new TextEncoder().encode("{}"))).toThrow(/missing raw/);
  });

  it("drafts.send has unknown recipients", () => {
    expect(decodeDraftSend(new TextEncoder().encode(`{"id":"r-123"}`))).toMatchObject({ recipients: null, draft_id: "r-123" });
  });
});
