# Brief: places in the sim (buying, rethought, part 13a)

## Goal and what it may touch

- Phase 5 step 13a of `docs/ROADMAP.md`, the first build part of **buying, rethought**: the owner's decision (`docs/decisions/ADR-2026-10-13-buying-a-growing-network.md`) as designed in `docs/design/buying.md` (mockups at https://kylelookingaround.github.io/the-commute/design/buying/). Read the design in full first; its **Build plan**, item 1, is this brief's scope, and where this brief is silent the design wins.
- **What it delivers:** everything the player buys becomes a **place** in the sim, offered by **touching**, while nothing on screen changes and the game plays exactly as it does on `main`.
  - `src/sim/places.ts`: the kinds (station, section, junction, route, stop, depot), ids (`kind:name`), what comes with what, touching from the network data (the design's section 2 table), `offered(g)`, `stagesFor(place)`, `buy(g, place, stage)`.
  - **As places now:** every station; the stopper and the Hazel Grove line as routes; Stockport's carriage sidings as a depot; the three bus links as stops, moved out of `grow` into the network data with their real positions. Sections and junctions as places that come with their stations, with no stages yet (step 11 adds them).
  - **Stages:** `UPGRADES` and `LINE_UPGRADES` in `src/sim/sim.ts` re-expressed as stages of the places the design puts them on (section 4): station stages on stations; Extra unit, Longer trains and Faster timetable on the stopper; Spare unit on the sidings. **Keep today's prices, prerequisites and effects exactly**; the folds (the kiosk into the booking office and the rest) are part 13d, not this one.
  - **Buying by touching:** stations are offered when they touch an owned place and their real `needs` are met (Davenport still waits on Stockport's platforms 0, 1 and 2), not strictly in order up the line.
  - **The save:** `places` (the design's section 9) replaces `owned`, `ups` and `line`; raise `SAVE_VERSION`. Station running state (`st`, `homes`) stays in arrays by index, as the design says.
  - **The bot:** the design's section 8 rule (save for the offered station that brings most homes and draw per pound, building what it waits on first), which gives today's order exactly. It calls the new buys and fingerprints the same fields.
  - **The view keeps working unchanged:** the panels, the strip and the map read ownership and stages through a thin adapter over `places` where they need one, so the screens look and behave as before. The new card and the Places row are parts 13b and 13c; don't start them.
- **Proof that play is unchanged:** the bot's `PLAY` on seeds 1-3 identical to a build of the `main` you rebase onto, apart from the save version's part of the fingerprint (show it with the version held, as the graph's commits did), and every check group that reads ownership green: `preview`, `line`, `layout`, `reach`, `saves`, `contract`, `trouble`, `bot` at least. New tests: touching (Stockport offers Heaton Chapel and Davenport; Davenport waits on its need; Middlewood once Hazel Grove is owned, Ashburys once Ardwick is, if those lines have landed), needs, what comes with what, and the save round trip.
- **Run in a quiet window.** This changes what other files call, so it starts once the Buxton line and the Marple line sessions have landed their stations and services, and no other session is changing `src/sim/` while it runs (the coordinator playbook, section 5). Pull before you start and include every station and service on `main` then.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`. Before a push, run `npm run rules`, `npm test` and the check groups above, not the whole suite: the Publish workflow runs all of it in four shards, and you confirm that run is green. Run `git status` and stage paths by name before each commit. Land it in two pushes if that's safer: places and the adapter with the old save, then the save's new shape.
- Files it may touch: `src/sim/` (`places.ts` new, `sim.ts`, `save.ts`, `contract.ts` where it reads ownership), `src/data/network.json` (bus links to stops, place ids where needed), the view only where it reads `owned`, `ups` or `line` and needs the adapter (`src/ui/`, `src/render/stations.ts` and the like), `test/`, `tools/bot.mjs`, `tools/checks/` (only where a check reads the old save fields), `docs/DESIGN.md` (the loop, Save, and a new short section on places), `docs/ROADMAP.md` (step 13a's state).

## Read first

- The project notes (`CLAUDE.md`), `docs/design/buying.md` in full, the two decision records (`ADR-2026-10-13-buying-a-growing-network.md`, `ADR-2026-10-13-all-public-transport.md`), `docs/DESIGN.md` (the loop, stations growing from a halt, car parks and bus links, contract renewal, Save), `.claude/skills/balance/SKILL.md`.
- `src/sim/sim.ts` (`UPGRADES`, `LINE_UPGRADES`, buying, `needs`, `lineReady`), `src/sim/save.ts`, `src/sim/contract.ts`, `tools/bot.mjs`.

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second.
- The game plays and looks exactly as on `main`: `PLAY` identical as above, every screen the same.
- Everything bought shows on the map; locked stations stand fogged with their price; everything else locked is hidden. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and its check groups pass, with the bot's fingerprints in the commit message, then confirms the "Publish to GitHub Pages" run for its commit is green, all four check shards and the report job included, or fixes it in the next push.

## What's left for others

- Parts 13b (one card), 13c (finding places), 13d (the folds) and 13e (Strain) each get their own brief from the coordinator, in that order.
- The line between stations (step 11) adds sections' stages; buses as a network (step 12) adds bus routes and stops beyond the three bus links.
- List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the design's recommendation, or the option that changes the game less, and say so in the commit message.

## Cost budget

- Estimate: about $30 (a new sim module, every upgrade re-expressed, the save's new shape, the bot's choice, an adapter for the view, and tests).
- Past twice the estimate: say why in the commit message and stop at the part you're on, leaving `main` playable.
