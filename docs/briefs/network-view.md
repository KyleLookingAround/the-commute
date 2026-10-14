# Brief: a network view you can read, and coming back to a changed map

## Goal and what it may touch

Roadmap phase 5, steps 16 and 17, from the ideas review (`docs/ideas/2026-10-14-review.md`, ideas 3 and 4). Do them one at a time, in order. Both are view only: the sim is untouched, and `PLAY` stays identical on seeds 1–3.

1. **Step 16, a network view you can read.**
   - **Mockup first:** a static mockup at `public/design/network-view/` (320 and 390 px portrait, landscape and desktop, as `public/design/buying/` was made). Send the coordinator its live link, then build without waiting.
   - **What it draws:** at Whole line and wide zoom:
     - the clouds fade out above a height
     - each service is drawn bold in its own colour, with tokens for every colour
     - trains show as dots coloured by how full they are
     - stations show as rings sized by who's waiting, red when people give up
   - **What it keeps:** Strain stays readable, taps open cards as now, and everything repeated is instanced.
   - **Budgets:** it loads after the first frame, inside the perf budgets.
   - **Check:** add a group that proves it draws at wide zoom and never changes `PLAY`.
2. **Step 17, come back to a changed map.**
   - After time away, the camera starts wide and plays what happened in about three seconds before the toast:
     - coins rise over each station by what it earned
     - homes that grew rise
     - car parks fill
   - Respect reduced motion. `MAX_AWAY` stays at half a game day.
   - Check it with a save carried forward through `window.__seed`.

**Files:**
- new `src/render/networkview.ts` and `src/render/away.ts`
- `src/render/camera.ts`, and the clouds where they're drawn
- the one hook that shows the toast
- tokens
- the new check groups
- `public/design/network-view/`
- `docs/DESIGN.md`

## Running alongside

| Session | Brief | Owns |
| --- | --- | --- |
| Services | `docs/briefs/services.md` | `src/data/network.json` (except `roads`), Piccadilly's kit, the sim's services, `src/ui/` cards, `tools/baseline.json`, and the units and tracks in `src/render/` |
| Station surroundings | `docs/briefs/station-surroundings.md` | `roads` and the kits' access parts, and where `src/render/` lays them |
| Budgets | `docs/briefs/budgets.md` | `tools/checks/perf.mjs`, `terrain.mjs` and `world.mjs`, `tools/check.mjs`, the workflow and the stats view |
| Gridlock G1 | `docs/briefs/gridlock-build.md` | `src/sim/traffic.ts` and `src/data/traffic.json` |

Keep to your own new files where you can. If you need a line in a file another session owns, keep it small and say so in the commit. Run `git pull --rebase origin main` before every push.

## What it must keep

- Impacts shown on the map, not as text.
- Colourful, not bleak.
- Phones from 320 px. UK English.
- Every perf budget.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

Push each step straight to `main` once its checks pass. Confirm the Publish run, then send the coordinator a few lines and a screenshot path.

## When to stop and ask

The owner has said not to wait: take the option the review points to and say so.

## Cost budget

About $25 for both. At about 450k of context, add a "## Handed on" section here.

## Handed on

Both steps are built, with the two things step 16 left and step 25 (from the coordinator), all view only:

- **Step 16** (400c5a1, nits 1e970f6): `src/render/networkview.ts`, the clouds' fade in `src/render/sky.ts`, `--map-svc-*`, `--map-full-*` and `--map-ring-*` tokens, and the `networkview` check group. Rings are sized by how full the platforms are. Fogged names give way to owned and offered ones by their real height.
- **Step 17** (38eeaa0, acc70be): `src/render/away.ts`, holds on the homes (`HomesLayer.hold`) and car parks (`StationLife.hold`), an instant Whole line (`fitAll(…, true)`), and the `away` check group, from the bot's save carried forward through `window.__seed`. `MAX_AWAY` is unchanged.
- **Step 25** (f1b31f5): `src/ui/cause.ts`, the chips under the what's-wrong line, and `test/cause.test.ts`.
- `PLAY` was identical to `main` on seeds 1–3 when last compared (before step 25, which doesn't touch the sim). Lines outside the brief's files (`src/main.ts`, `homes.ts`, `life.ts`, `panel.ts`, `strain.ts`, `page.css`) are named in their commits.
- Left for later: the network view draws a service's whole route between the furthest stations its trains reach, so a line with peak-only units resting off the map still shows. The coins after time away are HTML over the canvas, one column per station that earned.
