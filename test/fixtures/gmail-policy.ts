import { definePolicy } from "../../src/index.js";
import type { GmailRequest } from "../../src/providers/gmail/index.js";

export type Facts = { sendsLastHour: number };

export const policy = definePolicy<GmailRequest, Facts>([
  { rule: (r) => r.session.agent === "inbox-assistant" && r.in("gmail:read") },
  { rule: (r) => r.in("gmail:compose") },
  // Every recipient must be internal. `every` on the recipient list, not "contains acme.com".
  {
    rule: (r) => r.action === "gmail.users.messages.send" && r.context.recipient_domains.every((d) => d === "acme.com"),
    reason: "Email can only go to acme.com addresses.",
  },
  { rule: (r) => r.in("gmail:delete"), action: "deny", reason: "Deleting mail is not allowed." },
  { rule: (r) => r.in("gmail:forwarding"), action: "deny", reason: "Changing forwarding settings is not allowed." },
  // Gmail defaults maxResults to 100 when omitted.
  {
    rule: (r) => r.action === "gmail.users.messages.list" && (r.params.maxResults ?? 100) > 50,
    action: "deny",
    reason: "List at most 50 messages per page.",
  },
  { rule: (r) => r.in("gmail:send") && r.facts.sendsLastHour >= 20, action: "deny", reason: "Send limit reached (20/hour)." },
  // Recipients of a stored draft are unknown to the gateway (context is null), so never send drafts.
  { rule: (r) => r.action === "gmail.users.drafts.send", action: "deny", reason: "Sending stored drafts is not allowed." },
]);
