# Brief: real surroundings on the lines out

## Goal and what it may touch

- **What it delivers:** the real buildings, trees and ground cover along the Buxton line beyond Hazel Grove (Middlewood, Disley, New Mills Newtown), the Marple line (Ashburys to Marple) and the Rose Hill branch, as `docs/briefs/real-surroundings.md` did for today's line. Its Handed on says how: `node tools/osm-to-world.mjs --corridor 900 --from <id> --to <id>`, or `--station <id> --radius <m>`. The stand-in houses and lineside trees give way square by square. Then hedges along field edges on the open stretches, where the lines out cross fields.
- **The budget:** today's line takes 1.95 MB of the world check's 2 MB. Give the lines out a budget of their own in the world check (`tools/checks/world.mjs`), about 1.5 MB for all three, and say what they come to. The perf group's camera stands at Stockport, so the lines out shouldn't move its triangle counts much. Measure them before and after anyway. The busy save must stay under 550,000 and the opening under 450,000. The script before the first frame (447 of 450 KB) must not grow: the squares' list is the only thing in it that grows with them, so keep that list small.
- **Proof:** the world and perf groups pass, `PLAY` on seeds 1–3 is identical to `main` (nothing here touches the sim), and screenshots from above of Disley, Marple and Romiley, before and after, are committed under `docs/briefs/real-surroundings/lines-out-*`. Send the owner those shots.
- Prototype phase: push straight to `main`, after `git pull --rebase origin main`, one line at a time if that's safer.

## Running alongside

Two other sessions are working at the same time:
- **The railway at real scale** (`docs/briefs/real-scale.md`) owns `src/data/kits/`, the offsets in `network.json`, `src/render/`, `src/sim/layout.ts`, `tools/` and the terrain tiles. It will change `tools/osm-to-world.mjs`, where it clears the railway's land and places bridges, from 1.25 times real to 1:1, and then regenerate every world tile with the tool, yours included.
- **The pick-up session** owns `src/ui/` and the buying code in `src/sim/`.

**This session owns** the new world tiles for the lines out's squares (new files in `src/data/world/`), the hedges, and the world check's budget for the lines out. Don't change how `osm-to-world.mjs` clears the railway's land or places bridges; that's real scale's. Adding a hedges step to it is fine: put it in its own function and tell the coordinator, so real scale knows. If you need anything else in the other sessions' files, ask the coordinator.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (The surroundings), `docs/briefs/real-surroundings.md` with its Handed on, `tools/osm-to-world.mjs`, `tools/checks/world.mjs`.

## What it must keep

- The sim untouched; everything bought shows on the map; phones from 320 px; UK English; every perf budget.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests, the world and perf groups and the build pass, then confirms the Publish run is green.

## When to stop and ask

- Only for something irreversible or outside this brief. Otherwise take the option that changes the game less, and say so in the commit.

## Cost budget

- Estimate: about $25. The tool exists; the work is three runs, a budget, hedges and shots.

## Handed on

What landed (13 October 2026), `docs/DESIGN.md` (The surroundings):

- 63 new squares within 900 m of the Buxton line from Hazel Grove to New Mills Newtown (Middlewood, Disley), the Marple line from Ashburys and the Rose Hill branch: 1,462 KB of their own 1.5 MB budget in the `world` group. `--corridor` with `--from` and `--to` now walks the line those stations are on, so a corridor off the spine runs as the spine does. Today's 52 squares were left as they were, not rewritten.
- Hedges: `hedges()` in the tool, an `H` line each, from OSM's own and the field edges the LIDAR shows growing; 228 km on the lines out. Drawn only near the camera, in the trees' seasonal colour.
- The stand-in houses along the lines out give way to the real squares, as the spine's already did (one line in `src/render/world.ts`); the lineside trees already did.
- The perf group: a square wholly beyond the fog's far edge isn't drawn (it would be fog-coloured), so the opening stays at 438,000 triangles (439,000 before) and the busy save drops from 515,000 to 501,000. The tiles are named by their hash alone (`vite.config.ts`), so the script before the first frame stays at 447 KB with the longer list.
- Screenshots: `real-surroundings/lines-out-<station>-<size>-before.jpg` and `-after.jpg`, Disley, Marple and Romiley from above with every square loaded.

What's left:

- `tools/shots.mjs --stations` doesn't load every square before it shoots, so far squares can be missing from its shots; the ones here were taken with every square loaded (`window.__view.loadBuildings()`).
- The ground's cover keeps a 256-pixel layer a square on the GPU (about 30 MB for all 115 squares); a line out after these should halve it or page it.
- Squares beyond the 900 m band (north of Marple, the hills above Disley) keep the stand-in houses until a wider run.
