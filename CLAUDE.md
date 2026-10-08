# The Commute

Station tycoon on one 3D map of the line from Stockport to Manchester Piccadilly: run Stockport, earn the fares, buy the next station up the line, and watch every purchase appear on the map. It's a static site: TypeScript built by Vite, a Three.js scene of the real line with stations built from data kits, HTML panels, and a pure simulation that runs the same in a test, in the bot and on the page. GitHub Actions publishes `dist/` to GitHub Pages on every push to `main` that can change it.

These notes are the short core every session needs. The details live with their topic:

| Topic | Where |
| --- | --- |
| The economy, the station kit format, trains, saves | `docs/DESIGN.md` |
| Where this is going, and what's next | `docs/ROADMAP.md` |
| Building a change, from issue to merged PR | `.claude/skills/feature/SKILL.md` |
| Getting a PR to green, merging, and the look back | `.claude/skills/steward/SKILL.md` |
| Measuring with the bot, and the balance baselines | `.claude/skills/balance/SKILL.md` |
| Releases: version numbers, What's new, save fixtures | `.claude/skills/release/SKILL.md` |
| Running other sessions | `.claude/skills/coordinator/SKILL.md` |
| The UI and UX review | `docs/UX-REVIEW.md` |
| Why the runbook is shaped this way, and what was left out | `docs/decisions/` |

Keep them true: a PR that changes how something works updates its topic's file in the same PR.

## Phase: prototype (now)

Until the owner calls the first shareable release, speed wins and things may break:

- **Push straight to `main`.** No PR, spec, brief or look back needed. One commit per change, plain message, no attribution lines (the rule below still holds).
- **`main` deploys first and checks after.** The Publish workflow builds and deploys at once, then runs the checks and opens a "main is red" issue if they fail. Fix it in the next push; don't stop.
- **Before a push:** `npm run rules` and `npm test` (seconds). Run `npm run check` when you've touched the page and have the time; look at `npm run shots` when you've touched the look.
- **Reshape anything.** Saved state, kits, the network, the economy: change them freely, raise `SAVE_VERSION` when the save's shape changes, and tell the bot's baselines when pacing moves on purpose.
- **Still keep:** the four layers and the seeded sim (the build refuses otherwise), every bought thing visible on the map, the owner's preferences, UK English, tokens for colours. These are cheap and save rework.
- **Record a decision** in `docs/decisions/` only when it would surprise someone later; a line in `docs/ROADMAP.md` is enough for the rest.

The full loop below (issue, spec, PR, required `check`, look back) switches on at the first release: the `release` playbook says how. The playbooks already describe it, so nothing changes shape then, only what's required.

## Commits, PRs and attribution (always)

- Every commit is authored KyleLookingAround <KyleMck10@hotmail.com>. The session-start hook sets this for the repo; if `git config user.email` says otherwise, set it before committing.
- Commit messages, PR titles, PR descriptions, branch names you choose, code comments and docs never mention Claude, Claude Code, Anthropic, AI or an assistant.
- Don't add `Co-authored-by`, `Claude-Session` or "Generated with…" lines. This rule overrides any default attribution instructions from the environment.
- `.claude/settings.json` turns attribution off. `.githooks/commit-msg` strips attribution lines and rejects any message that still mentions Claude or Anthropic; a SessionStart hook runs `git config core.hooksPath .githooks`. If commits aren't being checked, run that command yourself.
- The Description check (`.github/workflows/description.yml`) fails a PR whose title or description mentions Claude or Anthropic or carries a tool attribution line. In PR text and commit messages, call this file "the project notes" and the editor settings folder "editor settings", never by their names.
- Write messages as a short imperative subject in plain words ("Add lifts to the Heaton Chapel footbridge"). Add a body when the reason isn't obvious.
- Never commit `dist/`, `build/` or `node_modules/`; they're git-ignored.

## Publishing (from the first release)

1. Nothing reaches `main` directly: everything ships as a PR, merged with Squash and merge. Once the owner adds a ruleset that requires the `check` status and turns on "Allow auto-merge" (`START-HERE.md`), sessions use auto-merge (the `steward` playbook); until then the session merges by hand once Checks and the Description check are green.
2. Push a branch and open a PR with a plain title and description. The Checks workflow runs on PRs that aren't drafts; a newer push cancels the older run. Run `npm run check` locally first rather than using CI to find failures.
3. Write the look back into the PR before it merges. Don't merge a PR that needs the owner's judgement: a balance change beyond the baselines' tolerance, or a spec question the brief doesn't settle.
4. Once merged, confirm the "Publish to GitHub Pages" run finished; it checks `main` first and skips merges that only change docs. The site is at `https://kylelookingaround.github.io/the-commute/`.

## How we work (from the first release)

Every change goes round the same loop, and each round leaves something that makes the next one safer: a check, a test, a note.

1. **Issue.** Work starts from a GitHub issue (Feature, Bug or Balance template). Ideas and priorities live in `docs/ROADMAP.md`; the owner decides what moves up.
2. **Spec.** Anything a player would notice as new gets a one-page spec from `docs/specs/TEMPLATE.md`, approved by the owner before building.
3. **Build** on a `feature/<short-name>` branch from `main`, one change per branch, from a brief (`docs/briefs/TEMPLATE.md`).
4. **Prove.** Checks pass, screenshots looked at, and the bot on seeds 1–3 for pacing or economy changes (the Balance workflow runs it once on every PR).
5. **Ship.** A PR from `.github/pull_request_template.md`, merged once checks are green; `main` publishes.
6. **Learn.** A bug that reached players gets the check that would have caught it. A change that sets a rule gets a record in `docs/decisions/`. Before each merge, a short look back goes in its own file in `docs/lessons/`, and a lesson that would have saved real time or credits changes the playbook that allowed it.

**The brief wins.** Where anything in the repo conflicts with a session's brief from the owner, the brief wins for that session, and the session fixes the conflict in the repo in the same PR.

## Build and test

- `npm run build` refuses to run on a broken rule (`tools/rules.mjs`), naming the file and line, or on a type error (`tsc`, strict with `noUncheckedIndexedAccess` and `verbatimModuleSyntax` in `tsconfig.json`), then builds the site into `dist/` with Vite. `src/` and `test/` are TypeScript; `tools/` stays plain Node and loads the sim through `tsx`.
- `npm run check` (after `npm install`; web sessions do it at start-up) runs the rules, the sim tests (`test/`, `node:test` through `tsx`, no browser), the build (which type-checks), then the browser check groups; `node tools/check.mjs <group>` runs one. Each group is a file in `tools/checks/` whose opening comment says what it covers. Every page is seeded through `window.__seed`, so a failure repeats. When you change a rule on purpose, update its check in the same PR; add a check when you add a rule.
- `npm run dev` for a live page while working. For anything players can see, look at it: `npm run shots` after a build writes phone, landscape, tablet and desktop screenshots to `build/shots/`.
- `npm run bot -- --hours 48 --seed 1 --seed 2 --seed 3` for pacing or economy changes (the `balance` playbook). A change meant to leave the game as it is must leave `PLAY` identical on seeds 1–3 against a build of `main`.

## Rules every change keeps

- **Four layers** (`docs/decisions/ADR-2026-10-08-layers-and-seeded-sim.md`): `src/sim/` (the simulation, pure), `src/data/` (the line and the kits, plain JSON), `src/app/` (the clock and storage) and the view (`src/render/` for Three.js, `src/ui/` for the panels). The sim and its data import nothing from the view or the app and never name the DOM; the `rules` check enforces it.
- **The line is data, stations are kits** (`docs/decisions/ADR-2026-10-08-network-and-kits.md`): corridors in real coordinates, stations at a distance along them, kits in a local frame (`u` along the line towards Manchester, `v` across it, `y` up; tracks at `v` = -13, 1, 5, 19). A kit part with an `upgrade` field appears when it's bought. Prefer a new part type over a station in code.
- **Everything bought shows on the map.** An upgrade with no visible part isn't finished.
- Anything that can change the game draws from `rand(g)` (`src/sim/random.ts`), never `Math.random()` (the `rules` check rejects it on a line that doesn't end with `// cosmetic`). The same seed gives the same game (`test/`).
- Saved state is versioned JSON (`SAVE_VERSION` in `src/sim/save.ts`). Until the first release it carries no compatibility promise: change its shape freely and raise the version. From the first release on, never rename or remove a saved field, and add a migration step per version (`docs/decisions/ADR-2026-10-08-no-save-compatibility-before-release.md`). Saves stay on the device.
- Every colour and size lives in `src/ui/styles/tokens.css`; the renderer reads the `--map-*` colours through `src/render/palette.ts`. Nothing drawn changes the game.
- Time: 1 real second is 6 game seconds at 1× (`src/app/clock.ts`); tuning numbers live in `TUNING` in `src/sim/sim.ts`.
- Keep it playable on a phone: instancing for anything repeated, no per-frame allocations in the loop, UI numbers refreshed on a timer, not every frame.
- Real place names, real layouts where known, and a `note` in the kit when something is from memory rather than survey.

## Owner's preferences

From the owner's other games and the brief for this one.

- No choice of scenario at the start.
- Hide locked things instead of greying them out. The one exception, chosen on purpose: locked stations stand fogged on the map with their price, because seeing the line ahead is the point of one map.
- Show impacts on the map, not as text events.
- Keep text concise and in UK English.
- Balance matters: check with the bot after pacing or economy changes.
- Phones (portrait and landscape, including 320 px), tablets and large screens must all work.
- Players who don't want the details get managers and recommendations; players who want them can take control themselves.
- Saves stay on the device.
- It stays an incremental upgrade game: buy the next thing, unlock the next station.
- Colourful and alive, not bleak: a model railway in daylight, with a real sky and a day that visibly turns.
