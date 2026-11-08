import type { gmail_v1 } from "@googleapis/gmail";
import { tool } from "ai";
import { z } from "zod";

// Plain AI SDK tool. No policy code: the gateway behind `gmail` enforces it.
// A denial throws, and the AI SDK hands the error message to the model.
export const createTools = (gmail: gmail_v1.Gmail) => ({
  sendEmail: tool({
    description: "Send an email",
    inputSchema: z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
    execute: async ({ to, subject, body }) => {
      const raw = Buffer.from(
        `To: ${to}\r\nSubject: ${subject}\r\n\r\n${body}`,
      ).toString("base64url");
      const res = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });
      return { id: res.data.id };
    },
  }),
});
