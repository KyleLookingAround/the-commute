# The runbook comes from Overgrow and Final Call, trimmed to a new game

**Status:** Approved · 8 October 2026

## Context

The owner's game repos (Final Call, Overgrow, Velocity) share one way of working that grew over a hundred-odd PRs: PR-only shipping with a required `check`, playbooks as editor skills, source rules enforced by a script, a seeded sim, a bot against baselines, screenshot checks at phone sizes, decision records and per-PR look backs. Hearthworks and Home Display use a lighter one (push to main, a dated log). The Commute is a new game with a small codebase and one developer, so it should take what pays for itself now and name the trigger that brings in the rest.

## Options considered

- **Copy Overgrow whole.** Every tool and workflow from day one. Pros: nothing to add later. Cons: joined lists, a knowledge graph and a coordinator for one session and five files is weight before there is anything to carry.
- **The light runbook.** Push to main, `npm run ci`, a log. Pros: fast. Cons: the first regression reaches the live site; no fixed place for specs, decisions or lessons, which the owner's other repos show accumulate value.
- **Overgrow's shape, trimmed.** Taken: what catches regressions and records decisions. Cut: what only pays with several sessions or a big tree, each with a trigger.

## Decision

The third. What was taken, in `CLAUDE.md` and this repo:

- Attribution policy, editor settings, the session-start hook, the commit-msg hook and the Description workflow, unchanged.
- PR-only shipping, a required `check` status, Squash and merge; `.github/workflows/checks.yml` and the Publish workflow that checks `main` before deploying and opens a "main is red" issue.
- The five playbooks (`feature`, `steward`, `balance`, `release`, `coordinator`), rewritten for this game and shorter: Overgrow's accumulated lessons stay there until they come up here.
- `tools/rules.mjs` (randomness, layers, file headers) with a check that proves each rule catches a slip; `tools/build.mjs` refuses to build on a broken rule.
- A seeded sim and a bot (`tools/bot.mjs`) with baselines, from the first line (`ADR-2026-10-08-layers-and-seeded-sim.md`).
- Versioned saves with a migration chain and guarded storage (`ADR-2026-10-08-no-save-compatibility-before-release.md`).
- `tools/check.mjs` with one group per file; `layout` at six sizes, `rules`, `bot`. `tools/shots.mjs` for a human to look.
- Design tokens in `src/ui/styles/tokens.css`, read into the renderer by `src/render/palette.js`.
- Decision records, a spec template, a brief template, lessons per PR, and Velocity's UI/UX review playbook.
- Issue and PR templates; `START-HERE.md`.

What was cut, and what brings it back:

| Left out | Trigger |
| --- | --- |
| One file per entry with joined lists (`tools/join.mjs`), the roadmap as `roadmap.d/`, What's new fragments | Two sessions editing the same list in one week, or the first release |
| The knowledge graph (`tools/graph.mjs`) and the brief checker | More than about thirty source files, or a brief that misses a file it needed |
| Catch up and Parts workflows | The first feature split across sessions |
| The Health workflow (weekly) | The first release |
| TypeScript strict | The first session in Claude Code with a compiler to hand: convert `src/` then, keep `node:test` for the sim |
| A worker for the sim | The sim taking more than a few ms a frame on a phone |
| OKF frontmatter on docs | The docs growing past what a reader can hold; Final Call's `tools/okf.mjs` is the pattern |

## Consequences

- Sessions follow the playbooks; the owner adds the ruleset and auto-merge (`START-HERE.md`).
- A trigger above firing is a reason to open an issue and port the piece, from the source repo named in the owner's other projects.
