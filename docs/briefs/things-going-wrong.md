# Brief: things going wrong

## Goal and what it may touch

- Phase 3 step 5 of `docs/ROADMAP.md`: a few clear kinds of trouble, shown on the map, that the player can see coming, live through and buy their way out of. Few and fair: a run of bad luck should never wreck a game, and none happen in the first game hour.
  - **A failed train:** now and then a unit fails between stations, stops with its hazard lights flashing and blocks its line until it's rescued (a few minutes, shorter with a spare unit standing by). Trains behind it wait at signals (platforms that block already hold them, commit c79ca29) and run late afterwards.
  - **A signal failure:** a stretch of line runs at caution for a while, trains crawling through it; the faster timetable's new signals (commit 7199b1d) make them rarer, so that purchase earns more than its minute.
  - **Rail replacement buses:** when a failure stops trains running for long enough, buses take over between the stations either side: a stop outside each station (a part), buses running on the real roads between them, people walking out to them and on. Slower than the train, so some still give up, but most get through. Build a road path between neighbouring stations from OpenStreetMap the way `tools/osm-to-network.mjs` builds the corridor (the first piece of the road network trams and buses use later); if OpenStreetMap can't be reached from the session, follow the real main roads from memory and say so in a `note`. Reuse the taxi ranks' vehicle movement (`src/render/taxis.ts`, commit b34a7ee).
  - **Fixes the player buys:** a spare unit on standby (a new line upgrade, shown as a unit stabled in Stockport's sidings), the faster timetable's resignalling, and whatever else the bot shows earns its place. Everything bought shows on the map.
- All of it seeded: failures draw from `rand(g)`, so the same seed gives the same trouble.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; a view session is editing kits and the renderer). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page.
- Files it may touch: `src/sim/`, `src/data/network.json` (road paths, the bus stops' places), `test/`, `tools/bot.mjs`, `tools/baseline.json`, a new tool beside `tools/osm-to-network.mjs` for roads, `src/render/trains.ts` (hazard lights), `src/render/taxis.ts` or a new `src/render/buses.ts`, `src/render/stations.ts` only to register a bus stop part (keep it small), one bus stop part appended to each kit, `src/render/palette.ts` and `src/ui/styles/tokens.css`, `src/main.ts` (wiring), `tools/checks/` and the docs below.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (timetable, platforms that block, door-to-door demand, taxi ranks), `.claude/skills/balance/SKILL.md`, phase 3 of `docs/ROADMAP.md`.
- Commits 97d67a6 (late trains), c79ca29 (platforms that block) and b34a7ee (taxi ranks), and their "Handed on" lists.

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second.
- Economy change is agreed: bot on seeds 1-3, 8 sim hours, before and after, table in the commit message, with how many failures each seed had and what they cost. The opening's milestones stay in range; lost and lateness may move, re-proposed with the note saying why.
- Colourful, not bleak: trouble reads as a hiccup on a model railway (hazard lights, a bus with a "Rail Replacement" board), never a disaster. Show it on the map, not as text events.
- Raise `SAVE_VERSION` if the save's shape changes. UK English, tokens for colours, instancing, no per-frame allocations.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and the bot's table is in the commit message; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push. One commit per piece (failures, signal failures, buses, the spare unit) is fine.

## What's left for others

- Departure boards could show "cancelled" or "bus replacement"; trams and buses later use the road paths. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $30 (failures in the sim, a road path, buses on the map, a new upgrade, and a balance pass).
- Past twice the estimate: say why in the commit message and trim what's left (buses are the piece to hand on first).
