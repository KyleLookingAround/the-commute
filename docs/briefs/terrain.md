# Brief: terrain

## Goal and what it may touch

- Phase 4 step 5 of `docs/ROADMAP.md`: the real lie of the land under the line, from the Environment Agency's open LIDAR: the Mersey valley under the viaduct, the Levenshulme embankment, the cuttings at Heaton Chapel and Davenport, so cutting walls and embankments can be their real height.
- **The data:** the LIDAR Composite DTM (1 m or 2 m) answers from these sessions as a WCS service (`https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs?service=WCS&request=GetCapabilities` returned 200). Write `tools/lidar-to-terrain.mjs` beside the other data tools: it fetches the DTM over the map's area into the git-ignored `data/raw/`, resamples it to what the page needs (coarse far out, finer along the corridor), and writes compact tiles into `src/data/terrain/` (or `public/`), loaded by zoom from the start so phase 8's county map can reuse the scheme. Keep what's committed small (a budget of a couple of MB in all) and say how big. Credit "Contains Environment Agency information © Environment Agency and/or database right" (Open Government Licence) in the footer beside the others.
- **The railway as datum:** keep the tracks, stations and trains where they are (the line's level is the game's zero), and draw the ground relative to the railway's real level along the corridor (the DTM's height minus the rail height, interpolated along the line), so the ground rises into cuttings and falls away under embankments and the viaduct without moving a single kit. Where the ground meets the line, cutting walls, retaining walls and embankment slopes come from the height difference.
- **Handed on to this step:** move the town centre's landmarks and the Pyramid back to their real positions in their notes once the valley is real (`viaductOf` in `src/render/landmarks.ts` reads the valley and viaduct's span and height); let the camera's 4 m floor follow the ground, so a view from the valley floor works (`src/render/camera.ts`); Heaton Chapel's cutting at its real depth (7-8 m on the east) and Levenshulme's embankment with its arched recesses; homes that grow and the reach glow must sit on the new ground (`World.buildable`, `src/render/homes.ts`, `src/render/reach.ts`'s shader patch on the terrain).
- Prototype phase: work on your session's branch and push straight to `main` (pull first; a life session and a sim session are pushing too). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page, and look at `npm run shots` and the station shots.
- Files it may touch: `tools/lidar-to-terrain.mjs` (new), `src/data/terrain/` or `public/terrain/` (new), `src/render/world.ts`, a new `src/render/terrain.ts`, `src/render/landmarks.ts`, `src/render/camera.ts`, `src/render/homes.ts`, `src/render/reach.ts`, the kits only for cutting and retaining walls (scenery), `index.html` (the footer credit only), `.gitignore`, `tools/checks/` (the geometry check must still pass; add a terrain check that no ground pokes into a train's space or a platform), and the docs below. Not `src/sim/`, `src/render/trains.ts`, `src/render/passengers.ts` or `src/render/life.ts`.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md`, phase 4 of `docs/ROADMAP.md`, `src/render/world.ts`.
- Commits 96f079f (landmarks), 6750f7a (stations as they are today) and 6efdeeb (homes that grow), and their "Handed on" lists.

## What it must keep

- No economy change: the bot's `PLAY` on seeds 1-3 identical to `main` at the commit you started from.
- Phones first: tiles loaded by zoom, the far ground cheap, no frame-time drop on the phone shots, nothing allocated per frame. Colourful, model-railway ground, not a grey heightmap. Colours as tokens.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and it has looked at the shots (the valley, the cuttings, a phone); then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push. Run `git status` and stage paths by name before each commit; one commit per piece is fine.

## What's left for others

- The county map (phase 8) widens the tiles. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where unclear, take the safer option, say so in the commit message, and carry on. If the LIDAR can't be fetched after all, build the tool and the tiling on a small area you can get, and hand on the rest.

## Cost budget

- Estimate: about $30 (a data tool, tiled ground, and fitting the line, landmarks, homes and camera to it).
- Past twice the estimate: say why in the commit message and hand on what's left.
