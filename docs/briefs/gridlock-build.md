# Brief: build the gridlock opening

## Goal and what it may touch

- **The owner's call, 14 October 2026:** build `docs/design/gridlock.md`, going with the defaults on all eight of its open questions. The design is the spec. Its build plan's parts G1 to G4 are this brief, one at a time, in order. G5 (the jam pushes back) is now built after G4: the ideas review changed this (roadmap step 20), because without it the roads hardly clear after the first morning.
  - **G1, the car in the sim:** sim, data, the bot and tests. Nothing shows on screen, and `PLAY` stays identical.
  - **G2, Stockport starts shut:** £4,000 to start; Reopen Stockport for £1,000; every station's button says Reopen; starts as data (§7). Raise `SAVE_VERSION`. Run the bot on seeds 1–3 at 8 and 16 h against `main`, with the table in the commit. The opening must be at least as quick to first income and the first next buy as today.
  - **G3, gridlock on the map:** load it in a chunk after the first frame. Its triangle budget comes from the owner's phone figures, which the budgets session (`docs/briefs/budgets.md`) is collecting. If those figures aren't in when you reach G3, build to today's 450,000 at the opening, using the design's wash for the far traffic, and say so.
  - **G4, the road card and the score.**
- **Files:** what each part's line in the build plan names. Those are `src/sim/`, `src/data/network.json`, `src/render/traffic.ts`, `src/ui/`, tokens, `tools/bot.mjs` and the baselines, `test/` and the checks the plan lists. Also `docs/DESIGN.md`, and `docs/design/buying.md` §5 once G2 lands.
- **The real railway by default** (`docs/decisions/ADR-2026-10-14-budgets-and-the-real-railway.md`) holds for realism calls. Economy tuning keeps "changes the game less".
- Prototype phase: push straight to `main` after `git pull --rebase origin main`, one part at a time. Then confirm the Publish run is green.

## Running alongside (14 October 2026)

Two other sessions are running. Keep G1 to your own new files so they don't collide:
- **The Crewe line** (`docs/briefs/crewe-line.md`) owns `src/data/network.json`, `src/data/kits/`, `src/render/`, `tools/baseline.json` and the sim's network and services. It's moving the lines out's data out of the first frame now.
- **Budgets** (`docs/briefs/budgets.md`) owns `tools/checks/perf.mjs`, `terrain.mjs` and `world.mjs`, `tools/check.mjs`, `.github/workflows/deploy.yml` and the stats view.

G1 owns:
- `src/sim/traffic.ts` (new)
- `src/data/traffic.json` (new): the traffic stretches with their real counts and sources. These go in their own file, not `network.json`, and load after the first frame.
- `test/traffic.test.ts` (new)
- the bot's traffic report, as its own block in `tools/bot.mjs`

Add `carShare` and `carScale` to `TUNING` in `src/sim/sim.ts` as a two-line change. Nothing else in `src/sim/`.

G1 is done (87f55f4). G2 is done (14 October 2026: `docs/DESIGN.md`, The start).

**G3 goes before G2** (the coordinator, 14 October 2026). It's view only and draws today's opening's jams. G2 (the start, Reopen, the save) waits until the services session (`docs/briefs/services.md`) has finished, since both edit `sim.ts` and the save.

G3 is done (gridlock on the map): `src/render/traffic.ts`, the tokens, the `traffic` check group; screenshots in `docs/briefs/gridlock-build/`.

For G3, the files are:
- a new `src/render/traffic.ts`, in a chunk after the first frame
- the `--map-car-*`, `--map-brake` and `--map-jam-*` tokens
- a few lines where the page loads it
- a new `traffic` check group

G3 reads `roads` and `src/data/traffic.json` but doesn't edit them: the station surroundings session owns `roads`. The perf budgets are being re-set from the owner's phone figures. Until then, build to today's budgets (opening 450,000 triangles), with far traffic as the wash.

## Read first

The project notes (`CLAUDE.md`), `docs/design/gridlock.md` in full, `docs/design/buying.md`, `docs/DESIGN.md` (Journeys, Car parks and bus links, Performance), the decision record above, and `.claude/skills/balance/SKILL.md`.

## What it must keep

- The sim pure and seeded.
- Everything bought shows on the map.
- No scenario choice in the first game.
- Impacts shown on the map, not as text.
- Colourful, not bleak: gridlock in daylight on a model railway.
- Phones from 320 px. UK English. Every perf budget.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

The session pushes each part once its checks pass and confirms its Publish run, then sends the coordinator a few lines.

## When to stop and ask

The owner has said not to wait on them: take the option the design and the decision record point to, say so, and carry on.

## Cost budget

About $30 a part. At about 450k of context, stop at the end of a part and add a "## Handed on" section here.
