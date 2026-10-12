# Brief: real people (and softer bad luck)

## Goal and what it may touch

- **First, a small fix carried over from things going wrong (commit 9b03e92), as its own commit:** on seed 2 two failed trains, one in the second morning's peak, cost 162 people and £21,500 (cash at the end 29.6k against 51k); the brief promised a run of bad luck would never wreck a game. Soften the worst case so trouble stays a hiccup: for example no failure inside a peak's busiest hour, a cap on what one incident can cost, or a shorter rescue in the peaks; the bot on seeds 1-12 shows no seed losing more than about a fifth of its cash to trouble.
- **Then phase 3 step 6 of `docs/ROADMAP.md`: real people.** Replace the hand-set station numbers (`catchment`, the homes, and `draw`, what draws people there, both "from memory") with Census 2021 figures:
  - **Where people live:** usual residents by Output Area (Census 2021 TS001 from Nomis, `https://www.nomisweb.co.uk/api/`), placed by each area's centroid (the ONS Open Geography Portal, `https://geoportal.statistics.gov.uk/`), summed for each station over the areas whose door-to-door trip is best by that station.
  - **Where people work:** workplace population (Census 2021 workplace tables on Nomis, by the smallest area they're published for) for each station's draw, Piccadilly and the city centre above all.
  - **A tool,** `tools/census-to-network.mjs`, beside the OpenStreetMap ones: it fetches or reads the raw tables (kept in a git-ignored `data/raw/`), works out each station's homes and draw, and writes them into `src/data/network.json` with a note of the source and date. Commit only the derived numbers and a small extract the tool can rerun on offline, not the raw downloads. These hosts answered from the coordinator's session; OpenStreetMap's (Overpass, Geofabrik) did not, so don't rely on them.
  - **Keep the game's scale:** real counts are far larger than the game's numbers; map them with one factor (or a gentle curve) so the opening's pacing holds, and show with the bot on seeds 1-3 what changes. Stations whose real numbers differ most from the old guesses should be named in the commit message.
  - **Credit:** "Contains Office for National Statistics data © Crown copyright and database right 2021" (Open Government Licence) in the page's footer beside the OpenStreetMap credit.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; a view session is editing the renderer and panel). Before a push, `npm run rules` and `npm test`.
- Files it may touch: `src/sim/` (the trouble fix, and anything the new numbers need), `src/data/network.json`, `tools/census-to-network.mjs` (new), `tools/bot.mjs`, `tools/baseline.json`, `test/`, `index.html` (the footer credit only), `.gitignore` (for `data/raw/`), and the docs below.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (door-to-door demand, things going wrong), `.claude/skills/balance/SKILL.md`, phase 3 of `docs/ROADMAP.md`.
- Commits c479207 (door-to-door demand) and 9b03e92 (things going wrong); `tools/osm-to-network.mjs` for how a data tool is laid out.

## What it must keep

- The sim stays pure and seeded; the data is plain JSON; the tool is plain Node and never runs in the build.
- Economy change is agreed: bot on seeds 1-3, 8 sim hours, before and after, for each of the two commits, table in each message; the opening's milestones in range; re-propose the baseline with the note saying why.
- Real places only; credit the source. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once `npm run rules` and `npm test` pass and the bot's table is in the commit message; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Homes that grow (phase 3 step 7) builds on the census homes; the county (phase 8) widens the tool. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on. If the census can't be fetched after all, build the tool against a small extract typed from the published tables, say so, and hand on the full run.

## Cost budget

- Estimate: about $20 (a small balance fix, a data tool, and a balance pass).
- Past twice the estimate: say why in the commit message and trim what's left.
