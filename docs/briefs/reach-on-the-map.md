# Brief: the reach on the map

## Goal and what it may touch

- Phase 3 step 1 of `docs/ROADMAP.md`: make door-to-door demand visible. People travel when the whole trip fits about 30 minutes each way (Marchetti's constant); show who that is, on the map, and how buying things widens it.
  - **The reach:** a soft glow on the ground round each owned station over the homes from which the trip to where people are going (Piccadilly for most) fits the budget: the walk to the station plus the wait and the ride. Work it from the sim's journey times (`Sim.journey(i, j)`, `Sim.tripRates`, from commit c479207, and the wait from the timetable), so a station with a long wait or a slow ride has a small glow and a busy, quick one a wide glow. A locked station has none.
  - **It grows when you buy:** an upgrade that saves minutes (an extra unit, the faster timetable, the way across, lifts) visibly widens the glow, easing out over about a second, at once with reduced motion. The card's preview shows the wider reach as a ghost ring before you buy.
  - **A view you can switch on:** a control with the stage's others shades the ground by minutes to Manchester (a few soft bands, a legend in minutes), for players who want the detail; off by default.
  - **Cards in homes and minutes:** where an upgrade saves minutes, its card says so concisely ("4 min less walk for about 1,200 homes"), from the sim.
- View only: read the sim, never change it. Cosmetic, instanced or one shader; no per-frame allocations; refreshed when what it depends on changes, not every frame.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; a sim session is changing the station data at the same time). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page, and look at `npm run shots`.
- Files it may touch: a new `src/render/reach.ts`, `src/render/world.ts` (the ground), `src/render/stations.ts` only for the preview ring (small), `src/render/palette.ts` and `src/ui/styles/tokens.css`, `src/ui/panel.ts` (card text), `index.html` (the stage control only), `src/main.ts` (wiring), `tools/checks/` and the docs below. Not `src/sim/` or `src/data/`.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (door-to-door demand, the preview and the rise), phase 3 of `docs/ROADMAP.md`.
- Commit c479207 ("Drive demand from door-to-door journey times") and its "Handed on" list; `src/sim/journeys.ts`.

## What it must keep

- No economy change: the bot's `PLAY` on seeds 1-3 identical to `main` at the commit you started from (compare in a worktree; the census session changes `main` meanwhile).
- Colourful, not clinical: a warm daylight glow on a model railway, not a heat map; legible on phones from 320 px. Colours as tokens; UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and it has looked at the shots, including the glow growing on a purchase and the minutes view on a phone; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Homes that grow (phase 3 step 7) will fill the reach with new houses; leave the reach easy for it to read. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where unclear, take the safer option, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $15 (a ground effect from the sim's journey times, a toggle, card text and a check).
- Past twice the estimate: say why in the commit message and trim what's left.
