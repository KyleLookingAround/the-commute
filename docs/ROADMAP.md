# Roadmap

Where this is going, in the order it makes sense to build it. Each step should leave the game playable.

## Next up (from the first look at the live site)

- **Weather, later.** Rain, overcast, fog, with gameplay effects (rain hurts patience without a canopy).
- **Stations closer to reality, third pass.** Platforms, buildings, footbridges and subways come from the OpenStreetMap export, and a pass with geograph photos added what the map doesn't hold (cutting walls, parapets, the Victorian building at Heaton Chapel, Ardwick's yard, Stockport's retaining wall and depot, the canopy style). Still to do: the real track spacing per station (the line is about 15 m across, the drawn slots 32 m), Ardwick's lattice footbridge as its own part, Stockport's platform 3a bay, Piccadilly's bay fan and the Gateway, and the photos' own detail (Levenshulme's curved shelter, Heaton Chapel's arches).

## 1. Repo and real geography (done)
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
