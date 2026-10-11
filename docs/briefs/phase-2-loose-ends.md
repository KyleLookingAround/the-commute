# Brief: phase 2 loose ends

## Goal and what it may touch

- Finish what the upgrades and impacts work handed on, all view-side:
  1. Tapping a Built chip on a station's panel frames what that step built on the map (the same framing as a card's preview, no ghost).
  2. The line's upgrades (extra units, longer trains and the rest of what the panel offers for the line rather than a station) as cards in the same style as a station's: price, what it adds, what it opens after, Buy or how much to go. Where a line upgrade has something to show (a new unit, a longer train), choosing its card frames it on the map.
  3. A `--map-ghost` token in `src/ui/styles/tokens.css`, read through `src/render/palette.ts`, for the preview ghost, so it no longer shares the passengers' amber. Pick a colour that reads against brick, grass and platform in daylight and at dusk.
- Prototype phase: work on your session's branch and push straight to `main` (pull first). One commit per change, plain message.
- Files it may touch: `src/ui/panel.ts`, `src/ui/styles/*.css`, `index.html` (the panel's markup only), `src/render/stations.ts`, `src/render/camera.ts`, `src/render/palette.ts`, `src/main.ts` (wiring), `tools/checks/` and the docs below. Not `src/sim/`, `src/data/`, `src/render/passengers.ts` or `src/render/trains.ts` beyond reading.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (the panel, the preview and the rise; Pressure on the map), and phase 2 of `docs/ROADMAP.md`.
- The two commits that handed these on: d654b77 (upgrades) and 2ee097c (impacts).

## What it must keep

- No economy change: the bot's `PLAY` on seeds 1-3 is identical to `main` before and after.
- No managers, advisor or recommended buy: the owner dropped them on 11 October 2026. Don't add badges that pick a buy for the player.
- Everything bought shows on the map; locked stations are the one fogged thing, everything else locked stays hidden.
- Phones from 320 px (portrait and landscape), tablet and desktop; tap targets at least 44 px on touch. UK English, concise. Colours and sizes as tokens. No per-frame allocations.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once `npm run rules`, `npm test` and `npm run check` pass and it has looked at `npm run shots` (a phone-sized shot of the panel included); then it confirms the "Publish to GitHub Pages" run for its commit is green.

## What's left for others

- Whether the peaks should press on the bought stations too is the owner's question in issue #2; don't touch the economy.
- The first release is the owner's call.

## When to stop and ask

- Only for something irreversible or outside this brief.
- Otherwise, if it truly needs the owner: open an issue labelled `needs-owner` with the question and the option it will take by default, carry on, and take the default after 12 hours with no answer.
- Where it's merely unclear, take the safer option and say so in the commit message.

## Cost budget

- Estimate: about $10 (three small view changes with screenshots).
- Past twice the estimate: say why in the commit message and trim what's left.
