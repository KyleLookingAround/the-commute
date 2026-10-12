// Saved state: versioned JSON. Until the first release there is no compatibility promise: change the shape freely,
// raise SAVE_VERSION, and an older save starts a new game (docs/decisions/ADR-2026-10-08-no-save-compatibility-before-release.md).
// From the first release on, every version gets a migration step here, and saved fields are never renamed or removed.
import type { GameState } from './types.ts';

export const SAVE_VERSION = 9;   // 2: stations count who alighted; 3: trains board through the stop; 4: services and changing trains;
                                 // 5: stations start as halts and grow; 6: each waiting group has its own time to give up;
                                 // 7: trains run to a timetable (due, late, stood) and each service's ends keep their headway;
                                 // 8: taxi ranks (each station's cab tally and its cabs, the game's cab total);
                                 // 9: things going wrong (trouble: failed trains, signal failures, replacement buses) and the spare unit

/** A save as parsed from JSON: some version's shape, known only once migrated. */
type RawSave = Record<string, unknown> & { v?: number };

/** Migrations by the version they migrate FROM: migrate(state at v) -> state at v + 1. None before the first release. */
export const MIGRATIONS: Record<number, (g: RawSave) => RawSave> = {};

export class SaveError extends Error {}

/** Bring a parsed save up to SAVE_VERSION, or throw SaveError if it can't be loaded. */
export function migrate(raw: unknown): GameState {
  if (!raw || typeof raw !== 'object') throw new SaveError('not a save');
  let g = raw as RawSave, v = g.v || 0;
  if (v > SAVE_VERSION) throw new SaveError(`save is from a newer version (${v} > ${SAVE_VERSION})`);
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) throw new SaveError(`no migration from version ${v}`);
    g = step(g); v++; g.v = v;
  }
  return g as unknown as GameState;
}
