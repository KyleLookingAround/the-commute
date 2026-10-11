# Brief: upgrades, better

## Goal and what it may touch

- Make growing a station a picture-led moment. Each reachable stage or upgrade at a station is a card that shows what it adds and what it opens next; choosing a card previews it on the map (the parts it adds drawn as a ghost, with the camera framing them), and buying it makes those parts rise into place. What isn't reachable stays hidden, as now. Ideas for how the cards look and feel come from the owner's other games.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; another session may be pushing too). One commit per change, plain message.
- Files it may touch: `src/ui/panel.ts`, `src/ui/styles/*.css`, `index.html` (the panel's markup only), `src/render/stations.ts` (a ghost preview of gated parts and the rise when built), `src/render/camera.ts` (framing a station's parts), `src/main.ts` (wiring), `tools/checks/` (a check for the preview), and the docs below. Anything else is outside the brief.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (the loop, halts and stages, the kit format), `docs/UX-REVIEW.md`, and phase 2 of `docs/ROADMAP.md`.
- `src/sim/sim.ts` for `visibleUpgrades`, `upgradeName`, `upgradeDesc`, `upgradePrice`, `opens` and `canBuyUpgrade`: the panel already uses them; don't change their meaning.
- The owner's other games, read-only: list them with the session's repository list tool, add the ones you want with `add_repo` (read access), and look at how they present upgrades, unlocks and "what this opens" (overgrow is where this project's runbook came from; hearthworks is another). Borrow ideas, not code or art.

## What it must keep

- No economy change: the bot's `PLAY` on seeds 1-3 is identical to `main` before and after (`npm run bot -- --hours 8 --seed 1 --seed 2 --seed 3` in a worktree of `main` and here).
- Everything bought shows on the map; locked stations are the one fogged thing; everything else locked stays hidden (no greyed-out cards for unreachable stages).
- Show impacts on the map, not as text: the preview and the rise are the point; a toast may confirm but never replace them.
- Phones from 320 px (portrait and landscape), tablet and desktop; tap targets at least 44 px on touch. UK English, concise. Colours and sizes as tokens.
- No per-frame allocations in the loop; the rise is short (about a second) and cheap.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines; never mention the tools used in commits or docs.

## Who merges and when

The session pushes to `main` once `npm run rules`, `npm test` and `npm run check` pass and it has looked at `npm run shots` and a phone-sized shot of the panel; then it confirms the "Publish to GitHub Pages" run for its commit is green.

## What's left for others

- Managers and recommendations (`docs/briefs/managers.md`) come after this lands and will add to the same panel: leave the card layout easy to add a badge or a toggle to.
- People turning away, packed trains and other crowd impacts are `docs/briefs/impacts.md`; don't touch `src/render/passengers.ts` or `src/render/trains.ts`.

## When to stop and ask

- Only for something irreversible or outside this brief.
- Otherwise, if it truly needs the owner: open an issue labelled `needs-owner` with the question and the option it will take by default, carry on, and take the default after 12 hours with no answer.
- Where it's merely unclear, take the safer option and say so in the commit message.

## Cost budget

- Estimate: about $25 (UI and renderer work with several rounds of screenshots).
- Past twice the estimate: say why in the commit message and trim what's left.
