# No save compatibility before the first release

**Status:** Approved · 8 October 2026

## Context

Saves are versioned JSON in `localStorage` (`src/sim/save.js`, `src/app/storage.js`). Keeping every early save loading would mean a migration for every reshaping of a game that is still finding its shape.

## Decision

Until the first release, saved state carries no compatibility promise: change its shape freely, raise `SAVE_VERSION`, and an older save starts a new game (its text is kept under a `-broken` key, never overwritten). From the first release on, every version gets a migration step in `MIGRATIONS`, saved fields are never renamed or removed, and a fixture per version lives in `tools/saves/` with a check that each still loads.

## Consequences

- Early sessions reshape freely but always raise the version.
- The `release` playbook adds the fixtures and the `migrate` check at the first release.
