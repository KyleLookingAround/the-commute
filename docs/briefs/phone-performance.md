# Brief: phone performance

## Goal and what it may touch

- The owner's preference, "keep it playable on a phone", from portrait at 320 px up, after a day of features that each added to the scene: terrain, weather, trees, homes, life, landmarks, car parks and buses. The page is now a 1.32 MB script (about 490 KB gzipped) plus a 432 KB terrain base, and nobody has measured a frame on a phone-like profile. Measure first, then cut where it counts.
  1. **Measure.** Add a `perf` check group:
     - load the opening and a busy save (several stations owned, a peak, rain) at 390 × 844
     - read `renderer.info` (draw calls, triangles, geometries, textures) and the time to the first frame
     - add a frame-time probe over a few seconds under Playwright's CPU throttling
     - log the numbers, and fail only on clear budgets you set from what you find, so the group catches a regression without flaking in a slow container (the timed checks use a steady frame clock: see `open()` in `tools/check.mjs`)

     Put the before numbers in the first commit message.
  2. **Load less.**
     - split the bundle so the first frame doesn't wait for what it doesn't need (Vite's `manualChunks`, or dynamic `import()` for things that come later, such as the sound, the weather particles and the settings sheet)
     - a smaller terrain base: a coarser far ring or a binary encoding, as terrain handed on
     - look again at anything big in `src/data/`

     Keep play offline working: the precache list in `vite.config.ts` is built from `dist/`, so new chunks are included.
  3. **Draw less.** From what step 1 shows: merge or instance what isn't yet, share materials, cut shadow casters on Low, cull far details by distance, and keep per-frame allocations at zero in the loop. Take the largest wins first; stop when the busy save is comfortably inside the budgets.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test`, and `npm run check` since this touches the page. Look at `npm run shots` before and after, since nothing should look different on High. Run `git status` and stage paths by name before each commit, and push each numbered step as its own commit.
- Files it may touch:
  - Render and view: `src/render/` (any file, with the changes kept to performance), `src/main.ts` (lazy loading and wiring), `src/ui/settings.ts` only if Low needs a new switch.
  - Data and build: `src/data/terrain/` and `tools/lidar-to-terrain.mjs` (a smaller base), `vite.config.ts`.
  - Checks and docs: `tools/checks/` (the new `perf` group; add it to `MINUTES` in `tools/check.mjs` if it takes more than a minute), `docs/DESIGN.md`, and the project notes' phone line if a rule changes.

## Read first

- The project notes (`CLAUDE.md`, "Keep it playable on a phone"), `docs/DESIGN.md` (Terrain, Settings, Playing offline), `src/main.ts` and the render loop, and `vite.config.ts`.
- Commits 62e1914 (terrain, and what it handed on about the base's size) and 1177551 (play offline's precache).

## What it must keep

- Nothing drawn changes the game: no edits in `src/sim/`, and the bot's `PLAY` on seeds 1-3 identical to `main`.
- High looks the same as before, and Low only gets cheaper. Phones from 320 px, landscape, tablet and desktop. Offline still works (the `offline` group passes).

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes each step to `main` once the rules, tests and `npm run check` pass. Then it confirms the "Publish to GitHub Pages" run for its commit is green, all four check shards included, or fixes it in the next push.

## What's left for others

- Contract renewal (finishing: a plaque on Stockport's kit, and the renewal on the map) and phase 3 loose ends (`src/render/trains.ts` for units stabled overnight, `life.ts` for the first train) are in `src/render/` too.
- Do steps 1 and 2 first, which barely touch their files. Leave `trains.ts` and `life.ts` until those sessions have pushed, and pull often.
- The redesign's stage 2 restyles `src/ui/` after contract renewal lands: don't restyle anything. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs (how Low trades looks for speed), take the safer option, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $15 (a perf check group, a split bundle and a smaller terrain base, and the largest draw-call wins).
- Past twice the estimate: say why in the commit message and stop at the step you're on.
