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

## Handed on

14 October 2026, after three batches on `main` (aa1ebf1, 693f44a and the commit after it). Done: Heaton Chapel, then Ardwick, Ashburys, Reddish North, Woodsmoor and Davenport, then Levenshulme, Hazel Grove, Romiley, New Mills Newtown and Rose Hill (`docs/audits/station-surroundings.md` says what moved where). The before-and-after shots of Heaton Chapel are in `station-surroundings/`.

What's in place for the next session:
- **The check.** `tools/checks/surroundings.mjs` (no browser, a few seconds). Its `LATER` list names the stations still to fix, and it prints what it finds at them; take each station off the list as it's fixed.
- **The `road` kit part.** Streets laid on the ground, or at a point's own height over a deck, with a grass bank where they stand above the ground. They join decks, ranks and stops to the painted streets.
- **Seating.** Street-level parts and roads are seated again as fine terrain tiles arrive (`groundVersion`).
- **`tools/osm-to-roads.mjs`.** It fetches OSM's main API itself (Overpass is blocked from sessions), snaps each way out to the nearest point on a street, and `--write` replaces one entry in `roads`. Where a kit draws a bridge square to the line and the real street skews, splice the kit's deck and roads into the bus road by hand (see Heaton Chapel's and Davenport's `roads`), as `--write` puts the real skewed crossing back.

Still to do, worst first, in the audit's list:
1. Stockport's Station Road, which the world doesn't paint.
2. Middlewood's, Disley's and Marple's stops.
3. Disley's and Bredbury's car parks on real buildings.
4. The three from-memory roads south of Hazel Grove.
5. Piccadilly, once the coordinator frees its kit.

Each time:
- Take matching before-and-after shots of every station touched: one page with every station grown, moved round with `window.__view.look` after `loadBuildings()`. Comparing views on `main` and on the change is quicker than `tools/shots.mjs --stations`, which reloads the page for every view.
- Run the bot on seeds 1 to 3. `PLAY` moved only on seed 2, after Heaton Chapel's roads changed length (bccd42c0 → 9bda2595); the second and third batches left it identical to `main` as it stood (1acb5b45, 9bda2595, 4f161e42 against 693f44a). Within the baselines throughout.

Underpasses: the buses' roads still cross the railway's land at rail level where they pass under an embankment (`pathThrough` in `src/render/buses.ts` bridges only over cuttings). The terrain check now lets a road pass under the line (5425002), so the next session can let `pathThrough` run straight under the land too.


### Second session, 14 October 2026

Batches on `main` from b8e1913 to the underpass flags: Stockport, Middlewood, Disley, Marple and Bredbury, the three from-memory roads, short underpasses, then Piccadilly (`docs/audits/station-surroundings.md` says what moved where). The check's `LATER` list is empty: every station passes. The before-and-after shots of Stockport and Piccadilly are in `station-surroundings/`.

- **The check missed squares.** It read only the world's squares whose corner was within a square of a station, so it missed every street north of Stockport's middle; Station Road was painted all along. It now reads every square within 600 m.
- **Closed ways aren't painted.** A street drawn as a closed way in OpenStreetMap (Stockport's Station Road loop) simplifies to its two ends in `tools/osm-to-world.mjs`, so it's left out of the world's streets. Draw it as a kit `road`, or fix the world tool (not this brief's file).
- **Bus roads follow kit roads in.** Where a kit lays a station's approach as a `road`, the bus road's points are cut where the kit's road leaves the street and the kit's road's points follow to the stop (done by hand, as for the bridges; `tools/osm-to-roads.mjs --write` puts the 40 m resampling back).
- **Underpasses.** `pathThrough` runs a bus road straight under an embankment where the way across the railway's land is 40 m or less, or 120 m where the road's `under` stretches mark it as passing under the line (`tools/osm-to-roads.mjs --under` reads OpenStreetMap's railway bridges; run it again after redrawing a road). Each bus way carries the flags as `under`, which the `terrain` check reads.
- **The bot.** `PLAY` identical to `main`'s on seeds 1 to 3 throughout (49758878, 32fcf737, e0d9f18d).
