# Brief: <fill: item name>

Copy this file to `docs/briefs/<short-name>.md` for every session you start and fill in each section. Give the finished brief to the new session as its first message, and commit it in that session's PR.

## Goal and what it may touch

- What the session delivers, in one or two sentences, and the branch: `feature/<fill: short-name>` from `main`, one PR.
- Files it may touch: <fill: files>. Anything else is outside the brief.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md`, then only the files this brief names.
- <fill: any spec, decision, lesson or roadmap item that matters>

## What it must keep

- The sim stays pure and seeded; the bot's `PLAY` on seeds 1–3 is identical to `main` unless this brief changes the economy, in which case: <fill: the agreed target, or "no economy change">.
- Everything bought shows on the map; locked stations are the one fogged thing, everything else locked is hidden.
- Phones from 320 px, landscape, tablet and desktop. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`).

## Who merges and when

<fill: "The session, with Squash and merge once checks are green, then confirms the Pages publish" or "The owner">

## What's left for others

<fill: what this session must not start>

## When to stop and ask

- Only for something irreversible or outside this brief.
- Otherwise, if it truly needs the owner: open an issue labelled `needs-owner` with the question and the option it will take by default, carry on, and take the default after 12 hours with no answer. Say so in the PR.
- Where it's merely unclear, take the safer option (easier to undo, or changing the game less) and say so in the PR.

## Cost budget

- Estimate: about $<fill: dollars> (<fill: why>).
- Past twice the estimate: say why in the PR and in its lesson (`docs/lessons/`), and trim or split what's left.
