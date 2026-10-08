# Roadmap

Where this is going, in the order it makes sense to build it. Each step should leave the game playable.

## Next up (from the first look at the live site)

- **Colour.** The palette is muddy: greener grass, warmer brick, lighter concrete, brighter platform surfaces, readable track. Boost saturation and ambient light in daytime so it reads as a model railway, not a security camera.
- **A sky.** Sky dome with a day/night gradient, a sun disc, soft clouds; the ground should meet a horizon rather than fog.
- **Day cycle that shows.** Sun angle and colour over the game day, shadows (one directional shadow map at station zoom), lamps that come on at dusk and windows that light up.
- **Time-of-day control.** A settings panel with a slider to lock the time of day for looking around, and a button to let the clock run again. The sim keeps its own clock; the slider only affects lighting.
- **Weather, later.** Rain, overcast, fog, with gameplay effects (rain hurts patience without a canopy).
- **Stations closer to reality.** Use the OSM export (platform polygons, building footprints, footbridge/subway ways) plus photos to rebuild each kit. Stockport first: the subway under the platforms with stairs up to each island, the Edgeley-side building and entrance, the canopy style, the No.1 and No.2 boxes in the right places. Add a `subway` kit part type.

## 1. Repo and real geography (done)
- The runbook from the owner's other games: playbooks, source rules, a seeded sim and a bot, versioned saves, checks and workflows, decision records (`docs/decisions/ADR-2026-10-08-runbook-from-overgrow.md`). TypeScript strict is the first Claude Code task (`START-HERE.md`).
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
