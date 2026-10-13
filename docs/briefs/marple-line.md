# Brief: the Marple line

## Goal and what it may touch

- Phase 5 step 3 of `docs/ROADMAP.md`, the first of the lines out, one session each. A new corridor on the graph (`docs/decisions/ADR-2026-10-13-network-as-a-graph.md`) from **Ardwick Junction** east and south-east on the real Marple line: Ashburys, Belle Vue, Ryder Brow, Reddish North, Brinnington, Bredbury, Romiley, then Marple on the line towards New Mills Central, and Rose Hill on its branch. The roadmap lists the six from Reddish North; the three nearer Manchester are real stations on the same line, so they come too, bought first, in order out from Ardwick. Going beyond Marple (Strines) or Rose Hill is out of scope.
  - **The corridor:** drawn towards Manchester, like every corridor, from the far end to Ardwick Junction, with chainage running on through it (the graph's decision record). Take the tracks, platforms and roads from OpenStreetMap's main API (`https://api.openstreetmap.org/api/0.6/map?bbox=W,S,E,N`, boxes a few hundred metres across; Overpass and Geofabrik don't answer), checked against the stations' real positions (NaPTAN, as `tools/census-to-network.mjs` and `tools/aerial-views.mjs` read it), the LIDAR, and the reference library: photographs in `docs/reference/photos/` (Reddish North to Rose Hill, with Marple's town centre in `areas/marple/`; there are none yet for Ashburys, Belle Vue or Ryder Brow) and views from above in `docs/reference/aerial/` for all nine. Put each source in the data's `note`, and mark anything from memory.
  - **Where it parts:** the Rose Hill branch leaves the Marple line near Romiley: find the real junction from OpenStreetMap and name it in `junctions`, as the graph does. The line shares the Hope Valley line's tracks from Ardwick to Ashburys and beyond: one pair of tracks, with the junction where the real one is.
  - **The track spacing rule** (`src/sim/layout.ts`, `test/layout.test.ts`): every new track, station and junction keeps it, and `npm test` holds them to it. Ardwick Junction is close to Piccadilly's throat, which is still on the test's list: keep the new junction clear of it, and don't re-lay Piccadilly (another session will).
  - **The stations** are each a kit from the photographs and views from above, like the others: a halt that grows through the usual stages, offered where the real station has them (`grow`). Census homes and draw from `tools/census-to-network.mjs`; prices continue the progression, set so the new line is a late-game choice beside the Buxton line rather than ahead of it. Fogged with their price until reachable, as today.
  - **The service:** a stopper from Piccadilly along the new line to the furthest station owned on each leg (Marple, and Rose Hill), using the graph's routes. Northern's real calling pattern and timings as far as known, with a `note` where it's a game choice. Trains need a platform at Piccadilly: use one the kit already has, and say which.
  - **The ground:** the terrain tiles cover the new corridor (the graph's decision record: a line off the spine needs its own ground and trees), with trees, masts, signals and roads along it as the rest of the line has. The terrain check holds a 2 MB budget, and the Buxton line has taken it to about 1.6 MB; if the new ground won't fit, propose a new budget in the commit message with the sizes, rather than coarsening what's there.
- **The economy:** the bot on seeds 1-3, 8 sim hours, before and after, with a table in the commit message: the opening's milestones unchanged, since the new stations come after Piccadilly. Also a 16-hour run showing when the bot reaches each new station and which it prefers, this line or the Buxton line, and re-propose the baselines with a note saying why.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules`, `npm test` and the check groups your change touches (geometry, kits, terrain, line, landmarks, layout, signals, bot at least), not the whole suite: the Publish workflow runs all of it in four shards, and you confirm that run is green. Run `git status` and stage paths by name before each commit, and push in parts that each leave `main` playable (the corridor and terrain first, then the stations, then the service and the balance).
- Files it may touch:
  - Data: `src/data/network.json` (the corridor, junctions, stations, `grow`, the service and the census figures), new kits in `src/data/kits/`, `src/data/terrain/`.
  - Tools: `tools/lidar-to-terrain.mjs`, `tools/census-to-network.mjs`, `tools/osm-to-network.mjs`, `tools/osm-to-kit.mjs`.
  - Sim and render: `src/sim/` only where the new corridor, junction or service needs it, and `src/render/` only for new part types or what lies along the new corridor.
  - Tests, checks and docs: `test/`, `tools/bot.mjs`, `tools/baseline.json`, `tools/checks/`, `docs/DESIGN.md`, `docs/ROADMAP.md`.

## Read first

- The project notes (`CLAUDE.md`), `docs/decisions/ADR-2026-10-13-network-as-a-graph.md`, `docs/DESIGN.md` (station kits, the network, where the tracks run, terrain, homes and draw, the economy), `.claude/skills/balance/SKILL.md`, phase 5 of `docs/ROADMAP.md`.
- `docs/briefs/buxton-line.md`: the pattern for a new line, being built beside you. Read its commits as they land for how it extends the corridors, the terrain and the service.
- The kits for Heaton Chapel, Levenshulme and Woodsmoor as the pattern for a small station.

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second.
- Everything bought shows on the map. Locked stations stand fogged with their price, and everything else locked is hidden. Real places and real layouts, with a `note` where something is from memory. Phones from 320 px still run smoothly: the `perf` group's budgets hold. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes each part to `main` once the rules, tests and its check groups pass and, for the economy, the bot's table is in the commit message. Then it confirms the "Publish to GitHub Pages" run for its commit is green, all four check shards included, or fixes it in the next push.

## What's left for others

- **Running beside you:** the Buxton line (`docs/briefs/buxton-line.md`), which also edits `src/data/network.json`, `src/data/terrain/` and `tools/baseline.json`; and the real surroundings (`docs/briefs/real-surroundings.md`), which adds real buildings and edits `src/render/world.ts`. Pull often, keep your edits to shared files small, and rebase carefully: never drop the other line's entries.
- **Real buildings** along your corridor come from the real surroundings session's tool once it has landed: draw the lineside as the rest of the line has it today, and list your corridor under "Handed on".
- **Piccadilly's throat** is re-laid by another session; services across lines and the Hope Valley trains are phase 5 step 4. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $35 (a corridor and a junction from OpenStreetMap and the LIDAR, nine small station kits, census figures, a new service with two legs, the ground, and the balance).
- Past twice the estimate: say why in the commit message and stop at the part you're on, leaving `main` playable.
