# Roadmap

Where this is going, in the order it makes sense to build it. Each step should leave the game playable.

## Next up (the owner's order, 11 October 2026)

- **Stations that grow, from a halt** (the owner's idea, 11 October 2026). Buying a station gets a halt: one platform on one line, so only trains one way call there (towards Manchester, which suits the morning peak; the evening crowd is the reason to build the second). Upgrades then unlock the rest in the order a real station would get it: a way across the line (footbridge or subway) before the second platform, then trains both ways, lifts, canopies, the booking office, longer platforms; at Stockport and Piccadilly more platforms, which are what let more units and services call. Each step is a stage of the kit, so the station visibly grows instead of a part popping in, and the upgrade panel becomes the station's next step shown as a picture of what it adds and what it opens up after, with what isn't reachable yet hidden (ideas for the UI from the owner's other games). What it needs: upgrades with prerequisites, a station knowing which platforms and directions it has (a halt only takes passengers the way its platform serves), and the opening re-tuned with the bot. To decide: whether Stockport starts as a halt too, so the very first purchase is its second platform; that makes the opening an honest incremental start.
- **More branches.** The Crewe line via Cheadle Hulme (the fast lines already start where it would join south of Stockport), the Styal line at Slade Lane, the line through Reddish South; through running from Hazel Grove to Manchester as an upgrade; the expresses as real services.
- **Weather, later.** Rain, overcast, fog, with gameplay effects (rain hurts patience without a canopy).
- **Stations closer to reality, fourth pass.** This detail becomes each station's "as it is today" stage. Still to do: Ardwick's lattice footbridge as its own part, Piccadilly's platforms 13 and 14 and the Gateway, the bays' real splay, and the photos' own detail (Levenshulme's curved shelter, Heaton Chapel's arches).

## 1. Repo and real geography (done)
- The Hazel Grove branch: the corridor runs on south from Stockport through Davenport and Woodsmoor to Hazel Grove (from the OpenStreetMap export), on two tracks; the three stations come after Piccadilly in the buying order, each with a kit from the export. A second service, the Hazel Grove line, runs from Stockport as far as the branch is owned, turning round in platform 1; passengers between the branch and the main line change at Stockport, walking off one train and through the subway to the other's platform (the panel counts them as Changed). Services are data (`route`, `home`), trains carry their service, and a train running in to the end of its run crosses over to its departure track.
- Boarding through the stop: a train boards while it stands, two doors a car at 0.7 passengers a second each, so the figures file on, a busy stop can leave people for the next train, and longer trains board faster. People reaching the platform while it stands catch it, so peaks lose fewer (lost re-proposed in `tools/baseline.json`; whether peaks should bite harder is the owner's call).
- Real track spacing: the tracks run where the OpenStreetMap export puts them, 1.25 times real across the line (about 14 m over four tracks, against 32 m before), easing between an open-line layout and each station's own (`layout` in `src/data/network.json`). Stockport is rebuilt round its two wide islands with the 3a bay, platform 0, the carriage sidings and both signal boxes; Piccadilly's twelve bays are six islands and single platforms under four shed spans, trains stopping short of the buffers. The stopper turns round in one platform at each end, so trains no longer jump across on reversing. A new `rails` part draws the tracks nobody runs on. The far ground no longer covers the line from some angles.
- Passengers that move (`src/render/passengers.ts`): figures come in through the station's entrance, walk to a spot on their platform, board the nearest door of a train standing at their face, step off at their destination and walk out, and walk out when they give up; coats in four colours; all cosmetic, in game time. Figures are 1.4 times life size, trains 1.3 times their real height and width.
- A photo pass on the kits (geograph.org.uk, via the Commons category lists): cutting walls and the Victorian building at Heaton Chapel, Levenshulme's parapets and platform building, Ardwick's hut and yard shed, Stockport's retaining wall and depot, canopies on Piccadilly's far bays; towers keep clear of stations and stay low-rise around Ardwick.
- The real corridor and stations from OpenStreetMap: `tools/osm-to-network.mjs` gives the shortest rail path from Davenport to Piccadilly (11.5 km, resampled every 60 m) and the station positions; `tools/osm-to-kit.mjs` drafts each kit's platforms, buildings (`footprint` parts from their real outlines), footbridges and subways (`subway` parts, with a stair head on each platform) in the kit's frame. The bot's measures stayed within the baseline on the real geometry.
- The time-of-day control: a slider on the stage locks the light to an hour for a look around and a Live button lets it follow the clock again; the sim's clock never changes (the `daylight` check proves it). Screenshots preset it through `window.__lockHour`.
- A day that shows: the sun rises in the east, crosses the south and sets in the west, orange at the ends and white overhead; one shadow map follows the camera at station zoom (under 900 m out); lamps, windows and lit signs are glassy by day and come on at dusk; stars after dark.
- A sky (`src/render/sky.ts`): a dome with a zenith-to-horizon gradient that follows the clock, a sun disc where the sun light is, soft clouds drifting over the line, and a far ground plane so the land meets the horizon. The stock views look a little lower now so some sky is always in frame; a screenshot can start the camera anywhere through `window.__orbit`.
- Colour: the `--map-*` tokens brightened to a model railway in daylight (greener grass, warmer brick, pale platforms, readable rails) and the sun and sky lights raised to physical units, white overhead and orange near the horizon.
- The runbook from the owner's other games: playbooks, source rules, a seeded sim and a bot, versioned saves, checks and workflows, decision records (`docs/decisions/ADR-2026-10-08-runbook-from-overgrow.md`). TypeScript strict from the first session with a compiler: `src/` and `test/` are strict TypeScript, the build type-checks, and the tools load the sim through `tsx`.
- Vite + Three.js, sim as a tested module, GitHub Pages deploy.
- Track network as corridors + offset tracks + stations at a distance along a corridor, from lat/lon. Branches later become more corridors joined at junctions.
- `tools/osm-to-network.mjs` to get the real corridor shape from an OSM export.
- Station kits as data, with upgrade-gated parts.

## 2. Stations that look like the stations
- Platforms and footprints from OSM (`railway=platform`, buildings) feeding the kits; hand-authored detail on top (canopies, signage, the real booking offices).
- Terrain from LIDAR; the Mersey valley and the Levenshulme embankment for real.
- Landmarks modelled properly: the viaduct, the Pyramid, the Plaza, Piccadilly's train shed and the Gateway, Beetham Tower on the skyline.
- More upgrade visuals: electrification puts the wires up, platform extensions grow, retail units light up, car parks fill.

## 3. Branches and other operators
- Hazel Grove / Buxton, Cheadle Hulme / Wilmslow / Crewe, the ghost line through Reddish South to Stalybridge, the Styal line joining at Slade Lane, Piccadilly to Oxford Road and Deansgate.
- Expresses and TPE as real services with calling patterns, paying passing fees and blocking platforms.
- Junction conflicts and timetabling as a late-game pressure.

## 4. Passenger mode
- Walk the stations and ride the trains in first person as one of your own passengers.
- Journeys with a brief ("Levenshulme to Stockport by 08:45 with a suitcase"), scored on time and stress; every tycoon decision felt from the other side.
- Reports from journeys feed back into the tycoon (spot a problem, get a discount on the fix).

## 5. Trams
- Metrolink as a second network sharing the map.
- A late goal: bring Metrolink to Stockport. Very expensive, takes a very long time.

## 6. Stations that don't exist yet
Once a station is complete as it stands today, it keeps growing into versions that have been planned, proposed or are plausible, each still recognisably the real place underneath.
- Planned or proposed for real: Piccadilly's platforms 15 and 16 (the Castlefield corridor fix) and a high-speed station alongside it, Stockport's new interchange with more through platforms, reopened stations such as Reddish South, longer platforms everywhere for 8-car trains.
- Plausible: buildings over the tracks, solar canopies and roof gardens, a glass roof over Heaton Chapel's cutting, double-deck platforms, automatic trains every two minutes, the Stockport viaduct floodlit and widened.
- Trains and the town move on with the stations: newer units, the city end growing taller, more people living along the line.

## 7. The very long game: sci-fi
Past the plausible the line goes science fiction, still a model railway in daylight rather than anything bleak.
- Eras change the trains (diesel units, electric units, then maglev on the viaduct, then pods in tubes), the stations (towers, then sky ports) and the sky (airships by day, traffic lanes lit at night).
- The commute shrinks: Stockport to Piccadilly in minutes, then one; demand and catchments grow with each era.
- To decide: whether a new era is a fresh start (stations back to halts in the new technology, with a lasting bonus, the classic incremental reset) or carries straight on.

