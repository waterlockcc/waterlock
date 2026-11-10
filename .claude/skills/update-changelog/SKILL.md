---
name: update-changelog
description: Write the changelog entry for a release on the docs site (docs/content/changelog/<version>.mdx). Use when asked to update, write or check the changelog or release notes, or when preparing a version bump.
---

# Update the changelog

The changelog is for people who use `@waterlock/gateway`. Each entry tells them what they can now do, what behaves differently, and what they have to change. Nothing else goes in.

## Where it lives

`docs/content/changelog/`, one MDX file per release (e.g. `0.2.0.mdx`), shown at `/changelog`, newest first. Entries are written when a version is released; there is no "unreleased" entry. The page adds links to the version's GitHub release and npm page from `version`, so don't add them to the body.

```mdx
---
title: "GraphQL, and a Linear provider"   # what the release is about, short
version: "0.2.0"
date: 2026-11-08                          # release day
summary: "One sentence a user can skim."
---

### BREAKING CHANGE

- What broke, who it affects, and the exact change to make. ([#12](https://github.com/waterlockcc/waterlock/pull/12))

  ```ts
  // before
  ...
  // after
  ...
  ```

### Added

- ...

### Changed

- ...

### Fixed

- ...

[Compare v0.1.1...v0.2.0](https://github.com/waterlockcc/waterlock/compare/v0.1.1...v0.2.0)
```

Sections in that order, each only when it has entries. `BREAKING CHANGE` comes first and only when a release breaks something; leave it out otherwise. Use `Removed` (after `Fixed`) for features taken away without a replacement; if users must act, it is also a breaking change.

## What goes in

Only user-facing changes: anything a user of the package can see, use, or has to react to.

- New public API: exports, options, providers, actions, `r.params` / `r.context` fields, codegen inputs.
- Behaviour a user can observe: what is allowed or denied, matching, error codes and response shapes, defaults (TTLs, timeouts, limits), credentials, sessions.
- Fixes to bugs a user could hit.
- Requirements: Node version, peer dependencies, supported upstream API versions.
- Security fixes, always, with what to do (e.g. upgrade, rotate a key).

## What stays out

Anything only the people working on the repo notice, even if the PR was large:

- Tests, CI, release tooling, scripts.
- Formatting, linting, refactors, renames of internals, file moves.
- Docs, README, wiki, site, examples and demos.
- Dependency bumps with no visible effect.
- Regenerated provider files when the API they describe didn't change.

When a PR mixes both, write only the user-facing part. If a release has nothing user-facing, set `summary: "No changes to the library."` and leave the body to the compare link, instead of listing internal work.

## Breaking changes

A change is breaking when code or config that worked before stops working, or works differently, after upgrading. Check for:

- Removed or renamed exports, subpaths in `package.json` `exports`, options or types.
- Changed function signatures or option types; a required option that used to be optional.
- A call that used to be allowed and is now denied (or the reverse), or a changed default.
- Changed error codes, statuses or response shapes that clients read.
- Renamed or removed actions or `r.params` / `r.context` fields (e.g. after a provider regeneration).
- A higher Node version in `engines`, or a new peer dependency.

Each breaking entry says what changed, who it affects, and the exact migration, with before / after code when it helps. Pre-1.0 minor releases can break; still list them here.

## How to write it

1. Find the range: `git describe --tags --abbrev=0` for the last release, then `git log --oneline <tag>..HEAD` (the release branch) and `gh pr view <n>` for each PR.
2. Read the diff of what users touch, not the PR titles: `git diff <tag>..HEAD -- src/index.ts package.json src/core src/checks src/graphql src/providers/*/index.ts` and the provider `generated.ts` action lists. Confirm each claim in the code before writing it.
3. Sort each change: user-facing (which section) or out. Look for breaking changes even in PRs not labelled as such.
4. Write each entry as one plain sentence about what the user gets or must do, then the PR link: `([#6](https://github.com/waterlockcc/waterlock/pull/6))`. Lead with the feature in bold when it's a headline (`**Linear provider**, ...`). Link to the docs page that explains it when there is one.
5. Update `summary` and, for a release, `title`.

## At release

In the PR that bumps `version` in `package.json`:

1. Snapshot the docs first, while the label is still the old version: `pnpm docs:snapshot` in `docs/` (see `docs/README.md`).
2. Add `<version>.mdx` for the new version with `version`, `date` (the release day), `title`, `summary`, the sections, and the compare link from the previous tag.

Then check the page: `pnpm dev` in `docs/`, open `/changelog`.
