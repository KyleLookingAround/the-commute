# Brief: build the gridlock opening

## Goal and what it may touch

- **The owner's call, 14 October 2026:** build `docs/design/gridlock.md`, going with the defaults on all eight of its open questions. The design is the spec. Its build plan's parts G1 to G4 are this brief, one at a time, in order. G5 (the jam pushes back) is not built.
  - **G1, the car in the sim:** sim, data, the bot and tests. Nothing shows on screen, and `PLAY` stays identical.
  - **G2, Stockport starts shut:** £4,000 to start; Reopen Stockport for £1,000; every station's button says Reopen; starts as data (§7). Raise `SAVE_VERSION`. Run the bot on seeds 1–3 at 8 and 16 h against `main`, with the table in the commit. The opening must be at least as quick to first income and the first next buy as today.
  - **G3, gridlock on the map:** load it in a chunk after the first frame. Its triangle budget comes from the owner's phone figures, which the budgets session (`docs/briefs/budgets.md`) is collecting. If those figures aren't in when you reach G3, build to today's 450,000 at the opening, using the design's wash for the far traffic, and say so.
  - **G4, the road card and the score.**
- **Files:** what each part's line in the build plan names. Those are `src/sim/`, `src/data/network.json`, `src/render/traffic.ts`, `src/ui/`, tokens, `tools/bot.mjs` and the baselines, `test/` and the checks the plan lists. Also `docs/DESIGN.md`, and `docs/design/buying.md` §5 once G2 lands.
- **The real railway by default** (`docs/decisions/ADR-2026-10-14-budgets-and-the-real-railway.md`) holds for realism calls. Economy tuning keeps "changes the game less".
- Prototype phase: push straight to `main` after `git pull --rebase origin main`, one part at a time. Then confirm the Publish run is green.

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
