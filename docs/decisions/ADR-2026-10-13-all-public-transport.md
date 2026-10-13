# The game is all public transport, not stations alone

**Status:** Approved · 13 October 2026 (the owner)

## Context

Until now nearly everything the player buys is at a station: fourteen kinds of station upgrade against four for the whole line (more units, longer trains, a faster timetable and a spare unit). Between stations the railway, the trains and the towns mostly just happen, and buses and trams were far off (trams in phase 7, buses "maybe" in phase 8). Asked whether the game should be broader, the owner liked the proposal of buying the line between stations next and said: "I'm thinking just all public transport is the game."

## Options considered

- Stay a station tycoon, with the lines out as more stations. Simple, but every phase plays the same, and the real story of Greater Manchester's transport (the railway, the buses taken back into public hands, Metrolink, one network with one fare) is left out.
- Widen into a city builder, with the player zoning and building the towns. Loses the railway at the centre and the incremental "buy the next thing" shape the owner wants.
- **All public transport:** the player builds and runs the whole network people travel on (the railway and the line itself, buses, trams, and the ways to reach them on foot, by bike, by cab or by car), and the places round it respond to how good it is.

## Decision

- **The game is all public transport.** The player builds the network the real Bee Network is becoming: trains and the infrastructure between stations, bus routes and bus stations, trams, and the links between them. The car is the rival, not another mode to run.
- **What stays:**
  - It stays an incremental upgrade game: buy the next thing, unlock the next place.
  - The opening is open to redesign (the owner, 13 October 2026, superseding "the opening is unchanged"): `docs/briefs/gridlock-opening.md` designs a start on a gridlocked network with the car as the visible rival. Until that design is built, the opening stays as it is. The other modes arrive as the game goes on.
  - Everything bought shows on the map; locked things are hidden except fogged places with their price.
  - The player buys every upgrade: no managers or recommended buys.
  - Real places, real layouts and real routes, with a `note` where from memory.
  - The four layers and the seeded sim.
- **How the modes meet:** people choose by door-to-door felt time, as journeys already work (`docs/DESIGN.md`, Journeys), so a bus, a tram and a train compete and connect through the same sums. A change between modes is a change like any other, with its walk and its wait.
- **Places a stop can be:** a station kit is one kind of stop. Bus stops, bus stations and tram stops become kits too, growing from a pole or a single platform the way a station grows from a halt.

## Consequences

- **The roadmap changes shape** (`docs/ROADMAP.md`):
  - Phase 5 gains **the line between stations** (step 11) and **buses as a network** (step 12).
  - The 192 on the A6 (step 8) becomes the player's first bus route rather than a rival they can't touch. The car is the rival.
  - Phase 8's "maybe buses" goes: buses are core from phase 5 on.
  - Trams stay in phase 7. Whether they can come sooner, before the city's streets, is for the phase 6 plan.
- **Later layers this opens:** one fare across modes (the Bee Network's capped fares, making changes feel shorter), cycle hubs at stations, park and ride by mode, and night buses for the quick nights.
- **The project notes** describe the game this way, and the owner's preferences list it.
- **Balance:** each new mode spreads the money thinner. Every step that adds one runs the bot, keeps the opening's milestones, and says where the new mode lands in the pacing.
