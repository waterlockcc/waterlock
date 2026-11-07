import { definePolicy } from "../../src/index.js";
import type { GmailRequest } from "../../src/providers/gmail/index.js";

/** Send only to yourself, and never with billing info (plain-language row). */
export const selfSendPolicy = definePolicy<GmailRequest>([
  {
    when: (r) =>
      r.action === "gmail.users.messages.send" &&
      r.context.recipients.length > 0 &&
      r.context.recipients.every((addr) => addr === r.session.onBehalfOf),
    reason: "You can only send email to yourself.",
  },
  { when: "The email contains billing information", action: "deny" },
]);
