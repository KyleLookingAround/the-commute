# Brief: Piccadilly's throat, and Stockport's crossover ladder

## Goal and what it may touch

- The pick-up list's item 8 (`docs/briefs/pick-up.md`, the coordinator, 13 October 2026): re-lay Manchester Piccadilly's throat from OpenStreetMap, as Stockport's was (bb2d83e), so it keeps the track layout rule (`docs/DESIGN.md`, Where the tracks run) and the layout test's pending list (`test/layout.test.ts`) empties. Today its twelve platforms' rails fan in long diagonals across the main lines, and the up slow and the fast lines swing across the down slow on the flat to reach platforms 5 and 6.
- **What it delivers:**
  - **The four main lines keep their order into the station** (west to east the down slow, down fast, up fast, up slow, as from Stockport), each fanning to its own platform line through the throat, no faster than 1 in 6 and clear of the islands: the down slow stays at platform 5 (the stopper's, the halt's), the fast lines run into platforms 4 and 3, the up slow into 2.
  - **The bays leave the outer tracks at turnouts**, crossing none: platforms 6 to 12 off the down slow westwards in one fanned lead, as OpenStreetMap's west throat is; platform 1 off the up slow eastwards. Their kit rails follow the same paths. Platforms 13 and 14's scenery rails leave west of them.
  - **Crossovers drawn with their rails** (Stockport's handed-on ladder, and Piccadilly's the same way): where a train is drawn crossing from its own track to its platform's (a stopper coming into Stockport's 4 or 3 on the up slow; at Piccadilly the stopper leaving platform 5 on the up slow, the expresses into 6 and 7, the Marple trains into 1 and 2), the map draws ballast and rails along the very path the trains take, a ladder across the tracks between, from one shared description so they always agree. Scenery: always there, like the throat's other rails.
  - The platforms themselves, the islands, the train shed and every service's platform lists stay as they are.
- **The sim.** Track offsets don't move a stop, but the stretches where tracks move (`Network.sections`) decide where signals may stand, so the blocks near Piccadilly may change. Run the bot on seeds 1–3 at 8 and 16 sim hours against `main` and put the table in the commit, saying what moves and why.
- **Taken as changing the game less (the owner's calls, said in the commit):** the Marple trains stay on the slow lines from Ardwick Junction, joining them on the flat, rather than running on their own pair into platforms 1 to 4 as the real Hope Valley lines do; every service keeps the platforms it uses today.
- Prototype phase: push straight to `main` after `git pull --rebase origin main`, with `npm run rules`, `npm test`, the bot, and the check groups it touches (`geometry`, `kits`, `signals`, `line`, `perf`) passing, then confirm the Publish run.
- Files it may touch: `src/data/network.json` (Piccadilly's layout entries and platform paths), `src/data/kits/piccadilly.json` (its rails and note), `src/sim/layout.ts` and `src/sim/network.ts` only if the rule needs a fix, `src/render/` (the crossovers' rails, the trains' crossover path), `test/layout.test.ts` and `test/` as the rule needs, `tools/checks/` for a check on the crossovers, `docs/DESIGN.md`, `docs/ROADMAP.md`.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (Where the tracks run; Trains), bb2d83e's commit message (Stockport's re-lay and what it handed on).
- `src/sim/layout.ts`, `src/sim/network.ts` (`offsetAt`, `sections`, `deck`), `src/render/trains.ts` (`eased`, `berthsOf`), `src/render/world.ts` (the tracks' ribbons).
- OpenStreetMap's tracks round Piccadilly, from the main API (git-ignored, in `data/raw/`).

## What it must keep

- The sim stays pure and seeded. No economy change: `PLAY` may move only by where signals can stand, and the commit says by how much.
- Everything bought shows on the map; locked stations are the one fogged thing, everything else locked is hidden.
- The perf group's budgets (the opening 450,000 triangles, the busy save 550,000, the script before the first frame 450 KB): measure before and after.
- Phones from 320 px, landscape, tablet and desktop. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` (prototype phase) once its rules, tests, bot run and check groups pass, then confirms the "Publish to GitHub Pages" run for its commit is green on all four shards, or fixes it in the next push, and reports to the coordinator.

## What's left for others

- The Marple trains on their own lines into platforms 1 to 4 (the owner's call), platforms 13 and 14 in service (phase 6), the flyover's own tracks, the viaduct deck's steps where Stockport's throat fans.

## When to stop and ask

- Only for something irreversible or outside this brief.
- Otherwise, where a call is the owner's, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $20 (one station's layout data, the crossovers' rails, a bot run).
- Past twice the estimate: say why in the commit message and leave the crossovers' rails to a follow-up.
