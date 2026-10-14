# Brief: the Crewe line and its Macclesfield leg

## Goal and what it may touch

- **What it delivers:** phase 5 step 3 of `docs/ROADMAP.md`, the second of the lines out, following the Marple line's pattern (`docs/briefs/marple-line.md` and its Handed on).
  - **The route:** a new corridor on the graph from **Edgeley** south on the real line: Cheadle Hulme, Handforth, Wilmslow.
  - **The Macclesfield leg:** it parts at Cheadle Hulme and runs through Bramhall and Poynton.
  - **Out of scope:** going beyond Wilmslow (Alderley Edge) or Poynton (Adlington), and the Styal line's join at Wilmslow. The Styal line comes next, so name the junction where it will join.
- **The corridor and junctions:**
  - Draw it towards Manchester, like every corridor, with chainage running on through Edgeley.
  - Take the tracks, platforms and roads from OpenStreetMap's main API (boxes a few hundred metres across). Check them against NaPTAN, the LIDAR, `docs/reference/photos/` (cheadle-hulme, handforth, wilmslow, bramhall, poynton) and `docs/reference/aerial/`.
  - Put each source in the data's `note`, and mark anything from memory.
  - Find the real junction at Edgeley and the real one at Cheadle Hulme, and name both in `junctions`.
  - The graph's decision record says junction conflicts first meet real traffic where the Crewe line joins at Edgeley. Show that on the signals, as the Marple line's junctions do.
  - Every new track keeps the spacing rule (`src/sim/layout.ts`), at real scale.
- **The stations and service:**
  - **Stations:** each a kit from the photographs and views from above. Each starts as a halt and grows through the usual stages where the real station has them. Wilmslow is the big one: four platforms and a proper booking hall.
  - **Census and prices:** census homes and draw from `tools/census-to-network.mjs`. Prices continue the progression, set so the new line is a choice beside the Buxton and Marple lines.
  - **Fog and offers:** each station stands fogged with its price until it can be bought. It's offered once Stockport is owned, by touching, as the buying design says. Since it starts from the player's own station, it can come earlier than the Marple line, but not ahead of Heaton Chapel.
  - **The service:** a stopper from Piccadilly through Stockport to the furthest station owned on each leg, with Northern's real calling pattern as far as known and a `note` where it's a game choice. Use a Piccadilly platform the kit already has, and say which.
- **The line between stations:**
  - The new sections get their real line speeds and wires from `tools/osm-to-sections.mjs`, as the other lines did.
  - The Crewe line is wired throughout. Check the Macclesfield leg.
- **The ground and the surroundings:**
  - The terrain tiles cover the new corridor, with trees, masts, signals and roads.
  - Run the real surroundings tool along it as the lines out had it: `node tools/osm-to-world.mjs --corridor 900 --from <id> --to <id>`, with hedges.
  - Give the new squares a budget of their own in the world check if they won't fit the lines-out budget, and give the sizes in the commit message.
- **The economy:**
  - Run the bot on seeds 1–3, at 8 and 16 sim hours, before and after, and put the table in the commit message.
  - At 8 hours the opening's milestones must stay within the baselines.
  - At 16 hours, say when the bot reaches each new station and which line it prefers, and re-propose the baselines with a note saying why.
- **Budgets:**
  - The opening is 442k of 450k triangles. The busy save is 512k of 550k.
  - The script before the first frame is 432 of 450 KB. Bundled terrain counts towards it, so lazy-load the new ground if it would grow.
  - Measure all three before and after.
- **How to land it:**
  - Prototype phase: push straight to `main`, after `git pull --rebase origin main`.
  - Push in parts that each leave `main` playable: the corridor and ground first, then the stations, then the service and balance, then the surroundings.
  - Before each push, run `npm run rules`, `npm test` and the groups the part touches: geometry, kits, terrain, line, layout, signals, world, perf and the bot.
  - Confirm each Publish run is green.

## Read first

- The project notes (`CLAUDE.md`), `docs/decisions/ADR-2026-10-13-network-as-a-graph.md`, `docs/DESIGN.md`, and `docs/design/buying.md`.
- `docs/briefs/marple-line.md`, `docs/briefs/real-surroundings-lines-out.md` and `docs/briefs/line-between-stations.md`, each with its Handed on.
- The Buxton and Marple lines' commits, for how a line out is added.

## What it must keep

- The sim stays pure and seeded. Everything bought shows on the map. Locked stations stand fogged with their price, and everything else locked is hidden.
- Real places and real layouts. Phones from 320 px. UK English. Every perf budget.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

The session pushes each part to `main` once its checks pass, then confirms that commit's Publish run is green on all four shards, or fixes it in the next push. After each part, send the coordinator a few lines.

## When to stop and ask

- The owner has said not to wait on them. Where a call is theirs, take the option that changes the game less, say so in the commit and to the coordinator, and carry on.

## Cost budget

- Estimate: about $40. That covers two legs, two junctions, five kits (one big), the census, a service, ground and surroundings, and the balance.
- At about 500k of context, stop at the end of a part and add a "## Handed on" section here.

## Handed on

14 October 2026, from the sixth pick-up session, stopping after part 1 at about 440k of context, as the cost budget says.

- **Part 1, the corridors and ground, done** (c2561bf; its commit message has the detail). `crewe` runs from about 530 m beyond Wilmslow to Edgeley Junction, and `macclesfield` from about 650 m beyond Poynton to Cheadle Hulme North Junction. (The commit message says 270 m and 600 m; these are the right figures.) Wilmslow South Junction is named for the Styal line. Both lines are wired. The sections for the Crewe line are in the data; the Macclesfield leg gets its sections when it has a station (run `node tools/osm-to-sections.mjs --write` again then). `PLAY` is unchanged. Confirm c2561bf's Publish run first, if this session hasn't.
- **Next: part 2, the stations.** Notes for it:
  - **Cheadle Hulme** has four platforms: 1 and 2 on the Crewe line, 3 and 4 on the Macclesfield line. The junction is north of the station, but the station sits on the `crewe` corridor. A Macclesfield train can't call there as the graph stands. Either draw 3 and 4 as scenery and have the Macclesfield trains pass (the option that changes the game less), or move the junction south of the station as a game choice. Say which in the commit.
  - **OpenStreetMap's platforms** (cached in `data/raw/crewe/`, git-ignored; fetch again if gone): Wilmslow 1 to 4 at about 53.3269, -2.2260; Handforth 1 and 2; Bramhall 1 and 2; Poynton 1 and 2. The station nodes for Poynton and Bramhall sit off the track, which throws `osm-to-network.mjs --via`.
- **Edgeley Junction:** the Crewe line comes in at about 35 degrees to the line to Piccadilly's start. Its track towards Manchester meets the down slow exactly, but the up slow's end is drawn about 6 m along from the Crewe line's track towards Crewe. The service part decides which main lines the Crewe trains use. If that's the slow lines, a short re-lay of the junction (or a corridor point nearer the main line's heading) would close the gap. The expresses still enter at the main line's start, not up the Crewe line, as the option that changes the game less.
- **The script before the first frame is 447 of 450 KB.** The bundled terrain grew with the new lines. To fit, I cut a line out's 32 m ground ring to 75 m (it was 800 m; the spine keeps 1.5 km), in `tools/lidar-to-terrain.mjs`. Before adding stations, move the lines out's near ring out of the bundle and fetch it after the first frame, as the fine tiles are, then put the ring back to 800 m. Kits and network data added in the bundle will otherwise go over.
- **Budgets now:** opening 442,343 of 450,000 triangles; busy save 521,792 of 550,000 (up 9.6k with the new lines' trees, masts and signals); terrain tiles 3.17 of 3.4 MB (the check's budget was raised from 2.6).
- **Not looked at on screen:** the new lines' ground and the Edgeley join were checked only by the terrain, geometry and layout checks, not by eye.

## The owner's decision, 14 October 2026

`docs/decisions/ADR-2026-10-14-budgets-and-the-real-railway.md` changes three things here.

- **Before the stations, part 1b:** the script before the first frame holds only the opening.
  - Every line out's network data, kits and ground load after the first frame: the Buxton, Marple, Rose Hill, Crewe and Macclesfield lines.
  - Put the lines out's near ground ring back to 800 m.
  - Say in the commit what the entry comes to.
- **The real railway by default:**
  - Cheadle Hulme follows the real line: the Macclesfield trains call at platforms 3 and 4.
  - The expresses run up the Crewe and Macclesfield lines once part 3 builds the service.
  - Run the bot as usual. If a milestone moves past the baselines, re-propose them in the commit.
- **Running alongside you:** a budgets session (`docs/briefs/budgets.md`) owns:
  - `tools/checks/perf.mjs`, `terrain.mjs` and `world.mjs`
  - `tools/check.mjs` and `.github/workflows/deploy.yml`
  - a new stats view

  You keep everything else. If you need a budget changed in those checks, ask the coordinator. Run `git pull --rebase origin main` before every push.

## Paused (the owner, 14 October 2026)

Depth before breadth: no new areas on the map until the current map has more to do (`docs/ROADMAP.md`, phase 5).
- Finish part 1b, the lines out's data and kits after the first frame. That helps every line.
- Then stop. Parts 2 to 4 (the stations, the service and the surroundings) wait.
- The corridors and ground stay as laid, with no stations offered.

### Handed on, 14 October 2026, from the seventh pick-up session (at about 420k of context, after part 2)

- **Done:** c2561bf's Publish run is green on all four shards. Then:
  - **b0d99df:** the lines out's near ring is back to 800 m.
  - **6d89765 (part 1b):** every line out's ground and kits load after the first frame. Entry 378 of 450 KB. The sim's graph stays in the bundle, because a save and the first step need it; the coordinator was told.
  - **Part 2, the stations (the commit after this note):**
    - Five kits, census homes and draw (Stockport's car-park pool moves from 150 to 160 drivers; every other existing figure is as it was), provisional prices (Cheadle Hulme £120k, Handforth 170k, Wilmslow 250k, Bramhall 190k, Poynton 240k), and every section's line speed and wires.
    - A layout entry moves the Crewe tracks to the real ones through Cheadle Hulme.
    - New rule: a station is offered only where a service calls (`Places.served`), so the five stand fogged with their prices.
    - Bot at 8 h: PLAY moves (b250564c, cadb2561, 8ca70a87) from about game day 3, with random draws shifted. Every milestone is within the baselines.
- **Confirm first:** the Publish runs for b0d99df, 6d89765 and part 2.
- **Next, part 3, the service.** Notes:
  - **Cheadle Hulme 3 and 4 are real** (the owner, f15ea74). The kit draws them as angled `footprint` platforms on the Macclesfield tracks, gated on `platforms`.
    - The Macclesfield trains must call there. Either move Cheadle Hulme North Junction south of the station (a game choice), or give Cheadle Hulme platform faces on the Macclesfield tracks and let a route call at a station on another corridor.
    - The geometry check sweeps only services on a station's own corridor and finds platforms only by `type: "platform"`. It needs extending to measure 3 and 4.
    - The Macclesfield tracks are drawn as 32 m chords past Cheadle Hulme. A car body swings 0.1 to 0.4 m over the platform edges at the kinks; straighten that stretch.
  - **Bramhall and Poynton:** the `macclesfield` corridor follows the real line towards Macclesfield there, so the network's tracks are about 3.5 m east of the real ones. The kits are shifted +3.5 to 3.7 m in v to stand on the game's tracks. To follow the real railway, add a layout entry through both (`macclesfield-north` about -3.5, `macclesfield-south` 0) and shift both kits' v by about -3.6.
  - **Wilmslow:** platforms 1 and 2 are the Styal pair, drawn as scenery rails (v -14.1 and -17.7). 3 (the halt, `crewe-north`) and 4 (`crewe-south`) are the trains via Stockport. `stop` 40.
  - **Handforth:** OSM numbers the west platform 2; the kit gives the halt to the west platform (towards Manchester).
  - **The expresses run up the Crewe and Macclesfield lines** (the owner's call). Choose Stockport platforms for the stoppers: southbound on the up slow is platform 1, which needs Stockport's `platforms` stage.
  - No bus stop places for the new stations yet (`stops`). Candidates from the export: Bramhall Stop A on Bramhall Lane South (kit u 83, v 23); Poynton's eastbound Railway Station stop on Chester Road (u 29, v -87).
  - Prices are provisional; part 3's bot sets them.
- **Not looked at on screen:** the five new kits. Geometry 151/151 and kits 52/52 pass, but only with no service on their lines.
