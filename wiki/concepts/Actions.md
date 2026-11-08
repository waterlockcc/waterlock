# Actions

Every call is one action. Rules match `r.action` and `r.params`.

| Spec | Action | `r.params` |
|---|---|---|
| Discovery (Google) | method id: `gmail.users.messages.send` | path + query params |
| OpenAPI | `<provider>.<operationId>` | path + query params |
| GraphQL | top-level field: `linear.mutation.issueCreate` | field arguments, schema defaults filled in |

Unknown paths, params, fields and arguments are rejected before policy runs.

## GraphQL limitation

Only the top-level field is checked, not nested selections.

- Mutations: the selection only shapes the response, so the action covers the write.
- Queries: an allowed query can read anything reachable from its field, e.g. `issue { team { members { email } } }`. Reads are limited by the upstream token's scopes, not by policy.
- SDK relation calls can be nested selections too. For example, Linear's `issue.comments()` sends `issue(id) { comments }`, so it is `linear.query.issue`, not `linear.query.comments`. Allowing `linear.query.issue` allows reading the issue's comments, attachments and history.
- One operation and one top-level field per request. Batches, subscriptions and persisted queries are rejected.
