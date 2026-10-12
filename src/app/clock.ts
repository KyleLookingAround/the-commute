// Real time to sim time. 1 real second is GAME_PER_REAL sim seconds at 1x (three: trains and people move at three times
// real speed, so the game's 1x, 3x and 10x are 3, 9 and 30 times real; the game's clock runs faster again inside the
// sim, and fastest at night, see src/sim/day.ts); a session away is caught up on load at 1x, capped so a week away
// doesn't hand over a fortune. The sim only ever sees sim seconds.
import { DAY } from '../sim/day.ts';

export const GAME_PER_REAL = 3;
export const MAX_AWAY = DAY / 2; // sim seconds: half a game day

/** Game seconds to advance for a save written `at` (ms since the epoch); 0 when there's nothing worth catching up. */
export function awaySeconds(at: number, now: number = Date.now()): number {
  const s = Math.min(MAX_AWAY, Math.max(0, (now - at) / 1000) * GAME_PER_REAL);
  return s > 120 ? s : 0;
}
