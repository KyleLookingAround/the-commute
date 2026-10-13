# Brief: the network as a graph

## Goal and what it may touch

- Phase 5 step 1 of `docs/ROADMAP.md`. Today the whole line is one corridor (`main` in `src/data/network.json`), the Hazel Grove line included, and every track, station and train is a distance along it. Phase 5's lines out of Stockport need lines that meet. Turn the network into a graph, so the steps after this (the Buxton line, the Marple, Crewe, Styal and Reddish South lines, services, the fleet, timetabling) each add data and small pieces rather than reshaping the sim again. This is the biggest change to the sim since it began. It runs alone, with nothing else in `src/sim/`.
  1. **Corridors joined at junctions.** Several corridors in the data, each a real line's centreline, joined at named junctions with the real junctions' names and positions. Today's map is re-expressed this way: the line from Stockport to Piccadilly, and the Hazel Grove line leaving it south of Stockport where it really does (Edgeley Junction; check against Wikipedia and the existing corridor, and give the source in the data's `note`). Tracks belong to a corridor and pass between corridors at junctions. Add the future junctions as named points with no line beyond them yet (where the Styal line leaves at Slade Lane, where the Hope Valley and Marple lines leave towards Ashburys, the Crewe line at Edgeley, the Reddish South line), so the next steps know where they join.
  2. **Services routed across the graph.** A service is a route through the graph, legs of corridor and track, not stations along one corridor. A train's position is a corridor and a distance along it, and it passes onto the next leg at a junction. Platforms, faces, holds, the timetable, late trains, trouble, expresses, last and first trains, stabling and contract renewal all keep working through the route.
  3. **Signalling where lines share track.** Block sections on each track: a train doesn't enter a block another train is in, and at a junction a train doesn't cross a conflicting route while it's set for another. Draw it with the existing colour-light signals (`src/render/lineside.ts`) showing red, yellow and green as blocks clear. Today's line seldom brings trains close, so it should rarely bite. Where it does, it's the late-game pressure phase 5 wants.
  4. **Journey times across the graph.** `src/sim/journeys.ts` finds a trip as a path of legs and changes across services (Stockport's change between the Hazel Grove line and the main line today, more later), rather than assuming one line.
- **What must come out the same:** the game on today's map plays the same. Say why, with the bot's table, wherever `PLAY` on seeds 1-3 differs from `main`, for example signalling holding a train that today slips past. Expect it identical before item 3, and nearly so after.
- **The view follows** (keep it to what the graph needs): world positions come from `src/sim/network.ts` as now, so the trains, tracks, wires, masts and signals draw along routes and junctions. The geometry check still passes for every service on every platform, and nothing looks different on today's map except signals changing aspect.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since another session pushes too. Before a push, run `npm run rules`, `npm test` and the check groups your change touches (geometry, line, trouble, life, bot, contract, camera at least), not the whole suite: the Publish workflow runs all of it in four shards in about twelve minutes, and you confirm that run is green. Run `git status` and stage paths by name before each commit, and push each numbered item as its own commit, each leaving `main` building and playable.
- Files it may touch:
  - Sim and data: `src/sim/` (all of it), `src/data/network.json` (corridors, junctions, tracks, services' routes).
  - Render, only where positions or signals are read: `src/render/` files that read positions from the network (`trains.ts`, `world.ts`, `lineside.ts`, `stations.ts`, `passengers.ts`, `life.ts`, `buses.ts`, `taxis.ts`, `reach.ts`, `camera.ts`).
  - Tools, tests and checks: the data tools that write corridors (`tools/osm-to-kit.mjs`, `tools/census-to-network.mjs` if a station's corridor key changes), `test/`, `tools/bot.mjs`, `tools/baseline.json`, `tools/checks/`.
  - Docs: `docs/DESIGN.md`, a decision record in `docs/decisions/` (the graph's shape is a rule later sessions build on), and the project notes' line about the network if it changes.

## Read first

- The project notes (`CLAUDE.md`, the four layers and "the line is data"), `docs/decisions/ADR-2026-10-08-network-and-kits.md`, and `docs/DESIGN.md` (where the tracks are, platforms, timetable, expresses, journeys, shorter days, contract renewal), phase 5 of `docs/ROADMAP.md`.
- `src/sim/network.ts`, `src/sim/sim.ts`, `src/sim/journeys.ts`, `src/sim/expresses.ts`, and commits 2210bdf (every platform in use), 86212cb (last trains and stabling) and 15d3ab8 (contract renewal).

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second, and `--runs 2` still plays two contracts the same twice.
- The save moves with it: raise `SAVE_VERSION`. The career keeps its own version and is untouched.
- UK English, real junction names and places, a `note` where something is from memory.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes each item to `main` once the rules, tests and its check groups pass and the bot's table is in the commit message. Then it confirms the "Publish to GitHub Pages" run for its commit is green, all four check shards included, or fixes it in the next push.

## What's left for others

- The redesign's stage 2 (running) is in `src/ui/`, `index.html` and `src/render/camera.ts` for the sheet's frame offset only. Stay out of `src/ui/`, and keep `camera.ts` edits to positions.
- The lines themselves (Buxton, Marple, Crewe, Styal, Reddish South), real calling patterns, the fleet and a timetable view are phase 5's later steps. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $40 (the sim's core reshaped across four items, the view reading positions through it, signalling drawn, and the bot, tests and save moved with it).
- Past twice the estimate: say why in the commit message and stop at the item you're on, leaving `main` playable.
