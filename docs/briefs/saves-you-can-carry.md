# Brief: saves you can carry (and the panel's figures)

## Goal and what it may touch

- **Phase 3 step 8 of `docs/ROADMAP.md`: saves you can carry.** Saves stay on the device and never touch a server (an owner's preference), but a player should be able to move a game between their phone and laptop:
  - **Export:** a "Save to file" control beside "Start over" downloads the current save as a small JSON file named after the game (for example `the-commute-day-3.json`), the same shape `src/app/storage.ts` writes.
  - **Import:** "Load from file" picks a file, checks it (it must migrate through `migrate` in `src/sim/save.ts`; a bad or newer-version file says so in a toast and changes nothing), asks once before replacing the game in progress, then loads it and catches up the time since it was written, as a normal load does.
  - Phones: on iOS and Android the file picker and download both work from a tap; check at 320 px.
- **Then, as its own commit, the panel's figures handed on by earlier sessions:** the station panel's homes figure reads `Sim.homes` (homes that grow, commit 6efdeeb) rather than the census number; a "By cab" figure from `StationState.cab` (taxi ranks, b34a7ee) where a station has a rank; a "By bus" figure from `trouble.bused` (things going wrong, 9b03e92) when buses have run. Concise, UK English, in the panel's existing style.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; a view session is editing the kits and the renderer). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page.
- Files it may touch: `src/app/storage.ts`, a small new file in `src/ui/` for the save controls, `src/ui/panel.ts`, `src/ui/styles/*.css`, `index.html` (the controls' markup only), `src/main.ts` (wiring), `test/` (export and import round-trip, a bad file rejected), `tools/checks/` and the docs below. Not `src/sim/` beyond reading.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (Saves), `docs/decisions/ADR-2026-10-08-no-save-compatibility-before-release.md`, `src/app/storage.ts`, `src/sim/save.ts`.

## What it must keep

- Saves stay on the device: no network calls, no accounts, nothing uploaded.
- No economy change: the bot's `PLAY` on seeds 1-3 identical to `main`.
- Tap targets at least 44 px on touch; phones from 320 px; colours as tokens; UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and it has looked at the shots on a phone; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push. Before committing, run `git status` and stage paths by name, so a commit carries the whole change.

## What's left for others

- Contract renewal (phase 3 step 9) will keep prestige apart from the run in the save; keep the file format easy to extend. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where unclear, take the safer option, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $8 (two small controls, a check and three panel figures).
- Past twice the estimate: say why in the commit message and trim what's left.
