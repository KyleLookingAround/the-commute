// Real time to game time. 1 real second is GAME_PER_REAL game seconds at 1x; a session away is caught up on load,
// capped so a week away doesn't hand over a fortune. The sim only ever sees game seconds.
export const GAME_PER_REAL = 6;
export const MAX_AWAY = 8 * 3600; // game seconds

/** Game seconds to advance for a save written `at` (ms since the epoch); 0 when there's nothing worth catching up. */
export function awaySeconds(at: number, now: number = Date.now()): number {
  const s = Math.min(MAX_AWAY, Math.max(0, (now - at) / 1000) * GAME_PER_REAL);
  return s > 120 ? s : 0;
}
