# Brief: the real main roads on today's map

## Goal and what it may touch

These are the road parts of roadmap phase 5 steps 8 and 9, on today's map only (depth before breadth). The station surroundings work has finished and handed `roads` on. Gridlock's cars (`src/render/traffic.ts`, G3) run on stand-in roads today, so real roads make the jams real too.

1. **The A6** along its real course beside the line the whole way: Hazel Grove, Stockport's Wellington Road high over Mersey Square, Heaton Chapel, Levenshulme, Longsight and Ardwick to London Road at Piccadilly.
   - Take it from OpenStreetMap's main API, with its junctions, lanes and bridges.
   - It replaces the straight stand-in roads wherever they run on the A6.
   - Line it with its real buildings where the real surroundings don't already stand. The photo library's `areas` folders have the terraces, shops and pubs, Levenshulme's market, and Stockport Town Hall and the offices by the station.
2. **The main roads round today's lines**, each along its real course with its junctions and bridges:
   - the M60 round Stockport (today a straight stand-in under the viaduct), with its junctions at Stockport (J1) and Portwood (J27)
   - the A57 Hyde Road
   - the A560 and A626 out to Bredbury and Marple
   - the A5145 through Didsbury where today's map reaches it

   Roads that belong to paused lines (the A555, the M56, the A34) wait.
3. **The traffic follows.** Move `src/data/traffic.json`'s stretch points onto the real roads, so gridlock's cars and wash sit on them. The counts and capacities stay as G1 set them. Draw the A5145 and A57 stretches that G3 left out for want of a road.
4. **A check:**
   - each main road joins at its real junctions
   - no road crosses the line at rail level where the real one bridges it
   - the landmarks and surroundings groups still pass

**Not in this brief:**
- the 192 as a bus route
- car parks and bus links reading drive times from the real roads

Both change the sim and come later, with the feeder buses (step 21) and after gridlock G2. `PLAY` must stay identical on seeds 1–3. Replacement buses reading the real roads may move a seed; if one does, say what moves.

**Files:**
- `roads` in `src/data/network.json`
- the geometry, not the counts, in `src/data/traffic.json`
- `tools/osm-to-roads.mjs`
- where `src/render/` lays roads, the street wash and buildings along them
- the new check
- `docs/DESIGN.md`

## Running alongside

| Session | Brief | Owns |
| --- | --- | --- |
| Gridlock G2 | `docs/briefs/gridlock-build.md` | `src/sim/`, `starts`, `tools/bot.mjs`, `tools/baseline.json`, the Reopen wording, and a shutter part in Stockport's kit |
| Budgets | `docs/briefs/budgets.md` | the perf, terrain and world checks, `tools/check.mjs`, the workflows, the stats view, and the ground cover in `src/render/buildings.ts` |
| Ideas | `docs/briefs/ideas.md` | `docs/ideas/`, `docs/ROADMAP.md` |

Keep to your files, and run `git pull --rebase origin main` before every push.

## Read first

- The project notes (`CLAUDE.md`)
- `docs/briefs/station-surroundings.md` and `docs/briefs/real-surroundings.md`, with their Handed on sections
- `docs/design/gridlock.md` §3
- `src/data/traffic.json`'s notes

## What it must keep

- Real places and real layouts, with a `note` where something is from memory.
- Every perf budget.
- Phones from 320 px. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

Push straight to `main`, a road at a time. Confirm each Check main run, and send the coordinator a few lines and before-and-after shots of Mersey Square and the M60 under the viaduct, committed under `docs/briefs/main-roads/`.

## When to stop and ask

The owner has said not to wait. Follow the real road, say so in the commit, and carry on.

## Cost budget

About $35. At about 450k of context, stop after a road and add a "## Handed on" section here.

## Handed on

14 October 2026. On `main`: 75c5e60 (the programs fix), 7b6223b (the roads), 3b7afd6 (the shots), 0a56409 (the checks brought up to the jammed opening), and the commit with this section.

What landed, all of the brief's four parts on today's map:
- **The roads.** These come from OpenStreetMap's main API by `node tools/osm-to-roads.mjs --main <id> [--write]`, into `mainRoads` in the network data, and are drawn by `src/render/mainroads.ts` (`docs/DESIGN.md`, The car):
  - the A6 from Hazel Grove to London Road at Piccadilly
  - the M60 from Heaton Mersey past J1 (the Pyramid roundabout) and under the viaduct to J27 (Portwood)
  - the A5145 from Heaton Mersey to Travis Brow
  - the A57 from Ardwick Green to Belle Vue
  - the A560 from J1 through the town and Portwood to Bredbury
  - the A626 from Portwood to Marple

  Each road comes with its carriageways, lanes, one-ways, bridges, slip roads, roundabouts and named junctions. The tool's `mainRoads()` lists each road's ends, box and junctions; add a road there.
- **Bridges and underpasses.** No main road crosses a line at grade: off a bridge, a road dips under the line (4.6 m headroom); on a bridge, the deck clears the rail by 5.2 m. Wellington Road stands on its deck over Mersey Square, and buses drive over it there.
- **What gave way.** The old M60 landmark and the straight stand-in roads within 160 m of a real road are gone. The buses' roads aren't drawn where they share a carriageway with a main road.
- **Buildings.** The real buildings already stand along all of it except 2.3 km of the A626 through Offerton, which is outside the world squares (`2_0`, `3_0`, `3_1`), so no stand-ins were added there.
- **Traffic.** `src/data/traffic.json`'s stretches carry `on`, `at` (the DfT's own count-point position, from its API) and `head` (a named junction). All 11 are drawn, the A5145 and A57 among them.
- **The check.** The `roads` group (no browser) covers junctions, crossings with the line (shown failing on a made-up level crossing) and the stretches.
- **Costs.** About 6k triangles and no new shader program (MAT.road). The roads are laid a few each frame and laid again only within 1.5 km of the camera, and traffic stops re-laying while the camera is past where cars are drawn. The entry script grew about 25 KB gzipped with the data (412 of 450 KB).
- **`PLAY`.** Identical to `main` on seeds 1–3 at each step.

Left:
- No lane markings: a texture cost the wash two programs. Paint them in the ground cover, or find room in the budget.
- The A626 through Offerton has no real buildings until its squares are fetched.
- The wide view's script time (about 0.8 s a frame at 4× throttle) was the same before the roads. It's worth a look by whoever owns perf.
- The strain 320 px tap from issue #8 didn't fail here (6 of 6 passed), so it may be a flake on CI's runner.
