/** Reads the whole body, refusing anything over `max` bytes. */
export async function readBody(
  body: ReadableStream<Uint8Array> | null,
  headers: Headers,
  max: number,
): Promise<Uint8Array | "too_large"> {
  const declared = Number(headers.get("content-length") ?? 0);
  if (declared > max) return "too_large";
  if (!body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.length;
    if (size > max) return "too_large";
    chunks.push(chunk);
  }
  return concat(chunks, size);
}

/**
 * Reads a stream to the end and drops it, so the client finishes sending
 * before it gets a response. A stream already taken (e.g. by `fetch`) is left
 * alone.
 */
export async function drain(body: unknown): Promise<void> {
  if (!(body instanceof ReadableStream) || body.locked) return;
  try {
    await body.pipeTo(new WritableStream());
  } catch {
    // The client went away; nothing to respond to.
  }
}

export function concat(
  chunks: readonly Uint8Array[],
  size = chunks.reduce((n, c) => n + c.length, 0),
): Uint8Array {
  const out = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
