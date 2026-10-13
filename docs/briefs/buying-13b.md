# Brief: one card (buying, rethought, part 13b)

## Goal and what it may touch

- Phase 5 step 13b of `docs/ROADMAP.md`, from `docs/design/buying.md` (its section 7 and Build plan, item 2), the pick-up list's item 5 (`docs/briefs/pick-up.md`). Where this brief is silent, the design wins.
- **What it delivers:** one card in the sheet for every place, in place of the Station and Line panels and their switch.
  - **The card** for any place: a head (its name, and under it its kind and one figure: "Station · halt · 12 waiting", "Train service · 2 units", "Depot · 1 spare", "Bus stop", "Network"), then Now (four figures for its kind, the rest of a station's behind More, as today), the stages offered as today's cards (name, price, what it adds, what it saves, Then, Buy or a meter), and Built chips. A place not yet owned shows what it is, its price and Buy, or what it waits on, as a station does today.
  - **The stopper's card** holds Extra unit, Longer trains and Faster timetable; **Stockport's sidings'** card holds the Spare unit; the Hazel Grove line, the Marple line and the other services have cards with their figures and nothing to build yet.
  - **The Network card** opens from the cash pill: the whole network's figures (stations owned, boarded, revenue, reputation) and, once Piccadilly is owned, Renew the contract (open question 6).
  - **Getting to a card:** a tap on a station opens it (as today); a tap on a train opens its service and rides with it; a tap on Stockport's sidings opens the depot; a tap on a bus link's bays opens its stop. Until part 13c's Places row, the strip keeps its station chips and adds one for each service running and for the sidings, after the stations, so no card is out of reach on a phone.
  - **The bus link** stays a card on its station's card too, so it can be bought where it is today; its own Stop card opens from its bays once built. Part 13c moves it to the map with the Places row and Next to.
  - The Buy bar holds the picked stage of any place.
- **Not in this part:** the Places row, Next to chips, edge markers for other kinds, fog prices (13c); the folds (13d); Strain (13e). No sim change but a read-only figure if a card needs one.
- **Budget:** the script before the first frame is at 447 of 450 KB. Keep new UI code out of the entry chunk where it can be: the contract's renewal sheet loads when it's first opened.
- Prototype phase: push straight to `main` after `git pull --rebase origin main`, with `npm run rules`, `npm test` and the check groups it touches green here (`line`, `preview`, `layout`, `reach`, `contract`, `perf`, and a new `places` group), then confirm the Publish run.
- Files it may touch: `src/ui/` (`panel.ts`, `contract.ts`, a new card module if that splits it well, styles), `index.html` (the sheet's tabs go), `src/main.ts` (taps, the cash pill, lazy imports), `src/render/pick.ts` (the sidings and the bays as tap targets), `tools/checks/` (`line`, `preview`, `layout`, `reach`, `contract`, a new `places`, `tools/check.mjs`'s minutes for it), `tools/reveal.mjs`, `tools/shots.mjs`, `docs/DESIGN.md`, `docs/ROADMAP.md`, `docs/UX-REVIEW.md` where a known finding is fixed.

## Read first

- The project notes (`CLAUDE.md`), `docs/design/buying.md` (sections 1, 7 and the Build plan), `docs/DESIGN.md` (the sheet).
- `src/ui/panel.ts`, `src/main.ts`, `src/sim/places.ts`, the `line`, `contract` and `layout` check groups.

## What it must keep

- The sim stays pure and seeded; the bot's `PLAY` on seeds 1–3 is identical to `main` (no economy change).
- Everything bought shows on the map; locked stations are the one fogged thing, everything else locked is hidden: a card never lists a stage that can't be built yet.
- Phones from 320 px, landscape, tablet and desktop. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` (prototype phase) once its rules, tests and check groups pass, then confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push, and reports to the coordinator.

## What's left for others

- Parts 13c (finding places), 13d (the folds) and 13e (Strain), in that order, each its own brief.

## When to stop and ask

- Only for something irreversible or outside this brief.
- Otherwise, where a call is the owner's, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $30 (the panel rewritten as one card for six kinds, three checks moved to it, a new check group).
- Past twice the estimate: say why in the commit message and trim what's left to part 13c.
