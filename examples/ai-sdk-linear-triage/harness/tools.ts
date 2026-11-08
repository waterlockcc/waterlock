import type { LinearClient } from "@linear/sdk";
import { tool } from "ai";
import { z } from "zod";

// Plain AI SDK tools over the stock Linear SDK. No policy code: the gateway
// behind `linear` enforces it. A denial throws, and the AI SDK hands the error
// message to the model.
export const createTools = (linear: LinearClient) => ({
  listTeams: tool({
    description: "List teams",
    inputSchema: z.object({}),
    execute: async () =>
      (await linear.teams()).nodes.map(({ id, key, name }) => ({
        id,
        key,
        name,
      })),
  }),
  listIssues: tool({
    description: "List a team's issues",
    inputSchema: z.object({ teamKey: z.string().describe("e.g. AGT") }),
    execute: async ({ teamKey }) =>
      (
        await linear.issues({ filter: { team: { key: { eq: teamKey } } } })
      ).nodes.map(({ identifier, title, description, priority }) => ({
        identifier,
        title,
        description,
        priority,
      })),
  }),
  createIssue: tool({
    description: "File an issue",
    inputSchema: z.object({
      teamId: z.string(),
      title: z.string(),
      description: z.string(),
    }),
    execute: async (input) => ({
      identifier: (await (await linear.createIssue(input)).issue)?.identifier,
    }),
  }),
  createComment: tool({
    description: "Comment on an issue",
    inputSchema: z.object({
      issueId: z.string().describe("id or identifier, e.g. AGT-1"),
      body: z.string(),
    }),
    execute: async (input) => ({
      success: (await linear.createComment(input)).success,
    }),
  }),
  deleteIssue: tool({
    description: "Delete an issue",
    inputSchema: z.object({
      id: z.string().describe("id or identifier, e.g. AGT-1"),
    }),
    execute: async ({ id }) => ({
      success: (await linear.deleteIssue(id)).success,
    }),
  }),
});
