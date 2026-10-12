# Brief: full screen

## Goal and what it may touch

- A full screen button with the stage's other controls (beside "Whole line"): it puts the whole game, top bar and panels included, in full screen, and takes it out again; its label and icon say which. Esc and the system's own gestures still leave.
- Where the browser can't do it (Safari on iPhone has no full screen for a page), hide the button rather than greying it, and let the game be added to the home screen instead: a web app manifest (name, short name, icons, theme and background colours from the tokens, `display: fullscreen` falling back to `standalone`, portrait and landscape both allowed) and the meta tags iOS reads, so it opens from the home screen without the browser's bars.
- In full screen and from the home screen, respect the safe areas (the notch, the home indicator) in portrait and landscape, so nothing sits under them.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; other sessions push too). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page, and look at `npm run shots`.
- Files it may touch: `index.html`, `src/ui/` (a small new file for the control, and the styles), `src/main.ts` (wiring), `public/` (the manifest and icons; icons drawn from the game's own look, no third-party art), `vite.config.*` if the manifest needs it, `tools/checks/` (the `layout` group or a new one: the button shows where full screen is supported and toggles it, the manifest is linked and valid), and the docs below.

## Read first

- The project notes (`CLAUDE.md`), `docs/UX-REVIEW.md`, `index.html` and `tools/checks/layout.mjs`.

## What it must keep

- No economy change: `PLAY` on seeds 1-3 identical to `main`.
- Tap targets at least 44 px on touch; phones from 320 px; colours as tokens; UK English.
- Not a service worker or offline play: that's a later roadmap item.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and it has looked at the shots; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- The phones-first UX/UI redesign (phase 2 of the roadmap) will restyle the controls; keep the button simple to move.

## When to stop and ask

- The owner has said not to wait on them: where unclear, take the safer option, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $6 (a control, a manifest and a check).
- Past twice the estimate: say why in the commit message and trim what's left.
