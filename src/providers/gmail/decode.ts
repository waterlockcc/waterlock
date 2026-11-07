/**
 * Gmail sends opaque base64url RFC 822 in `raw`. Recipients live in the MIME
 * headers and content lives in (possibly nested, encoded) MIME parts, so policy
 * can't see either without decoding. Parser is deliberately strict: anything it
 * can't parse confidently throws, which denies the call.
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
   * Decoded subject + every text/* part, transfer-encoding and charset undone,
   * HTML reduced to text. What a content rule should scan.
   */
  text: string;
  /** Parts marked as attachments or with non-text content. Their bytes are not in `text` unless they're text/*. */
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
  attachments: null;
  draft_id: string;
}

export function decodeMessageSend(body: Uint8Array): GmailMessageContext {
  const json = parseJson(body) as { raw?: unknown };
  return fromRaw(json.raw);
}

export function decodeDraftWrite(body: Uint8Array): GmailMessageContext {
  const json = parseJson(body) as { message?: { raw?: unknown } };
  return fromRaw(json.message?.raw);
}

export function decodeDraftSend(body: Uint8Array): GmailDraftSendContext {
  const json = parseJson(body) as { id?: unknown };
  if (typeof json.id !== "string" || !json.id) throw new Error("drafts.send requires a draft id");
  return { recipients: null, recipient_domains: null, subject: null, text: null, attachments: null, draft_id: json.id };
}

function parseJson(body: Uint8Array): Record<string, unknown> {
  const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("body must be a JSON object");
  return parsed as Record<string, unknown>;
}

function fromRaw(raw: unknown): GmailMessageContext {
  if (typeof raw !== "string" || !raw) throw new Error("missing raw message");
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(raw)) throw new Error("raw is not base64");
  // latin1 keeps one char per byte, so MIME structure can be parsed without corrupting binary parts.
  const binary = Buffer.from(raw.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
  const { headers } = splitEntity(binary);

  const recipients = ["to", "cc", "bcc"].flatMap((h) => (headers.get(h) ?? []).flatMap(parseAddressList));
  const unique = [...new Set(recipients)];
  const subjectRaw = headers.get("subject")?.[0];
  const subject = subjectRaw === undefined ? null : decodeEncodedWords(subjectRaw);

  const collected: Collected = { texts: [], attachments: [] };
  walkEntity(binary, 0, collected);

  return {
    recipients: unique,
    recipient_domains: [...new Set(unique.map((a) => a.slice(a.lastIndexOf("@") + 1)))],
    subject,
    text: [subject ?? "", ...collected.texts].join("\n"),
    attachments: collected.attachments,
  };
}

// ---------------------------------------------------------------------------
// MIME body walking

interface Collected {
  texts: string[];
  attachments: GmailAttachment[];
}

const MAX_DEPTH = 8;

function walkEntity(binary: string, depth: number, out: Collected): void {
  if (depth > MAX_DEPTH) throw new Error("MIME nesting too deep");
  const { headers, body } = splitEntity(binary);
  const ct = parseHeaderParams(headers.get("content-type")?.[0] ?? "text/plain; charset=us-ascii");
  const cte = (headers.get("content-transfer-encoding")?.[0] ?? "7bit").trim().toLowerCase();
  const disposition = parseHeaderParams(headers.get("content-disposition")?.[0] ?? "inline");

  if (ct.value.startsWith("multipart/")) {
    const boundary = ct.params.boundary;
    if (!boundary) throw new Error("multipart without boundary");
    if (!["7bit", "8bit", "binary"].includes(cte)) throw new Error(`multipart with transfer encoding ${cte}`);
    for (const part of splitMultipart(body, boundary)) walkEntity(part, depth + 1, out);
    return;
  }

  // Forwarded message: its content counts too.
  if (ct.value === "message/rfc822") {
    walkEntity(Buffer.from(transferDecode(body, cte)).toString("latin1"), depth + 1, out);
    return;
  }

  const isText = ct.value.startsWith("text/");
  const filename = disposition.params.filename ?? ct.params.name ?? null;
  if (!isText || disposition.value === "attachment") {
    out.attachments.push({ contentType: ct.value, filename: filename && decodeEncodedWords(filename) });
  }
  if (!isText) return;

  let text = decodeCharset(transferDecode(body, cte), ct.params.charset ?? "utf-8");
  if (ct.value === "text/html") text = htmlToText(text);
  out.texts.push(text);
}

function splitEntity(binary: string): { headers: Map<string, string[]>; body: string } {
  const m = /\r?\n\r?\n/.exec(binary);
  const headText = m ? binary.slice(0, m.index) : binary;
  const body = m ? binary.slice(m.index + m[0].length) : "";
  return { headers: parseHeaders(Buffer.from(headText, "latin1").toString("utf8")), body };
}

function splitMultipart(body: string, boundary: string): string[] {
  const delim = `--${boundary}`;
  // Delimiters must start a line. Find each one, then the rest of its line.
  const re = new RegExp(`(?:^|\\r?\\n)${escapeRe(delim)}(--)?[ \\t]*(?:\\r?\\n|$)`, "g");
  const parts: string[] = [];
  let start: number | null = null;
  let closed = false;
  for (let m = re.exec(body); m; m = re.exec(body)) {
    if (start !== null) parts.push(body.slice(start, m.index));
    if (m[1]) {
      closed = true;
      break;
    }
    start = m.index + m[0].length;
  }
  if (!closed) throw new Error("multipart missing closing boundary");
  return parts;
}

function transferDecode(body: string, cte: string): Uint8Array {
  switch (cte) {
    case "7bit":
    case "8bit":
    case "binary":
      return Buffer.from(body, "latin1");
    case "base64": {
      const clean = body.replace(/\s+/g, "");
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) throw new Error("invalid base64 part");
      return Buffer.from(clean, "base64");
    }
    case "quoted-printable":
      return Buffer.from(
        body.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))),
        "latin1",
      );
    default:
      throw new Error(`unsupported transfer encoding ${cte}`);
  }
}

function decodeCharset(bytes: Uint8Array, charset: string): string {
  // Unknown charset label throws RangeError -> deny.
  return new TextDecoder(charset.trim().toLowerCase()).decode(bytes);
}

/** Crude but sufficient for scanning: drop script/style, tags become spaces, decode entities. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x([0-9a-f]+);?/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&");
}

/** RFC 2047 encoded words: `=?utf-8?B?...?=` and `=?utf-8?Q?...?=`. */
function decodeEncodedWords(value: string): string {
  return value
    .replace(/\?=\s+=\?/g, "?==?") // whitespace between adjacent encoded words is ignored
    .replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, enc: string, data: string) => {
      const bytes =
        enc.toUpperCase() === "B"
          ? Buffer.from(data, "base64")
          : Buffer.from(
              data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (__, h: string) => String.fromCharCode(parseInt(h, 16))),
              "latin1",
            );
      return decodeCharset(bytes, charset);
    });
}

/** `type/sub; a=b; c="d"` -> { value, params }. Lowercases value and param names. */
function parseHeaderParams(header: string): { value: string; params: Record<string, string> } {
  const [value = "", ...rest] = header.split(";");
  const params: Record<string, string> = {};
  for (const p of rest) {
    const i = p.indexOf("=");
    if (i === -1) continue;
    params[p.slice(0, i).trim().toLowerCase()] = p.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
  }
  return { value: value.trim().toLowerCase(), params };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Headers and addresses

export function parseHeaders(head: string): Map<string, string[]> {
  const unfolded = head.replace(/\r?\n[ \t]+/g, " ");
  const out = new Map<string, string[]>();
  for (const line of unfolded.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const name = line.slice(0, i).trim().toLowerCase();
    out.set(name, [...(out.get(name) ?? []), line.slice(i + 1).trim()]);
  }
  return out;
}

const ADDR = /^[^\s@<>()",;:[\]\\]+@[A-Za-z0-9.-]+$/;

/**
 * RFC 5322 address-list, the subset real mail uses: display names (quoted or
 * not), comments, angle addresses, and group syntax (`team: a@x, b@y;`).
 * Rejects quoted local parts and address literals rather than guessing.
 */
export function parseAddressList(value: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let inQuote = false;
  let angle = 0;
  let paren = 0;

  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (inQuote) {
      if (c === "\\") i++;
      else if (c === '"') inQuote = false;
      continue; // display-name text is irrelevant; drop it
    }
    if (paren > 0) {
      if (c === "(") paren++;
      else if (c === ")") paren--;
      continue;
    }
    if (c === '"') {
      if (angle > 0) throw new Error("quoted local part not supported");
      inQuote = true;
    } else if (c === "(") paren++;
    else if (c === "<") {
      angle++;
      buf += c;
    } else if (c === ">") {
      angle--;
      buf += c;
    } else if ((c === "," || c === ";") && angle === 0) {
      parts.push(buf);
      buf = "";
    } else if (c === ":" && angle === 0) {
      buf = ""; // group name
    } else buf += c;
  }
  if (inQuote || angle !== 0 || paren !== 0) throw new Error("unbalanced address header");
  parts.push(buf);

  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const angled = p.match(/<([^<>]*)>/);
      if (angled && p.indexOf("<") !== p.lastIndexOf("<")) throw new Error(`multiple angle addresses: ${p}`);
      const addr = (angled ? angled[1]! : p).trim().toLowerCase();
      if (!ADDR.test(addr)) throw new Error(`unparseable address: ${addr}`);
      return addr;
    });
}
