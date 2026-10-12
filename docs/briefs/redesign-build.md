# Brief: UX/UI redesign, stage 2: build the platform sheet

## Goal and what it may touch

- Phase 4 step 10 of `docs/ROADMAP.md`, stage 2 of 2. Build direction A, the platform sheet, exactly as `docs/design/redesign.md` specifies under "What stage 2 builds": the tokens, the components, the panels and files that change, and the checks to update. The mockups at `public/design/` are the picture to match. The owner was shown the three directions on 12 October 2026. The brief said A would be built unless they chose another; if they've since named another, the coordinator will have rewritten this brief.
- **In short:**
  - one sheet over the map (peek, half and full in portrait; docked to the left in landscape, tablet and desktop)
  - cash and clock as pills top left, settings top right, and the title gone
  - the map views as round buttons on the right edge, with Light in a popover
  - chips in the strip
  - the station panel led by four stats
  - a Buy bar that sinks the sheet so the ghost stands in open map
  - edge markers for the next locked station off screen
  - settings gains Screen, Your game (Save, Load, Start over) and About (credits)
  - the contract sheet restyled
  - the token changes for contrast and type
- **Order:**
  1. Tokens and contrast. They're safe alone.
  2. The sheet and the stage's layout, with the camera taking the sheet's cover as a frame offset.
  3. The panels into the sheet, the strip's chips and the Buy bar.
  4. Settings and the contract sheet.
  5. Edge markers.

  Push each as its own commit, each leaving the game playable at every size.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test`, and `npm run check` since this touches the page. Look at `npm run shots` at every size after each step, at 320 px above all. Run `git status` and stage paths by name before each commit.
- Files it may touch: everything the write-up lists (`index.html`, `src/ui/` including a new `src/ui/sheet.ts`, `src/ui/styles/`, `src/render/camera.ts` for the frame offset only, `src/main.ts`), the check groups it names in `tools/checks/` (and a new `contrast` group), `docs/DESIGN.md`, `docs/UX-REVIEW.md`, and the project notes only if a rule changes. This session runs alone on `src/ui/`.

## Read first

- The project notes (`CLAUDE.md`, the owner's preferences above all), `docs/design/redesign.md` in full, the mockups in `public/design/`, and `docs/UX-REVIEW.md`.
- Commits 70e4bb1 (moving around the map: the gestures the sheet must not fight, the strip's slider, the compass) and contract renewal's commits (its sheet in `src/ui/contract.ts`).

## What it must keep

- Nothing drawn changes the game: no edits in `src/sim/`, and the bot's `PLAY` on seeds 1-3 identical to `main`.
- **The owner's preferences:**
  - the map is the star
  - locked things are hidden, except the fogged stations with their price
  - impacts show on the map
  - text is concise UK English
  - no recommended buy: no card is singled out
- Phones from 320 px, landscape, tablets and desktop, with every tap target at least 44 px, keyboard and reduced motion as the write-up says, and play offline still working.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes each step to `main` once the rules, tests and `npm run check` pass. Then it confirms the "Publish to GitHub Pages" run for its commit is green, all four check shards included, or fixes it in the next push.

## What's left for others

- Phone performance (running) may lazy-load the settings sheet and touches `src/main.ts`. Phase 3 loose ends (running) is in the sim, `trains.ts` and `life.ts`. Pull often.
- B's route diagram for the line panel's header and C's board styling for the strip's figures are later ideas (the write-up's last section). List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where the write-up doesn't settle something, take the safer option (easier to undo), say so in the commit message, and carry on.

## Cost budget

- Estimate: about $30 (the write-up's own estimate for A).
- Past twice the estimate: say why in the commit message and stop at the step you're on.
