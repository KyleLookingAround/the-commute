# Brief: play offline

## Goal and what it may touch

- Phase 4 step 11 of `docs/ROADMAP.md`. Once a player has visited, the game loads and plays without a connection, from the home screen too. Full screen (3db2e34) added the web app manifest and icons; this step adds a service worker.
  - **What it caches.** The built page, its scripts and styles, the icons and manifest, and `src/data/terrain/base.json` go in at install. These are hashed by Vite, so take the list from the build output, not by hand. The terrain's fine tiles (`src/render/terrain.ts` fetches them by zoom) are cached as they're fetched, so places already seen stay sharp offline. With no connection, a tile never seen falls back to the base tiles quietly, as it does on a failed fetch now.
  - **Updates.** A new deploy is picked up on the next visit without the player clearing anything. When a new version is waiting, it takes over on the next load rather than mid-game. Show nothing, or at most a quiet line in the settings sheet saying the game is ready offline. A build stamp in the worker's cache name keeps old caches from piling up.
  - **The base path.** GitHub Pages serves the site under `/the-commute/` (`vite.config.ts`). The worker's scope, its precache list and the manifest's `start_url` and icons must all work there and at `/` in `npm run dev` and the checks. Check the manifest link in `index.html` resolves under the base path in the build, and fix it if it doesn't.
  - **Saves are untouched.** They stay on the device in local storage, as now. Nothing goes to a server.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test`, and `npm run check` since this touches the page. Run `git status` and stage paths by name before each commit.
- Files it may touch: `public/` (the worker if it's hand-written, and the manifest), `vite.config.ts` (a small plugin step that writes the precache list after the build, or a well-known plugin pinned to an exact version, whichever is smaller), `index.html`, a small `src/app/offline.ts` to register the worker (the app layer, not the view), `src/main.ts` (one line of wiring), `src/render/terrain.ts` only if the tile fetch needs a change to cache well, `src/ui/settings.ts` (the one quiet line, if any), `tools/checks/` (a new `offline` group: load once, go offline with Playwright's `context.setOffline(true)`, reload, and the game starts and runs; a fine tile seen online loads offline; a new build's worker takes over on the next load), and the docs below.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (Save, Terrain), commit 3db2e34 (full screen and the manifest) and its `fullscreen` check group, `.github/workflows/deploy.yml`.

## What it must keep

- Nothing drawn changes the game: no sim change, and the bot's `PLAY` on seeds 1-3 identical to `main`.
- The checks still seed every page through `window.__seed`; the worker must not serve a stale build to the checks. Unregister it, or skip it under the checks if that's simpler, and say which.
- Phones (portrait and landscape, down to 320 px), tablets and desktop. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass. Then it confirms the "Publish to GitHub Pages" run for its commit is green, check job included, or fixes it in the next push. Then it confirms the live site at https://kylelookingaround.github.io/the-commute/ registers the worker, if this container can reach it.

## What's left for others

- Moving around the map (in `src/render/camera.ts`, the strip, `index.html`'s compass button) and shorter days (in the clock across the sim and view) are running. Keep your `index.html` and `src/main.ts` edits to a few lines, and pull often.
- List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the safer option (easier to undo), say so in the commit message, and carry on.

## Cost budget

- Estimate: about $6 (a service worker with a build-time precache list, tile caching, and a check group).
- Past twice the estimate: say why in the commit message and trim what's left.
