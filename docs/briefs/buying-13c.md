# Brief: finding places (buying, rethought, part 13c)

## Goal and what it may touch

- Phase 5 step 13c of `docs/ROADMAP.md`, from `docs/design/buying.md` (sections 3 and 7 and the Build plan, item 3), the pick-up list's item 5 (`docs/briefs/pick-up.md`). Where this brief is silent, the design wins.
- **What it delivers:** the player finds every place they own or are offered without the Station | Line switch or a station-only strip.
  - **The Places row** replaces the strip: a chip for each place owned or offered (name, its figure, or a fogged price with the meter on offered ones), in network order: each line out from Stockport, its stop after its station, the services and the sidings after the stations they serve. With one mode (rail) there's no kind filter yet; it comes with the first bus route.
  - **Raised to full**, the sheet lists the same places grouped by kind (Stations, Train services, Bus stops, Depots) with their figures, below the open card.
  - **Next to** on every card: a chip for each touching place, owned (its figure) or offered (fogged, its price); a tap flies there and opens it. Sections and junctions aren't listed until they have stages (step 11).
  - **The bus stop moves to the map:** it's no longer a stage card on its station's card. Once its station is owned, an offered stop shows on its station's Next to and in the Places row with its price, and its card has Buy. Nothing locked shows at a station the player doesn't own.
  - **Fog and price on the map:** offered stations' names carry the bright price pill with a meter of how near the cash is; stations further out keep a dim price, shown only near the camera (open question 2).
  - **Edge markers** for up to three offered places off the open map, nearest first (stations and stops).
- **Not in this part:** the folds (13d), Strain (13e), sections' and junctions' stages (step 11). No sim change.
- **Budget:** the script before the first frame is at about 448 of 450 KB. Make room before adding: load what isn't needed for the first frame (the settings sheet, the save files' wiring, the full list) when it's first opened, or trim elsewhere, and say what in the commit message.
- Prototype phase: push straight to `main` after `git pull --rebase origin main`, with `npm run rules`, `npm test` and the check groups it touches green here (`layout`, `places`, `preview`, `line`, `reach`, `contract`, `access`, `perf`), then confirm the Publish run.
- Files it may touch (the pick-up's file split, `docs/briefs/pick-up.md` item 5a: the real-scale session owns `src/render/`, the kits, the offsets in `network.json`, `src/sim/layout.ts`, `tools/` and the tiles): `src/ui/` (`panel.ts`, `edges.ts`, a new module for the row and the list if that splits it well, styles), `index.html`, `src/main.ts` (labels, edge markers, lazy imports), `src/sim/places.ts` and `src/sim/sim.ts` only to drop `bus` from a station's visible stages (the bot buys stops through `Sim.buy` and its `PLAY` must not move), and of `tools/` only buying's own check groups (`places`, `layout`, and any that buys a bus link from a station's card) and `tools/reveal.mjs`, as told to the coordinator; `docs/DESIGN.md`, `docs/ROADMAP.md`, `docs/UX-REVIEW.md`. Anything in `src/render/` goes to the coordinator first.

## Read first

- The project notes (`CLAUDE.md`), `docs/design/buying.md` (sections 2, 3, 7), `docs/DESIGN.md` (the interface), `docs/briefs/buying-13b.md`.
- `src/ui/panel.ts`, `src/ui/edges.ts`, `src/main.ts` (labels, edge markers), `src/sim/places.ts` (`touching`, `offered`).

## What it must keep

- The sim stays pure and seeded; the bot's `PLAY` on seeds 1–3 is identical to `main` (no economy change).
- Everything bought shows on the map; locked stations are the one fogged thing, everything else locked is hidden: no stop shows at a station not owned, no stage that can't be built yet.
- Phones from 320 px, landscape, tablet and desktop. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` (prototype phase) once its rules, tests and check groups pass, then confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push, and reports to the coordinator.

## What's left for others

- Parts 13d (the folds) and 13e (Strain), in that order, each its own brief.

## When to stop and ask

- Only for something irreversible or outside this brief.
- Otherwise, where a call is the owner's, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $30 (the row and the list, Next to, the stop's move to the map, prices in the fog, edge markers for places, and room under the first frame's budget).
- Past twice the estimate: say why in the commit message and leave the full list or the dim prices to part 13e's session.
