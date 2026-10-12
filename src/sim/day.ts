// The game's clock (docs/DESIGN.md, Time). Trains and people move in sim seconds; the clock runs faster than that, and
// not at one rate: BASE (6) clock seconds a sim second through the peaks, where the trains and the crowds play off each
// other, about twice that between them, and fast enough through the night (23:00 to 05:00) that it passes in about two
// real minutes at 1x. The rate eases between bands, so the sky and the clock never jump. Everything that reads the hour
// or counts days asks here; nothing else turns sim seconds into the clock.
//
// The clock is counted in clock seconds from 00:00 on day 1. Sim time 0 is that midnight, so day d starts at sim time
// (d - 1) * DAY. A table of where each clock minute falls in sim time is worked out once; between its entries the
// clock runs straight, so the map is exact both ways.

/** The clock's rate, in clock seconds a sim second: through the peaks, between them, and at night. */
export const DAY_RATE = {
  base: 6,                          // the peaks, as the whole day ran before
  mid: 12,                          // between the peaks, early morning and evening
  night: 60,                        // 23:00 to 05:00
  // eased over half an hour either side of their edges, so the old rate holds from 06:00 to 09:30 (from 06:30 people
  // were stranded at Stockport before the peak) and from 16:00 to 19:00
  peaks: [[5.5, 10], [15.5, 19.5]] as [number, number][],
  night0: 23, night1: 5,            // the night, by the clock
  ease: 0.5,                        // clock hours either side of a peak's edge over which the rate eases (the night's, twice)
};
export const BASE = DAY_RATE.base;

const smooth = (x: number) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
/** How far into a band the hour h is, 0 outside to 1 inside, eased over e hours either side of its edges (a band
 * may wrap midnight). */
function inBand(h: number, a: number, b: number, e: number): number {
  const wrap = (x: number) => ((x % 24) + 24) % 24, from = wrap(h - a), len = wrap(b - a);
  const dist = from < len ? Math.min(from, len - from) : -Math.min(from - len, 24 - from);   // positive inside
  return smooth((dist + e) / (2 * e));
}
/** The clock's rate at clock hour h (0 to 24): clock seconds a sim second. Eased in the log, so a doubling feels the
 * same wherever it is. */
export function rateAtHour(h: number): number {
  const R = DAY_RATE, e = R.ease, lb = Math.log(R.base), lm = Math.log(R.mid), ln = Math.log(R.night);
  let peak = 0; for (const [a, b] of R.peaks) peak = Math.max(peak, inBand(h, a, b, e));
  const night = inBand(h, R.night0, R.night1, 2 * e);
  return Math.exp(lm + (lb - lm) * peak + (ln - lm) * night);
}

// where each clock minute of the day starts, in sim seconds after midnight
const MINS = 1440, AT = new Float64Array(MINS + 1);
for (let k = 0; k < MINS; k++) AT[k + 1] = AT[k]! + 60 / rateAtHour((k + 0.5) / 60);
/** Sim seconds in a game day. */
export const DAY = AT[MINS]!;

/** The clock at sim time t: clock seconds since 00:00 on day 1. */
export function clockAt(t: number): number {
  const d = Math.floor(t / DAY), r = t - d * DAY;
  let lo = 0, hi = MINS;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (AT[m]! <= r) lo = m; else hi = m; }
  return d * 86400 + 60 * (lo + (r - AT[lo]!) / (AT[lo + 1]! - AT[lo]!));
}
/** The sim time the clock reads c (clock seconds since 00:00 on day 1): clockAt's inverse. */
export function simAt(c: number): number {
  const d = Math.floor(c / 86400), r = (c - d * 86400) / 60, k = Math.min(MINS - 1, Math.floor(r));
  return d * DAY + AT[k]! + (r - k) * (AT[k + 1]! - AT[k]!);
}
/** The sim time the clock next reads hour h of day `day` (1 on), e.g. simAtHour(1, 6.5) for 06:30 on the first day. */
export function simAtHour(day: number, h: number): number { return simAt((day - 1) * 86400 + h * 3600); }
/** The clock's hour of the day at sim time t, 0 to 24. */
export function hourAt(t: number): number { return (clockAt(t) % 86400) / 3600; }
/** Which game day sim time t falls in, 1 on. */
export function dayAt(t: number): number { return Math.floor(t / DAY) + 1; }
/** The clock's rate at sim time t, in clock seconds a sim second. */
export function rateAt(t: number): number { return rateAtHour(hourAt(t)); }
/** How many times faster than through the peaks the clock is running at sim time t (1 in the peaks). */
export function pace(t: number): number { return rateAt(t) / BASE; }
/** The sim time that comes after s of the peaks' sim seconds have passed by the clock from sim time t: s sim seconds
 * in a peak, fewer when the clock runs fast. For what's paced by the clock rather than by the trains. */
export function later(t: number, s: number): number { return simAt(clockAt(t) + s * BASE); }
/** Sim time t as the clock shows it: HH:MM. */
export function clockText(t: number): string {
  const s = Math.floor(clockAt(t) % 86400);
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`;
}
