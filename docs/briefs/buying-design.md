# Brief: buying, rethought (the design)

## Goal and what it may touch

- **The owner (13 October 2026):** "maybe the way upgrades and buying stations needs to be rethought too, since they become part of the game instead of the game", then chose two of the three directions proposed: **a growing network** and **problems on the map lead**. The decision is `docs/decisions/ADR-2026-10-13-buying-a-growing-network.md`; the wider direction, all public transport, is `docs/decisions/ADR-2026-10-13-all-public-transport.md`. Read both first.
- **This session designs; it builds nothing in the game.** It works out the buying model in detail, shows it as mockups the owner can open on their phone, and writes the plan to build it. A later session builds it from your write-up.
- **The model, to work out and write down** in `docs/design/buying.md`:
  1. **Places.** Everything buyable is a place on the map: a station, a section of line (between neighbouring stations, or a station and a junction), a junction, a bus route, a bus stop or bus station, a tram stop, a depot. Each starts small and grows in stages, as stations grow from a halt today. List each kind, its first state, its stages and what each stage does in the sim's own terms (minutes off the walk, the wait or the ride; capacity; reliability; fares collected; homes and draw).
  2. **Touching.** What's offered: anything that touches what the player owns. Define touching for every pair of kinds, across modes (a section touches the stations at its ends; a bus stop touches a station within a walk; a bus route touches the stops it calls at; and so on). Real `needs` stay (Davenport waits on Stockport's platforms 0, 1 and 2, where the Hazel Grove trains turn round).
  3. **Fog and price.** Offered places stand fogged with their price, as stations do today; nothing else locked shows. How prices are set: by kind, by distance from Stockport, by what the place would bring, or as the network grows. Keep the incremental shape.
  4. **Today's upgrades, mapped.** Every one of today's fourteen station upgrades and four line upgrades (`UPGRADES` and `LINE_UPGRADES` in `src/sim/sim.ts`) goes somewhere: a stage of a place, folded into another, or dropped, with a reason. The small flat bonuses (a kiosk's £0.35 a passenger) may fold into bigger stages. More units and longer trains belong to the fleet; say where they live until the fleet step (phase 5 step 5) lands, perhaps a depot as a place.
  5. **The opening.** A new player's first five minutes: Stockport as a halt, what's offered first, and what they're likely to buy. The opening should play about as quickly as today: the bot reaches Heaton Chapel at about 0.6 sim hours and Piccadilly at about 5.8 (`tools/baseline.json`). With several things offered at once, say how a first-time player isn't swamped: few offers at the start, more as the network grows.
  6. **The problems layer.** Which of the sim's numbers show on the map and how, all view only: crowded platforms, people giving up (the walk home), late trains, slow sections, junctions holding trains, full car parks, traffic on the roads once there are roads. Showing what's happening, never which buy to make: tapping a problem opens the place it's at, and the place's card lists everything buildable there, as any card does. No arrows, badges or "best buy". Keep it calm in daylight and readable at 320 px; say how the player turns it on or off, if they can.
  7. **One card for every place.** The card's layout for any kind of place: its name, kind, what it carries and earns now, its stages built and the ones offered with prices and what each saves. The sheet's Station | Line switch and the strip of station chips give way to something that finds places across modes: say what (a list of owned and offered places by kind, a search, the map itself). Direction A of the redesign (`docs/design/redesign.md`) stays the frame: the map full screen, the sheet over it.
  8. **The bot.** How `tools/bot.mjs` chooses among several offers simply, so pacing can still be measured on seeds 1-3.
  9. **The save.** What the save holds in the new model (places owned and their stages), for the build session to raise `SAVE_VERSION` from.
- **The mockups:** a page at `public/design/buying/index.html`, so it goes live at https://kylelookingaround.github.io/the-commute/design/buying/. Static HTML and CSS, reusing `public/design/design.css` where it helps; no game code. Phones first. Show:
  - the map at the start with the first offers fogged with their prices;
  - the network a few hours in, with offers on several fronts: the next station on two lines, a section of line, a bus stop by a station;
  - the problems layer on, over the same view;
  - a place's card for a station, a section of line, a bus stop and a bus route;
  - what replaces the strip for finding places;
  - the first five minutes, step by step.
  Each at 320 and 390 px portrait, a landscape phone and a desktop. Real place names, prices worked out from your model and today's game, UK English. Today's game, for comparison: a few screenshots from `npm run shots`, kept small.
- **Open questions:** where the owner's call is needed, write the question, the option you'd take and why, at the top of the write-up and the page. Where it's merely unclear, take the option that changes the game less and say so.
- **The build plan:** at the end of `docs/design/buying.md`, the steps to build it, each about one session's work, in order, with what each changes (sim, save, view, bot, checks) and the briefs it changes: `docs/briefs/line-between-stations.md` (its sections become places), the lines out (`docs/briefs/buxton-line.md`, `docs/briefs/marple-line.md`: only the buying order), and buses as a network (phase 5 step 12).
- **The roadmap:** add the build plan to phase 5 of `docs/ROADMAP.md` as step 13, "Buying, rethought", with its parts, and mark step 13 as coming before steps 11 and 12. Add the findings that belong in `docs/UX-REVIEW.md` there.
- **Keep the page out of the offline cache:** `design/` is already left out of the precache (`offline()` in `vite.config.ts`); check the new folder is too.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test`. Run `git status` and stage paths by name before each commit.
- Files it may touch: `public/design/buying/` (the page, its CSS and small PNG screenshots, a few MB at most), `public/design/design.css` only to share styles, `vite.config.ts` (the precache filter, only if the new folder isn't already left out), `docs/design/buying.md`, `docs/UX-REVIEW.md`, `docs/ROADMAP.md`, and nothing in `src/`.

## Read first

- The project notes (`CLAUDE.md`, the owner's preferences above all), the two decision records above, `docs/DESIGN.md` (the loop, journeys, stations growing from a halt, taxi ranks, car parks and bus links, contract renewal, the interface), `docs/design/redesign.md`, `docs/UX-REVIEW.md`.
- `src/sim/sim.ts` (`UPGRADES`, `LINE_UPGRADES`, how stations are bought and `needs`), `src/data/network.json` (`grow`, `needs`), `src/ui/panel.ts`, `src/ui/sheet.ts`, `tools/bot.mjs`, `tools/baseline.json`.
- Phase 5 of `docs/ROADMAP.md`, and the briefs for the line between stations and the lines out.

## What it must keep

- Nothing in the game changes: no edits in `src/`, and the bot's `PLAY` is untouched.
- The owner's preferences: no managers or recommended buys; hide locked things except fogged places with their price; impacts on the map, not text events; concise UK English; phones from 320 px; an incremental upgrade game; colourful and alive.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules and tests pass, then confirms the "Publish to GitHub Pages" run deployed the page and gives the page's live URL in its last commit message.

## What's left for others

- Building the model is for later sessions, from your build plan. The line between stations waits for your write-up.
- List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them. Recommend clearly on each open question; if the owner doesn't answer, the build follows your recommendation.

## Cost budget

- Estimate: about $18 (the model written out across nine questions, mockups of six screens at four sizes, the comparison screenshots, and the build plan).
- Past twice the estimate: say why in the commit message and trim what's left.
