import { describe, expect, it } from "vitest";
import {
  decodeDraftSend,
  decodeMessageSend,
} from "../src/providers/gmail/decode.js";

const send = (mime: string) =>
  decodeMessageSend(
    new TextEncoder().encode(
      JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }),
    ),
  );
const to = (value: string) =>
  send(`To: ${value}\r\n\r\nx`).then((c) => c.recipients);

describe("gmail decoder", () => {
  it("collects To, Cc, Bcc including repeated and folded headers", async () => {
    const ctx = await send(
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
    expect(ctx.recipients.sort()).toEqual(
      [
        "alice@acme.com",
        "bob@acme.com",
        "second-to@acme.com",
        "ops@acme.com",
        "later@partner.io",
        "hidden@evil.com",
      ].sort(),
    );
    expect(ctx.recipient_domains.sort()).toEqual([
      "acme.com",
      "evil.com",
      "partner.io",
    ]);
    expect(ctx.subject).toBe("Q3 numbers");
  });

  it("is not fooled by quoted display names or comments that look like addresses", async () => {
    expect(
      await to(`"ceo@acme.com, cfo@acme.com" <attacker@evil.com>`),
    ).toEqual(["attacker@evil.com"]);
    expect(await to(`attacker@evil.com (CEO ceo@acme.com)`)).toEqual([
      "attacker@evil.com",
    ]);
  });

  it("handles group syntax", async () => {
    expect(await to("Team: a@acme.com, b@acme.com;, c@acme.com")).toEqual([
      "a@acme.com",
      "b@acme.com",
      "c@acme.com",
    ]);
  });

  it.each([
    [`<"a@b"@evil.com>`],
    [`a@acme.com <b@evil.com> <c@evil.com>`],
    [`"unterminated <x@acme.com>`],
    [`not-an-address`],
  ])("fails closed on %s", async (v) => {
    await expect(to(v)).rejects.toThrow();
  });

  it("passes text and html through as sent; missing parts are null", async () => {
    const html = await send(
      "To: a@acme.com\r\nContent-Type: text/html\r\n\r\n<p>card <b>4242</b></p>",
    );
    expect(html).toMatchObject({
      text: null,
      html: "<p>card <b>4242</b></p>\n",
    });
    const qp = await send(
      "To: a@acme.com\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nupdate bil=\r\nling",
    );
    expect(qp).toMatchObject({ text: "update billing\n", html: null });
  });

  it("lists attachments", async () => {
    const ctx = await send(
      'To: a@acme.com\r\nContent-Type: multipart/mixed; boundary="b"\r\n\r\n--b\r\nContent-Type: text/plain\r\n\r\nhello\r\n' +
        '--b\r\nContent-Type: application/pdf\r\nContent-Disposition: attachment; filename="inv.pdf"\r\nContent-Transfer-Encoding: base64\r\n\r\nJVBERg==\r\n--b--',
    );
    expect(ctx.attachments).toEqual([
      { contentType: "application/pdf", filename: "inv.pdf" },
    ]);
  });

  it("denies content the parser dropped", async () => {
    await expect(
      send(
        'To: a@acme.com\r\nContent-Type: multipart/mixed; boundary="b"\r\n\r\n--x\r\nhidden billing\r\n',
      ),
    ).rejects.toThrow();
    await expect(
      send(
        'To: a@acme.com\r\nContent-Type: multipart/mixed; boundary="b"\r\n\r\n--b\r\n\r\nshown\r\n--b\r\n\r\nhidden',
      ),
    ).rejects.toThrow(/closing boundary/);
  });

  it("rejects missing raw", async () => {
    await expect(
      decodeMessageSend(new TextEncoder().encode("{}")),
    ).rejects.toThrow(/missing raw/);
  });

  it("drafts.send has unknown recipients", () => {
    expect(
      decodeDraftSend(new TextEncoder().encode(`{"id":"r-123"}`)),
    ).toMatchObject({ recipients: null, draft_id: "r-123" });
  });
});
