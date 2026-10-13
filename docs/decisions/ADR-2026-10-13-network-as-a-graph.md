# The network is a graph of corridors joined at junctions, measured in chainage, with services as routes of legs

**Status:** Approved · 13 October 2026

## Context

Until now the whole map was one corridor, the Hazel Grove line included, and every track, station and train was a distance along it. Phase 5's lines out of Stockport and Manchester (`docs/ROADMAP.md`) meet the line at real junctions, share its tracks, and need trains to wait for each other where they do. Each of those steps should add data and small pieces, not reshape the sim again.

## Options considered

- Keep one corridor and draw branches as tracks offset from it. Breaks the moment a line leaves at an angle.
- Corridors joined at junctions, each with its own distances from 0, and every comparison in the sim and the view converting between them. True to the graph, but every place that compares a train with a station (the sim's platforms, holds, trouble and timetable, the view's berths and crossovers) needs a conversion, and today's numbers all move.
- Corridors joined at junctions, measured in chainage: one distance that runs on through every junction, as the railway's own mileages do, so a distance with its corridor names one place, and along any route the distance is just the chainage.

## Decision

- **Corridors:** each is a real line's centreline, drawn towards Manchester, cut at the junctions it starts or ends at (`from`, `to`; its waypoints run a little past one so its curve there is unchanged). Distances along every corridor grow towards Piccadilly.
- **Chainage:** 0 at the start of the spine (`spine`: the corridors the ground is laid along, end to end), and along any other corridor so it meets the one it joins at the junction's own chainage. Two corridors can share a range of chainage (a branch beside the line it leaves); a place is a corridor and a chainage.
- **Junctions:** named points on a corridor (`junctions`, real names and positions, a `note` where from memory), with the corridors that start or end there. A junction with no line beyond it yet marks where a later line joins.
- **Tracks** belong to one corridor. A service lists its tracks each way leg by leg (`tracks: { north: [...], south: [...] }`); `Route` in `src/sim/network.ts` joins the legs at the junctions where their corridors meet, and a train passes onto the next leg's track there.
- **Signalling:** every track is cut into blocks at the signal sites along its corridor and at its ends; a train doesn't enter an open-line block another is in, and at a junction doesn't cross a way set for another train. A station's own block is worked by its platforms. The view's colour-light signals stand at those sites and show what the sim says.
- **Track layout:** every layout keeps the rule in `src/sim/layout.ts` (docs/DESIGN.md, Where the tracks run): no shift sharper than 1 in 5, tracks that never cross but run apart or together, 100 m clear between throats, crossovers and junctions, every track on its deck, blocks as long as a train. A new line's stations and junctions are placed and laid out to keep it, and `npm test` fails naming any place that doesn't.
- **Journeys** are paths through the graph: rides on services and changes between them, the quickest as people feel it, as many changes as that takes, each change onto another service.
- **The view** asks the network for positions as before; what's laid along the whole line (the ground, trees, masts, signals) follows `net.spine`, the spine's corridors as one.

## Consequences

- Today's game is unchanged: the Hazel Grove line's chainage is what its distance was, and the line to Piccadilly's runs on from it, so every distance the sim uses is the same (the bot's `PLAY` is identical on seeds 1–3).
- A route that turns back away from Manchester at a junction (the Stalybridge line from Stockport through Heaton Norris) runs against chainage on one leg; that step gives a leg a direction of its own.
- A line beside the spine (the Styal line, the Crewe line) needs its own ground and trees: the terrain is laid along the spine only.
