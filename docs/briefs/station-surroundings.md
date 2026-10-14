# Brief: fix what looks broken round the stations

## Goal and what it may touch

The owner, 14 October 2026, from a phone at Heaton Chapel (`station-surroundings/owner-heaton-chapel-phone.png`): "make sure to fix anything that looks broken, like the taxi ranks in the wrong places or roads around stations."

In that shot:
- **The taxi rank** stands on a raised pad on the cutting's side, beside the platform, reached by no road. Its kit entry says "from memory, placed by eye".
- **The brown roads** run into the cutting and stop at its edge.
- **The road over the overbridge** doesn't join the streets either side.

That is phase 3's leftovers meeting the real ground and the real buildings. This session fixes it everywhere on today's map: every station from Stockport to Piccadilly, the Buxton line to New Mills Newtown, and the Marple line and Rose Hill.

1. **Look first.**
   - Build, then take screenshots at platform level and from above of every station, with every upgrade bought (`tools/shots.mjs --stations`, with every square loaded: `window.__view.loadBuildings()`).
   - List what's broken, worst first, in `docs/audits/station-surroundings.md`.
   - Look for:
     - taxi ranks, car parks, bus stops and cycle racks that aren't on a road or are on a slope
     - roads that end in mid-air, run into cuttings or embankments, or miss the bridges
     - entrances with no path to them
     - anything floating or buried
     - parts that clash with the real buildings
2. **Fix from the real thing:**
   - Use OpenStreetMap's main API (where the rank, the car park and the station's access road really are), the LIDAR and `docs/reference/`.
   - Move each part to its real place, give it a road that joins the network, and sit it on the ground the terrain gives.
   - Where a part has no real counterpart, put it where one would go and keep the `note` saying so.
   - Replace "from memory" notes with their source.
3. **A check that would have caught it:** add a `surroundings` group, or extend `kits`:
   - Every taxi rank, car park, bus stop and drop-off touches a road.
   - Each sits within a small height of the ground under it.
   - Every road's ends meet another road, a bridge or the map's edge.
   - Show it failing on today's Heaton Chapel before the fix.

**Files:**
- the kits' parts for taxi ranks, car parks, bus stops, entrances and paths in `src/data/kits/`, but not Piccadilly's kit
- the `roads` list in `src/data/network.json`, and nothing else in that file
- `src/render/` where it lays roads and these parts on the ground
- `tools/osm-to-roads.mjs`, `tools/osm-to-kit.mjs` and the new check
- `docs/DESIGN.md`

The sim reads taxi ranks and car parks, so `PLAY` should stay identical on seeds 1–3. If a moved part changes a walk, say what moves.

## Running alongside

- **Services** (`docs/briefs/services.md`) owns `src/data/network.json`'s services, tracks and stations, Piccadilly's kit, the sim's services, `src/ui/` and the baselines. Leave Piccadilly until its first part (the Marple pair into 1 to 4) has landed, then ask the coordinator.
- **Budgets** owns `tools/checks/perf.mjs`, `terrain.mjs` and `world.mjs`, `tools/check.mjs`, the workflow and the stats view.
- **Gridlock G1** owns `src/sim/traffic.ts`, `src/data/traffic.json` and its test.
- In `network.json`, change only `roads`, so a rebase merges cleanly. Run `git pull --rebase origin main` before every push.

## What it must keep

- Real places and real layouts.
- Everything bought shows on the map.
- Every perf budget.
- Phones from 320 px. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

Push straight to `main`, a few stations at a time, worst first, once the rules, tests, kits, geometry, the new check and perf pass. Confirm each Publish run. Send the coordinator a few lines and the before-and-after shots for Heaton Chapel. The coordinator sends them to the owner.

## When to stop and ask

The owner has said not to wait. Follow the real place; say so in the commit.

## Cost budget

About $30. At about 450k of context, stop after a batch of stations and add a "## Handed on" section here.
