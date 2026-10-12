# Brief: homes that grow

## Goal and what it may touch

- Phase 3 step 7 of `docs/ROADMAP.md`, the heart of Marchetti's constant: where the line brings places within reach, people move there. Improve the line and the suburbs visibly fill in.
  - **In the sim:** each station's homes (its census `catchment`, commit 53e7633) can grow over the game days towards a ceiling set by its land (from the census extract: how many could live within a walk), at a rate that rises with how good its door-to-door trip is (the reach, `Sim.journey`). A station whose trip gets quicker (an extra unit, the faster timetable, the way across) grows faster; one with long waits barely grows. Growth is slow (noticeable over a few game days, not minutes), seeded, saved, and caught up when the player's been away. Demand follows the homes, so growth pays the player back.
  - **On the map:** new houses and small blocks of flats appear round the stations that grow, in the reach's glow (`reachOf(sim, i)` in `src/render/reach.ts`), rising into place as bought parts do; where the world's houses are drawn today (`src/render/world.ts`) they keep off tracks, roads and stations. Colourful terraces and new-builds, not grey boxes.
  - **Balance:** the bot on seeds 1-3 over 8 sim hours, and a longer run (24 or 30 sim hours) to show growth paying back; the opening's milestones in range; the long run's later milestones (Piccadilly, the branch) arriving sooner but not trivially.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; a view session is editing the kits and stations.ts). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page.
- Files it may touch: `src/sim/`, `src/data/network.json` (each station's ceiling, from the census tool), `tools/census-to-network.mjs` (to work out the ceilings), `data/census/extract.json` if it needs a field, `test/`, `tools/bot.mjs`, `tools/baseline.json`, `src/render/world.ts` and a new `src/render/` file for the new homes, `src/render/palette.ts` and `src/ui/styles/tokens.css`, `src/main.ts` (wiring), `tools/checks/` and the docs below. Not the kits or `src/render/stations.ts`.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (door-to-door demand, the reach), `.claude/skills/balance/SKILL.md`, phase 3 of `docs/ROADMAP.md`.
- Commits 53e7633 (real people) and 71073c6 (the reach on the map), and their "Handed on" lists.

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second. Raise `SAVE_VERSION` for the new saved fields.
- Economy change is agreed: bot tables in the commit message (8 hours on seeds 1-3, plus the longer run); re-propose the baseline with the note saying why.
- Instancing for the homes; no per-frame allocations; phone frame time not worse. UK English, tokens for colours.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and the bot's tables are in the commit message; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Contract renewal (phase 3 step 9) decides what grown homes keep through a renewal. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $20 (growth in the sim with its balance, and new homes on the map).
- Past twice the estimate: say why in the commit message and trim what's left.
