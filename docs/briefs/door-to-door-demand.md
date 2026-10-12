# Brief: door-to-door demand (tuning the peaks)

## Goal and what it may touch

- The owner's answer to issue #2: tune the peaks so they press on the bought stations too, not only on Stockport's full platform. Do it from first principles rather than by nudging numbers: passengers travel when the whole journey fits a time budget (Marchetti's constant: people spend about an hour a day travelling, roughly 30 minutes each way, and travel further when transport gets faster).
- The model, to shape as the bot shows works:
  - **Door-to-door time** for each pair of stations: the walk to the station, the wait (about half the gap between trains going that way, from the units in service and where they run), the time on the train (distance at line speed plus a dwell per stop between), a penalty for changing at Stockport, and the walk at the far end.
  - **Time as people feel it:** waiting and walking count for more than riding (UK appraisal practice weights them about twice), and standing on a crowded train counts for more again.
  - **Demand:** trips from each station to each other station come from the homes at one end (the station's `catchment` as population, for now), what draws people at the other (Piccadilly most), the hour's demand curve, and a smooth fall-off around the budget. No hard cut-off: about 30 minutes each way on average, some people travelling further.
  - **Upgrades as minutes saved** where that's what they really do: the way across and lifts cut the walk for the far side, a canopy makes the wait feel shorter, more units cut the wait, the faster timetable cuts the ride. Update each upgrade's `desc` to say what it now does, concisely.
  - **Patience as the budget left:** someone gives up when their wait has used up what's left of their budget, so long waits at halts with one train each way bite there too.
- Measure the budget in sim seconds (trains move at real speed), not on the game clock, which runs six times faster. `TUNING.patience` already works this way.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; another session may be pushing view work). One commit per change, plain message. Before a push, `npm run rules` and `npm test`; `npm run check` when you've touched the page.
- Files it may touch: `src/sim/` (sim.ts, types.ts, save.ts and new files there), `src/data/network.json` (per-station numbers such as walk times, if the model needs them, each with a `note` where it's from memory), `test/`, `tools/bot.mjs` (only if the policy needs to know something new), `tools/baseline.json`, `src/ui/panel.ts` only for upgrade text that the sim doesn't already supply, and the docs below. Not `src/render/` (another session is working on the line's look).

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (the economy, halts and stages), `.claude/skills/balance/SKILL.md`, and phase 2 of `docs/ROADMAP.md` ("Pressure that bites").
- Issue #2 (closed) for the measurement it answers: 205 lost of 4,734 over 8 sim hours on seeds 1-3, all at Stockport's full platform.
- `src/sim/sim.ts`: `generate`, `northShare`, `enqueue`, `expire`, `demandCurve` and `TUNING`.

## What it must keep

- The sim stays pure and seeded; the same seed gives the same game. Precompute journey times when what they depend on changes (a purchase, units in service), not every tick: the bot runs 8 sim hours in under a second and should stay fast.
- Economy change is agreed by the owner. Targets, judged with the bot on seeds 1-3 over 8 sim hours, before and after:
  - Lost spread beyond Stockport: report lost per station at each peak, before and after.
  - The opening still moves: Heaton Chapel bought within the first sim hour, and no daytime quiet stretch longer than today's.
  - The faster timetable and extra units now bring passengers, not only room: show it in the measures.
  - Re-propose `tools/baseline.json` ranges and its note with the reasons, and update the balance playbook's table.
- Everything bought shows on the map (no new purchases here). Raise `SAVE_VERSION` if the save's shape changes.
- UK English, concise text.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once `npm run rules` and `npm test` pass and the bot's before-and-after table is in the commit message; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Showing the reach on the map (a glow round each station of who lives within 30 minutes), real census population and jobs, and homes that grow where you've brought places within reach: later roadmap steps. Name what you'd hand them in your last commit message under "Handed on".
- The faster timetable's look on the map is `docs/briefs/timetable-on-the-map.md`.

## When to stop and ask

- The owner has said not to wait on them. Where a choice is theirs, take the option that changes the game less or is easier to undo, say so in the commit message, and carry on; open a `needs-owner` issue only as a record.
- Stop only for something irreversible or outside this brief.

## Cost budget

- Estimate: about $30 (a demand model in the sim, proved and tuned with the bot).
- Past twice the estimate: say why in the commit message and trim what's left.
