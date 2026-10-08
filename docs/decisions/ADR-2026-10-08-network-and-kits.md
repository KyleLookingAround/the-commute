# The line is a corridor in real coordinates; stations are data kits with upgrade-gated parts

**Status:** Approved · 8 October 2026

## Context

The first prototype laid the line along one axis with compressed distances. The owner wants branching lines, stations that look like the real ones, upgrades that change what you see, landmarks and later trams, on one map.

## Options considered

- Keep the axis and compress. Simple; breaks the moment two lines meet.
- Model each station by hand in code. Looks right for one station; the sixth is a rewrite.
- A network of corridors in projected metres with stations at a distance along them, and stations as data.

## Decision

- `src/sim/network.js`: corridors are lat/lon waypoints projected to local metres (origin Stockport, true scale), tracks are offsets from a corridor, stations sit at a distance along one. A branch is another corridor; a junction joins two.
- `src/data/kits/<station>.json`: a station is parts in a local frame (`u` along the line, `v` across, `y` up). Parts with an `upgrade` field appear when it's bought. Add a part type in `src/render/stations.js`, not a station in code.
- `tools/osm-to-network.mjs` turns an OSM export into corridor waypoints; the real curves replace the hand-entered ones when the owner supplies the export.

## Consequences

- Trains run on real speeds; the clock runs at 6× real time so they stay watchable.
- Passenger mode, trams and branches are additions to data and the view, not rewrites of the sim.
