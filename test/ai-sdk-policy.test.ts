import { describe, expect, it } from "vitest";
import { policy } from "../examples/ai-sdk-send-email/gateway/policy.js";
import { evaluatePolicy } from "../src/core/evaluate.js";
import type { GmailRequest } from "../src/providers/gmail/index.js";
import { decodeMessageSend } from "../src/providers/gmail/decode.js";
import { mockCheckModel, modelCheck } from "./mock-judge.js";

const SELF = "alice@acme.com";
const setup = () => {
  const model = mockCheckModel();
  const evaluate = (mime: string) =>
    evaluatePolicy(
      policy,
      {
        provider: "gmail",
        action: "gmail.users.messages.send",
        groups: ["gmail:send"],
        params: { userId: "me" },
        context: decodeMessageSend(new TextEncoder().encode(JSON.stringify({ raw: Buffer.from(mime).toString("base64url") }))),
        session: { sid: "s", agent: "a", onBehalfOf: SELF, iat: 0, exp: 0 },
      } satisfies GmailRequest,
      {},
      { check: modelCheck(model) },
    );
  return { model, evaluate };
};

describe("ai-sdk-send-email policy", () => {
  it("allows send to self after the billing check passes", async () => {
    const { model, evaluate } = setup();
    expect(await evaluate(`To: ${SELF}\r\n\r\nBuy milk`)).toMatchObject({ effect: "allow" });
    expect(model.conditions).toEqual(["The email contains billing information"]);
  });

  it("denies other recipients without running the check", async () => {
    const { model, evaluate } = setup();
    expect(await evaluate(`To: bob@acme.com\r\n\r\nhi`)).toMatchObject({ effect: "deny", reason: "You can only send email to yourself." });
    expect(await evaluate(`To: ${SELF}\r\nBcc: x@evil.com\r\n\r\nhi`)).toMatchObject({ effect: "deny" });
    expect(model.conditions).toEqual([]);
  });

  it("billing check denies, even base64-encoded", async () => {
    const { evaluate } = setup();
    expect(await evaluate(`To: ${SELF}\r\n\r\nupdate billing address`)).toMatchObject({
      effect: "deny",
      rules: ["#1"],
      reason: "The email mentions billing.",
    });
    const b64 = `To: ${SELF}\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from("billing").toString("base64")}`;
    expect(await evaluate(b64)).toMatchObject({ effect: "deny", rules: ["#1"] });
  });
});
