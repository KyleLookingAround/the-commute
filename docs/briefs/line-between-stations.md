# Brief: the line between stations

## Goal and what it may touch

- **Waiting (13 October 2026):** buying is being rethought as a growing network of places with the network's problems shown on the map (`docs/decisions/ADR-2026-10-13-buying-a-growing-network.md`). This session starts once that design lands (`docs/design/buying.md`): build the sections as places in that model, with its card, and take its build plan's word over this brief's on how they're bought and shown. The sim's sections, real speeds and wires below stand either way.

- **The owner (13 October 2026):** liked buying the line between stations next, and set the direction: "I'm thinking just all public transport is the game" (`docs/decisions/ADR-2026-10-13-all-public-transport.md`). Phase 5 step 11 of `docs/ROADMAP.md`, the first step of that wider game.
- **What it is:** the player buys the railway itself, a stretch at a time, as well as the stations on it. Today the line is one thing: one top speed for every train everywhere (`vmax` and `vmaxFast` in `TUNING`, `src/sim/sim.ts`), and four line-wide upgrades (more units, longer trains, the faster timetable, the spare unit). After this, the line is made of **sections**, each the stretch between two neighbouring stations or a station and a junction, on each corridor, and each section has upgrades of its own.
- **Real speeds and wires first.** OpenStreetMap's main API answers (`https://api.openstreetmap.org/api/0.6/map?bbox=W,S,E,N`, boxes a few hundred metres across; Overpass and Geofabrik don't). Its railway ways carry `maxspeed` and `electrified` tags. Read them along every corridor with a small tool, and record each section's real line speed and whether it's wired in the network data with a `note`. The views from above (`docs/reference/aerial/`) and the photo library (`docs/reference/photos/`) show bridges, curves and wires.
- **The upgrades, each with a visible change on the map:**
  1. **Line speed by section.** Track renewal and realignment raise a section's speed in steps towards the real line speed and beyond it, where the real railway has proposals; trains run each section at its own speed. Replaces the line-wide "Faster timetable" (keep its name for the last step, if that reads well). On the map: fresh ballast and new rail in that section, and speed boards at its ends.
  2. **Resignalling by section.** Shorter blocks (the graph's block signalling, `docs/DESIGN.md` Signalling) so trains can follow closer, and fewer signal failures there. On the map: new colour-light signals at the closer spacing.
  3. **Electrification** where the real line isn't wired (read `electrified` from OpenStreetMap; the Buxton line beyond Hazel Grove and the Marple line are diesel today, as far as known). Wires let trains accelerate harder on that section. On the map: masts and wires, as the wired lines already show. Where the real line is already wired, it starts wired.
  4. **Junctions rebuilt** (once a line out meets real traffic there): a flying junction at a busy flat junction so trains on the two lines stop waiting for each other. Offer it only where the graph's junction conflicts actually hold trains (the sim can count them). On the map: the line rising over the other on a bridge. If no junction sees conflicts yet when you get here, build the mechanism and one junction's model, and hand the rest on.
- **The opening stays as it is.** The first sections start where the game's line speed is today, so the bot's milestones up to Piccadilly don't move unless an upgrade is bought; section upgrades are offered once the line's first stretch is owned, and the dearer ones later. Nothing locked shows: a section's upgrades appear when the player owns a station at either end.
- **Buying it on the map:** tap a section of line between two stations and its card opens, as a station's does, with its upgrades and what each saves (minutes off the ride, trains an hour, failures less often). The line panel lists the sections too. No recommended buy. Phones from 320 px.
- **The economy:** a change to pacing, so run the bot (`.claude/skills/balance/SKILL.md`) on seeds 1-3, 8 sim hours, before and after, with a table in the commit message, and a 16-hour run showing when it buys each kind of section upgrade. The bot needs to learn to buy sections, simply. The opening's milestones up to Piccadilly hold within the baselines' tolerance; re-propose the baselines with a note saying why. Raise `SAVE_VERSION` for the sections in the save.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules`, `npm test` and the check groups your change touches (line, signals, trouble, layout, geometry, bot, saves and a new `sections` group at least), not the whole suite: the Publish workflow runs all of it in four shards, and you confirm that run is green. Run `git status` and stage paths by name before each commit, and push in parts that each leave `main` playable (sections and real speeds in the data with no change to play, then line speed by section, then resignalling, then electrification, then junctions).
- Files it may touch:
  - Data and tools: `src/data/network.json` (sections, real speeds, wires), a new `tools/osm-to-sections.mjs`.
  - Sim: `src/sim/sim.ts`, `src/sim/network.ts`, `src/sim/save.ts`, and a new `src/sim/sections.ts` if it helps.
  - View: `src/render/lineside.ts`, `src/render/world.ts` (small edits: two other sessions work in it), `src/render/pick.ts`, `src/ui/panel.ts`, `src/ui/styles/tokens.css`.
  - Tests, checks and docs: `test/`, `tools/bot.mjs`, `tools/baseline.json`, `tools/checks/`, `docs/DESIGN.md` (a new section, The line between stations, and Signalling, Trains and the economy), `docs/ROADMAP.md`.

## Read first

- The project notes (`CLAUDE.md`), `docs/decisions/ADR-2026-10-13-all-public-transport.md`, `docs/decisions/ADR-2026-10-13-network-as-a-graph.md`, `docs/DESIGN.md` (the loop, journeys, signalling, trains, things going wrong, numbers that matter), `.claude/skills/balance/SKILL.md`, phase 5 of `docs/ROADMAP.md`.
- `src/sim/sim.ts` (`LINE_UPGRADES`, `TUNING`, `vmax`, `runTime`, the trouble), `src/sim/network.ts`, `src/render/lineside.ts`.

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second.
- Everything bought shows on the map. Locked stations stand fogged with their price; every other locked thing, a section's upgrades included, is hidden.
- The track spacing rule (`src/sim/layout.ts`): a flying junction keeps it.
- Phones from 320 px, landscape, tablet and desktop; the `perf` budgets as they stand. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes each part to `main` once the rules, tests and its check groups pass and, for the economy, the bot's table is in the commit message. Then it confirms the "Publish to GitHub Pages" run for its commit is green, all four check shards included, or fixes it in the next push.

## What's left for others

- **Running beside you:** the Buxton line and the Marple line (both edit `src/data/network.json`, the service and `tools/baseline.json`) and the real surroundings (edits `src/render/world.ts`). Pull often, keep edits to shared files small, rebase carefully, and never drop another session's entries. Their new corridors get sections from your tool: run it for whatever corridors exist when you finish, and say how in its opening comment.
- **The fleet** (phase 5 step 5) chooses diesel or electric units and the depot; electrification here only changes how a train accelerates on a wired section. **Services** (step 4) use the fast lines and overtaking.
- List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $35 (real speeds and wires from OpenStreetMap, sections in the sim and the save, three kinds of section upgrade drawn on the map, a section card, the bot taught to buy them, and the balance).
- Past twice the estimate: say why in the commit message and stop at the part you're on, leaving `main` playable.
