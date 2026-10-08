// Saving to the device: one localStorage key, guarded so a private window or a full store never breaks the game.
// This is the only place the game names localStorage; the sim never does (tools/rules.mjs).
import { migrate, SaveError } from '../sim/save.ts';
import type { GameState } from '../sim/types.ts';

export const SAVE_KEY = 'the-commute-save-v1';

/** What the device keeps: the game, which station the panel showed, and when it was written (ms since the epoch). */
export interface Saved { g: GameState; selected?: number; at?: number }

/** The saved {g, selected, at} or null; a save that can't be loaded is kept aside under a -broken key, never overwritten. */
export function load(): Saved | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<Saved>;
    return { ...s, g: migrate(s.g) };
  } catch (e) {
    try { localStorage.setItem(SAVE_KEY + '-broken', raw); localStorage.removeItem(SAVE_KEY); } catch { /* the device won't keep it */ }
    if (!(e instanceof SaveError)) console.warn('save could not be read', e);
    return null;
  }
}

/** Write the save; returns false when the device won't keep it. */
export function save(state: Omit<Saved, 'at'>): boolean {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, at: Date.now() })); return true; } catch { return false; }
}
export function wipe(): void { try { localStorage.removeItem(SAVE_KEY); } catch { /* nothing to wipe */ } }
