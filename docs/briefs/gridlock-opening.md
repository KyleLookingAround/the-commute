# Brief: design the gridlock opening

## Goal and what it may touch

- **The owner's idea, 13 October 2026:** start the game with no public transport running and the roads in complete gridlock, so the car is the rival the player can see. The owner has lifted the old rule that the opening stays unchanged (`docs/decisions/ADR-2026-10-13-all-public-transport.md`).
- **The coordinator's recommendation, which the owner liked enough to design:** open on the gridlock, with Stockport station shut and the A6, the M60 and the town's roads jammed. The first action is "Reopen Stockport", paid for with the starting cash, so the player earns within seconds. From then on the traffic is the score: every station, service, section and bus route bought takes cars off the roads, and the map shows the jams easing. It fits the buying design's Strain (`docs/design/buying.md`): the map shows where the network hurts.
- **This session writes a design, not code.** It delivers `docs/design/gridlock.md` and mockups at `public/design/gridlock/` (static HTML and CSS, like `public/design/buying/`, at 320 and 390 px portrait, a landscape phone and a desktop), and the build plan in parts for the coordinator to brief. It must not change anything in `src/` or `tools/`, or any data. Three other sessions are building there now.
- **What the design must settle:**
  1. **The first 60 seconds,** shot by shot: what the player sees on load (the jam, the shut station, its price), the one thing they can do, what happens when they do it, and when the first fares come in. No scenario choice, no tutorial text wall (the owner's preferences). The opening must be at least as quick to the first income and first next buy as today's, measured against the bot's milestones (`tools/baseline.json`).
  2. **The car in the sim:** how many trips go by car between which places, and how each thing bought shifts them, built on the journeys model that already exists (door-to-door felt time in `docs/DESIGN.md`, Journeys; the drive and bus pools in Car parks and bus links). Say what's new in `src/sim/` and what stays, keep it seeded and pure, and say how the bot measures it (a new figure such as "cars on the road at the morning peak").
  3. **Gridlock on the map, within budget:** how the jams are drawn (instanced cars on the roads that exist, queues at junctions, brake lights, density by the sim's car figure) and what it costs. The opening is at 443k of 450k triangles and the first-frame script at 447 of 450 KB, so say what it draws instead of what, or how it fits (for example, far traffic as a coloured road wash rather than cars). It depends on the roads: today's stand-in roads are from memory, and steps 8 and 9 (the 192, the main roads) redraw them, so say what the gridlock needs from those steps and in what order.
  4. **Places that start shut:** whether every station starts closed and fogged with its price as now, and how "reopen" differs from "buy", or whether that's the same thing with new words.
  5. **Pacing:** how the economy changes. Is income per passenger the same, with demand starting lower and growing as the roads clear? Or is there a reward for cars taken off the road? Say what the bot should show after, against today's baselines.
  6. **What it replaces or folds into:** today's opening (owning Stockport's halt from the start), the contract's renewal, Strain, and the existing car parks and drive pools.
  7. **Open questions for the owner,** at the top, each with the option the build takes if the owner doesn't answer.
- **Research the real picture:** the A6 through Stockport and Heaton Chapel, the M60 at junction 1, Stockport town centre and the Mersey Square gyratory at peak, and Greater Manchester's car mode share, so the design's numbers have a source. Use the census tools' data where it helps (`tools/census-to-network.mjs`, Nomis's method-of-travel tables).

## Read first

- The project notes (`CLAUDE.md`), `docs/design/buying.md` (the format to follow, and Strain), `docs/DESIGN.md` (The loop, Journeys, Car parks and bus links, Pressure on the map, Performance), the two 13 October decision records, `docs/ROADMAP.md` phase 5.
- `public/design/buying/` for how the mockups were made.

## What it must keep

- The owner's preferences in the project notes. In particular: no choice of scenario, hide locked things except fogged stations with their price, show impacts on the map rather than as text events, the player buys everything with no advisor, colourful and alive rather than bleak (gridlock in daylight on a model railway, not grim), and phones from 320 px.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

The session pushes the design and mockups straight to `main` (prototype phase; documents and `public/design/` only), confirms the Pages publish, and sends the coordinator the mockups' live link and the open questions.

## Cost budget

- Estimate: about $20. Research, a write-up and static mockups.
