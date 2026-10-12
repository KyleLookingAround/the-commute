# Brief: contract renewal

## Goal and what it may touch

- Phase 3 step 12 of `docs/ROADMAP.md`, the first layer of the owner's prestige idea (11 October 2026). Running the line is an operating contract. When it's renewed, the network goes back to halts and the player starts again a little stronger: the reputation earned buys permanent perks. The deeper layers (eras, challenges, phase 11) build on this later, so keep the shape general.
  - **When it ends:** the pacing per run is the owner's call, so take the option that changes the game less. Renewal is offered, never forced. Once the player owns Piccadilly (the whole line), a "Renew the contract" choice appears in the line panel with the reputation it would bank. The player renews when they like and can keep playing the run as long as they want, and the reputation keeps counting until they do. It is hidden until then, as locked things are.
  - **Reputation:** earned through the run from passengers carried and how well (on time, not lost), so a well-run line banks more than a big one run badly. It is shown as a running figure only once renewal is offered. The bot reports what a first run banks.
  - **Perks:** a small tree of about 8 to 12, in three or four branches, bought with reputation between runs. It covers the roadmap's starting cash, quicker building, a wider reach and a unit to start with, plus whatever the bot shows is worth having. Each perk costs more than the last in its branch. Perks act through the sim's existing numbers (cash, prices, walk and reach, units), not new systems.
  - **What lasts:** perks and milestones last through every renewal. Everything else starts again from Stockport as a halt: the run's cash, stations, stages, homes grown, weather and trouble.
  - **On the map**, because everything bought shows:
    - a brass plaque by Stockport's entrance that reads the contract's number and grows a line for each renewal
    - a starting unit standing in the sidings
    - the wider reach in the glow
    - quicker building shown by the parts rising sooner
    - the renewal itself as a moment on the map, not a text event: the line's stages fold back down and the halts stand ready
  - **Pacing target:** with a typical first renewal's perks, the second run reaches Piccadilly about a quarter sooner than the first. A run that renews often shouldn't trivialise the opening; say what the bot shows.
- **The save:** the career (reputation, perks, milestones, contracts renewed) is kept apart from the run, so starting a run again never touches it. Save to file carries both, and Start over says whether it clears the career too (offer both, defaulting to the run only). Raise `SAVE_VERSION` and give the career its own version.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test`, and `npm run check` since this touches the page. Run `git status` and stage paths by name before each commit.
- Files it may touch:
  - Sim: `src/sim/` (a new `src/sim/contract.ts` for reputation, perks and renewal, and hooks where perks act), `src/sim/types.ts`, `src/sim/save.ts`.
  - Data and app: `src/data/network.json` (the perk tree's names and prices), `src/app/storage.ts` (the career beside the save).
  - UI: a new `src/ui/contract.ts` (the renewal sheet and the perk tree, kept plain since the redesign will restyle it), `src/ui/panel.ts` (the line panel's renew choice only), `src/ui/saves.ts` (Start over's choice).
  - Render: `src/render/stations.ts` (only to register the plaque as a part type) and one `plaque` part appended to Stockport's kit, `src/render/trains.ts` only if the starting unit needs it.
  - Styles, wiring, tests and docs: `src/ui/styles/` and `tokens.css`, `src/main.ts` (wiring), `test/`, `tools/bot.mjs` (whole runs and renewals: `--runs 2` or similar), `tools/baseline.json`, `tools/checks/` (a new `contract` group: renewal hidden until Piccadilly is owned, offered after, perks bought, the next run starting from halts with them in effect, the career kept through Start over's run-only choice), and the docs below.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (the economy, halts and stages, Save, Shorter days), `.claude/skills/balance/SKILL.md`, phases 3 and 11 of `docs/ROADMAP.md`.
- Commit 46a9419 (shorter days: `src/sim/day.ts` is the one clock, and the bot reports game days).

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second. A run with no renewal plays exactly as `main` (the bot's `PLAY` on seeds 1-3 identical while the career is empty).
- **The economy changes on purpose, for second runs only.** Run the bot on seeds 1-3 through a first run to Piccadilly, a renewal and a second run, with a table in the commit message: the time to each milestone in both runs, the reputation banked, and the perks the bot bought. Re-propose the baselines with a note saying why.
- The owner's preferences: hidden until reachable, impacts on the map, concise UK English, the player buys every perk themselves (no recommended buy), and phones from 320 px.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and the bot's table is in the commit message. Then it confirms the "Publish to GitHub Pages" run for its commit is green, check job included, or fixes it in the next push. Push in parts if that's safer (the career and renewal in the sim first, then the sheet and the map), each part leaving `main` building and playable.

## What's left for others

- Moving around the map is finishing (the camera and the strip in `panel.ts`). The UX/UI redesign (phase 4 step 10) will restyle the panels later, your sheet included, so build the behaviour and keep the look plain.
- Eras, heritage and challenges (phase 11) come later. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs (pacing above all), take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $30 (a career kept apart from the run, reputation and a perk tree in the sim with the bot playing renewals, a sheet, the plaque and the renewal on the map, and a check group).
- Past twice the estimate: say why in the commit message and trim what's left.
