import { definePolicy } from "../../src/index.js";
import type { GmailRequest } from "../../src/providers/gmail/index.js";

export const policy = definePolicy<GmailRequest>([
  {
    when: (r) =>
      r.session.agent === "inbox-assistant" &&
      (r.action.endsWith(".get") || r.action.endsWith(".list")),
  },
  { when: (r) => r.action.startsWith("gmail.users.drafts.") },
  // Every recipient must be internal. `every` on the recipient list, not
  // "contains acme.com".
  {
    when: (r) =>
      r.action === "gmail.users.messages.send" &&
      r.context.recipient_domains.every((d) => d === "acme.com"),
    reason: "Email can only go to acme.com addresses.",
  },
  {
    when: (r) =>
      /\.(batchDelete|delete)$/.test(r.action) &&
      !r.action.startsWith("gmail.users.drafts."),
    action: "deny",
    reason: "Deleting mail is not allowed.",
  },
  {
    when: (r) =>
      r.action === "gmail.users.settings.updateAutoForwarding" ||
      r.action.startsWith("gmail.users.settings.forwardingAddresses."),
    action: "deny",
    reason: "Changing forwarding settings is not allowed.",
  },
  // Gmail defaults maxResults to 100 when omitted.
  {
    when: (r) =>
      r.action === "gmail.users.messages.list" &&
      (r.params.maxResults ?? 100) > 50,
    action: "deny",
    reason: "List at most 50 messages per page.",
  },
  // Recipients of a stored draft are unknown to the gateway (context is null),
  // so never send drafts.
  {
    when: (r) => r.action === "gmail.users.drafts.send",
    action: "deny",
    reason: "Sending stored drafts is not allowed.",
  },
]);
