// Seed data for the fake Linear. Made up: no real people or customers.

export interface Team { id: string; key: string; name: string }
export interface User { id: string; name: string; email: string }
export interface Issue {
  id: string;
  identifier: string;
  number: number;
  title: string;
  description: string;
  priority: number;
  teamId: string;
  assigneeId?: string;
}
export interface Comment { id: string; issueId: string; body: string }

export const teams: Team[] = [
  { id: "team-agents", key: "AGT", name: "Agents" },
  { id: "team-finance", key: "FIN", name: "Finance" },
];

export const users: User[] = [
  { id: "user-alice", name: "Alice Doe", email: "alice@acme.test" },
  { id: "user-bob", name: "Bob Roe", email: "bob@acme.test" },
];

export const issues: Issue[] = [
  { id: "issue-1", identifier: "AGT-1", number: 1, title: "Login test is flaky in CI", description: "Fails about 1 in 10 runs on the OAuth redirect step.", priority: 2, teamId: "team-agents", assigneeId: "user-alice" },
  { id: "issue-2", identifier: "AGT-2", number: 2, title: "Customer cannot reset password", description: "Reset email never arrives for some customers since Tuesday.", priority: 1, teamId: "team-agents" },
  { id: "issue-3", identifier: "AGT-3", number: 3, title: "Add retry to webhook sender", description: "Webhooks are dropped when the receiver returns 503.", priority: 3, teamId: "team-agents", assigneeId: "user-bob" },
  { id: "issue-4", identifier: "AGT-4", number: 4, title: "Login test flaky", description: "Duplicate of AGT-1.", priority: 0, teamId: "team-agents" },
  { id: "issue-5", identifier: "FIN-1", number: 1, title: "Q3 invoice export is missing VAT", description: "Export CSV has an empty VAT column.", priority: 2, teamId: "team-finance" },
];

export const comments: Comment[] = [];
