import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";

/** Stand-in Gmail for runs without GMAIL_ACCESS_TOKEN: accepts every call, sends nothing. */
export async function startFakeGmail(): Promise<string> {
  const server = serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => Response.json({ id: "fake-msg-1" }),
  });
  await once(server, "listening");
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
