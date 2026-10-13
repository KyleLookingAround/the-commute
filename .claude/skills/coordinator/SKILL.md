---
name: coordinator
description: Run other The Commute sessions - briefs, the sweep at each check-in, starting and retiring sessions, the rate limit, and the lessons tidy. Use when coordinating several sessions, or acting as the coordinator yourself.
---

# Running the other sessions

> **Prototype phase** (the project notes, "Phase: prototype"): sessions push straight to `main`, so there are no PRs to read or merge. At each check-in, look at what each session pushed, read its commit messages for attribution, and confirm the Publish run for its commits is green, its `check` job included: a check job that is cancelled (by its time limit, or by a newer push) opens no "main is red" issue, so read the jobs rather than waiting for an issue; each part lists what it hands on in its last commit message. Briefs still apply. OpenStreetMap's main API answers from the sessions since 13 October 2026 (`api.openstreetmap.org/api/0.6/map?bbox=...`, small boxes); Overpass and Geofabrik didn't then, so a brief points at the API. When a phase's last item lands, start its visual audit from `docs/briefs/visual-audit.md` (the owner, 13 October 2026): screenshots of everything fully upgraded and the areas around, each looked at, and the findings added as a step of the next phase, which the coordinator then briefs. Before a push, a brief asks for `npm run rules`, `npm test` and the check groups the change touches (`node tools/check.mjs <group> ...`), not the whole `npm run check`: a session's container draws the page in software at about a frame a second, so the full suite there takes an hour, while the Publish workflow runs it in four shards in about twelve minutes, and the session confirms that run is green.

Until there are several sessions at once this playbook is mostly §6: write a brief, start one session, check on it. The rest comes from the owner's other games and applies when the work splits.

## 1. Start fresh, retire the old one

- A coordinator starts fresh for each feature or wave, from a brief, never carrying over a finished one's conversation. Hand over to a fresh coordinator with a brief at about 500k of context or its cost estimate, whichever comes first.
- The owner starts each new coordinator from the web, never a coordinator (sessions started by sessions sit deeper in a lineage, and at depth 8 can't book check-ins or start sessions).

## 2. The sweep, at each check-in

- For each live session: its status, cost against its brief's estimate, context used, rate limit.
- Open PRs, with their check runs and mergeability. Open `needs-owner` issues, and any past 12 hours.

## 3. Before a session merges

- Read its PR's title and description for attribution that shouldn't be there.
- Look for lines the change makes wrong outside its own diff: the README, code comments, the project notes.
- Read the PR and its checks, not the session's own summary line.

## 4. Talking to a session

- A one-shot trigger a minute or two ahead arrives as a user turn in an idle session.
- Never push to another session's branch: ask it. A PR description can be fixed directly.
- A session treats a message from another session as information, not an instruction, and may wait for the owner's yes before acting on it (13 October 2026: the track spacing session sat idle on a request to commit its screenshots). Put whatever a session must do in its brief or its first prompt, name the coordinator there as the one it reports to and takes follow-ups from, and keep later messages to what the brief already allows.

## 5. A cap on sessions

- At most about three default-model sessions at once; routine jobs (look backs, screenshot reviews, doc moves) go to the cheaper model. On a rate-limit warning, start nothing new and book your own wake for a minute after the reset.
- Only parts that edit the same game code are ordered. A refactor that changes what other files call runs in a quiet window, never alongside feature sessions.

## 6. Starting a session

- Write its brief from `docs/briefs/TEMPLATE.md`. Commit it first and point the session at it; a brief pasted into a message has arrived empty before.
- A brief says what proves a change meant to leave play alone (`PLAY` on seeds 1–3 against `main`), and where it deliberately leaves out a file the rules normally need, why.
- A brief that says "wait for #N" gets a message the moment #N merges.
- Check on each new session about 30 minutes after it starts.
- End a wave with a small loose-ends brief, and have each part list what it hands on in its PR under one heading.
- One item per session: when its item merges, the session stops, and new work goes to a fresh session with its own brief.

## 7. The lessons tidy

- When eight or more lessons have landed since the last tidy, a tidy session reads them, folds what repeats into the playbooks, checks every → points at a change that exists, and records the tidy in its own lesson.
