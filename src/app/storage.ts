// Saving to the device: one localStorage key, guarded so a private window or a full store never breaks the game.
// This file and src/app/prefs.ts (the player's settings, kept apart) are the only places the game names localStorage; the sim never does (tools/rules.mjs).
// A save can also go to a file and come back from one, to carry a game between devices: the file is the same {g, selected, at} the device keeps.
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

/** A save as a file's text, written now: the same shape the device keeps. */
export function toFile(state: Omit<Saved, 'at'>): string { return JSON.stringify({ ...state, at: Date.now() }); }
/** The file's name, after the game: the-commute-day-3.json. */
export const fileName = (g: GameState): string => `the-commute-day-${g.day}.json`;

/** Why a file can't be loaded: not a save at all, from a newer version of the game, or from an older one that can't be brought up to date. */
export type FileProblem = 'bad' | 'newer' | 'older';
/** Read a save from a file's text: the save, or why it can't be loaded. Nothing is written. */
export function fromFile(text: string): { ok: true; saved: Saved } | { ok: false; why: FileProblem } {
  let s: Partial<Saved>;
  try { s = JSON.parse(text) as Partial<Saved>; } catch { return { ok: false, why: 'bad' }; }
  if (!s || typeof s !== 'object' || !s.g || typeof s.g !== 'object') return { ok: false, why: 'bad' };
  const v = (s.g as { v?: unknown }).v;
  if (typeof v !== 'number') return { ok: false, why: 'bad' };
  try {
    const g = migrate(s.g);
    // a save that migrates still has to look like a game: stations, trains and money
    if (!Array.isArray(g.st) || !Array.isArray(g.trains) || !Array.isArray(g.owned) || typeof g.cash !== 'number') return { ok: false, why: 'bad' };
    // whatever else the file carries beside the game comes along, so the format can grow
    const out: Saved = { ...s, g };
    if (typeof out.selected !== 'number') delete out.selected;
    if (typeof out.at !== 'number') delete out.at;
    return { ok: true, saved: out };
  } catch (e) {
    if (!(e instanceof SaveError)) return { ok: false, why: 'bad' };
    return { ok: false, why: /newer/.test(e.message) ? 'newer' : 'older' };
  }
}
/** Put a save read from a file on the device in place of the game there, keeping when it was written; false when the device won't keep it. */
export function put(s: Saved): boolean {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}
