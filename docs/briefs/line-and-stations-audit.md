# Brief: tracks, trains and stations right

## Goal and what it may touch

- The owner wants to be sure the line looks and works right: tracks lined up with the platforms, trains never passing through a station (its platforms, buildings, stairs, canopies, bridges), trains stopping alongside their platform, and every station looking like the real place.
- Measure before fixing. Add a `geometry` check group that works from the data and the renderer's own geometry, not from eyeballing:
  - at every station and every track a service runs on, the gap from each platform edge to that track's centreline, at points along the platform, is the right one (the real gap, 1.25 times across like the tracks) and the same all the way along;
  - no solid part (platforms, buildings, footprints, stairs, shelters, canopy columns, bridge piers, walls) overlaps the space a train sweeps on any track a service runs on, at any point along the line, in stations and on the open line, including crossovers and turnbacks;
  - each train standing at a stop is wholly alongside a platform face of the station it calls at, stops short of buffers, and boards on the side the platform is;
  - what the renderer draws for tracks and trains matches the offsets and positions the sim uses.
  Show each new check failing on a deliberately broken kit before trusting it.
- Then look: per-station screenshots at platform level and from above, at phone and desktop sizes, compared with each kit's `note`, OpenStreetMap and the photographs it names. Fix what the checks and the shots find, station by station, one commit each.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; other sessions push too). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page.
- Files it may touch: `src/data/kits/*.json`, `src/data/network.json` (layouts, offsets, `stop` positions), `src/render/stations.ts`, `src/render/world.ts`, `src/render/trains.ts` and `src/render/passengers.ts` (only where they draw from different geometry than the sim), `src/sim/network.ts` (only the geometry it hands the renderer), `tools/checks/`, `tools/osm-to-kit.mjs` and `tools/osm-to-network.mjs` (if a fix belongs in the drafting tools), and the docs below.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (the kit format, layouts and tracks), and phase 1 of `docs/ROADMAP.md` (real track spacing, the photo pass).
- `src/sim/network.ts`, `src/render/world.ts`, `src/render/stations.ts`, and the kits in `src/data/kits/`.

## What it must keep

- The bot's `PLAY` on seeds 1-3 identical to `main`, unless a `stop` position or a track has to move to be right; then report the bot before and after in the commit message and keep the measures in their ranges.
- Real places: where a fix comes from memory rather than survey, say so in the kit's `note`.
- Instancing and no per-frame allocations; colours as tokens; phones from 320 px.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass (the new group included) and it has looked at the per-station shots; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Stations as they are today (the next step in phase 4 of the roadmap) comes after this; list anything you find but don't fix in your last commit message under "Handed on", by station.

## When to stop and ask

- The owner has said not to wait on them: where unclear, take the safer option, say so in the commit message, and carry on. Stop only for something irreversible or outside this brief.

## Cost budget

- Estimate: about $20 (a geometry check, then fixes across eight stations with screenshots).
- Past twice the estimate: say why in the commit message and hand on what's left.
