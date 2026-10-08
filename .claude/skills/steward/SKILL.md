---
name: steward
description: Drive a The Commute pull request to green and merged - reading CI failures, review comments, catching up with main, the look back and the merge. Use when watching or fixing a PR in this repo.
---

# Getting a PR to green

> **Prototype phase** (the project notes, "Phase: prototype"): push straight to `main`; the spec, brief, PR and look back here are optional until the first release. Keep the rules the build enforces, the owner's preferences and the tests.

## Checks workflow (`checks.yml`)

- It runs the rules, the sim tests, the build and the browser groups on every PR that isn't a draft, and on demand; a newer push cancels the older run. Screenshots from the `layout` group are in the `check-layout` artifact, failing or not: look at them.
- Every page is seeded, so a failure repeats locally: `npm test` for the sim, `node tools/check.mjs <group>` for a browser group.
- Fix the cause. Never skip, weaken or delete a check to get green, and never push an empty commit to re-run CI.
- GitHub runs no `pull_request` workflow while a PR's `mergeable_state` is `dirty`: a push with zero runs after a few minutes is a merge conflict with `main`.
- Push, wait for that push's run to show, and only then mark a draft ready.
- The Balance workflow puts the bot's table in its run summary; report it in the PR for an economy change.

## Check-ins, not polling

- CI takes a few minutes. Subscribe to your own PR's events once it's open, and keep one `send_later` (about 20 minutes) as the fallback. Don't poll.

## Review comments

- Small, clear asks: fix, push, reply briefly.
- Bigger asks or design questions: propose an approach to the owner before changing course.

## Catching up with `main`

- `git fetch origin main && git merge origin/main`, resolve, push. Never rebase a pushed branch or force-push.

## Before every push

- `npm run check` passes locally.
- The commit message is a plain imperative subject with no attribution lines; the commit hook enforces this.
- The PR title and description are plain and follow the template, with no tool names or editor-settings paths. The Description check enforces this; read the description back once the PR is up.

## The look back, before the PR merges

Every PR gets a short look back at the session that built it, committed into the PR before it merges. Keep it to a few minutes.

1. **Numbers.** Cost against the brief's estimate, when it started, time waiting on the owner; from the PR: pushes, red CI runs, merges from `main`.
2. **Friction.** What slowed it or needed someone else.
3. **Record it** in `docs/lessons/<pr>-<short-name>.md` (format in that folder's README).
4. **Act on it** when a lesson would have saved real time or credits, or comes up a second time: change the playbook, brief, check or tool that would have prevented it, in the same PR, marked with → and where.

## Done

Green `check`, no conflicts, every review thread answered, the look back committed. Then:

- **With a ruleset requiring `check` and "Allow auto-merge" on:** mark the PR ready, turn on auto-merge with the squash method, book one `send_later` to confirm the merge and the Pages publish, and stop.
- **Without them:** squash-merge it yourself, pinned to the head SHA you saw green, then confirm the Pages publish (it skips docs-only merges).
- Don't merge a PR that needs the owner's judgement: a balance change beyond the baselines' tolerance, or a spec question the brief doesn't settle. Say so in the PR, open a `needs-owner` issue with the default you'll take after 12 hours, and carry on with other work.
