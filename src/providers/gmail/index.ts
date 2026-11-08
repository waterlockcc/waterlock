import type { CredentialSource } from "../../core/credentials.js";
import type { ProviderRequest } from "../../core/policy.js";
import { createProvider } from "../../core/provider.js";
import {
  decodeDraftSend,
  decodeDraftWrite,
  decodeMessageSend,
} from "./decode.js";
import type { GmailDraftSendContext, GmailMessageContext } from "./decode.js";
import { gmailTable, type GmailAction, type GmailParams } from "./generated.js";

export type { GmailAction, GmailParams } from "./generated.js";
export type {
  GmailAttachment,
  GmailDraftSendContext,
  GmailMessageContext,
} from "./decode.js";
export { gmailTable } from "./generated.js";

/** Hand-written: what each decoder adds to `context`. Everything else has an empty context. */
export interface GmailDecoded {
  "gmail.users.messages.send": GmailMessageContext;
  "gmail.users.drafts.create": GmailMessageContext;
  "gmail.users.drafts.update": GmailMessageContext;
  "gmail.users.drafts.send": GmailDraftSendContext;
}

type ContextFor<A extends GmailAction> = A extends keyof GmailDecoded
  ? GmailDecoded[A]
  : Record<string, never>;

/** What Gmail rules see. Narrow on `action` to get typed params/context. */
export type GmailRequest = {
  [A in GmailAction]: ProviderRequest<
    "gmail",
    A,
    GmailParams[A],
    ContextFor<A>
  >;
}[GmailAction];

export function gmail(opts: {
  credentials: CredentialSource;
  upstream?: string;
}) {
  return createProvider<GmailRequest>({
    id: "gmail",
    upstream: opts.upstream ?? "https://gmail.googleapis.com",
    table: gmailTable,
    // Google system params. Excluded on purpose: key, access_token, oauth_token
    // (credentials in the URL), callback (JSONP), uploadType/upload_protocol.
    allowedGlobalQueryParams: [
      "alt",
      "fields",
      "prettyPrint",
      "quotaUser",
      "$.xgafv",
    ],
    decoders: {
      "gmail.users.messages.send": ({ body }) => decodeMessageSend(body),
      "gmail.users.drafts.create": ({ body }) => decodeDraftWrite(body),
      "gmail.users.drafts.update": ({ body }) => decodeDraftWrite(body),
      "gmail.users.drafts.send": ({ body }) => decodeDraftSend(body),
    },
    credentials: opts.credentials,
  });
}
