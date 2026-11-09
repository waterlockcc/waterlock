# waterlock

Open source solution to [workos airlock](https://workos.com/blog/workos-airlock).
Currently in beta.

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

## Guide

Install and usage: [wiki](https://github.com/waterlockcc/waterlock/wiki).

## Bug reports

Please raise issues on this repo for any bugs you find. Using AI is absolutely fine for them, just vet it yourself before raising it, please.

## New Feature/Provider Requests

If there are new providers or features that you would like to see, please raise an issue for them on the repo. I'll try to take it up on priority.
