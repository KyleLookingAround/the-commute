---
name: feature
description: Build a feature or change for The Commute from issue to merged PR - spec, code, checks, screenshots, bot, docs. Use when asked to add, change or fix something in the game.
---

# Building a change

> **Prototype phase** (the project notes, "Phase: prototype"): push straight to `main`; the spec, brief, PR and look back here are optional until the first release. Keep the rules the build enforces, the owner's preferences and the tests.

Work through these steps in order. Small fixes (a label, a nit, an obvious bug) can skip the spec; anything a player would notice as new gets one.

## 1. Start from an issue and a brief

- Find the issue for the work, or write one from `.github/ISSUE_TEMPLATE/` (Feature, Bug or Balance).
- A session starts from a brief (`docs/briefs/<short-name>.md`, from `docs/briefs/TEMPLATE.md`). Save the brief you were given there, in your PR.
- Read the issue's comments and current state, not only its body: the owner's answer may already be there.
- Branch from the latest `main`: `git fetch origin main && git checkout -b feature/<short-name> origin/main`.

## 2. Spec first

- Copy `docs/specs/TEMPLATE.md` to `docs/specs/<short-name>.md` and fill it in. Keep it to a page.
- Check it against the owner's preferences in the project notes: what you buy shows on the map, locked things hidden (fogged stations are the one exception), concise UK English, real place names, phones down to 320 px.
- A spec that changes a number already in `TUNING` or a kit quotes the current value.
- Get the owner's approval before writing code, and mark the spec `Approved` when they agree. A brief that approves a spec in advance counts.

## 3. Build

- Four layers (`docs/decisions/ADR-2026-10-08-layers-and-seeded-sim.md`): the sim in `src/sim/`, data in `src/data/`, the clock and storage in `src/app/`, the view in `src/render/` and `src/ui/`. The sim never imports `three` or names the DOM; `npm run rules` says when it does.
- Every file opens with a `//` line saying what's in it.
- Stations are kits: add a part type to `src/render/stations.js` and parts to the station's JSON, never a station in code. A new part the player buys carries `upgrade`.
- Randomness that can change the game draws from `rand(g)` in `src/sim/random.js`. `Math.random()` only on cosmetic lines ending `// cosmetic`.
- New saved state: its field with a default in `Sim.fresh`. Until the first release, reshape freely and raise `SAVE_VERSION` (`docs/decisions/ADR-2026-10-08-no-save-compatibility-before-release.md`).
- Every colour and size is a token in `src/ui/styles/tokens.css`; the renderer reads `--map-*` through `src/render/palette.js`.
- `npm run dev` for a live page; `npm test` to run the sim's tests as you go.
- **Probe before you write.** For an economy change, run the bot (`npm run bot -- --hours 48 --seed 1 --seed 2 --seed 3`) before writing the tests: it sets the numbers from what the sim does.

## 4. Prove it

- `npm test` and `node tools/check.mjs <group>` while iterating; the full `npm run check` before pushing.
- A rule of the game gets a test in `test/`; a rule of the page gets a check group in `tools/checks/` with an opening comment saying what it covers. Every new check is shown failing before it's trusted.
- **Measure before you fix a layout bug.** Screenshot and measure at every size first, then fix everything the measurement found in one pass.
- A check that taps must tap on a touch page (`page.touchscreen.tap`). A browser check waits for what it asserts, never for a fixed time: CI's software renderer runs a few frames a second.
- Look at the result: `npm run shots` after `npm run build`, at phone, landscape, tablet and desktop. The 3D scene renders under swiftshader in CI, slowly but faithfully.
- Pacing or economy: follow the `balance` playbook. A change meant to leave the game as it is leaves `PLAY` identical on seeds 1–3.
- If a check fails, reproduce it (pages are seeded) and fix the cause. Never weaken or skip a check to get green.

## 5. Keep the docs true

- A change to how something works updates `docs/DESIGN.md` or the kit's `note`; a new rule gets a record in `docs/decisions/`.
- Move the roadmap item in `docs/ROADMAP.md`.
- Re-read the project notes after any merge from `main`.

## 6. A fresh review before opening

- Before opening the PR, start one fresh reviewer that hasn't seen the work (a helper agent or the `code-review` skill, medium effort). Give it the three-dot diff (`git diff origin/main...HEAD`), the brief and the project notes, and ask for bugs; broken rules (the owner's preferences, saved fields, the layers, the seeded rng, UK English); lines outside the diff the change makes wrong; and anything in the PR's title or description the project notes don't allow.
- Fix what you agree with. Say in the PR what the review found and what was fixed or left, without naming the tool or saying "AI" or "assistant".

## 7. Ship

- Commit with a short imperative subject in plain words; a body when the reason isn't obvious. No attribution lines.
- `git push -u origin feature/<short-name>`, then open a PR with a plain title, filling in `.github/pull_request_template.md`. Read the description back and remove anything the template doesn't have.
- Follow the `steward` playbook until the PR is merged.

## 8. Learn

- If a bug got through to players, add the check that would have caught it, in the same PR as the fix.
- Before the PR merges, look back at the session (the `steward` playbook) and commit it into the PR as its own file in `docs/lessons/`.

## Working while the owner is away

- Don't stop on a question the brief or the project notes already answer. Read them again first.
- If something is truly ambiguous, take the safer option (easier to undo, or changing the game less), say so in the PR, and carry on.
- Stop and ask only for something irreversible or outside the brief.
- **The needs-owner queue.** When the owner truly has to decide, open an issue labelled `needs-owner` with the question, the options and the default you'll take. Take the default after 12 hours with no answer; say so on the issue and in the PR.
- When the choice is between things the owner can look at (a palette, a layout), publish a page that shows them side by side and link it from the issue.
- **One PR-sized item per session.** When an item merges, the session stops; the next item gets its own brief and a fresh session.
- Run `git status` before committing and stage paths by name.
