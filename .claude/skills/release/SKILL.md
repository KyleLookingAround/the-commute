---
name: release
description: Cut a The Commute release - claim the version, write What's new and the version history, save fixtures for the new version, roadmap. Use when the owner asks for a release or release notes after player-visible changes have merged.
---

# Release

**The first release ends the prototype phase.** In its PR: remove "Phase: prototype" from the project notes, make the Publish workflow check before it deploys (swap the job order in `.github/workflows/deploy.yml`; the comment marks it), and ask the owner to add the ruleset from `START-HERE.md`. From then on everything ships as a PR.

`main` publishes to GitHub Pages on every merge that can change the page, so a release is about the record: what changed for players, and saves that keep old versions tested. The first release sets up what later ones use: `docs/HISTORY.md` (a table, newest version on top), a What's new list the page shows, `tools/saves/` and a `migrate` check group. Write those into this playbook as you add them.

Before the first release, an audit session comes first. It fixes nothing: it plays a new game for its first real hour at 1× and 3× on phone and desktop, hunts bugs, runs the bot against the baselines, and sweeps polish at the six sizes. It writes ranked rows (where, what's wrong, the fix in a sentence, size, files, how to prove it), grouped into batches that share no file, marking the rows that need the owner. Fix sessions then run one batch each.

Saves, before the first release: a migration that throws mustn't be autosaved over the good save (`src/app/storage.ts` keeps it under a `-broken` key; check it); a build never overwrites a newer build's save; two tabs mustn't overwrite each other. Each gets a check.

1. **Claim the version.** It's the next number after the top row of `docs/HISTORY.md` (1 if there's none). `git fetch origin main`, check no other `feature/release-*` branch is open, then create the branch on GitHub from `main` before any work: GitHub refuses a branch that already exists, so a second claim fails. If the create is refused, another session has the version: stop and say so.
2. **What's new.** From the merged PRs since the last release, write one entry at the top of the page's What's new list (the version, a short title and two to four points players will see) and one row at the top of `docs/HISTORY.md`. Leave out code-only changes. The title names what's new in the game, not the release.
3. **Save fixtures.** If anything changed `SAVE_VERSION` since the last release: run the bot on seed 1 and copy its save to `tools/saves/v<version>.json`, add its hash to the `migrate` check (never change an existing line), and run `npm run check`. Every save, old and new, must load and play. From the first release on, every version gets a migration step (`docs/decisions/ADR-2026-10-08-no-save-compatibility-before-release.md`).
4. **Roadmap.** Move the shipped items to Done in `docs/ROADMAP.md`.
5. **Ship** it as a PR (the `steward` playbook), then confirm the Publish run finished green.
