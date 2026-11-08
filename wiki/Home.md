# waterlock

Open source solution to [workos airlock](https://workos.com/blog/workos-airlock).

** This repo is a work in progress. Not ready for production usage. If you would like to contribute, 
please raise an issue and we can chat **

## Why use this?

You don't want to inject real creds into your agents since most of the applications have
really broad permissions. What waterlock gives you
- A common language to work with permissions regardless of the application you choose
- Full visibility into what the accesses were like / audit logs (upcoming)
- A gateway to proxy forward your external resource calls, preventing rogue agents from
  leaking your sensitive keys.
- Static typescript functions that can work for validation.
- Natural language for limiting what your agents can do for a more restrictive agents. For example,
  if you are using gmail, you can simply say 'No billing info allowed in emails' and waterlock takes
  care of working with you.
- You own the integration logic. With workos, you are really coupled to their infra. This provides a
  more variable approach to integration.
- You own the ai layer, use ai-sdk, direct Anthropic's ai is fine as well. Waterlock just works.

## Navigate

- [Install](Install)
- [Quickstart](Quickstart)
- [Actions](Actions): how calls map to rules (Discovery, OpenAPI, GraphQL)
- [Policies](Policies) · [Credentials](Credentials)
- Providers: [Gmail](Gmail) · [Linear](Linear)
