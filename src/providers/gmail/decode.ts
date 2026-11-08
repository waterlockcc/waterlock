import PostalMime, { type Address } from "postal-mime";

/**
 * Gmail sends opaque base64url RFC 822 in `raw`. Recipients live in the MIME
 * headers and content in (possibly nested, encoded) MIME parts, so policy can't
 * see either without decoding. postal-mime does the parsing; it is lenient like
 * a mail client, so the checks below turn anything ambiguous into a throw,
 * which denies the call.
 */

export interface GmailAttachment {
  contentType: string;
  filename: string | null;
}

export interface GmailMessageContext {
  /** Lowercased addresses from every To, Cc and Bcc header. */
  recipients: string[];
  recipient_domains: string[];
  subject: string | null;
  /**
   * The text/plain body as sent. Null when the message has none (e.g.
   * HTML-only).
   */
  text: string | null;
  /**
   * The text/html body as sent, markup included. Null when the message has
   * none.
   */
  html: string | null;
  attachments: GmailAttachment[];
}

/**
 * drafts.send sends a stored draft by id. The body may contain a message, but
 * Gmail sends the stored version, so recipients and content are unknown to the
 * gateway. Typed as null so policies must decide explicitly what to do.
 */
export interface GmailDraftSendContext {
  recipients: null;
  recipient_domains: null;
  subject: null;
  text: null;
  html: null;
  attachments: null;
  draft_id: string;
}

export async function decodeMessageSend(
  body: Uint8Array,
): Promise<GmailMessageContext> {
  const json = parseJson(body) as { raw?: unknown };
  return fromRaw(json.raw);
}

export async function decodeDraftWrite(
  body: Uint8Array,
): Promise<GmailMessageContext> {
  const json = parseJson(body) as { message?: { raw?: unknown } };
  return fromRaw(json.message?.raw);
}

export function decodeDraftSend(body: Uint8Array): GmailDraftSendContext {
  const json = parseJson(body) as { id?: unknown };
  if (typeof json.id !== "string" || !json.id)
    throw new Error("drafts.send requires a draft id");
  return {
    recipients: null,
    recipient_domains: null,
    subject: null,
    text: null,
    html: null,
    attachments: null,
    draft_id: json.id,
  };
}

function parseJson(body: Uint8Array): Record<string, unknown> {
  const parsed: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(body),
  );
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
    throw new Error("body must be a JSON object");
  return parsed as Record<string, unknown>;
}

/**
 * Strict on purpose: no quotes, spaces, brackets or comments. Anything fancier
 * denies.
 */
const ADDR = /^[^\s@<>()",;:[\]\\]+@[A-Za-z0-9.-]+$/;

async function fromRaw(raw: unknown): Promise<GmailMessageContext> {
  if (typeof raw !== "string" || !raw) throw new Error("missing raw message");
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw))
    throw new Error("raw is not base64");
  const bytes = Buffer.from(raw, "base64url");

  // Limits throw (deny) instead of truncating.
  const email = await PostalMime.parse(bytes, {
    maxNestingDepth: 8,
    maxPartCount: 100,
    attachmentEncoding: "arraybuffer",
  });

  const headerValues = (key: string) =>
    email.headers.filter((h) => h.key === key).map((h) => h.value);
  const recipients = [
    ...addresses(email.to, headerValues("to")),
    ...addresses(email.cc, headerValues("cc")),
    ...addresses(email.bcc, headerValues("bcc")),
  ];
  const unique = [...new Set(recipients)];

  assertBodyParsed(bytes, email);

  return {
    recipients: unique,
    recipient_domains: [
      ...new Set(unique.map((a) => a.slice(a.lastIndexOf("@") + 1))),
    ],
    subject: email.subject ?? null,
    text: email.text ?? null,
    html: email.html ?? null,
    attachments: email.attachments.map((a) => ({
      contentType: a.mimeType,
      filename: a.filename,
    })),
  };
}

/**
 * postal-mime keeps going on malformed lists: `a@x <b@y> <c@z>` yields b@y with
 * "a@x c@z" as the display name. Gmail may read that differently, so: every
 * address must be plain, and an address-like display name is only accepted when
 * it was quoted or a comment.
 */
function addresses(
  list: Address[] | undefined,
  rawHeaders: string[],
): string[] {
  const raw = rawHeaders.join("\n");
  return (list ?? [])
    .flatMap((a) => (a.group ? a.group : [a]))
    .map(({ address, name }) => {
      if (!ADDR.test(address))
        throw new Error(
          `unparseable recipient ${JSON.stringify(address || name)}`,
        );
      const delimited = raw.includes(`"${name}"`) || raw.includes(`(${name})`);
      if (/[@<>]/.test(name) && !delimited)
        throw new Error(
          `ambiguous recipient ${JSON.stringify(name)} <${address}>`,
        );
      return address.toLowerCase();
    });
}

/**
 * Lenient parsing can drop content it doesn't understand (e.g. a broken
 * multipart boundary), which a content check would then never see. Deny when a
 * non-empty body produced nothing, or a top-level multipart is never closed.
 */
function assertBodyParsed(
  bytes: Uint8Array,
  email: Awaited<ReturnType<typeof PostalMime.parse>>,
): void {
  const source = Buffer.from(bytes).toString("latin1");
  const split = source.search(/\r?\n\r?\n/);
  const body = split === -1 ? "" : source.slice(split).trim();
  if (body && !email.text && !email.html && email.attachments.length === 0)
    throw new Error("message body could not be parsed");

  const contentType =
    email.headers.find((h) => h.key === "content-type")?.value ?? "";
  const boundary = contentType.match(/boundary\s*=\s*(?:"([^"]+)"|([^\s;]+))/i);
  if (/^\s*multipart\//i.test(contentType)) {
    const b = boundary?.[1] ?? boundary?.[2];
    if (!b || !source.includes(`--${b}--`))
      throw new Error("multipart message is missing its closing boundary");
  }
}
