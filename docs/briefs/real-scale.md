# Brief: the railway at real scale

## Goal and what it may touch

- **The owner's call, 13 October 2026:** draw the railway at its real width. Today everything across the line is 1.25 times real: the tracks' offsets, the kits' `v`, the railway's land, the buses' and cars' width. The trains are 1.3 times real width. The real surroundings are true to scale: OpenStreetMap's buildings, the LIDAR's trees and ground, and the bridges over the line. So every station spills a quarter wider than its real footprint and doesn't line up with what's round it. At Stockport that's 10 to 15 m, all on one side. This session takes the multiplier out, so everything across the line is 1:1, and draws the trains, buses and cars at their real width.
- **What it delivers:**
  - **Track offsets:** `src/data/network.json` drops the 1.25 from every offset, along with the layout list and its eases, and its notes say so.
  - **The kits:** every kit in `src/data/kits/` has its `v` (and anything else across the line) divided by 1.25. Rebuild a kit with `tools/osm-to-kit.mjs` where that's cleaner than scaling by hand. Each kit's `note` gets a line saying so.
  - **Vehicles:** trains drawn at real width. Buses, cars and taxis lose their 1.25 across.
  - **Tools:** every tool and check that multiplies or divides by 1.25 to convert between the game's frame and the real one loses it. That includes `tools/osm-to-world.mjs` (`--bridges`), `tools/lidar-to-terrain.mjs` (the railway's land and how far out the ground is read), `tools/osm-to-kit.mjs`, `tools/osm-to-roads.mjs`, `tools/census-to-network.mjs` and `tools/checks/`. Regenerate the terrain's base and fine tiles and the world tiles with their tools, never by hand. Rerun the real surroundings for today's line, so buildings the old wider railway land removed come back where they're clear of the real land.
  - **The layout rule:** `src/sim/layout.ts` and `docs/DESIGN.md`'s Where the tracks run keep their meaning at real scale. Rework "4.2 m apart" and "1 in 5" from first principles, as real track centres are about 3.4 to 4 m. Keep the rule passing for everything it passes today; Piccadilly's throat stays on the pending list.
  - **Tight spots:** where trains at real width now touch a platform edge or each other (an island with a narrow platform, a bay), fix that place's offsets from OpenStreetMap. Don't put a multiplier back.
- **Proof:**
  - The bot's `PLAY` on seeds 1-3 must be identical to `main`. The sim measures along the line, so nothing across should reach it. If anything does (for example walking distances on a platform), say what moves and why.
  - Every check group green, with the geometry, kits, layout, terrain, world, homes, signals, perf and camera groups run locally.
  - Before and after screenshots of Stockport, Heaton Chapel and Levenshulme from above, so the real buildings show how the stations now line up. Commit them under `docs/briefs/real-scale/`.
- **Rules for working:**
  - Run in a quiet window, the one session working.
  - Land it as one push, or as two if safer: first the data and kits, then the tools and regenerated tiles. Main must be green after each.
  - We're in the prototype phase, so push straight to `main`, after `git pull --rebase origin main`.
  - Measure the perf budgets before and after: there are fewer pixels, so they should fall.
- **Files it may touch:**
  - `src/data/network.json`, `src/data/kits/`, the terrain and world tiles (regenerated)
  - `src/render/` (wherever the 1.25 or the trains' 1.3 lives), `src/sim/layout.ts`, `src/sim/network.ts` where it reads offsets
  - `tools/`, `tools/checks/`, `test/`
  - `docs/DESIGN.md` (the station frame, Where the tracks run, the railway's land), the project notes' line on kits, the decision records that name the 1.25 (add a short line to each)

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md`: the frame, Where the tracks run, the railway's land.
- `docs/decisions/ADR-2026-10-08-network-and-kits.md` and `docs/decisions/ADR-2026-10-13-network-as-a-graph.md`.
- `src/data/network.json`'s `trackNote` and `stopNote`; `grep -rn "1\.25\|1\.3" src tools test` for every place it lives.
- `docs/briefs/pick-up.md`'s Handed on, for the budgets and the container's slow browser groups.

## What it must keep

- The sim stays pure and seeded, and `PLAY` stays identical on seeds 1–3 (see above).
- Everything bought shows on the map. Locked stations stand fogged with their price.
- Phones from 320 px, landscape, tablet and desktop. UK English.
- Every perf budget: the first-frame script (447 of 450 KB), the triangles at the opening and in the busy save, the terrain and world tile budgets.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and the groups above pass, then confirms the Publish run is green on all four shards and the report job.

## What's left for others

- Piccadilly's throat and Stockport's crossover ladder (pick-up item 8). Re-laying them is easier after this, at real scale.
- The roads (phase 5 steps 8 and 9).

## When to stop and ask

- Only for something irreversible or outside this brief. Otherwise take the option that changes the game less, and say so in the commit.

## Cost budget

- Estimate: about $35. It touches every kit, the tools and the tiles, but most of it is mechanical.

## Running alongside

The owner asked for this to start at once, alongside the pick-up session that's building buying, rethought (parts 13b to 13e: the place card, finding places, the folds, Strain). That session owns `src/ui/`, `src/sim/places.ts`, `src/sim/sim.ts` and `src/sim/save.ts`. This one owns `src/data/kits/`, the offsets in `src/data/network.json`, `src/render/` (except anything the buying card draws), `src/sim/layout.ts`, `tools/`, and the terrain and world tiles. If you need a change in the other session's files, ask the coordinator. Run `git pull --rebase origin main` before every push. The perf budgets are shared: real scale should lower the triangle count, and if it does, don't spend the room.
