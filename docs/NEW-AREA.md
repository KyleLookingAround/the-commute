# A new area: the checklist

What every area of the map has once it's finished, learned from building today's line, the Buxton line, the Marple line and the Rose Hill branch. It's two things at once:

- **The bar for today's areas.** Depth before breadth (the owner, 14 October 2026): no new area until the current ones tick every box. The last section lists what they don't tick yet.
- **The steps for a new area,** in order, once they do. An area is a line out (a corridor and its stations) or a stretch of the network round them: a tram line, a town's buses.

Each box names the tool that makes it and the check that proves it. A box that can't be ticked is written up under Handed on in the area's brief, never left silent.

## 1. Before starting

- [ ] Today's areas tick every box below, or the owner has said to go ahead anyway.
- [ ] A brief from `docs/briefs/TEMPLATE.md`, with the area's real stations, junctions, roads and services listed from sources, a cost budget and the files it may touch (`docs/briefs/marple-line.md` is the pattern).
- [ ] What the area adds to the loop, in a sentence: the problem it brings that the player can see on the map and fix by buying. An area that only adds more of the same stages isn't ready.

## 2. The ground and the railway

- [ ] The corridor along the real line from OpenStreetMap (`tools/osm-to-network.mjs`), drawn towards Manchester, its chainage running on through the junction it leaves by, the junction named where the real one is. Check: `line`, `layout` (the track spacing rule, `test/layout.test.ts`).
- [ ] Line speed by section from OpenStreetMap's `maxspeed`, and where the wires really run (`tools/osm-to-sections.mjs`). Check: `sections`.
- [ ] The ground from the LIDAR (`tools/lidar-to-terrain.mjs`) and the real buildings, trees, hedges and ground cover (`tools/osm-to-world.mjs`), within the area's budget in `tools/lines.mjs`. Check: `terrain`, `world`.
- [ ] The main roads along their real courses, with their junctions and bridges (`tools/osm-to-roads.mjs --main`), joined to every station's own streets, nothing sinking into the ground, nothing laid over the rails. Check: `roads`, `surroundings`.
- [ ] Signals, masts and the lineside as the rest of the line has them. Check: `signals`, `landmarks`.
- [ ] Depots and sidings where the real ones are (`depots` in the network data), drawn with their roads, and only once they do a job in the game: a depot that adds trains to a full line makes things worse (`docs/DESIGN.md`, Why the stopper can't just run more units).

## 3. The stations

- [ ] A kit per station from the photo library and views from above (`tools/osm-to-kit.mjs`), real layouts, a `note` on anything from memory. Check: `kits`, `geometry` (no part where a train passes, platforms beside their tracks).
- [ ] Opens as a halt and grows through the usual stages where the real station has them (`grow`), fogged with its price until it's offered.
- [ ] The stages that keep going drawn into its kit (`node tools/tiers.mjs`): longer platforms, full canopies, a travel centre, shops, a cycle hub, a poster by the nearest main road, the Bee Network's posts and totem, the bus stop's shelter and live times.
- [ ] A signature stage from its real history or plans (`grow.signature`), its `note` saying the source and when it was checked, and where the place is nearer another station.
- [ ] Census homes and draw (`tools/census-to-network.mjs`), and a price that continues the progression from the stations before it.
- [ ] Looked at by eye, from above and at platform level, on a phone and a desktop (`npm run shots -- --stations <id>`, `--world` once the buildings are in).

## 4. Getting there and getting about

- [ ] Each service on its real calling pattern, its frequency as steps to buy from the real timetable, its peak units resting somewhere drawn, a platform it can really use at each end. Check: `geometry` (a standing unit short of the buffers), `life`.
- [ ] A bus stop by each station that has a real one (`stops`), where its kit's `buslink` stands, growing from a pole to a shelter to live times.
- [ ] Its feeder: one real bus route through the stop from OpenStreetMap (`tools/osm-to-feeders.mjs`).
- [ ] A bus route along the area's main road where a real one links its stations (`busRoutes`: `needs`, `every`, `buses`), with stops by its stations. Check: `roads`.
- [ ] The car as the rival: the area's main roads as stretches from the DfT's count points (`src/data/traffic.json`: `serves`, `on`, `at`, `head`), so the cars it takes off show. Check: `traffic`.
- [ ] Taxis, car parks and cycle racks where the real station has them.

## 5. What happens there

- [ ] Its surges: the match days, events and shifts that really draw people there (`src/sim/surges.ts`), each seen on the map.
- [ ] Its landmarks, so the area is recognisable from above.
- [ ] Strain finds its problems (a crowded platform, a full car park, the walk home, a late stretch) and each one opens the place whose buys fix it. Check: `strain`.

## 6. The economy

- [ ] The bot on seeds 1–3 at 8, 16 and 32 sim hours before and after (the `balance` playbook): the opening unchanged, and when the bot reaches each new station.
- [ ] Every new stage is bought at some point by the bot (its `REACHED` list), or its brief says why not: no dead buys.
- [ ] Each peak from day 4 loses within the pressure band, 6 to 14% (`peak lost % from day 4`), and buying the area's capacity lowers it for a while rather than not at all.
- [ ] Baselines re-proposed with a note saying why (`tools/baseline.json`).

## 7. Phones, facts and docs

- [ ] Phones from 320 px still run smoothly: the `perf` group's triangle and frame budgets hold, and the script before the first frame doesn't grow.
- [ ] Every `note` that says "from memory" checked against a source, or listed under Handed on.
- [ ] `docs/DESIGN.md` and `docs/ROADMAP.md` updated; the brief's Handed on lists what's left.

## Today's areas: what they don't tick yet

As of 19 October 2026:

- **The loop (section 1):** buying capacity doesn't yet clearly fix a problem. More stopper units made things worse (the line is full: they queued at Stockport), and room on the trains filled with new riders at once. Word of mouth (riders adjusting to how full the trains are) and towns that grow where the player invests are the fix being built. The late game needs problems a buy fixes for a while, before any area is added.
- **The streets round each station** clearing as it's served (step 20): built on the session branch, not yet checked or on `main`.
- **The A6's own buildings** from the photo library's `areas` (step 8).
- **The bus garage** (Stagecoach's on Daw Bank) and bus priority at junctions (step 12): no job in the game yet.
- **Levenshulme's A6 stop:** its shelters stand at the carriageway's edge, where the road's course and its drawn carriageway part.
- **Not yet looked at by eye** at platform level: Ashburys, Brinnington and Marple (the Marple line's brief).
- **Piccadilly's throat:** the Marple trains join the slow lines on the flat at Ardwick Junction rather than on their own pair.
- **Romiley Junction** (the line from Woodley and Hyde) isn't marked.
- **The Crewe line's tracks and ground** are laid with no stations offered (paused by depth before breadth).
