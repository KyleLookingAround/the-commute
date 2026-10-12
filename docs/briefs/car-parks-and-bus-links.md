# Brief: car parks and bus links

## Goal and what it may touch

- Phase 3 step 10 of `docs/ROADMAP.md`. The ground round a station brings people (the owner, 12 October 2026): a car park lets drivers from beyond a walk park and ride, and a bus link brings people from beyond a walk by bus. Both are stages the player buys, felt through door-to-door journey times, and shown on the map. Stations grow into their surroundings gradually through the phases (the owner): this step adds car parks and bus links, not forecourts, bridges or street works.
  - **Car parks.** A `carpark` stage where the real station has one: Stockport's multi-storey, Hazel Grove's car park, Levenshulme's off Station View and Piccadilly's multi-storey (each kit already draws these as scenery, so gate the existing part with the upgrade instead of adding a new one), and Davenport's small one if a photo settles which side. A bigger car park as a second stage where the real one is big enough to stage (Hazel Grove, Stockport). Drivers come from homes beyond a walk of every station but within a short drive. Their journey is drive, park and walk, then the train, all in the door-to-door budget. The car park has spaces, it fills over the morning, and once it's full the rest don't come. Each car pays a parking charge.
  - **Bus links.** Stockport's Interchange first: the real bus station by the viaduct with its link to the railway station, opened in 2025 (check where it stands and how it looks against Wikipedia and Commons, and put what you used in the kit's or landmark's `note`). Today Stockport's bus pool (the census tool's `BUS_HUBS`, 5 km) is already in its homes from the start, and the opening's pacing rests on it. So the safer option, which changes the game less, is to keep that pool: buying the Interchange makes the bus leg quicker and covered (a shorter felt change between bus and train) and widens the pool. Then bus stops at the other stations a real bus route passes (Levenshulme and Hazel Grove on the A6, Heaton Chapel, Davenport). Each brings a smaller pool of homes beyond a walk whose nearest station it is. No home is counted at two stations.
  - **The census tool** (`tools/census-to-network.mjs`) gives each station its drive and bus pools from the census areas it already reads (Nomis and the ONS geoportal answer from these sessions; re-fetch if the cached data isn't there). Use straight-line distances with a road factor, as it does now, and record the method in the network data's note.
  - **On the map.** Each car park appears when it's bought and fills with cars through the day; the car park drawing in `src/render/life.ts` reads the sim's occupancy instead of the hour. The Interchange is drawn when it's bought, with buses coming in and leaving. A bus stop gets its shelter and its buses pulling in. The reach glow (`src/render/reach.ts`) gains a fainter outer ring where a car park or a bus link reaches, and a card's preview shows it. The station panel shows how many came by car and by bus beside By cab.
  - **Making room.** The town centre's seeded filler blocks (`town()` in `src/render/landmarks.ts`) fill the valley the Interchange stands in, so add its footprint to `taken` there. Kit parts stand at rail level and widen the station's flat pad in `src/render/terrain.ts`. A part away from the platforms, such as the Interchange, a street-level car park or a bus stop, needs a small part flag that stands it on the ground and keeps it out of the pad (the terrain session handed on "a street level for kit parts"). Build that in `src/render/stations.ts` and `terrain.ts`, kept small.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test`, and `npm run check` since this touches the page. Run `git status` and stage paths by name before each commit.
- Files it may touch:
  - Sim: `src/sim/journeys.ts`, a new `src/sim/access.ts` for the car parks and bus links, and small hooks in `src/sim/sim.ts`, `src/sim/types.ts` and `src/sim/save.ts` (raise `SAVE_VERSION`).
  - Data and tools: `src/data/network.json` (the stages' names and the pools), `tools/census-to-network.mjs`, and in the kits, the `carpark` parts' gating plus one part appended for each Interchange or bus stop.
  - Render: `src/render/stations.ts` and `src/render/terrain.ts` (the ground part flag only), `src/render/landmarks.ts` (`taken` in `town()`), `src/render/life.ts` (the car park fill), `src/render/buses.ts` or a new `src/render/links.ts` (buses at the Interchange and stops), `src/render/reach.ts`, `src/render/palette.ts`.
  - UI: the station panel in `src/ui/` (By car, By bus), and `src/ui/styles/tokens.css`.
  - Wiring, tests and docs: `src/main.ts` (wiring), `test/`, `tools/bot.mjs`, `tools/baseline.json`, `tools/checks/`, and the docs below.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (Journeys, Homes and draw, Homes that grow, Taxi ranks, Station life, Terrain), `.claude/skills/balance/SKILL.md`, phase 3 of `docs/ROADMAP.md`.
- Commit 62e1914 (terrain: the pad, the datum, and what it handed on), the taxi rank stage (`docs/DESIGN.md`, Taxi ranks) as the pattern for a station stage with a pool and a map, and `tools/census-to-network.mjs`'s `BUS_HUBS`.

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second.
- Economy change is agreed: bot on seeds 1-3, 8 sim hours, before and after, table in the commit message, with what each car park and bus link brings and earns, and how often a car park fills. The opening's milestones stay in range. A car park should pay for itself in two or three game days at a busy station, and the bot buys them where they earn. Re-propose the baseline with a note saying why if lost or cash moves.
- Everything bought shows on the map; locked stages stay hidden. Real places, with a `note` where something is from memory or a game choice. UK English, tokens for colours, instancing for the cars and buses, no per-frame allocations.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and the bot's table is in the commit message. Then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Every platform in use (running) owns services, platforms and the departure boards, so it shares `src/sim/sim.ts`, `types.ts`, `save.ts`, `network.json` and `life.ts` with you. Weather and seasons (running) also hooks `sim.ts` and `journeys.ts`. Keep your edits there small, put the rest in `access.ts`, pull often, and when two sessions raise `SAVE_VERSION`, take the higher number plus one when you rebase.
- Not this step: forecourts, road bridges and street works round stations; trams (phase 7); buses as competition (phase 5); the county's bus network (phase 8). List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs (pacing above all), take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $25 (two stages through the sim and the census tool with their balance, a part flag for the ground, and cars and buses on the map).
- Past twice the estimate: say why in the commit message and trim what's left.
