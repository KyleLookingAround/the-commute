# Brief: landmarks

## Goal and what it may touch

- Phase 4 step 4 of `docs/ROADMAP.md`: the places that make the line recognisable at a glance.
  - **Stockport Viaduct for real:** 27 arches at full height over the Mersey valley, red brick with its piers and the 1880s widening's join visible, the M60 and the river beneath, lit at night. It exists today as a simple arcade in `src/render/world.ts`; make it the line's centrepiece.
  - **The Pyramid** (the blue glass office by the M60), **the Plaza** (Stockport's art deco cinema) and **Stockport's town centre and Merseyway** around the viaduct's north end. Leave the Stockport Interchange (the new bus station with the roof park) out: the owner counts it as part of the station, and it arrives with phase 3's bus links.
  - **The city skyline on the horizon** towards Manchester: Beetham Tower, Deansgate Square's towers and the other tall buildings, as silhouettes that sit right from every angle and light up at dusk.
- **Sources:** geograph.org.uk and Wikimedia Commons answer from these sessions (OpenStreetMap does not); the landmarks' positions are in `src/data/network.json` (`landmarks`). Record the photos used in each landmark's `note`.
- **How:** a new `src/render/landmarks.ts` for the landmarks, called from where `world.ts` builds them now; move the viaduct's build there rather than growing `world.ts`, keeping its valley and the corridor exactly where they are (the geometry check, `tools/checks/geometry.mjs`, must still pass). Instancing for repeated parts (arches, windows); far landmarks cheap (silhouettes, few triangles); no per-frame allocations.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; the stations-as-today session is editing kits, `src/render/stations.ts` and maybe `src/render/world.ts`, and other sessions are running too). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page, and look at `npm run shots`.
- Files it may touch: a new `src/render/landmarks.ts`, `src/render/world.ts` (only to move the viaduct out and call the new file; keep the change small), `src/data/network.json` (the `landmarks` entries only), `src/render/palette.ts`, `src/render/scene.ts` (materials) and `src/ui/styles/tokens.css`, `tools/checks/`, and the docs below. Not the kits, `src/render/stations.ts` or `src/sim/`.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md`, phase 4 of `docs/ROADMAP.md`, `src/render/world.ts`.

## What it must keep

- No economy change: the bot's `PLAY` on seeds 1-3 identical to `main` at the commit you started from.
- Colourful and alive, a model railway in daylight; real places with a `note` for anything from memory. Phone frame time not worse on the shots. Colours as tokens.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and it has looked at the shots, including the viaduct from the valley floor and the skyline at dusk; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push. Run `git status` and stage paths by name before each commit.

## What's left for others

- Terrain from LIDAR is the next phase 4 step and will reshape the valley; keep the viaduct's height and the valley in one place it can read. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where unclear, take the safer option, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $20 (a hero viaduct, three town landmarks and a skyline).
- Past twice the estimate: say why in the commit message and hand on what's left.
