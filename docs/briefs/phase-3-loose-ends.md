# Brief: phase 3 loose ends

## Goal and what it may touch

- The sim items phase 3's sessions handed on (`docs/ROADMAP.md`, phase 3 steps 9 and 11). In order:
  1. **The expresses by the clock.** Shorter days (46a9419) left the expresses on sim-second slots (`every` and `at` in `src/sim/expresses.ts`), so a quarter fewer call in a game day than before. Move their slots to the clock through `src/sim/day.ts`: one of each every two clock hours, as many a game day as before shorter days. They run through the real day only (first and last from Wikipedia's timetable notes, about 06:00 to 23:00), so the night is quiet. The option that changes the game less is to get express £ a game day back to what it was before shorter days (about 3,000 over two game days on seeds 1-3).
  2. **Real last and first trains.** The stoppers stop after the last train, about 23:30 from Piccadilly and Stockport, and start with the first, about 05:30. The units stable overnight where they'd really stand: Stockport's sidings, Piccadilly's bays, and Hazel Grove for that line. The stations stand empty through the quick night, and the boards show the first train's time overnight (`src/render/life.ts`, one line). The timetable's even gaps (`headway`, the `ends` in `src/sim/sim.ts`) start fresh each morning, so nothing bunches at dawn. Nobody waits through the night: demand is already zero from 00:00 to 04:00, and people arriving after the last train give up as they would at a full platform (they count as lost, which is what really happens; keep it small).
  3. **A loop or bay at a halt.** Add this only if a real layout has room: a second face one way at a through station, so a train can wait while another passes, bought as a stage and shown on the map. Check against photographs and Wikipedia's track diagrams first. If no station on the line has the room, hand it on with what you found, and don't invent one.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test`, and `npm run check` since this touches the page. Run `git status` and stage paths by name before each commit, and push each numbered item as its own commit.
- Files it may touch:
  - Sim: `src/sim/expresses.ts`, `src/sim/sim.ts` (the timetable's ends, and stabling), `src/sim/day.ts` (read; add a helper if one's missing), `src/sim/types.ts`, `src/sim/save.ts` (raise `SAVE_VERSION` if the save's shape changes).
  - Data: `src/data/network.json` (express slots, first and last trains, a loop stage's name).
  - Render: `src/render/trains.ts` (units standing overnight), `src/render/life.ts` (the first train on the boards), and for item 3 one part appended to a kit and `src/render/stations.ts` to register it.
  - Tests and docs: `test/`, `tools/bot.mjs`, `tools/baseline.json`, `tools/checks/`, and the docs below.

## Read first

- The project notes (`CLAUDE.md`, the Time line), `docs/DESIGN.md` (Timetable, Platforms and Expresses, Shorter days), `.claude/skills/balance/SKILL.md`, phase 3 of `docs/ROADMAP.md`.
- Commits 2210bdf (every platform in use, expresses), 46a9419 (shorter days: `src/sim/day.ts`) and 15d3ab8 (contract renewal in the sim: a run with no perks must still play as before).

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second.
- **The economy changes on purpose.** Run the bot on seeds 1-3, 8 sim hours, before and after each item, with a table in the commit message: express £ and calls a game day, lost a game day, cash a game day, and the milestones. Also run `--runs 2`, so contract renewal's second run is still about a quarter quicker. Re-propose the baselines with a note saying why.
- Everything bought shows on the map. Real workings, with a `note` where something is a game choice. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes each item to `main` once the rules, tests and `npm run check` pass and the bot's table is in the commit message. Then it confirms the "Publish to GitHub Pages" run for its commit is green, all four check shards included, or fixes it in the next push.

## What's left for others

- Contract renewal (running) is finishing its sheet and map: `src/ui/contract.ts`, the line panel, a plaque on Stockport's kit. Its sim part has landed (`src/sim/contract.ts`).
- The line, polished (running, view only) is in `src/render/life.ts` (calling points, "Cancelled") and `trains.ts` (the spare unit driving out).
- Keep your edits in those files small and pull often. If another session raised `SAVE_VERSION` meanwhile, take the higher number plus one when you rebase.
- Phase 5's network as a graph comes after this and runs alone. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $15 (expresses moved to the clock, last and first trains with stabling, and a look at whether a loop fits).
- Past twice the estimate: say why in the commit message and stop at the item you're on.
