# Brief: the real surroundings

## Goal and what it may touch

- **The owner (13 October 2026):** "can we somehow use the map data and photos to create the game world?", then, after the performance question: "brief the buildings import", and "Environment Agency's photos could be used for other stuff in the game".
- Phase 5 step 10 of `docs/ROADMAP.md`. Replace the made-up surroundings (the scattered suburb houses, the stand-in town in the viaduct's valley, the scattered trees) with the real ones, from open data, drawn in the game's model-railway style: every real building where it stands, at its real height, with its real roof; real trees where the trees are; the ground's real cover (grass, fields, woods, water, roads and car parks).
- **The sources.** Each answers from the sessions (tested 13 October 2026):
  - **OpenStreetMap's main API** (`https://api.openstreetmap.org/api/0.6/map?bbox=W,S,E,N`, boxes a few hundred metres across; it refuses big boxes, so tile the area and keep to a polite rate). Buildings with their outlines, `building:levels` (about 70% have it round Levenshulme), `roof:shape` (about 40%), `height` (rare); `landuse`, `natural`, `leisure` areas; roads and paths. A 500 m by 450 m box round Levenshulme had 627 buildings. Overpass and Geofabrik don't answer.
  - **The Environment Agency's LIDAR Composite first-return DSM** (1 m, 2022, Open Government Licence), the height of whatever the laser met first. Its WCS answers as the DTM's does (`tools/lidar-to-terrain.mjs`): `https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-first-return-dsm-1m/wcs`, coverage `df4e3ec3-315e-48aa-aaaf-b5ae74d7b2bb__Lidar_Composite_Elevation_FZ_DSM_1m`. The DSM less the DTM is the height of everything standing on the ground: a building's height where OSM has none, and a tree's height and spread.
  - **The Agency's survey downloads** (`POST https://environment.data.gov.uk/backend/catalog/api/tiles/collections/survey/search` with a GeoJSON polygon lists the tiles; each result's `uri` is the download): the National LIDAR Programme's **VOM** (vegetation object model: tree and hedge heights, 1 m, 2020 to 2021), **Intensity** (how brightly each spot reflected the laser: tarmac, grass, roofs and water read differently) and its classified **point cloud** (ground, buildings, vegetation). Use them where the DSM and OSM aren't enough; say which you used.
  - **The views from above** in `docs/reference/aerial/` (the DSM shaded, every station, `tools/aerial-views.mjs`) and the **photo library** in `docs/reference/photos/` (each area's "For the map" list gives its materials and colours): to check the result against, and to choose each area's palette.
- **What gets drawn** (view only; the sim doesn't change):
  - **Buildings.** One per OSM building, as a simple shape: its footprint fitted as an oriented rectangle where it nearly is one (most British houses), its outline otherwise; walls to its height (`height`, else `building:levels` at 3 m a storey, else the DSM less the DTM over its footprint, else 2 storeys); a pitched, hipped or flat roof (`roof:shape`, else pitched for houses and terraces, flat for anything over 4 storeys or 30 m across). Terraces join into rows: houses sharing walls become one block with one roof, so a street of 20 is one piece. Colours from the photo library's areas (red brick and slate through the suburbs, buff and render where the photos show it, the city's glass and concrete towards Piccadilly), all as `--map-*` tokens.
  - **Trees** where the DSM or the VOM says there are trees (standing over 3 m where OSM has no building), thinned to one tree per crown, sized by height and spread; hedges along field edges on the open stretches.
  - **Ground cover** from OSM's areas and the intensity survey: grass, fields, woods, water, tarmac and car parks, as a few token colours on the terrain, not a photograph.
  - **Bridges over the line** where the DSM shows them (the DTM leaves them out), as a check on the lineside's road bridges: list any that are missing or in the wrong place for the audit-fix session rather than moving them yourself.
- **What stays.** The landmarks (`src/render/landmarks.ts`: the viaduct, the Pyramid, the M60 and the river) stay as they are: leave their footprints out of the import so nothing stands twice. The stations' kits stay; buildings within a station's kit (210 m) are left out where the kit draws its own. The line's corridor stays clear: no building or tree within the railway's land (the tracks' widest layout and the cutting or embankment), so the trains stay readable.
- **Homes that grow** (`src/render/homes.ts`, view only) need land to stand on, and the real town fills most of it. The sim's homes don't change. On the map, new homes take real gaps first (OSM `landuse=brownfield`, `construction` and `greenfield`, and open ground with no building or tree), nearest the station first; where there isn't room, they stand further out, as today. This is the option that changes the game less (the owner said not to wait on them): say so in the commit message, and what share of each station's grown homes found a real gap.
- **The data.** A new tool, `tools/osm-to-world.mjs` (plain Node, like the others), fetches OSM and the DSM into the git-ignored `data/raw/`, and writes tiles by kilometre square into `src/data/world/`, in a compact text encoding like the terrain's. The page loads the squares after the first frame, nearest the camera first, as it does the fine terrain (`src/render/terrain.ts`), so the script before the first frame doesn't grow. A size budget in a check group, as the terrain has (2 MB for the terrain): propose one from what the pilot measures, aiming at no more than 2 MB for today's line.
- **Performance** (the owner's question; the answer they were given): draw calls barely change, since buildings and trees are instanced by kilometre square (`src/render/cells.ts`); triangles are the risk. Keep within the `perf` group's budgets as they stand (busy save 800 calls and 550,000 triangles, opening 450 and 450,000): don't raise them. The means:
  - join terraces into rows;
  - only buildings and trees near the camera cast shadows (all receive them);
  - simpler further off: past a few hundred metres a building is a block with a flat top, and past a kilometre a square's buildings can be one merged mesh;
  - Low (Settings, Graphics) leaves out far buildings and trees, besides the shadows it already turns off.
  Log the counts before and after in each commit message: draw calls, triangles, geometries, the first frame, and the data's size.
- **In parts, each leaving `main` playable:**
  1. **The pilot:** the tool and the drawing for Levenshulme and Heaton Chapel only (a square or two each), with the `perf` group's numbers before and after, and screenshots beside the views from above. The scattered suburb houses give way to the real ones there only.
  2. **Today's line:** Stockport (the town in the viaduct's valley becomes the real one, round the landmarks), Davenport to Hazel Grove, and Ardwick to Piccadilly. The stand-in houses go.
  3. **Trees and ground cover**, from the DSM, the VOM, the intensity survey and OSM's areas.
  4. **Homes that grow** on the real gaps.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules`, `npm test` and the check groups your change touches (`perf`, `terrain`, `homes`, `geometry`, `landmarks` and the new one at least, `node tools/check.mjs <group> ...`), not the whole suite: the Publish workflow runs all of it in four shards, and you confirm that run is green. Run `git status` and stage paths by name before each commit. Look at the screenshots (`npm run shots`) at every size for each part.
- Files it may touch:
  - Tools and data: `tools/osm-to-world.mjs` (new), `src/data/world/` (new).
  - The view: `src/render/buildings.ts` (new; put the new drawing here), `src/render/world.ts` (to retire the stand-in houses, town and trees, and to give homes and `buildable` the real buildings: keep these edits small, since the Buxton line session also works in it), `src/render/homes.ts`, `src/render/terrain.ts` (ground cover and loading the squares), `src/render/palette.ts`, `src/ui/settings.ts` (only what Low leaves out), `src/ui/styles/tokens.css` (new `--map-*` colours).
  - Checks and docs: `tools/checks/` (a new `world` group: the size budget, every square loads, no building or tree inside the railway's land or a kit, terraces joined; and `perf` only to log the new counts), `docs/DESIGN.md` (a new section, The surroundings, and the Terrain and Homes that grow sections), `docs/ROADMAP.md` (step 10's state), the page footer's credits only if a new source needs one (OSM and the Agency's LIDAR are credited already).

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (Terrain, Homes that grow, Landmarks, Performance), `src/render/world.ts`, `src/render/homes.ts`, `src/render/cells.ts`, `src/render/terrain.ts`, `tools/lidar-to-terrain.mjs` (the WCS fetch and the game's frame to copy), `tools/checks/perf.mjs`, `tools/checks/terrain.mjs`.
- `docs/reference/aerial/index.md` and a few areas' "For the map" lists in `docs/reference/photos/areas/`.

## What it must keep

- The sim stays pure and seeded, and nothing here changes it: the bot's `PLAY` on seeds 1-3 is identical to `main` (say so in each commit message).
- Everything bought shows on the map: no real building may hide a station's bought parts, its car park or bus links. Locked stations stand fogged with their price; everything else locked is hidden.
- Phones from 320 px, landscape, tablet and desktop; the `perf` budgets as they stand. Colourful and alive, a model railway in daylight, not a photograph: simple shapes and token colours. UK English.
- Real places: nothing invented where the data has the real thing; a `note` in the data where something is filled in (a height guessed, a roof assumed).

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes each part to `main` once the rules, tests and its check groups pass, then confirms the "Publish to GitHub Pages" run for its commit is green, all four check shards and the report job included, or fixes it in the next push.

## What's left for others

- **The Buxton line** session works beside you (`docs/briefs/buxton-line.md`), on the corridor south-east of Hazel Grove and in `src/render/world.ts` for what lies along its stretch. Keep your `world.ts` edits small and pull often. Its stretch gets the real surroundings from your tool once it has landed: list that under "Handed on".
- **The lines out** will run your tool for their own areas: make it take an area (a station's id and a radius, or a corridor) rather than today's line only, and say how in its opening comment.
- **The A6 and the 192** (step 8) and **the main roads** (step 9) draw the roads; you draw the buildings along them, and leave the roads as they are.
- **The city skyline** (phase 6 step 4) builds on this at the city end.
- List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on.
- If the pilot can't stay inside the `perf` budgets with the means above, stop after the pilot and say what it would take, rather than raising the budgets.

## Cost budget

- Estimate: about $35 (a new tool over two sources, a new drawing layer with levels of detail, the ground cover, homes on real gaps, a check group, and screenshots at every size for each part).
- Past twice the estimate: say why in the commit message and stop at the part you're on, leaving `main` playable.
