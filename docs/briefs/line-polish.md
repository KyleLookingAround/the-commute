# Brief: the line, polished

## Goal and what it may touch

- A view-only pass over the "Later" items that phase 3 and 4 sessions handed on (`docs/ROADMAP.md`, phase 3 steps 5 and 9, phase 4 steps 1, 3, 5 and 6). The sim doesn't change. In order, as far as the budget goes:
  1. **Passengers board at their train's platform.** People walk to the platform their train actually stands at, not to the station's face each way. That matters now that every platform is in use: Stockport's 3 and 4 by turns, the expresses on 2 and 3, Piccadilly's bays. The file is `src/render/passengers.ts`, reading the platform each train holds.
  2. **The boards say more** (`src/render/life.ts`): calling points under each departure, and "Cancelled" or "Bus replacement" while trouble blocks the line, read from the sim's trouble state.
  3. **Trouble you can watch:**
     - the spare unit visibly drives out of Stockport's sidings to a failed train over the rescue time
     - the rail replacement buses drive in from, and back off to, a depot or the edge of the map, instead of appearing at the stop
     - their roads come down a station pad's wall rather than dropping off it

     Files: `src/render/trains.ts` and `src/render/buses.ts`.
  4. **Levenshulme at street level.** Its forecourt, taxi rank and replacement bus stop move to the street on the `street` part flag (car parks and bus links added it), and the arched recesses show in the embankment below its platform building. This is in its kit, with `src/render/stations.ts` and `src/render/terrain.ts` if a recess needs a new part type.
  5. **The ground's real lines:**
     - the Mersey's and the M60's real courses through the valley, in place of straight lines out from the viaduct (follow the valley floor in the LIDAR tiles, and check against Wikipedia and Commons maps; OpenStreetMap is still blocked here)
     - the brick arches from Ardwick into Piccadilly, in place of the embankment

     Files: `src/render/landmarks.ts`, `src/render/terrain.ts`, and the network data's landmarks.
  6. **Hipped roofs** as a roof part (Davenport's booking office, Hazel Grove's building, Heaton Chapel's booking office), in place of the flat ones drawn now.
  7. **Weather in the screenshots:** a `--weather` option for `tools/shots.mjs` (the weather session handed this on; `window.__weather` and `window.__day` already set a spell and a day).
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test`, and `npm run check` since this touches the page. Look at `npm run shots`. Run `git status` and stage paths by name before each commit, and push each numbered item as its own commit when it's done.
- Files it may touch: `src/render/` (`passengers.ts`, `life.ts`, `trains.ts`, `buses.ts`, `landmarks.ts`, `terrain.ts`, `stations.ts`, `palette.ts`), the kits in `src/data/kits/` (with `note`s saying where each change came from), the network data's `landmarks` only, `src/ui/styles/tokens.css` (new colours only), `tools/shots.mjs`, `tools/checks/` (extend the groups that cover what you change: life, trouble, landmarks, terrain, geometry), and `docs/DESIGN.md` and `docs/ROADMAP.md` (strike each "Later" item you build).

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (Station life, Things going wrong, Terrain, Landmarks, Platforms and Expresses, Car parks and bus links), the "Later" notes in phases 3 and 4 of `docs/ROADMAP.md`.
- Commits 2210bdf (every platform in use), 62e1914 (terrain), 9820484 (car parks and bus links, the `street` flag) and 0548612 (weather's view).

## What it must keep

- Nothing drawn changes the game: no edits in `src/sim/` or `src/ui/`, and the bot's `PLAY` on seeds 1-3 identical to `main`.
- Real places, with a `note` where something is from memory. Instancing for anything repeated, no per-frame allocations. Phones from 320 px still run smoothly. UK English, and tokens for colours.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes each item to `main` once the rules, tests and `npm run check` pass. Then it confirms the "Publish to GitHub Pages" run for its commit is green, all four check shards included, or fixes it in the next push.

## What's left for others

- Contract renewal (running) appends a `plaque` part to Stockport's kit and registers it in `src/render/stations.ts`, so pull often and keep your edits there to new part types. The redesign (stage 1, running) touches nothing in `src/`.
- Not this pass: Heaton Chapel's and Davenport's car parks (sim stages), the Interchange's flats and ramp, Piccadilly's platform numbering (phase 6), and real last trains (sim). List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the safer option, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $25 (seven view items, each small, with their checks and screenshots).
- Past twice the estimate: say why in the commit message and stop at the item you're on.
