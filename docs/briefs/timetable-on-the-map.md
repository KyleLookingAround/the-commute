# Brief: the faster timetable on the map

## Goal and what it may touch

- The faster timetable (line speed 75 to 90 mph) is the one purchase with nothing of its own on the map, against "everything bought shows". Give it a visible part: the resignalling and track work a real line-speed upgrade comes with, such as colour-light signals along the corridor showing green, and line-speed boards reading 90 where they read 75 before. Choosing its card previews them (the ghost, as for stations), buying it makes them rise into place, and its card and Built chip frame them rather than the whole line.
- View only: read `g.line.timetable` from the sim; don't change the sim. Place the signals and boards from the corridor itself (every so far along the line, clear of stations), not by hand.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; the door-to-door demand session is pushing sim work). One commit per change, plain message. Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page, and look at `npm run shots`.
- Files it may touch: `src/render/world.ts` (where the tracks, wires and masts are drawn), `src/render/stations.ts` only if the preview or rise needs to be shared, `src/render/camera.ts`, `src/render/palette.ts` and `src/ui/styles/tokens.css` (new colours as tokens), `src/main.ts` and `src/ui/panel.ts` (wiring the preview and framing), `tools/checks/` (extend the `line` group) and the docs below. Not `src/sim/` or `src/data/`.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (the panel, the preview and the rise), phase 2 of `docs/ROADMAP.md` ("Upgrades, better").
- `src/main.ts` around the line preview (`lineView`), `src/render/world.ts`, and the preview and rise in `src/render/stations.ts`.

## What it must keep

- No economy change: the bot's `PLAY` on seeds 1-3 identical to `main` before and after (the door-to-door session may change `main` meanwhile: compare against `main` at the commit you started from, in a worktree).
- Instancing for the repeated signals and boards; no per-frame allocations; the rise about a second, at once with reduced motion.
- Phones from 320 px; colours as tokens; UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and it has looked at the shots, including the preview on a phone; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Anything in the sim or the economy (the door-to-door demand session). List anything you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where unclear, take the safer option, say so in the commit message, and carry on. Stop only for something irreversible or outside this brief.

## Cost budget

- Estimate: about $10 (a renderer part with a preview and a check).
- Past twice the estimate: say why in the commit message and trim what's left.
