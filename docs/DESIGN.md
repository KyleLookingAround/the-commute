# Design

## The loop

Passengers are the resource. Each owned station generates them from its catchment by the demand curve (`demandCurve` in `src/sim/sim.ts`: morning peak to Manchester, evening peak home, nothing at night). They join a queue on the platform for their direction with a destination chosen among reachable stations (owned ones, plus Stockport and Piccadilly which always exist as destinations). They board the train for their direction while it stands (changing at Stockport if their journey runs between the main line and the Hazel Grove branch), through its doors at a set rate, and pay a distance-based fare as they get on; whoever the doors can't take in the stop waits for the next, and are counted off at their destination (`alighted`, shown as Arrived). A full platform turns new arrivals away; waiting longer than their patience sends them home. Both count as lost.

Money buys station upgrades (per station), line upgrades (more units, longer trains, faster timetable) and the next station up the line. Stations must be bought in order.

## Numbers that matter (`TUNING` in `src/sim/sim.ts`)

- Time: a sim second is a real second at 1×, so motion is real speed; the clock and demand curve run `dayRate` (6) times faster, so a game day is four real hours of sim time. Everything per sim second (speeds, dwells, patience, platform caps) is in real seconds; everything per clock hour (demand) comes round six times as often.
- Fare: `(1.5 + 0.6 × miles) × fareMult`. `fareMult` (12) is the single knob for overall pacing; it is six times what it was when the clock ran at 6×, so a sixth of the trains earn the same money a real minute.
- Seats: 75 per car, 2 cars to start. Boarding: 2 doors a car, 0.7 passengers a second through each, all through the stop, so a 2-car unit takes about 125 in a 45 s stop and longer trains board faster as well as holding more. Passengers get off the moment the train arrives.
- Speeds are real (33.5 m/s = 75 mph) on a true-scale line. Stockport to Piccadilly takes about ten real minutes plus stops; dwell 45 s, turnaround at the termini 120 s.
- Patience 25 min, 45 with a canopy. Platform cap 150, 320 extended.
- 82% of fares collected without barriers.

The bot (`tools/bot.mjs`) measures pacing on seeds 1–3 against `tools/baseline.json`; the `balance` playbook has the table. Current pacing at 1×: an extra unit in about 10 real minutes, Heaton Chapel in about 25 (the bot's run; a player buying nothing first takes longer), Levenshulme at two hours, Ardwick at five; Piccadilly needs a long session or 10×. Peaks lose fewer passengers than they did with the 6× clock, because a peak now lasts a sixth of the sim seconds while patience and platform caps are in sim seconds; the owner tunes that when the pacing is settled. `test/sim.test.ts` pins the Heaton Chapel pacing so tuning changes are deliberate.

## Station kits

A kit is JSON with `faces` (where each direction's passengers wait: a line near the platform edge and a `depth` back into the platform, 4 m if not given), an optional `entrance` (the `u` passengers come and go at, for a terminus whose way in is its concourse rather than a subway or footbridge) and `parts`. Part types in `src/render/stations.ts`: `platform`, `canopy`, `lamps`, `box`, `windows`, `shelter` (with `back` saying which side its glass is on), `footbridge`, `lifts`, `retail`, `barriers`, `signalbox`, `shed`, `footprint` (a building from its real outline), `subway` (a passage under the line with a stair head on each platform) and `rails` (a track no service runs on: sidings, bays, platform lines, through `(u, v)` points, with an optional buffer stop). Any part may carry `upgrade: "<id>"` and then only shows once bought. Add a new part type by adding its shape to the `Part` union and a builder to `partBuilders`, both in that file. The saved game's shape is `GameState` in `src/sim/types.ts`.

Frame: `u` along the corridor towards Manchester, `v` across it (positive `v` is east at Stockport: the main building, Grand Central and Stockport Exchange), `y` up. Lengths along the line are real; everything across it is 1.25 times real, so the trains, drawn 1.3 times real width, pass clear of each other and of the platforms. Platform lengths, buildings, footbridges and subways come from an OpenStreetMap export: `tools/osm-to-kit.mjs` drafts a kit's parts from one at that scale, and each kit's `note` says what it took and what was fitted by hand.

Where the tracks are: each track in `src/data/network.json` has an open-line `offset` (0, 4.4, 9.2 and 13.8 m, west to east: down slow, down fast, up fast, up slow), and the `layout` list moves them around a station (`station` with `u0`–`u1` in its frame) or along a stretch (`s0`–`s1`), from the real tracks in the export. Tracks ease between layouts over `ease` metres, and a train turns with its track. A kit's platforms stand 2.1 m from the track they serve (`test/sim.test.ts` checks it): side platforms outside the slow lines, Stockport's and Piccadilly's islands between tracks. The stopper turns round at both ends, so at Stockport (platform 4) and Piccadilly (platform 5) both its tracks run into one platform and a train never jumps across on reversing. A station's `stop` moves where trains stop along the line without moving its kit: Piccadilly's trains stop 35 m short so the longest clears the buffers.

## Trains

Passenger services are in `services` in `src/data/network.json`, each with a `route` of stations south to north. The main-line stopper runs its whole route, Stockport to Piccadilly, calling at every owned station and always at both ends; its units are the ones the line upgrades buy. The Hazel Grove line has a `home` (Stockport): it runs from there only as far down its route as stations are owned, with one unit, from when Davenport is bought, and buying Woodsmoor or Hazel Grove extends it. It turns round in Stockport's platform 1, so a journey between the branch and the main line changes at Stockport: at the end of a train's run everyone still aboard gets off, counted as `changed`, and joins the platform for the train that goes their way with their fare already paid (it was taken where the journey began). The real Buxton-line trains run through to Manchester; turning them at Stockport is a game choice, so changing trains is something to watch, and through running could be an upgrade later. Where different services go each way from a station (Stockport, once the branch is open), its passengers split between the two ways by how many people live each way as well as by the hour, so a short branch doesn't take half of Stockport; elsewhere the split is the hour's alone. Trains are drawn in their service's livery on its tracks, and a train running in to the end of its run crosses over to the track it will leave on, so it never jumps across when it turns round.

The branch stations come after Piccadilly in the buying order, so the incremental loop goes on past the city. Expresses are scenery for now (they pass on the fast lines, which begin south of Stockport where the Crewe line would join, and earn nothing); making them real services with their own calling pattern is on the roadmap.

## Save

`localStorage` key `the-commute-save-v1` (`src/app/storage.ts`): the whole sim state, `SAVE_VERSION` (2: stations count who alighted, so the view can show them leaving), the seed and the random state, plus a timestamp. On load the sim advances by the time away at 1×, capped at 8 game hours (`src/app/clock.ts`). A save that can't be read is kept under a `-broken` key. Versioning: `docs/decisions/ADR-2026-10-08-no-save-compatibility-before-release.md`.

## Randomness

`src/sim/random.ts`: a mulberry32 whose state is saved, so the same seed and the same purchases give the same game. The bot and the checks rely on it; `tools/rules.mjs` keeps `Math.random()` out of the sim.
