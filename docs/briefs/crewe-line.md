# Brief: the Crewe line and its Macclesfield leg

## Goal and what it may touch

- **What it delivers:** phase 5 step 3 of `docs/ROADMAP.md`, the second of the lines out, following the Marple line's pattern (`docs/briefs/marple-line.md` and its Handed on).
  - **The route:** a new corridor on the graph from **Edgeley** south on the real line: Cheadle Hulme, Handforth, Wilmslow.
  - **The Macclesfield leg:** it parts at Cheadle Hulme and runs through Bramhall and Poynton.
  - **Out of scope:** going beyond Wilmslow (Alderley Edge) or Poynton (Adlington), and the Styal line's join at Wilmslow. The Styal line comes next, so name the junction where it will join.
- **The corridor and junctions:**
  - Draw it towards Manchester, like every corridor, with chainage running on through Edgeley.
  - Take the tracks, platforms and roads from OpenStreetMap's main API (boxes a few hundred metres across). Check them against NaPTAN, the LIDAR, `docs/reference/photos/` (cheadle-hulme, handforth, wilmslow, bramhall, poynton) and `docs/reference/aerial/`.
  - Put each source in the data's `note`, and mark anything from memory.
  - Find the real junction at Edgeley and the real one at Cheadle Hulme, and name both in `junctions`.
  - The graph's decision record says junction conflicts first meet real traffic where the Crewe line joins at Edgeley. Show that on the signals, as the Marple line's junctions do.
  - Every new track keeps the spacing rule (`src/sim/layout.ts`), at real scale.
- **The stations and service:**
  - **Stations:** each a kit from the photographs and views from above. Each starts as a halt and grows through the usual stages where the real station has them. Wilmslow is the big one: four platforms and a proper booking hall.
  - **Census and prices:** census homes and draw from `tools/census-to-network.mjs`. Prices continue the progression, set so the new line is a choice beside the Buxton and Marple lines.
  - **Fog and offers:** each station stands fogged with its price until it can be bought. It's offered once Stockport is owned, by touching, as the buying design says. Since it starts from the player's own station, it can come earlier than the Marple line, but not ahead of Heaton Chapel.
  - **The service:** a stopper from Piccadilly through Stockport to the furthest station owned on each leg, with Northern's real calling pattern as far as known and a `note` where it's a game choice. Use a Piccadilly platform the kit already has, and say which.
- **The line between stations:**
  - The new sections get their real line speeds and wires from `tools/osm-to-sections.mjs`, as the other lines did.
  - The Crewe line is wired throughout. Check the Macclesfield leg.
- **The ground and the surroundings:**
  - The terrain tiles cover the new corridor, with trees, masts, signals and roads.
  - Run the real surroundings tool along it as the lines out had it: `node tools/osm-to-world.mjs --corridor 900 --from <id> --to <id>`, with hedges.
  - Give the new squares a budget of their own in the world check if they won't fit the lines-out budget, and give the sizes in the commit message.
- **The economy:**
  - Run the bot on seeds 1–3, at 8 and 16 sim hours, before and after, and put the table in the commit message.
  - At 8 hours the opening's milestones must stay within the baselines.
  - At 16 hours, say when the bot reaches each new station and which line it prefers, and re-propose the baselines with a note saying why.
- **Budgets:**
  - The opening is 442k of 450k triangles. The busy save is 512k of 550k.
  - The script before the first frame is 432 of 450 KB. Bundled terrain counts towards it, so lazy-load the new ground if it would grow.
  - Measure all three before and after.
- **How to land it:**
  - Prototype phase: push straight to `main`, after `git pull --rebase origin main`.
  - Push in parts that each leave `main` playable: the corridor and ground first, then the stations, then the service and balance, then the surroundings.
  - Before each push, run `npm run rules`, `npm test` and the groups the part touches: geometry, kits, terrain, line, layout, signals, world, perf and the bot.
  - Confirm each Publish run is green.

## Read first

- The project notes (`CLAUDE.md`), `docs/decisions/ADR-2026-10-13-network-as-a-graph.md`, `docs/DESIGN.md`, and `docs/design/buying.md`.
- `docs/briefs/marple-line.md`, `docs/briefs/real-surroundings-lines-out.md` and `docs/briefs/line-between-stations.md`, each with its Handed on.
- The Buxton and Marple lines' commits, for how a line out is added.

## What it must keep

- The sim stays pure and seeded. Everything bought shows on the map. Locked stations stand fogged with their price, and everything else locked is hidden.
- Real places and real layouts. Phones from 320 px. UK English. Every perf budget.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

The session pushes each part to `main` once its checks pass, then confirms that commit's Publish run is green on all four shards, or fixes it in the next push. After each part, send the coordinator a few lines.

## When to stop and ask

- The owner has said not to wait on them. Where a call is theirs, take the option that changes the game less, say so in the commit and to the coordinator, and carry on.

## Cost budget

- Estimate: about $40. That covers two legs, two junctions, five kits (one big), the census, a service, ground and surroundings, and the balance.
- At about 500k of context, stop at the end of a part and add a "## Handed on" section here.
