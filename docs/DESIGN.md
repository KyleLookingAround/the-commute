# Design

## The loop

Passengers are the resource. Each owned station generates them from its catchment by the demand curve (`demandCurve` in `src/sim/sim.ts`: morning peak to Manchester, evening peak home, nothing at night). They join a queue on the platform for their direction with a destination chosen among reachable stations (owned ones, plus Stockport and Piccadilly which always exist as destinations). They leave on the next train with room and pay a distance-based fare when they board, and are counted off at their destination (`alighted`, shown as Arrived). A full platform turns new arrivals away; waiting longer than their patience sends them home. Both count as lost.

Money buys station upgrades (per station), line upgrades (more units, longer trains, faster timetable) and the next station up the line. Stations must be bought in order.

## Numbers that matter (`TUNING` in `src/sim/sim.ts`)

- Time: a sim second is a real second at 1×, so motion is real speed; the clock and demand curve run `dayRate` (6) times faster, so a game day is four real hours of sim time. Everything per sim second (speeds, dwells, patience, platform caps) is in real seconds; everything per clock hour (demand) comes round six times as often.
- Fare: `(1.5 + 0.6 × miles) × fareMult`. `fareMult` (12) is the single knob for overall pacing; it is six times what it was when the clock ran at 6×, so a sixth of the trains earn the same money a real minute.
- Seats: 75 per car, 2 cars to start.
- Speeds are real (33.5 m/s = 75 mph) on a true-scale line. Stockport to Piccadilly takes about ten real minutes plus stops; dwell 45 s, turnaround at the termini 120 s.
- Patience 25 min, 45 with a canopy. Platform cap 150, 320 extended.
- 82% of fares collected without barriers.

The bot (`tools/bot.mjs`) measures pacing on seeds 1–3 against `tools/baseline.json`; the `balance` playbook has the table. Current pacing at 1×: an extra unit in about 10 real minutes, Heaton Chapel in about 25 (the bot's run; a player buying nothing first takes longer), Levenshulme at two hours, Ardwick at five; Piccadilly needs a long session or 10×. Peaks lose fewer passengers than they did with the 6× clock, because a peak now lasts a sixth of the sim seconds while patience and platform caps are in sim seconds; the owner tunes that when the pacing is settled. `test/sim.test.ts` pins the Heaton Chapel pacing so tuning changes are deliberate.

## Station kits

A kit is JSON with `faces` (where each direction's queue stands) and `parts`. Part types in `src/render/stations.ts`: `platform`, `canopy`, `lamps`, `box`, `windows`, `shelter`, `footbridge`, `lifts`, `retail`, `barriers`, `signalbox`, `shed`, `footprint` (a building from its real outline) and `subway` (a passage under the line with a stair head on each platform). Any part may carry `upgrade: "<id>"` and then only shows once bought. Add a new part type by adding its shape to the `Part` union and a builder to `partBuilders`, both in that file. The saved game's shape is `GameState` in `src/sim/types.ts`.

Frame: `u` along the corridor towards Manchester, `v` across it (positive `v` is east at Stockport: the main building, Grand Central and Stockport Exchange), `y` up. Platform lengths, buildings, footbridges and subways come from an OpenStreetMap export: `tools/osm-to-kit.mjs` drafts a kit's parts from one, and each kit's `note` says what it took and what was fitted to the drawn tracks. Tracks sit at `v` = -13 (down slow), 1 (down fast), 5 (up fast), 19 (up slow); stopping services use the two slow lines, so side platforms go outside them and islands go between a slow line and the fast lines.

## Trains

The stopping service runs end to end on the slow lines, calling at every reachable station, turning round at the termini. Units are shared across the line. Expresses are scenery for now (they pass on the fast lines and earn nothing); making them real services with their own calling pattern is on the roadmap.

## Save

`localStorage` key `the-commute-save-v1` (`src/app/storage.ts`): the whole sim state, `SAVE_VERSION` (2: stations count who alighted, so the view can show them leaving), the seed and the random state, plus a timestamp. On load the sim advances by the time away at 1×, capped at 8 game hours (`src/app/clock.ts`). A save that can't be read is kept under a `-broken` key. Versioning: `docs/decisions/ADR-2026-10-08-no-save-compatibility-before-release.md`.

## Randomness

`src/sim/random.ts`: a mulberry32 whose state is saved, so the same seed and the same purchases give the same game. The bot and the checks rely on it; `tools/rules.mjs` keeps `Math.random()` out of the sim.
