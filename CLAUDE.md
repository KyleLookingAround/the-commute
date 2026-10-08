# The Commute

Station tycoon on a 3D map of the Stockport to Manchester line. Vite + Three.js. See README.md for layout, docs/DESIGN.md for the economy and the station kit format, docs/ROADMAP.md for the plan.

## Working rules

- The simulation (`src/sim/`) never imports Three or touches the DOM. If you change the economy, add or update a test in `test/` and run `npm test`.
- Geometry is data: stations are kits in `src/data/kits/`, the line is `src/data/network.json`. Prefer adding a kit part type over hard-coding a station in the renderer.
- Kits use a local frame: `u` along the corridor (positive towards Manchester), `v` across it (negative is the Stockport-building side, the same side as the `down-slow` track at offset -13), `y` up. Track offsets: -13, 1, 5, 19.
- Parts with an `upgrade` field appear only when that upgrade is bought at that station. Every purchasable thing should be visible on the map.
- Time: 1 real second = 6 game seconds at 1x (`GAME_PER_REAL` in main.js). Tuning numbers live in `TUNING` in sim.js.
- Keep it playable on a phone: instancing for anything repeated, no per-frame allocations in the loop, UI numbers refreshed on a timer not every frame.
- Real place names, real layouts where known, and notes in the kit `note` field when something is from memory rather than survey.
