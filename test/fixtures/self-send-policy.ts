import { definePolicy } from "../../src/index.js";
import type { GmailRequest } from "../../src/providers/gmail/index.js";

/** Send only to yourself, and never with billing info (dynamic check). */
export const selfSendPolicy = definePolicy<GmailRequest>([
  {
    rule: (r) =>
      r.action === "gmail.users.messages.send" &&
      r.context.recipients.length > 0 &&
      r.context.recipients.every((addr) => addr === r.session.onBehalfOf),
    reason: "You can only send email to yourself.",
  },
  {
    rule: (r) => r.action === "gmail.users.messages.send" && r.check("The email contains billing information"),
    action: "deny",
  },
]);
