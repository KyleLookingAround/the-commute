# Brief: the end-of-phase visual audit

## Goal and what it may touch

- **The owner (13 October 2026):** "at the end of each phase you should take screenshots of everything fully upgraded and the areas around and make sure everything looks correct and if not add them to the next phase to fix."
- This brief is reused at the end of every phase. This run covers phases 3 and 4 (both built, bar their releases); its findings go into phase 5.
  1. **Make the audit repeatable.** A `--audit` mode for `tools/shots.mjs` (it already has `--stations`, with every station bought and grown) that writes a complete, named set to `build/shots/audit/`, so the next phase's audit is one command.
     - **Fully upgraded:** every station bought with every stage, every line upgrade, the car parks full, the bus links and the Interchange, the taxi ranks, the contract plaque (a renewed career), six-car units at platforms, and the expresses calling. Do this by buying everything the game offers, read from the data, so later phases' stations and stages come in on their own.
     - **Every station** from four views: platform level, from above, the approach along the line from each side, and the street side with its surroundings (car park, forecourt, bus stops, roads, town).
     - **The areas around and between:** the line every few hundred metres, from Hazel Grove and Edgeley to Piccadilly. Include the viaduct from the valley and from the deck, every junction, the landmarks (the Pyramid, the Plaza, Merseyway, St Mary's, the Market Hall, the town), the city skyline, and the terrain's cuttings and embankments.
     - **Light and weather:** each view by day; a sample at dusk, at night (lamplight, the engineering train), in rain, in snow and in fog.
     - **Sizes:** each view at phone portrait (390 px) and desktop.
     - **The page's own surfaces:** the sheet at peek, half and full, settings, the contract sheet, the edge marker and the Buy bar, each at 320 px.
  2. **Look at every image.** Write down everything that doesn't look right, for example:
     - tracks or trains through anything solid, or off a deck
     - parts floating or sunk into the ground
     - a bought upgrade with nothing to show for it
     - overlapping or clashing buildings, roads through buildings, or the town's blocks on the line
     - z-fighting or flicker, missing textures or colours
     - labels or markers in the wrong place
     - anything that contradicts the real place (from the kits' notes and photos)
     - panels that overflow or are cut off at 320 px
  3. **Hand it on.** Write `docs/audits/phase-3-4.md`: each finding with a one-line description, where it is, how bad (a player would notice it straight away, or only looking closely), and the screenshot. Keep only the screenshots of findings, plus one overview contact sheet, as JPEGs at about half size, under `docs/audits/phase-3-4/` (a few MB at most). Then add a step to phase 5 of `docs/ROADMAP.md`, "Fix what the phase 3 and 4 audit found", pointing at the file and listing the findings in a line each, most visible first.

  Fix nothing in the game in this session: the audit finds, the next phase fixes. The one exception is the shots tool itself.
- **Already being fixed:** track spacing at Stockport's north end (`docs/briefs/track-spacing.md`) is running now. Pull `main` before your final pass. If the fix has landed, check it; if not, note it under "being fixed" rather than as a finding.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test`. Run `git status` and stage paths by name before each commit.
- Files it may touch: `tools/shots.mjs` (the `--audit` mode, and a fully-upgraded save it builds through the sim), `docs/audits/` (the write-up and its images), `docs/ROADMAP.md` (the new phase 5 step), and the coordinator's and release playbooks' audit lines if the command needs explaining.

## Read first

- The project notes (`CLAUDE.md`, the owner's preferences), `docs/DESIGN.md` (station kits, station life, terrain, landmarks, car parks and bus links, contract renewal, the night), `docs/UX-REVIEW.md`, `docs/design/redesign.md`, and phases 3 to 5 of `docs/ROADMAP.md` (the "Later" notes are known gaps, so list them only if they look wrong, not merely unfinished).
- `tools/shots.mjs` as it stands.

## What it must keep

- Nothing in the game changes: no edits in `src/`, and the bot's `PLAY` untouched.
- The audit set must be complete and named so a later audit can be compared view for view.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes once the rules and tests pass, and confirms the "Publish to GitHub Pages" run is green.

## What's left for others

- The fixes are phase 5's, briefed by the coordinator from the audit file.
- The Buxton line may be running beside you. Shoot the line as it is on `main` when you take the final pass.

## When to stop and ask

- The owner has said not to wait on them. Where it's unclear whether something is wrong, list it as "to check" with the screenshot rather than leaving it out.

## Cost budget

- Estimate: about $15 (an audit mode with a fully-upgraded save, a few hundred screenshots looked at, and the write-up).
- Past twice the estimate: say why in the commit message, write up what you've seen so far, and hand on the rest.
