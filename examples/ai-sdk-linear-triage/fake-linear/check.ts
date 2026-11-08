import assert from "node:assert/strict";
import { LinearClient } from "@linear/sdk";

// Checks the fake on its own: the stock SDK calls the harness tools make, straight at the
// fake (no gateway). Run against a fresh fake: it creates an issue and a comment.
const api = new LinearClient({
  accessToken: process.env.LINEAR_TOKEN ?? "fake",
  apiUrl: process.env.LINEAR_URL ?? "http://127.0.0.1:4000/graphql",
});

const teams = await api.teams();
assert.deepEqual(teams.nodes.map((t) => t.key), ["AGT", "FIN"]);
const agents = teams.nodes[0]!;

const list = await api.issues({ filter: { team: { key: { eq: "AGT" } } } });
assert.deepEqual(list.nodes.map((i) => i.identifier), ["AGT-1", "AGT-2", "AGT-3", "AGT-4"]);

const issue = await api.issue("AGT-1");
assert.equal(issue.title, "Login test is flaky in CI");
assert.equal((await issue.team)?.key, "AGT");
assert.equal((await issue.assignee)?.name, "Alice Doe");

const created = await api.createIssue({ teamId: agents.id, title: "Check fake", description: "From check.ts" });
assert.equal(created.success, true);
const createdIssue = await created.issue;
assert.equal(createdIssue?.identifier, "AGT-5");
assert.equal((await api.issue("AGT-5")).description, "From check.ts");

const comment = await api.createComment({ issueId: "AGT-5", body: "hello" });
assert.equal(comment.success, true);
assert.equal((await comment.comment)?.body, "hello");

const del = await api.deleteIssue("AGT-5");
assert.equal(del.success, true);
await assert.rejects(api.issue("AGT-5"), /Entity not found/);

await assert.rejects(new LinearClient({ accessToken: "wrong", apiUrl: process.env.LINEAR_URL ?? "http://127.0.0.1:4000/graphql" }).viewer, /Authentication/);

console.log("fake Linear ok");
