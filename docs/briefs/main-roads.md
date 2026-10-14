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
