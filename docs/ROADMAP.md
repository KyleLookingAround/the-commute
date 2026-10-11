# Roadmap

Where this is going, in the order it makes sense to build it. Each step should leave the game playable.

## Next up (the owner's order, 11 October 2026)

- **Boarding across the dwell.** The sim boards everyone the moment a train calls, so a crowd rushes the doors at once. Board at a rate per door through the dwell instead, so longer trains matter more and the figures file on; a balance change, so the bot on seeds 1–3.
- **The Hazel Grove branch.** The first branch (phase 3): a second corridor from Stockport, its stations and a second service, which makes Stockport a through station and gives the incremental loop something past Piccadilly. Transfers come with it: an arriving passenger whose journey continues walks to the other platform instead of the exit.
- **Upgrades, better.** A better UI and UX for buying upgrades, and upgrades that visibly change the stations (more than a part appearing), drawing on the owner's other games for how they do it.
- **Weather, later.** Rain, overcast, fog, with gameplay effects (rain hurts patience without a canopy).
- **Stations closer to reality, fourth pass.** Still to do: Ardwick's lattice footbridge as its own part, Piccadilly's platforms 13 and 14 and the Gateway, the bays' real splay, and the photos' own detail (Levenshulme's curved shelter, Heaton Chapel's arches).

## 1. Repo and real geography (done)
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

## 5. Trams and the long game
- Metrolink as a second network sharing the map.
- Endgame: bring Metrolink to Stockport. Very expensive, takes a very long time.
