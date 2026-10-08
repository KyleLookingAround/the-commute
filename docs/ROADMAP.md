# Roadmap

Where this is going, in the order it makes sense to build it. Each step should leave the game playable.

## 1. Repo and real geography (this commit)
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
