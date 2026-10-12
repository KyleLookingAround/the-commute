# Brief: moving around the map

## Goal and what it may touch

- Phase 4 step 8 of `docs/ROADMAP.md`. Today `OrbitRig` (`src/render/camera.ts`) only orbits and zooms round one spot, so you get anywhere else through a card or Whole line. Make the map move like a map app, so a player can go anywhere on the line by hand and never get lost.
  - **Touch:**
    - one finger slides the map
    - two fingers pinch to zoom, twist to turn and drag up or down together to tilt
    - zoom is towards the fingers, not the middle of the screen
    - double-tap zooms in where you tapped
  - **Desktop:**
    - drag to slide, right-drag (or Ctrl-drag) to orbit
    - the wheel zooms towards the cursor
    - arrow keys and WASD move, Q and E turn, and + and - zoom; keys do nothing while a text field or a panel's control has focus
  - **Gliding along the line:**
    - the station strip doubles as a slider down the line: drag along it and the camera glides along the corridor; tapping a station in it still opens its panel as now
    - tapping a station on the map flies there and opens its panel
    - tapping a train rides alongside it until you move
  - **Fly-tos** (focus, frame, Whole line and the new ones) ease out, across and in, so a long move lifts to show where it's going. With reduced motion they're instant.
  - **A compass** appears once the map is turned and puts north back up when tapped.
  - **Never lost:** the camera stays above the ground (the terrain's floor, as now) and its target stays within a few hundred metres of the line, sliding along it rather than stopping dead.
  - **Hidden behaviour:** whatever already frames a card's ghost, a Built chip or a train keeps working the same way.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test`, and `npm run check` since this touches the page. Look at `npm run shots`, and try it in a phone-sized page with touch emulation. Run `git status` and stage paths by name before each commit.
- Files it may touch: `src/render/camera.ts` (the rig, rewritten as much as it needs), a small picking helper in `src/render/` (a raycast against the stations' and trains' bounds, no per-frame allocations), `src/ui/panel.ts` (only the strip's slider and the station-tap hook), `index.html` (the compass button), `src/ui/styles/` and `tokens.css` (the compass and the strip's slider), `src/main.ts` (wiring), `tools/checks/` (a new `camera` group: slide, pinch towards a point, twist, tilt, keys, double-tap, strip glide, tap a station to fly and open, tap a train to follow, compass, reduced motion, and the camera never below the ground or far from the line), and the docs below.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (Terrain, and anything on the camera and cards), `docs/UX-REVIEW.md`, phase 4 of `docs/ROADMAP.md`.
- `src/render/camera.ts`, and where `focus` and `frame` are called (cards, Built chip, Whole line, framing a train).

## What it must keep

- Nothing drawn changes the game: no sim change, and the bot's `PLAY` on seeds 1-3 identical to `main`.
- Phones (portrait and landscape, down to 320 px), tablets and desktop. Gestures must not fight the page's own scroll in panels, and the strip still scrolls on a narrow phone. No per-frame allocations, and UK English.
- Settings keep their place; the existing check groups still pass, so update one that relied on the old drag-to-orbit on purpose and say so.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass. Then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Car parks and bus links (running) adds rows to the station panel in `src/ui/panel.ts`. Keep your edits there to the strip and the tap hook, and pull often.
- The UX/UI redesign (phase 4 step 10) will restyle the strip and the controls later, so build the behaviour and keep the look plain. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the safer option (easier to undo), say so in the commit message, and carry on.

## Cost budget

- Estimate: about $15 (a new camera rig with gestures and keys, picking, the strip slider, and a check group).
- Past twice the estimate: say why in the commit message and trim what's left.
