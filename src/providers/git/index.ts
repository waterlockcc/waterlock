import type { CredentialSource } from "../../core/credentials.js";
import type { ProviderRequest } from "../../core/policy.js";
import { createProvider } from "../../core/provider.js";
import {
  gitRouter,
  type GitFetchContext,
  type GitPushContext,
} from "./router.js";

export type { GitFetchContext, GitPushContext } from "./router.js";
export type { GitRefUpdate } from "./pktline.js";

export interface GitParams {
  /**
   * Repository path on the host, without the leading slash and `.git`:
   * `acme/app`, `group/sub/project`, `org/project/_git/repo`.
   */
  repo: string;
}

/**
 * What git rules see. `Id` is the provider id, one per upstream host. Narrow
 * on `action`, then on `context.phase` for push updates:
 *
 *   r.action === "git.push" && r.context.phase === "rpc" &&
 *     r.context.updates.some((u) => u.ref === "refs/heads/main")
 */
export type GitRequest<Id extends string = "git"> =
  | ProviderRequest<Id, "git.fetch", GitParams, GitFetchContext>
  | ProviderRequest<Id, "git.push", GitParams, GitPushContext>;

/**
 * Git over smart HTTP, against any host: GitHub, GitLab, Bitbucket, Gitea,
 * Azure DevOps, `git http-backend`. One provider per host, each with its own
 * `id`; the session token picks the host.
 */
export function git<const Id extends string = "git">(opts: {
  /** Default `git`. Set one per host when a gateway serves several. */
  id?: Id;
  /**
   * The host, plus any path prefix: `https://github.com`,
   * `https://git.example.com/gitea`.
   */
  upstream: string;
  credentials: CredentialSource;
  /**
   * Upstream gets `Authorization: Basic <username>:<token>`. Default
   * `x-access-token` (GitHub; GitLab and Azure DevOps accept any username
   * with a token). Bitbucket Cloud: `x-token-auth`.
   */
  username?: string;
  /**
   * Lowercase `repo` before rules see it. Default true: GitHub and GitLab
   * resolve `Acme/App` and `acme/app` to the same repo, so a case-sensitive
   * rule could be bypassed. Set false for hosts where case matters.
   */
  caseInsensitive?: boolean;
}) {
  const username = opts.username ?? "x-access-token";
  return createProvider<GitRequest<Id>>({
    id: opts.id ?? ("git" as Id),
    upstream: opts.upstream,
    router: gitRouter({ caseInsensitive: opts.caseInsensitive ?? true }),
    credentials: opts.credentials,
    inject: ({ headers, credential }) =>
      headers.set(
        "authorization",
        `Basic ${Buffer.from(`${username}:${credential.token}`).toString("base64")}`,
      ),
  });
}
