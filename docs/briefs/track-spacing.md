# Brief: track spacing, and Stockport's north end

## Goal and what it may touch

- **The owner (13 October 2026), with the two screenshots in `docs/briefs/track-spacing/`:** "you need to make sure we have good enough distances between stations and sections so we don't end up with this spaghetti junction that doesn't make sense."

  The screenshots look north from Stockport's platforms over the viaduct. Tracks weave across the viaduct's deck, cross over one another in long diagonals, and leave the deck at an angle, so pairs of track hang off its side and run on beside it over the valley.
- **Why it happens** (the coordinator's reading; check it):
  - Through Stockport the four main lines spread about 80 m across (the fast lines at 32 and 45.6 m in the `layout`, the slow lines both at 0.25 m), and they must come back to 0, 4.4, 9.2 and 13.8 m on the open line.
  - The up slow does it by crossing both fast lines.
  - Platform 0's `path` runs from 82 m east back to 13.8 m between u = 170 and 400, across every main line.
  - The branch pair at 77.9 m eases over 320 m.
  - Terrain (62e1914) moved the viaduct 190 m south to its real place, so the viaduct now starts at the platforms' north end (u ≈ 155), and all of that easing happens on its deck.
  - Find what the pairs beside the viaduct are too: the branch pair, platform 0's path, a kit's scenery rails or the stabling roads.
- **Two parts:**
  1. **A rule, enforced.** Write down what a sensible layout keeps, and check it in a fast test with no browser (`test/`, run by `npm test`), sampling every track's offset along its corridor. The test fails naming the place. It should cover at least:
     - **No sharp shifts:** a track shifts sideways no faster than a real turnout allows. As a guide, a 4.4 m crossover takes about 90 m, so no more than about 1 m sideways per 20 m along; set the figure from what looks right and say why.
     - **Tracks don't cross except at a proper crossover:** one modelled as such, between neighbouring tracks, short, where the real layout has one. No long diagonals across several tracks.
     - **Room between sections:** a station's throat (from its platform ends to where its tracks reach open-line spacing), a junction's diverging ways and a crossover each get their own stretch. They don't overlap one another or a structure's ends, with a clear gap between them (set it, for example 100 m).
     - **On the deck:** on the viaduct and every bridge, every track stays within the deck's width; off them, tracks follow the ground or an embankment, and nothing hangs in the air.
     - **Blocks:** no block section shorter than the longest train plus an overlap, and no signal inside a throat.

     The rule goes in `docs/DESIGN.md` (where the tracks are) and in a line of the graph's decision record, so the Buxton line and the lines out keep it: their stations and junctions must leave the room it asks for.
  2. **Fix the line so it passes.** Stockport's north end first:
     - Use the real layout from Wikipedia's and Commons' track diagrams and photographs of the station's north end and the viaduct.
     - Order changes are done by proper crossovers in the throat, not diagonals.
     - Where 1.25 times real across leaves no room, narrow the station's spread towards its real widths (the islands, the kit's `v`s and the `layout` offsets, keeping every platform edge 2.1 m from its track for the geometry check) rather than squeezing the throat onto the viaduct.
     - Only if the real viaduct is wider there, widen its deck to match.

     Then run the test over the whole line and fix what else it finds: Piccadilly's throat, Hazel Grove's crossover, Edgeley, and the crossover north of the viaduct at chainage 6192.
- **What must stay the same:** trains drawn where they run, every train wholly alongside its platform, and the sim's distances unchanged unless a platform truly moves. Keep the bot's `PLAY` on seeds 1-3 identical, or explain the difference with its table. Nothing looks different except the layout being tidy: compare `npm run shots` before and after, and take a view like the owner's (looking north over the viaduct from Stockport at 390 × 844) before and after for the commit message.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules`, `npm test` and the check groups your change touches (geometry, kits, line, landmarks, terrain, signals, life at least), not the whole suite. The Publish workflow runs all of it in four shards, and you confirm that run is green. Run `git status` and stage paths by name before each commit, and push the rule and the Stockport fix as separate commits, each leaving `main` building and playable.
- Files it may touch:
  - Data: `src/data/network.json` (layout, tracks, platforms, paths, the viaduct), `src/data/kits/stockport.json` and any kit the test flags.
  - Sim: `src/sim/network.ts`.
  - Render: whatever draws tracks, the viaduct, crossovers and trains (`src/render/world.ts`, `landmarks.ts`, `trains.ts`, `lineside.ts`, `stations.ts`).
  - Tests and docs: `test/`, `tools/checks/geometry.mjs`, `docs/DESIGN.md`, `docs/decisions/ADR-2026-10-13-network-as-a-graph.md`.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (where the tracks are, station kits, terrain, landmarks), the graph's decision record, and the two screenshots in `docs/briefs/track-spacing/`.
- Commits 62e1914 (terrain moved the viaduct), 2210bdf (every platform in use, the platform paths), and your own graph commits.

## What it must keep

- The sim stays pure and seeded. Real layouts where known, with a `note` where something is from memory or a game choice. The geometry check's rules (platform edges 2.1 m from their track, no train through anything solid) still hold. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes each part to `main` once the rules, tests and its check groups pass. Then it confirms the "Publish to GitHub Pages" run for its commit is green, all four check shards included, or fixes it in the next push.

## What's left for others

- The Buxton line and the lines out wait for this rule, and build to it.
- The redesign has landed; nothing else is in the sim. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that looks most like the real railway with the least other change, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $15 (a track layout test, Stockport's north end re-laid, and whatever else the test finds).
- Past twice the estimate: say why in the commit message and stop at the part you're on, leaving `main` playable.
