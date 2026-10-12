# Brief: every platform in use

## Goal and what it may touch

- Phase 3 step 9 of `docs/ROADMAP.md`. Today most platforms stand empty: at a through station the stopper uses one platform each way, at Stockport it turns in one platform (trains seven minutes or more apart never need a second), platform 1 serves only the Hazel Grove line, platforms 0 and 2 see nothing, and the expresses are scenery running to Piccadilly's platform 6 without calling or earning. Make every platform the player buys carry trains, so each platform stage relieves something they can see.
- **The owner's facts (12 October 2026):** trains from Stockport to Manchester use platforms 3 and 4, both of them, and other stations probably use both their platforms for the same trains. Build on that, and check every other platform working against real timetables and photographs (Wikipedia and Commons answer from these sessions; OpenStreetMap does not), recording what you used in the network data's notes.
  - **Real platforms for each service:** each service has the platforms it really uses at each station (data in `src/data/network.json`, for example a list of platforms per service per station), and a train takes whichever of its platforms is free, the nearer first. At Stockport the Manchester stoppers use 3 and 4; the second stopper unit and later ones alternate, so platform 3 (the second-platform stage) is visibly in use as soon as there are two units.
  - **Expresses that call:** Avanti West Coast, CrossCountry and the other long-distance trains that really stop at Stockport and Piccadilly become real services (they already run on the fast lines, `scenery: true` in the network data). They call at their real platforms, take a platform face like any train (so they can hold a stopper, and the platform stages relieve it), bring through passengers who pay you a share at your stations, and pay an access charge per call. They run whether or not the player owns Piccadilly; at Stockport they need the platforms the player has built, and run through without stopping until they're there.
  - **More turning trains:** where real short workings turn (Stockport's bay platform 0, Piccadilly's bays), use them, so the Stockport platforms stage and Piccadilly's bays have trains.
  - **A loop or bay at a halt** (handed on by commit c79ca29): a new stage at a through station whose real layout has room, giving a second face one way so a train can wait while another passes, shown on the map.
  - **The boards show the platform:** the departure boards (`src/render/life.ts`) give each train's platform number.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; other sessions push too). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page.
- Files it may touch: `src/sim/`, `src/data/network.json` (services, platforms, the loop stage's names), one part appended to a kit for each loop or bay it adds, `src/render/stations.ts` only to register a new part type (small), `src/render/trains.ts` (expresses calling, which platform a train draws at), `src/render/life.ts` (the platform on the boards), `test/`, `tools/bot.mjs`, `tools/baseline.json`, `tools/checks/` (the geometry check must still pass for every service's platforms) and the docs below.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (services, platforms that block, the timetable, station life), `.claude/skills/balance/SKILL.md`, phase 3 and phase 5 of `docs/ROADMAP.md`.
- Commits 97d67a6 (late trains), c79ca29 (platforms that block) and 33f8b12 (departure boards), and `Sim.faces`, `holds` and `blocked` in `src/sim/sim.ts`.

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second.
- Economy change is agreed: bot on seeds 1-3, 8 sim hours, before and after, table in the commit message, with how often each platform is used at Stockport and Piccadilly and what the expresses earn. The opening's milestones stay in range; re-propose the baseline with the note saying why.
- Everything bought shows on the map; real places and real workings, with a `note` where something is a game choice. Raise `SAVE_VERSION` if the save's shape changes. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and the bot's table is in the commit message; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push. One commit per piece is fine. Run `git status` and stage paths by name before each commit.

## What's left for others

- Phase 5 keeps the new lines, through running from the branches and full timetabling; contract renewal (the next phase 3 step) decides what a renewal keeps. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $25 (platform allocation, calling expresses, a new stage and a balance pass).
- Past twice the estimate: say why in the commit message and hand on what's left (the loop stage first).
