# Brief: coordinator for the rest of phase 2

## Goal and what it may touch

- Run the rest of phase 2 of `docs/ROADMAP.md` to done, short of the first release (the owner calls that): three items, each in its own fresh session with its own committed brief, then a small loose-ends session.
  1. `docs/briefs/upgrades-ui.md`: the upgrade cards, the ghost preview and stages rising when built.
  2. `docs/briefs/impacts.md`: people turning back, full trains, earning stations; and a measured report on whether the peaks bite enough.
  3. ~~`docs/briefs/managers.md`~~: dropped by the owner on 11 October 2026 (the player buys every upgrade themselves); the brief stays, on hold.
- Order: 1 and 2 can run at once (they don't share files). 3 starts when 1 has landed on `main`, and its session gets a message saying so.
- The coordinator itself writes no game code. It may touch `docs/briefs/` (a loose-ends brief at the end), `docs/ROADMAP.md` (marking items done) and nothing else.

## Read first

- The project notes (`CLAUDE.md`), `.claude/skills/coordinator/SKILL.md`, phase 2 of `docs/ROADMAP.md`, and the three briefs above.

## How to run it

- Start each item's session with `create_session` from this repository (`https://github.com/KyleLookingAround/the-commute`), its first message pointing at its brief file on `main`. At most three sessions at once, this one included.
- Prototype phase: the item sessions push straight to `main` after `npm run rules`, `npm test` and `npm run check`; there are no PRs to merge. Check each new session about 30 minutes after it starts, then every hour or so with a one-shot check-in (`send_later`): its status, what it has pushed, whether the Publish run for its commits is green, and its cost against its brief.
- If a Publish run goes red, the session that pushed fixes it in its next push; if that session has stopped, start a small fix session with a brief.
- When an item's work is on `main` and green, that session stops; archive it. New work goes to a fresh session with its own brief.
- At the end: a loose-ends brief for anything the three left (each says what it hands on in its last commit message), then mark phase 2's items done in the roadmap and tell the owner, in this session, what landed and what's waiting on them.

## What it must keep

- Each brief's "what it must keep", in particular `PLAY` identical to `main` for the two view items and for the managers' refactor.
- Commits authored KyleLookingAround <KyleMck10@hotmail.com>, no attribution lines, no mention of the tools used.

## When to stop and ask

- Questions only the owner can answer go in a `needs-owner` issue with a default, taken after 12 hours. Never cut the first release; never change the economy beyond the baselines without the owner.

## Cost budget

- Estimate: about $10 for this session, plus the items' own ($25, $15 and $25) and up to $10 for loose ends.
- Past twice the estimate: stop starting new work and tell the owner.
