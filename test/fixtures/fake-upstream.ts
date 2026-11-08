import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";

export interface SeenRequest {
  /** Path + query, e.g. `/gmail/v1/users/me/messages?maxResults=10`. */
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/**
 * A local HTTP server standing in for a provider API. Point the provider at it with
 * `upstream: up.url`; the gateway then makes real HTTP calls, and `seen` records them.
 */
export async function fakeUpstream(
  respond: (req: SeenRequest) => Response | Promise<Response> = () =>
    Response.json({}),
) {
  const seen: SeenRequest[] = [];
  const server = serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: async (req) => {
      const url = new URL(req.url);
      const record = {
        path: url.pathname + url.search,
        method: req.method,
        headers: Object.fromEntries(req.headers),
        body: await req.text(),
      };
      seen.push(record);
      return respond(record);
    },
  });
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    seen,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
