# Brief: more to see when bought

## Goal and what it may touch

- Phase 4 step 1 of `docs/ROADMAP.md`: what the player buys, and the station around it, look alive and busy rather than placed.
  - **Departure boards** on the platforms and in the booking office once it's built: the next trains each way with their times, and "late" or the minutes late when they are, read from the sim (`Train.due`, `Train.late`, `Sim.headway`, from commit 97d67a6). Refreshed on a timer, never every frame; legible at platform zoom, a lit rectangle further out.
  - **Shops that trade:** a station's kiosk and retail units lit inside, open by day and shuttered at night, busier when the station is.
  - **Car parks that fill** with the hour and how busy the station is: empty at dawn, full by mid-morning on a weekday-like day, emptying in the evening. Where a station has none in its kit, add one only where the real station has one (with a `note`).
  - **Cycle racks** with bikes that come and go, at stations whose real layout has them, tied to a purchase such as the way across.
  - **Platform extensions growing:** buying the extension shows the new platform length rising, with its lamps and edge, as the rise does for other parts.
  - Check every upgrade at every station shows something on the map; add what's missing (a part, or a bigger one where it's too small to see).
- New part types go in `src/render/stations.ts` (the `Part` union and `partBuilders`), with parts in each kit; anything reading the sim each frame reads, never allocates. Cars, bikes and lit windows are instanced.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; a sim session may be pushing too). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page, and look at `npm run shots`.
- Files it may touch: `src/data/kits/*.json`, `src/render/stations.ts`, new files in `src/render/` (boards, car parks), `src/render/palette.ts` and `src/ui/styles/tokens.css`, `src/main.ts` (wiring), `tools/checks/` and the docs below. Not `src/sim/`, `src/render/trains.ts` or `src/render/passengers.ts`.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (the kit format, the preview and the rise, Pressure on the map), phase 4 of `docs/ROADMAP.md`, and the kits' notes.
- Commit 97d67a6 ("Run trains to a timetable and let busy stops make them late") for what the sim offers the boards.

## What it must keep

- No economy change: the bot's `PLAY` on seeds 1-3 identical to `main` at the commit you started from (a sim session is changing `main` meanwhile; compare in a worktree).
- Real places: only add what the real station has, with a `note` where it's from memory. Locked stations stay fogged; locked parts stay hidden.
- Phones first: check the frame time on the phone shots doesn't drop. Colours as tokens; UK English on the boards (real destinations: Manchester Piccadilly, Stockport, Hazel Grove).

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and it has looked at the shots, including a board at platform zoom on a phone; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Tracks, trains and stations right is the next phase 4 step (`docs/briefs/line-and-stations-audit.md`); list anything you notice for it, and anything else you hand on, in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where unclear, take the safer option, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $20 (several new part types across eight kits, with boards that read the timetable).
- Past twice the estimate: say why in the commit message and trim what's left.
