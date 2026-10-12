# Brief: platforms that block, and peaks that press again

## Goal and what it may touch

- The owner asked for the peaks to be tuned so they press on the stations they buy, not only Stockport. Door-to-door demand did that (lost about 350, a third beyond Stockport), but late trains then spaced the units evenly and most of the pressure went (lost about 80, almost none beyond Stockport). Bring it back in a way the player can see and fix, so buying things relieves a real problem:
  - **Platforms that block:** one train at a platform face at a time. At a stop with one platform for its direction (a halt), a train standing there holds the one behind it outside, so a long stop at a busy halt delays the next train too; the second platform, a bay, or Stockport's platform 3 let trains pass or turn without waiting. That makes the second platform a fix for something you can see, not only "trains both ways".
  - **Peaks that press:** then tune, with the bot, so the morning and evening peaks lose people at the bought stations again, and the purchases that relieve them (the second platform, longer trains, more units, canopies, lifts) each measurably do. Use the door-to-door model's own levers (budgets, how waiting is felt, the draw of each station) before reaching for the fare.
  - **The faster timetable** can earn its keep here if it gives more recovery or shorter blocking; show it with the bot or leave it.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; a view session may be pushing too). Before a push, `npm run rules` and `npm test`.
- Files it may touch: `src/sim/`, `test/`, `tools/bot.mjs`, `tools/baseline.json`, `src/render/trains.ts` (only if a held train needs to show it, for example its brake lights), and the docs below. Not the kits, `src/render/stations.ts` or `src/ui/` (a view session owns those).

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md`, `.claude/skills/balance/SKILL.md`, phase 3 of `docs/ROADMAP.md`.
- Commits c479207 (door-to-door demand) and 97d67a6 (late trains), especially their "Handed on" lists and bot tables.

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second.
- Targets, bot on seeds 1-3 over 8 sim hours, before and after: lost back to roughly 150-300 with at least a third of it beyond Stockport (show lost per station per peak); each relieving purchase shown to cut it; the opening's milestones in their ranges; no daytime quiet stretch longer than now; trains within five minutes still the norm. Re-propose `tools/baseline.json` with its note saying why.
- Raise `SAVE_VERSION` if the save's shape changes. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once `npm run rules` and `npm test` pass and the bot's table is in the commit message; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Taxi ranks (the next phase 3 step) catch people who'd give up, so they need the pressure this brings back. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $20 (platform occupancy in the sim and a balance pass).
- Past twice the estimate: say why in the commit message and trim what's left.
