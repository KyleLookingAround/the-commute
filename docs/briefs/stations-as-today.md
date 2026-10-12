# Brief: stations as they are today

## Goal and what it may touch

- Phase 4 step 3 of `docs/ROADMAP.md`: each station, fully grown, should look like the real place today. Work through the eight stations against photographs and fix or add what's missing or wrong, one station per commit:
  - **From the roadmap:** Ardwick's lattice footbridge as its own part; Piccadilly's platforms 13 and 14 and the Gateway (as scenery: the line doesn't run through them until phase 6), and the bays' real splay; Levenshulme's curved shelter; Heaton Chapel's arches; Stockport's glass entrance with its curved roof on Station Road.
  - **Handed on by earlier sessions:** Piccadilly's multi-storey and cycle hub were placed by eye; the parts each kit's `note` marks as from memory (shelters, canopies, lamps, the ranks and bus stops) against photographs; car parks at Heaton Chapel, Levenshulme and Davenport if the photographs show them; whether Woodsmoor has lifts at all, and where.
- **Sources:** geograph.org.uk and Wikimedia Commons answer from these sessions (OpenStreetMap does not; don't rely on it). Look at several photographs per station, from different years if the station changed, and record what you used in the kit's `note` (photo ids or Commons file names). Where a photograph can't settle something, say so in the note rather than inventing.
- **How:** prefer a new part type over a station in code (`src/render/stations.ts`'s `Part` union and `partBuilders`); new parts gate on the stage that would build them, or are scenery. The geometry check (`tools/checks/geometry.mjs`) must still pass: nothing solid in a train's way, platforms the right gap from their tracks. Look at `node tools/shots.mjs --stations` before and after each station.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; a sim session is working at the same time). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page.
- Files it may touch: `src/data/kits/*.json`, `src/render/stations.ts`, `src/render/world.ts` (only where a station's surroundings need it), `src/render/palette.ts` and `src/ui/styles/tokens.css`, `tools/checks/`, `tools/shots.mjs`, and the docs below. Not `src/sim/` or the network data's numbers.

## The station's surroundings (the owner, 12 October 2026)

- Not all in this step. Stations grow into their surroundings gradually through the phases (bridges, car parks, forecourts, bus stations such as the Stockport Interchange), each when a phase gives it a reason; see "Throughout" in `docs/ROADMAP.md`. Finish what this brief asks; draw a surrounding only where a station's own parts need it.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (the kit format), phase 4 of `docs/ROADMAP.md`, each kit's `note`.
- Commits 9d4ed9c to 497060b (the tracks-and-stations audit) and 33f8b12 (station life), and their "Handed on" lists.

## What it must keep

- No economy change: the bot's `PLAY` on seeds 1-3 identical to `main` at the commit you started from (no new stages or prices; detail on the existing ones).
- Everything bought shows; locked stations stay fogged; the halt is still the halt. Real places, with a `note` for anything from memory.
- Instancing for repeated parts; phone frame time not worse on the shots; colours as tokens.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass (geometry included) and it has looked at the station shots; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Landmarks (the viaduct for real, the Pyramid, the skyline) are the next phase 4 step. List what you hand on in your last commit message under "Handed on", by station.

## When to stop and ask

- The owner has said not to wait on them: where unclear, take the safer option, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $25 (eight stations against photographs, several new part types).
- Past twice the estimate: say why in the commit message and hand on the stations left.
