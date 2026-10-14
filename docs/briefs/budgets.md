# Brief: budgets that scale with the network

## Goal and what it may touch

The owner's decision, 14 October 2026: `docs/decisions/ADR-2026-10-14-budgets-and-the-real-railway.md`, points 2 to 4. This session builds the checks and tools for them. The Crewe line session builds point 1, lazy-loading the lines out, alongside you.

1. **A stats view for a real phone.**
   - Opening the site with `?stats` shows a small overlay. It shows:
     - frames a second, with the slowest frame in the last 10 seconds
     - triangles and draw calls this frame
     - geometries, textures and the JS heap where the browser gives it
   - Refresh it on a timer, not every frame, with no allocations in the loop.
   - Add a "Copy" button that puts one line of figures on the clipboard, so the owner can paste it back.
   - Add `?stats&save=busy` to open the perf group's busy save, so the owner can measure the heavy case too.
   - Keep it out of the script before the first frame: load it only when the flag is there.
   - Tokens for colours; phones from 320 px.
   - Once it's live, send the coordinator the two links and what to do with them. The owner will run them on a mid-range phone and paste the figures back. The coordinator passes them on, and you set the triangle budgets from them.
2. **Triangles counted per view.**
   - The `perf` group counts what's drawn at the opening and in the busy save.
   - Make sure it counts only what the frame draws at that view, after frustum culling, and say in the group's opening comment that it does.
   - Add one wide view, the whole-line view, with its own budget.
   - Until the owner's figures come in, keep today's numbers.
3. **Tile budgets per line.**
   - In `tools/checks/terrain.mjs` and `tools/checks/world.mjs`, replace the shared totals with an allowance per corridor, read from the network's corridors.
   - Allowances: today's line keeps its own, and each line out gets about 0.5 MB of terrain and 0.5 MB of world squares. Report each line's figure.
   - Add a check of what one view loads: the opening, and the Buxton and Marple lines framed. Measure it from the network requests after the first frame, with a budget that says what a player downloads.
4. **Six shards.**
   - The browser checks run as six parallel jobs in the Publish workflow rather than four.
   - Rebalance `tools/check.mjs`'s minutes from the latest runs.
   - Keep each job well inside its time limit, and keep the report job's "main is red" handling working with six.
5. **Later, if there's time:** the real squares' ground cover keeps a 256-pixel layer a square on the GPU, about 30 MB for 115 squares (`docs/briefs/real-surroundings-lines-out.md`, Handed on). Halve it, or page it in and out by distance. It's in `src/render/world.ts`, so tell the coordinator before starting, in case the Crewe line session is in that file.

**Files it owns:**
- `tools/checks/perf.mjs`, `terrain.mjs` and `world.mjs`
- `tools/check.mjs`
- `.github/workflows/deploy.yml`
- the new stats view, as new files in `src/ui/` and `src/app/`, plus the one line that loads it

Everything else (`src/data/`, `src/sim/`, `src/render/` and the other checks) belongs to the Crewe line session (`docs/briefs/crewe-line.md`), which is lazy-loading the lines out's data and ground now. If you need a change there, ask the coordinator.

Before every push, run `git pull --rebase origin main`.

## Read first

- The project notes (`CLAUDE.md`), the decision record above, and `docs/DESIGN.md` (Performance).
- `tools/checks/perf.mjs`, `world.mjs` and `terrain.mjs`, and the Publish workflow.

## What it must keep

- The sim untouched, so `PLAY` stays identical on seeds 1–3.
- Every check still able to fail on a real regression. Never loosen a check just to make it pass.
- Phones from 320 px. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

Prototype phase: push straight to `main`, one part at a time, then confirm each Publish run is green. After each part, send the coordinator a few lines.

## When to stop and ask

The owner has said not to wait on them: take the safer option, say so, and carry on.

## Cost budget

About $25. At about 450k of context, stop at the end of a part and add a "## Handed on" section here.

## Added by the owner, 14 October 2026: faster check runs

A Publish run takes about 35 minutes alone, and 70 or more when one queues behind another. Run 131's shards took 23, 29, 23 and 35 minutes. After the six shards, in this order:

6. **Eight shards, balanced on fresh timings.**
   - Put every group in `MINUTES`: signals, sections, geometry, kits, terrain, world and the others count as one minute today.
   - Take the figures from the latest run's "-- group took" lines.
7. **A cheaper way to draw in the checks.**
   - Add a check mode, set by the check harness only: no shadows, a lower pixel ratio and fewer far details.
   - Leave alone any group that measures the look or the cost: perf, contrast, daylight and the screenshots. Those keep the real settings.
   - Say what each group took before and after.
8. **Share the page.**
   - Where a group loads the game afresh for each test, load it once and reset between tests where that's safe: new saves through `window.__seed` and the save key, not a new page.
   - Where the runner has the cores, run a group's independent pages side by side.
   - Report the minutes saved.
9. **Run only what a push can break.**
   - Each group's opening comment names the paths it covers. For pushes to `main`, run only the groups whose paths the push changed, plus a small always-run set (perf, life, saves).
   - Run the whole suite once a night on a schedule. If that run fails, it opens the "main is red" issue too.
   - Prototype phase only: say in the workflow that from the first release, PRs run everything.

Files: as above, plus the opening comments and the page set-up in `tools/checks/*.mjs`. A check's assertions stay as they are. Tell the coordinator before changing a group the Crewe line session is also changing.

## Handed on (14 October 2026)

Done, all on `main`:

1. **Stats view** (a4726b6): `?stats` and `?stats&save=busy`, Copy, its own 1 KB file loaded after the first frame. The busy save is built by `src/app/busy.ts`, shared with the perf group. The links went to the coordinator; **the owner's phone figures haven't come back yet**, so the triangle budgets are still today's.
2. **Per view** (a4726b6): perf's opening, busy save and Whole line (its own geometry and program budgets), counted after culling. What one view loads (e845c29): each view's own files after the first frame, budget 1.5 MB (CI saw 0.17, 0.17 and 0.95 MB); every world square comes in after the first frame wherever the camera is, against the lines' world allowances added up.
3. **Tile allowances per line** (128537b): `tools/lines.mjs`, read by terrain and world. Today's line and the Marple line keep their own; every other corridor gets 0.5 MB of each.
4. **Six shards** (1dd714d), then **eight** (547c55a), rebalanced on the first Check main run (bc6d4da).
- **Check main** (a327002): the checks have their own workflow with one lock for the whole run, so a started run always finishes. This came from the coordinator, after runs 137 to 154 never finished.
7. **Check mode** (4ddb067): no shadows and one pixel per CSS pixel, except perf, contrast, daylight and life; `CHECK_REAL=1` to compare. camera 16.2 → 5.5 min, layout 9.6 → 2.8 and others (bc6d4da's message).
8. **Side by side** (5a6cfe0, bc6d4da): `side()` in `tools/check.mjs`. Not done: sharing one page between tests. Most groups open one page per screen size, and their reloads are what they test.
9. **Selective runs** (7269237): `Covers:` lines and `--changed`, from the last green run; nightly full run at 02:23 UTC.
- Also: terrain lets a bus road pass under the railway (5425002).

Open:
- Set the triangle budgets from the owner's figures when they come.
- Item 5, half done (df4ad28): the ground cover (it lives in `src/render/buildings.ts`, not `world.ts`) holds about 8 MB on the GPU in place of 30. Every square has a 64-pixel layer, and the 24 nearest the camera a 256-pixel one, repainted as it moves. `src/render/traffic.ts`'s `jamStreet` reads both tiers. **Not done: fetching the world squares by distance.** All 115 are fetched after the first frame, nearest first (3.3 MB). `main.ts` waits on all of them (`world.buildings.ready`, then `homes.replan`). Paging needs the station squares fetched first, plus a radius round the camera that grows with its height, so Whole line still loads everything; `ready` would then mean the station squares. perf's "every world square" check would then count per view.
- Time the side-by-side groups from the next Check main runs and update `MINUTES` (run 12 of Check main: shards 10 to 15.5 min).
- Also done since: a time limit per check group (7b8f854) and on offline's takeover steps (ec4fca4). The offline takeover itself (the page stops answering as a new worker takes over) is with the offline takeover fix session. contract runs one size at a time again (dd5c727). Terrain allows a road under a skewed underbridge for up to 120 m where the way's `under` flags mark it (168a66a).
- perf's whole-line view holds 61 programs against 60 since the traffic layer came in. The roads session is sharing materials to fix it.
- The `wip/budgets`, `wip/check-mode` and `wip/side` branches can be deleted: the session's push to delete them was refused.
