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
