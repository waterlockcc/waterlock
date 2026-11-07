import { defineCodegenConfig } from "../../codegen/config.js";

/**
 * Curated layer on top of the Gmail Discovery doc. Everything else is generated.
 * Review codegen-report.md after any change here or to spec.json.
 */
export default defineCodegenConfig({
  provider: "gmail",
  typePrefix: "Gmail",
  source: {
    kind: "discovery",
    file: "./spec.json",
    url: "https://gmail.googleapis.com/$discovery/rest?version=v1",
  },
  out: "./generated.ts",
  report: "./codegen-report.md",
  typesImport: "../../core/types.js",

  groups: {
    read: [
      "gmail.users.getProfile",
      "gmail.users.history.list",
      "gmail.users.messages.get",
      "gmail.users.messages.list",
      "gmail.users.messages.attachments.get",
      "gmail.users.threads.get",
      "gmail.users.threads.list",
      "gmail.users.labels.get",
      "gmail.users.labels.list",
      "gmail.users.drafts.get",
      "gmail.users.drafts.list",
    ],
    // Drafts never leave the mailbox, so deleting one is compose, not delete.
    compose: ["gmail.users.drafts.create", "gmail.users.drafts.update", "gmail.users.drafts.delete"],
    send: ["gmail.users.messages.send", "gmail.users.drafts.send"],
    // Reversible changes. trash/untrash are POSTs but not destructive.
    organize: [
      "gmail.users.messages.modify",
      "gmail.users.messages.batchModify",
      "gmail.users.threads.modify",
      "gmail.users.*.trash",
      "gmail.users.*.untrash",
      "gmail.users.labels.create",
      "gmail.users.labels.patch",
      "gmail.users.labels.update",
    ],
    // Permanent. batchDelete is a POST — a method-based heuristic would call it "write".
    delete: [
      "gmail.users.messages.delete",
      "gmail.users.messages.batchDelete",
      "gmail.users.threads.delete",
      "gmail.users.labels.delete",
    ],
    // Writes mail into the mailbox without sending it: phishing-into-inbox risk.
    inject: ["gmail.users.messages.import", "gmail.users.messages.insert"],
    settings: ["gmail.users.settings.**", "gmail.users.watch", "gmail.users.stop"],
    // Writes that silently route mail elsewhere or let others act as the mailbox.
    // Also in `settings`; this group exists so a policy can forbid them by name.
    // Writes only: reading forwarding config is harmless and useful to agents.
    forwarding: [
      "gmail.users.settings.updateAutoForwarding",
      "gmail.users.settings.forwardingAddresses.create",
      "gmail.users.settings.delegates.create",
      "gmail.users.settings.filters.create", // filters can forward matching mail
      "gmail.users.settings.sendAs.create",
      "gmail.users.settings.sendAs.patch",
      "gmail.users.settings.sendAs.update",
    ],
  },

  fallback: (op) => (op.method === "GET" ? "read" : "write"),
});
