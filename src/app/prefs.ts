// The player's settings on this device: sound, graphics and the weather. Kept apart from the save (never in it, so starting over
// keeps them), under their own localStorage key and guarded the way the save is, so a private window or a full store
// never breaks the game; anything missing or out of range reads as its default.

export const PREFS_KEY = 'the-commute-prefs-v1';

/** sound: on or muted; volume: 0 to 1. shadows: the sun casts them; fewer: a third of the passenger figures, for older
 * phones; sharp: draw at the screen's full sharpness (off draws at one pixel per CSS pixel, much lighter on a phone);
 * weather: rain, fog and snow drawn on the map (off draws fair weather; the game is the same either way). */
export interface Prefs { sound: boolean; volume: number; shadows: boolean; fewer: boolean; sharp: boolean; weather: boolean }
export const DEFAULT_PREFS: Readonly<Prefs> = { sound: true, volume: 0.6, shadows: true, fewer: false, sharp: true, weather: true };
/** The lighter graphics: what the settings sheet's Low sets. */
export const LOW: Readonly<Pick<Prefs, 'shadows' | 'fewer' | 'sharp'>> = { shadows: false, fewer: true, sharp: false };

export function loadPrefs(): Prefs {
  let raw: string | null = null;
  try { raw = localStorage.getItem(PREFS_KEY); } catch { /* the device won't say */ }
  const p: Prefs = { ...DEFAULT_PREFS };
  if (!raw) return p;
  try {
    const s = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>;
    for (const k of ['sound', 'shadows', 'fewer', 'sharp', 'weather'] as const) if (typeof s[k] === 'boolean') p[k] = s[k];
    if (typeof s.volume === 'number' && s.volume >= 0 && s.volume <= 1) p.volume = s.volume;
  } catch { /* unreadable: the defaults */ }
  return p;
}

/** Keep the settings; false when the device won't. */
export function savePrefs(p: Prefs): boolean {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); return true; } catch { return false; }
}

/** The map views left on, kept like the settings but under a key of their own, so the settings sheet never writes over
 * them: strain, the problems layer. */
export interface Views { strain: boolean }
export const VIEWS_KEY = 'the-commute-views-v1';
export function loadViews(): Views {
  try { const s = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '{}') as Partial<Record<keyof Views, unknown>>; return { strain: s.strain === true }; } catch { return { strain: false }; }
}
export function saveViews(v: Views): void { try { localStorage.setItem(VIEWS_KEY, JSON.stringify(v)); } catch { /* the device won't keep it: off next time */ } }
