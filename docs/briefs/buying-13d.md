# Brief: the folds (buying, rethought, part 13d)

## Goal and what it may touch

- Phase 5 step 13d of `docs/ROADMAP.md`, from `docs/design/buying.md` (section 4 and the Build plan, item 4), the pick-up list's item 5 (`docs/briefs/pick-up.md`). Where this brief is silent, the design wins.
- **What it delivers:** the three folds that make a halt's first card short.
  - **The kiosk folds into the booking office:** the booking office costs £4,500 (£3,000 and the kiosk's £1,500) and brings the kiosk's £0.35 a boarding passenger with it; the kiosk is no longer a stage of its own. Its parts in the kits still show, with the booking office (the sim reads the kiosk as built once the booking office is, so no kit changes).
  - **The car park waits on the booking office** (it had no need).
  - **Longer platforms wait on the second platform** (they had no need).
- **The bot** keeps its order of priorities; the kiosk drops out of its list by itself (it's built with the booking office).
- **Balance:** the bot on seeds 1–3 before (a build of `main`) and after, 8 sim hours and 16, with a table of each milestone in the commit message. Baselines (`tools/baseline.json`, the real-scale session's file) are re-proposed to the coordinator only if a milestone leaves its range.
- **The save** keeps its shape (`places` by id); a save with a booking office reads its kiosk as built. No `SAVE_VERSION` change.
- Prototype phase: push straight to `main` after `git pull --rebase origin main`, with `npm run rules`, `npm test`, the bot and the check groups that read the kiosk or the car park's order (`preview`, `places`, `access`) green, then confirm the Publish run.
- Files it may touch (the pick-up's file split): `src/sim/places.ts`, `src/sim/sim.ts`, `test/` for the folds' tests, `src/ui/` if a card's wording needs it, `docs/DESIGN.md`, `docs/ROADMAP.md`. `tools/` (the bot, the baselines, the checks) only through the coordinator.

## Read first

- The project notes (`CLAUDE.md`), `docs/design/buying.md` (sections 4, 5 and 8), `.claude/skills/balance/SKILL.md`, `docs/DESIGN.md` (stations growing from a halt).
- `src/sim/places.ts` (`UPGRADES`, `derive`), `src/sim/sim.ts` (fares and `ready`), `tools/bot.mjs` (`act`).

## What it must keep

- The sim stays pure and seeded. The economy changes on purpose, by the three folds only: the bot's milestones stay inside `tools/baseline.json`'s ranges, or the commit says which moved and why.
- Everything bought shows on the map; locked stations are the one fogged thing, everything else locked is hidden.
- Phones from 320 px, landscape, tablet and desktop. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` (prototype phase) once its rules, tests, bot run and check groups pass, then confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push, and reports to the coordinator with the bot's table.

## What's left for others

- Part 13e (Strain), its own brief.

## When to stop and ask

- Only for something irreversible or outside this brief.
- Otherwise, where a call is the owner's, take the option that changes the game less, say so in the commit message, and carry on. A milestone leaving its range goes to the coordinator with the option taken.

## Cost budget

- Estimate: about $15 (three stage changes, tests, and the bot before and after).
- Past twice the estimate: say why in the commit message.
