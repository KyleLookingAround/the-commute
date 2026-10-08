# The Commute

Station tycoon on a 3D map of the line from Stockport to Manchester Piccadilly. Run Stockport, earn the fares, buy the next station up the line. Everything is one map: locked stations sit in the fog with a price over them until you can afford them.

Built with Vite and Three.js. The simulation is plain JavaScript with no rendering in it, so it runs in node for tests and catch-up, and the 3D scene is only a view of it.

## Run it

```
npm install
npm run dev        # http://localhost:5173
npm test           # simulation tests (node:test, no extra deps)
npm run build      # static site in dist/
```

Pushing to `main` builds and deploys to GitHub Pages (`.github/workflows/deploy.yml`). Turn on Pages in the repo settings with "GitHub Actions" as the source the first time.

## Layout

```
src/
  sim/network.js      corridors, tracks, stations: lat/lon in, metres along a corridor out
  sim/sim.js          passengers, trains, money, upgrades. Game seconds in, state out
  data/network.json   the line: corridor waypoints, tracks, stations, landmarks, services
  data/kits/*.json    one station each: platforms, buildings, and parts gated behind upgrades
  render/             scene, world (ground, towns, track, viaduct, pyramid), stations, trains, passengers, camera
  ui/panel.js         station strip, panels, ticker
  main.js             wires it together, saves to localStorage, catches up time away
tools/osm-to-network.mjs   turn an OSM export into corridor waypoints
test/                 sim and network tests
docs/                 DESIGN.md (economy and kit format), ROADMAP.md (where this is going)
```

## Where the geography comes from

`network.json` currently has hand-entered waypoints. Export the corridor from OpenStreetMap (query in `tools/osm-to-network.mjs`) and paste the generated waypoints in to get the real curves. Station kits are hand-authored in a local frame (u along the line, v across it), so they survive the corridor changing underneath them.
