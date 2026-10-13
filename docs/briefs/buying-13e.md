# Brief: Strain (buying, rethought, part 13e)

## Goal and what it may touch

- Phase 5 step 13e of `docs/ROADMAP.md`, from `docs/design/buying.md` (section 6, open question 4, and the Build plan, item 5), the pick-up list's item 5 (`docs/briefs/pick-up.md`). Where this brief is silent, the design wins.
- **What it delivers:** the network's problems shown on the map, view only.
  - **Strain**, a map view: a round labelled button beside Line, Mins and Light on the right edge, off at the start and remembered on the device (`src/app/prefs.ts`, like the other settings, never in the save). While it's on, the reach glow steps back.
  - **Glows** in a warm ramp from amber (`--map-strain-1`) to coral (`--map-strain-2`), soft-edged and lit so they read in daylight, breathing slowly (still with reduced motion), for: a crowded platform (waiting against its cap, from 60% full, each face), people giving up (the walk home: a thin trail of figures into the station's streets, more as more give up this clock hour), late trains (the stretch of line behind each late departure, amber from 1 minute late, coral from 5, over the clock hour) and full car parks (the outline lit once full). No icons, arrows, badges or ranking. A figure ("142 / 150") only on a strong glow, near enough to sit by its place, giving way like station names.
  - **Tap a glow:** the place's card opens at half height with "what's wrong now" at the top in plain figures ("Platform 1: 142 waiting of 150 at 07:50 · 23 gave up this hour"), then its stages as usual. No stage is marked as the fix. The same line shows on a card whenever Strain sees something there, whether or not the view is on.
  - **320 px:** glows have a least size on screen (40 px) so a stretch or a stop stays tappable; figures 12 px mono on the glass pill.
- **Not in this part:** slow sections and held junctions (step 11), full buses and traffic (steps 8, 9, 12).
- **Reads, never writes:** Strain reads the sim's numbers (waiting, `cap`, `lost` this hour, `late` by departure, car park spaces); if a number isn't kept by the hour yet, add a read-only tally in the sim that doesn't move `PLAY` (prove it on seeds 1–3).
- **Budget:** the script before the first frame is at about 448 of 450 KB, shared with the real-scale session. Load Strain's drawing when the view is first turned on, not before the first frame. The opening's and the busy save's triangles stay inside `perf`'s budgets with Strain off; measure with it on too.
- Prototype phase: push straight to `main` after `git pull --rebase origin main`, with `npm run rules`, `npm test`, the bot (`PLAY` unchanged) and the check groups it touches green, then confirm the Publish run.
- Files it may touch (the pick-up's file split): `src/ui/` (the button, the card's line, styles and `--map-strain-*` tokens in `tokens.css`), `src/sim/sim.ts` only for a read-only tally, `src/app/prefs.ts` for the remembered view, `index.html`, `src/main.ts`, `docs/DESIGN.md`, `docs/ROADMAP.md`. **The glows are drawn in `src/render/`, which the real-scale session owns while it runs: agree with the coordinator first where Strain's drawing lives** (a new `src/render/strain.ts` of buying's own is the likely answer), and the same for a new `strain` check group in `tools/checks/` (320 px, reduced motion, nothing drawn changes `PLAY`, a tap on a glow opens its card).

## Read first

- The project notes (`CLAUDE.md`), `docs/design/buying.md` (section 6), `docs/DESIGN.md` (the interface, the reach), `docs/briefs/buying-13b.md` and `buying-13c.md`.
- `src/render/reach.ts` (the glow on the ground it steps back from), `src/ui/panel.ts`, `src/main.ts` (the map views, labels).

## What it must keep

- The sim stays pure and seeded; the bot's `PLAY` on seeds 1–3 is identical to `main` (no economy change).
- Everything bought shows on the map; locked stations are the one fogged thing, everything else locked is hidden. Calm in daylight: a model railway, not a dashboard.
- Phones from 320 px, landscape, tablet and desktop. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` (prototype phase) once its rules, tests, bot run and check groups pass, then confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push, and reports to the coordinator.

## What's left for others

- Slow sections and held junctions join Strain with the line between stations (step 11); full buses and traffic with steps 8, 9 and 12.

## When to stop and ask

- Only for something irreversible or outside this brief.
- Otherwise, where a call is the owner's, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $30 (a map view of four kinds of glow, a tap target for each, the card's line, the prefs, and a check group).
- Past twice the estimate: say why in the commit message and leave the walk home's figures to a follow-up.
