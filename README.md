# The Commute

Station tycoon on a 3D map of the line from Stockport to Manchester Piccadilly. Run Stockport, earn the fares, buy the next station up the line. Everything is one map: locked stations sit in the fog with a price over them until you can afford them.

Built with Vite, Three.js and TypeScript (strict, `tsconfig.json`). The simulation has no rendering in it, so it runs in Node for tests and catch-up (through `tsx`), and the 3D scene is only a view of it.

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm test           # simulation tests (node:test through tsx, no browser)
npm run types      # the type check on its own (the build runs it too)
npm run check      # rules, tests, build, then the browser checks (Playwright)
npm run bot -- --hours 48 --seed 1 --seed 2 --seed 3   # the sensible player, against tools/baseline.json
npm run shots      # screenshots at phone, landscape, tablet and desktop (after a build)
```

Play it at https://kylelookingaround.github.io/the-commute/. Pushing to `main` checks `main` and deploys to GitHub Pages (`.github/workflows/deploy.yml`). How changes are made is in `CLAUDE.md` (the project notes) and the playbooks under `.claude/skills/`; why the repo is shaped this way is in `docs/decisions/`.

## Layout

```
src/
  sim/                the simulation, pure: network, economy and trains, seeded random, versioned saves
  data/               the line (network.json) and one kit per station, plain JSON
  app/                the clock (real time to game time, catching up) and storage (the only localStorage)
  render/             the Three.js view: scene, palette from the tokens, world, stations from kits, trains, passengers, camera
  ui/                 the panels (panel.ts) and the styles (tokens.css, page.css)
  main.ts             wires it together
tools/
  rules.mjs           the source rules the build enforces; build.mjs runs them, then tsc, then Vite
  check.mjs           the browser check runner; checks/ holds one group per file
  bot.mjs             the sensible player; baseline.json its ranges
  shots.mjs           screenshots for a human to look at
  osm-to-network.mjs  turn an OSM export into corridor waypoints; osm-to-kit.mjs drafts a station kit from one
test/                 sim and network tests (node:test)
docs/                 DESIGN.md, ROADMAP.md, decisions/, specs/, briefs/, lessons/, ux/, UX-REVIEW.md
```

## Where the geography comes from

`network.json` holds the real corridor: `tools/osm-to-network.mjs` turns an OpenStreetMap export (the Overpass query is in the file; the raw export lives in the git-ignored `data/raw/`) into waypoints along the line from Davenport to Piccadilly, and `tools/osm-to-kit.mjs` drafts a station's platforms, buildings, footbridges and subways from the same kind of export, in the kit's local frame (u along the line, v across it). The kits are tidied by hand from those drafts; each kit's `note` says what came from the map.
