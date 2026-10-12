# Brief: weather and seasons

## Goal and what it may touch

- Phase 4 step 7 of `docs/ROADMAP.md`: a sky that changes and a year that turns, with weather the player feels through the door-to-door model, not as text.
  - **Weather:** sunny spells, overcast, rain, fog and the odd snowy day, seeded from `rand(g)` and saved, changing over the game hours with fronts that come and go (Manchester, so rain is common but rarely all day). On the map: clouds thickening, rain streaks and puddles' sheen, fog closing the view, snow settling on roofs and platforms; umbrellas up among the passengers when it rains.
  - **What it does:** rain makes walking and waiting feel longer (a canopy, a shelter and lifts matter more, through the door-to-door weights); leaves on the line in autumn slow trains a little (the faster timetable's new signals help); snow slows everything and a few stay home. Keep it gentle: a wet day is a reason a canopy pays, never a wrecked game.
  - **Seasons:** the year turns through the game days (a season every few game days, so a long session sees it change): greener in summer, golden leaves in autumn, bare trees and early dusk in winter, blossom in spring; the sun's path follows the season.
  - **Sound and settings:** rain in the soundscape (`src/render/sound.ts` has a bed and filtered noise bursts to build it from, per the life session's hand-on) and a weather row in the settings sheet (`src/ui/settings.ts`) to show weather or keep it fair-weather for players who'd rather not see rain (cosmetic only: the gameplay effect stays the same, or turns off with it; say which you chose).
- **Working beside other sessions:** the every-platform session owns `src/sim/sim.ts`'s structure at the same time, and the terrain session owns `src/render/world.ts`, `camera.ts`, `homes.ts`, `reach.ts` and `landmarks.ts`. Put the weather's state and rules in a new `src/sim/weather.ts` with the smallest hooks into `sim.ts` and `journeys.ts`, and pull before every push.
- Prototype phase: work on your session's branch and push straight to `main` (pull first). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page, and look at `npm run shots`.
- Files it may touch: a new `src/sim/weather.ts`, small hooks in `src/sim/sim.ts`, `src/sim/journeys.ts`, `src/sim/types.ts` and `src/sim/save.ts` (raise `SAVE_VERSION`), `src/render/sky.ts`, a new `src/render/weather.ts` (rain, fog, snow), `src/render/passengers.ts` (umbrellas), `src/render/sound.ts`, `src/ui/settings.ts`, `src/render/palette.ts` and `src/ui/styles/tokens.css`, `src/main.ts` (wiring), `test/`, `tools/bot.mjs`, `tools/baseline.json`, `tools/checks/` and the docs below.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (door-to-door demand, time, the sky), `.claude/skills/balance/SKILL.md`, phase 4 of `docs/ROADMAP.md`.
- Commit 6beb641 (life: night and the engineering train) and d8d35ec (sound and settings), and their "Handed on" lists.

## What it must keep

- The sim stays pure and seeded: weather from `rand(g)`, the same seed gives the same weather; the bot still runs 8 sim hours in about a second.
- Economy change is agreed: bot on seeds 1-3, 8 sim hours, before and after, table in the commit message, with how many wet hours each seed had and what they cost; keep the opening in range; re-propose the baseline with the note saying why.
- Colourful and alive, not bleak: rain on a model railway, bright macs and umbrellas, the sun coming back. Phones first: rain and snow instanced and cheap, the low graphics setting lighter still, no per-frame allocations. Colours as tokens; UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and the bot's table is in the commit message; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push. One commit per piece (weather, its effects, seasons, sound and settings) is fine. Run `git status` and stage paths by name before each commit.

## What's left for others

- Challenges such as storm season (phase 11) can build on the weather. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $25 (weather in the sim with its balance, rain, fog and snow on the map, seasons, sound and a setting).
- Past twice the estimate: say why in the commit message and hand on what's left.
