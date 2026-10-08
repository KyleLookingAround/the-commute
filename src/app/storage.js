// Saving to the device: one localStorage key, guarded so a private window or a full store never breaks the game.
// This is the only place the game names localStorage; the sim never does (tools/rules.mjs).
import { migrate, SaveError } from '../sim/save.js';

export const SAVE_KEY = 'the-commute-save-v1';

/** The saved {g, selected, at} or null; a save that can't be loaded is kept aside under a -broken key, never overwritten. */
export function load() {
  let raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (_) { return null; }
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return { ...s, g: migrate(s.g) };
  } catch (e) {
    try { localStorage.setItem(SAVE_KEY + '-broken', raw); localStorage.removeItem(SAVE_KEY); } catch (_) {}
    if (!(e instanceof SaveError)) console.warn('save could not be read', e);
    return null;
  }
}

/** Write the save; returns false when the device won't keep it. */
export function save(state) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, at: Date.now() })); return true; } catch (_) { return false; }
}
export function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (_) {} }
