import { concat } from "../../core/body.js";
import type { GatewayError } from "../../core/provider.js";
import { FLUSH, pktLine, sideband } from "./pktline.js";

/**
 * Plain text: git prints a `text/plain` error body line by line as
 * `remote: ...` before failing, so the agent sees the reason.
 */
export function gitError(error: GatewayError): Response {
  return new Response(`${error.message}\n`, {
    status: error.status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * A refused push as receive-pack's own result: `ng <ref> <reason>` for every
 * ref, so git prints `! [remote rejected] main -> main (<reason>)`. Wrapped in
 * side-band when the client asked for it. Clients that didn't ask for a report
 * get plain text.
 */
export function pushRejected(
  refs: readonly string[],
  capabilities: readonly string[],
): (error: GatewayError) => Response {
  if (
    !capabilities.includes("report-status") &&
    !capabilities.includes("report-status-v2")
  )
    return gitError;
  const band = capabilities.includes("side-band-64k")
    ? 65520
    : capabilities.includes("side-band")
      ? 1000
      : undefined;

  return (error) => {
    // One line per ref: no newlines or control characters in the reason.
    const reason = error.message.replace(/[\x00-\x1f\x7f]+/g, " ").trim();
    const report = concat([
      pktLine("unpack ok\n"),
      ...refs.map((ref) => pktLine(`ng ${ref} ${reason}\n`)),
      FLUSH,
    ]);
    return new Response(band ? sideband(report, band) : report, {
      status: 200,
      headers: {
        "content-type": "application/x-git-receive-pack-result",
        "cache-control": "no-cache",
      },
    });
  };
}
