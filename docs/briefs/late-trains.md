# Brief: late trains

## Goal and what it may touch

- Phase 3 step 2 of `docs/ROADMAP.md`: a long stop at a busy platform makes a train late, and the lateness carries down the line. Today every stop is a fixed 45 s (`TUNING.dwell`) and nothing runs to a timetable, so nothing can be late. Give trains a timetable to be late against, and let busy stops overrun it:
  - **A timetable:** each unit's planned departures from each stop, from the line's running times, the planned dwell and its turnaround at each end; the gap between units even. Recovery time at the termini lets a late train catch up when it turns round.
  - **Stops that overrun:** a train stays while people are still getting on and off (up to a sensible limit, so a train never sits for ever), so a crowded platform holds it and it leaves late.
  - **Lateness that spreads:** a late train finds more people waiting at its next stops (the gap ahead of it is longer), so it gets later and the one behind it emptier: trains bunch at the peaks. Passengers' budgets (the door-to-door demand's patience) run down while they wait, so a late train costs people at every stop.
  - **What eases it:** extra units shorten the gaps, the second platform lets a train stand without blocking the one behind where that applies, the faster timetable gives more recovery, longer trains board quicker. Show it with the bot.
- **On the map, not in text:** a late train shows it (for example amber marker lights or a small amber lamp over the cab, growing as it gets later; on time looks as now), and the crowd on a platform waiting for it builds visibly as it already does. Departure boards come later (phase 4), so leave the sim's lateness easy to read for them.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; a view session may be pushing too). Before a push, `npm run rules` and `npm test`; `npm run check` if you touched the page.
- Files it may touch: `src/sim/` (sim.ts, journeys.ts, types.ts, save.ts and new files), `test/`, `tools/bot.mjs` (add measures: lost per station per peak, which the last balance pass needed, and how late trains run, such as the share within five minutes and the worst at each peak), `tools/baseline.json`, `src/render/trains.ts` (the late marker only), `src/render/palette.ts` and `src/ui/styles/tokens.css` (its colour as a token), and the docs below. Not `src/render/stations.ts`, the kits or `src/ui/panel.ts` (view sessions own those).

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (trains, boarding, door-to-door demand), `.claude/skills/balance/SKILL.md`, phase 3 of `docs/ROADMAP.md`.
- Commit c479207 ("Drive demand from door-to-door journey times") for the demand model and what it handed on.
- `src/sim/sim.ts` (`board`, the train step, `TUNING`) and `src/sim/journeys.ts`.

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second.
- Economy change is agreed: bot on seeds 1-3, 8 sim hours, before and after, table in the commit message. Keep the opening's milestones in their ranges; lateness and lost may move, with the baseline re-proposed and its note saying why. No daytime quiet stretch longer than today's.
- Raise `SAVE_VERSION` if the save's shape changes. Everything bought shows on the map. UK English, tokens for colours, no per-frame allocations in the view.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once `npm run rules` and `npm test` pass and the bot's table is in the commit message; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Taxi ranks, failures and replacement buses (phase 3 steps 3 and 4) build on this; departure boards are phase 4. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on. Stop only for something irreversible or outside this brief.

## Cost budget

- Estimate: about $20 (a timetable and overrunning stops in the sim, tuned with the bot, and a marker in the view).
- Past twice the estimate: say why in the commit message and trim what's left.
