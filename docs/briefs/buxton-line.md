# Brief: the Buxton line beyond Hazel Grove

## Goal and what it may touch

- Phase 5 step 2 of `docs/ROADMAP.md`, and the first new line on the graph that the network-as-a-graph step built (`docs/decisions/ADR-2026-10-13-network-as-a-graph.md`). Extend the Hazel Grove line south-east beyond Hazel Grove on the real Buxton line, as far as the map reasonably goes: Middlewood, Disley and New Mills Newtown at least. Going further (Furness Vale, Whaley Bridge) is your call, depending on what the terrain and census tools can reach in budget; say where you stopped and why.
  - **The corridor:** extend the Hazel Grove line's corridor with the real line's centreline. OpenStreetMap is still blocked from these sessions, so build it from the stations' real coordinates (Wikipedia, NaPTAN through the census tool), the LIDAR (the cutting and embankment show in the DTM, and the terrain tool can fetch more tiles), and Commons and geograph photographs. Put each source in the data's `note`, and mark anything from memory.
  - **The stations** are each a kit from photographs, like the others: a halt that grows through the usual stages, offered where the real station has them (`grow` in the network data). Census homes and draw come from `tools/census-to-network.mjs`, and prices continue the line's progression. They're bought in order out from Hazel Grove, fogged with their price until reachable, as today.
  - **The service:** the Hazel Grove trains run on to the furthest owned station, as the stopper extends to the stations owned now, using the graph's routes. Real calling pattern and timings as far as known (Northern's Manchester to Buxton service), with a `note` where a game choice.
  - **The ground:** the terrain tiles cover the new stretch (base and fine, within the size budget the terrain check holds), with trees, masts, signals and roads along it as the rest of the line has. Middlewood is famously in the fields with no road to it: keep what's true.
- **The economy:** new stations add to the late game. Run the bot on seeds 1-3, 8 sim hours, before and after, with a table in the commit message. The opening's milestones should be unchanged, since the new stations come after Hazel Grove. Also give a 16-hour run showing when the bot reaches each new station, and re-propose the baselines with a note saying why.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules`, `npm test` and the check groups your change touches (geometry, kits, terrain, line, landmarks, bot at least), not the whole suite: the Publish workflow runs all of it in four shards, and you confirm that run is green. Run `git status` and stage paths by name before each commit, and push in parts that each leave `main` playable (the corridor and terrain first, then the stations, then the service and the balance).
- Files it may touch:
  - Data: `src/data/network.json` (the corridor, stations, `grow`, the service's legs and the census figures), new kits in `src/data/kits/`, `src/data/terrain/`.
  - Tools: `tools/lidar-to-terrain.mjs`, `tools/census-to-network.mjs`.
  - Sim and render: `src/sim/` only where a new station or the longer service needs it, and `src/render/` only for new part types or what lies along the new stretch.
  - Tests, checks and docs: `test/`, `tools/bot.mjs`, `tools/baseline.json`, `tools/checks/`, `docs/DESIGN.md`, `docs/ROADMAP.md`.

## Read first

- The project notes (`CLAUDE.md`), `docs/decisions/ADR-2026-10-13-network-as-a-graph.md`, `docs/DESIGN.md` (station kits, terrain, homes and draw, the economy), `.claude/skills/balance/SKILL.md`, phase 5 of `docs/ROADMAP.md`.
- The network-as-a-graph commits (f4b4e19, f59b7eb, 8dc48df and its journeys commit), and the kits for Hazel Grove, Woodsmoor and Davenport as the pattern for a small station.

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second.
- Everything bought shows on the map. Locked stations stand fogged with their price, and everything else locked is hidden. Real places and real layouts, with a `note` where something is from memory. Phones from 320 px still run smoothly: the `perf` group's budgets hold. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes each part to `main` once the rules, tests and its check groups pass and, for the economy, the bot's table is in the commit message. Then it confirms the "Publish to GitHub Pages" run for its commit is green, all four check shards included, or fixes it in the next push.

## What's left for others

- The other lines out (Marple, Crewe and Macclesfield, Styal, Reddish South) come next, one session each, possibly side by side with you. Keep to the Hazel Grove line's corridor and pull often.
- Services across lines (Hazel Grove and Buxton trains through to Manchester) are phase 5 step 4. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $30 (a corridor and terrain from LIDAR and coordinates, three or more station kits from photographs, census figures, the service extended, and the balance).
- Past twice the estimate: say why in the commit message and stop at the part you're on, leaving `main` playable.
