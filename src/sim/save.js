// Saved state: versioned JSON. Until the first release there is no compatibility promise: change the shape freely,
// raise SAVE_VERSION, and an older save starts a new game (docs/decisions/ADR-2026-10-08-no-save-compatibility-before-release.md).
// From the first release on, every version gets a migration step here, and saved fields are never renamed or removed.

export const SAVE_VERSION = 1;

/** Migrations by the version they migrate FROM: migrate(state at v) -> state at v + 1. None before the first release. */
export const MIGRATIONS = {};

export class SaveError extends Error {}

/** Bring a parsed save up to SAVE_VERSION, or throw SaveError if it can't be loaded. */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object') throw new SaveError('not a save');
  let v = raw.v || 0, g = raw;
  if (v > SAVE_VERSION) throw new SaveError(`save is from a newer version (${v} > ${SAVE_VERSION})`);
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new SaveError(`no migration from version ${v}`);
    g = step(g); v++; g.v = v;
  }
  return g;
}
