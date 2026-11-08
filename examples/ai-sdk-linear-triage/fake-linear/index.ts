import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { addMocksToSchema, type IMocks } from "@graphql-tools/mock";
import { buildSchema, graphql } from "graphql";
import { comments, issues, teams, users, type Issue } from "./seed.js";

// Stand-in for api.linear.app: real GraphQL execution against Linear's own pinned schema.
// The fields the demo uses read and write the seed data; every other field the SDK asks
// for gets a fixed placeholder, so the stock @linear/sdk works unchanged.

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "127.0.0.1";
const sdl = await readFile(new URL("../../../src/providers/linear/schema.graphql", import.meta.url), "utf8");

const NOW = "2026-11-01T00:00:00.000Z";
const noPages = { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null };
const connection = <T>(nodes: T[]) => ({ nodes, edges: nodes.map((node) => ({ node, cursor: "" })), pageInfo: noPages });
const team = (id: string) => teams.find((t) => t.id === id)!;
const user = (id?: string) => users.find((u) => u.id === id) ?? null;
const issueView = (i: Issue) => ({
  ...i,
  team: team(i.teamId),
  assignee: user(i.assigneeId),
  url: `https://linear.app/acme/issue/${i.identifier}`,
  comments: connection(comments.filter((c) => c.issueId === i.id)),
});
const find = (idOrIdentifier: string) => {
  const i = issues.find((x) => x.id === idOrIdentifier || x.identifier === idOrIdentifier);
  if (!i) throw new Error(`Entity not found: Issue ${idOrIdentifier}`);
  return i;
};
let syncId = 100;

type Comparator = { eq?: string } | undefined;
type IssueFilter = { team?: { id?: Comparator; key?: Comparator } } | undefined;
const matches = (i: Issue, filter: IssueFilter) => {
  const t = team(i.teamId);
  return (!filter?.team?.id?.eq || t.id === filter.team.id.eq) && (!filter?.team?.key?.eq || t.key === filter.team.key.eq);
};

// Deterministic placeholders for everything the seed data doesn't cover.
const mocks: IMocks = {
  String: () => "",
  Int: () => 0,
  Float: () => 0,
  Boolean: () => false,
  DateTime: () => NOW,
  DateTimeOrDuration: () => NOW,
  TimelessDate: () => NOW.slice(0, 10),
  TimelessDateOrDuration: () => NOW.slice(0, 10),
  Duration: () => "P1D",
  JSON: () => ({}),
  JSONObject: () => ({}),
  UUID: () => crypto.randomUUID(),
};

const schema = addMocksToSchema({
  schema: buildSchema(sdl),
  mocks,
  resolvers: {
    Query: {
      viewer: () => users[0],
      teams: () => connection(teams),
      team: (_: unknown, { id }: { id: string }) => teams.find((t) => t.id === id || t.key === id) ?? null,
      users: () => connection(users),
      user: (_: unknown, { id }: { id: string }) => user(id),
      comment: (_: unknown, { id }: { id?: string }) => {
        const c = comments.find((x) => x.id === id);
        return c ? { ...c, issue: issueView(find(c.issueId)) } : null;
      },
      issues: (_: unknown, { filter }: { filter?: IssueFilter }) => connection(issues.filter((i) => matches(i, filter)).map(issueView)),
      issue: (_: unknown, { id }: { id: string }) => issueView(find(id)),
    },
    Mutation: {
      issueCreate: (_: unknown, { input }: { input: { teamId: string; title?: string; description?: string; priority?: number; assigneeId?: string } }) => {
        const t = teams.find((x) => x.id === input.teamId);
        if (!t) throw new Error(`Entity not found: Team ${input.teamId}`);
        const number = Math.max(0, ...issues.filter((i) => i.teamId === t.id).map((i) => i.number)) + 1;
        const issue: Issue = {
          id: crypto.randomUUID(),
          identifier: `${t.key}-${number}`,
          number,
          title: input.title ?? "",
          description: input.description ?? "",
          priority: input.priority ?? 0,
          teamId: t.id,
          ...(input.assigneeId ? { assigneeId: input.assigneeId } : {}),
        };
        issues.push(issue);
        console.log(`issueCreate ${issue.identifier} "${issue.title}"`);
        return { success: true, lastSyncId: ++syncId, issue: issueView(issue) };
      },
      commentCreate: (_: unknown, { input }: { input: { issueId: string; body?: string } }) => {
        const issue = find(input.issueId);
        const comment = { id: crypto.randomUUID(), issueId: issue.id, body: input.body ?? "" };
        comments.push(comment);
        console.log(`commentCreate on ${issue.identifier}: "${comment.body}"`);
        return { success: true, lastSyncId: ++syncId, comment: { ...comment, issue: issueView(issue) } };
      },
      issueDelete: (_: unknown, { id }: { id: string }) => {
        const issue = find(id);
        issues.splice(issues.indexOf(issue), 1);
        console.log(`issueDelete ${issue.identifier}`);
        return { success: true, lastSyncId: ++syncId };
      },
    },
  },
});

createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
  };
  if (req.method !== "POST" || req.url !== "/graphql") return send(404, { errors: [{ message: "POST /graphql only" }] });
  if (req.headers.authorization !== `Bearer ${process.env.LINEAR_TOKEN ?? "fake"}`) {
    return send(401, { errors: [{ message: "Authentication required", extensions: { code: "AUTHENTICATION_ERROR" } }] });
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const { query, variables, operationName } = JSON.parse(raw) as { query: string; variables?: Record<string, unknown>; operationName?: string };
  send(200, await graphql({ schema, source: query, variableValues: variables, operationName }));
}).listen(PORT, HOST, () => console.log(`fake Linear on http://${HOST}:${PORT}/graphql`));
