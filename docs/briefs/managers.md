# Brief: managers and recommendations

## Goal and what it may touch

- The owner's preference made real: players who don't want the details get managers and recommendations; players who want them take control. Move the bot's buying policy into the sim as an advisor that ranks a player's next buys, use it for a highlighted best next buy (on its card and on the map), a manager per station (a switch on the station's panel: it buys that station's next steps as money allows, keeping a reserve) and a line controller (units, cars, timetable). Managers act inside the sim's step, so they run the same when catching up after time away, in the bot and in tests.
- Prototype phase: work on your session's branch and push straight to `main` (pull first). One commit per change.
- Files it may touch: `src/sim/advisor.ts` (new), `src/sim/sim.ts`, `src/sim/types.ts`, `src/sim/save.ts` (raise `SAVE_VERSION`: the switches are saved), `tools/bot.mjs` (use the advisor), `test/`, `src/ui/panel.ts`, `src/ui/styles/*.css`, `src/main.ts`, `src/render/` only for the map marker, and the docs below.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md`, `.claude/skills/balance/SKILL.md`, phase 2 of `docs/ROADMAP.md`.
- `tools/bot.mjs` (the policy to move), `src/sim/sim.ts` (`visibleUpgrades`, `canBuyUpgrade`, `stationNeeds`, `lineReady`).
- Wait for `docs/briefs/upgrades-ui.md` to land on `main` before touching the panel; the coordinator will tell you.

## What it must keep

- The sim stays pure and seeded. Moving the policy must not change the bot: `PLAY` on seeds 1-3 identical to `main` with the bot using the advisor. Managers are off by default, so a fresh game plays as before.
- Everything a manager buys shows on the map like any purchase (the rise from the upgrades work).
- Phones from 320 px; switches at least 44 px on touch. UK English. Tokens for colours.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

The session pushes to `main` once `npm run rules`, `npm test` and `npm run check` pass, the bot's `PLAY` matches `main`, and it has looked at the panel on a phone; then it confirms the Publish run is green.

## What's left for others

- Crowd impacts on the map (`docs/briefs/impacts.md`). Prestige, regions and anything from later phases.

## When to stop and ask

- Only for something irreversible or outside this brief. A `needs-owner` issue with a default for real questions (what a manager should keep in reserve, say), taking the default after 12 hours. Where merely unclear, the safer option.

## Cost budget

- Estimate: about $25 (a sim refactor proved by the bot, plus UI).
- Past twice the estimate: say why in the commit message and trim what's left.
