// Weather and seasons (docs/DESIGN.md, Weather and seasons). The year turns through the game days, a season every
// two, starting in spring; the weather comes in spells (sunny, cloudy, rain, fog, and in winter the odd snowy day),
// each drawn by the season from the weather's own seeded random numbers, so the same seed gives the same weather and
// the weather never shifts anything else the game draws. People feel it through the door-to-door journey: rain makes
// the walk and an open platform's wait feel longer (a canopy and lifts matter more), leaves on the line in autumn
// slow the trains a little (less with the faster timetable's new signals), and snow slows everything and keeps a few
// at home. Gentle on purpose: a wet day is a reason a canopy pays, never a wrecked game.
import { rand } from './random.ts';
import { clockAt, hourAt, simAt } from './day.ts';
import type { GameState, Season, Sky, Weather } from './types.ts';

/** The weather's numbers. `felt` off makes every spell feel fair (the bot's --fair, to measure what the weather costs). */
export const WEATHER = {
  felt: true,
  seasonDays: 2,                      // game days a season: the year is eight game days, so a long session sees it turn
  yearStart: 0.06,                    // where in the year a new game starts: early spring (0 spring, .25 summer, .5 autumn, .75 winter)
  // the chance of each kind of spell by season, spring to winter: Manchester, so rain is common, but rarely all day
  odds: [
    { sun: 0.34, cloud: 0.3, rain: 0.3, fog: 0.06, snow: 0 },
    { sun: 0.5, cloud: 0.26, rain: 0.22, fog: 0.02, snow: 0 },
    { sun: 0.24, cloud: 0.3, rain: 0.34, fog: 0.12, snow: 0 },
    { sun: 0.2, cloud: 0.3, rain: 0.25, fog: 0.12, snow: 0.13 },
  ] as Record<Sky, number>[],
  // how long a spell lasts, in the clock's hours, least and most
  lasts: { sun: [2, 6], cloud: [2, 5], rain: [1, 3.5], fog: [1.5, 3], snow: [2, 5] } as Record<Sky, [number, number]>,
  fogFrom: 3, fogBefore: 11,          // fog only comes in between these hours, overnight to morning; otherwise it's low cloud
  dryFrom: 2,                         // the first game day stays dry (cloud and fog, no rain), so the opening is as it was
  // how much longer walking and waiting feel: rain, snow; a canopy keeps most of the wet off
  rainWalk: 1.1, rainWait: 1.15, rainWaitCanopy: 1,
  snowWalk: 1.4, snowWait: 1.3, snowWaitCanopy: 1.1, snowSpeed: 0.85, snowHome: 0.85,
  leaves: 0.92, leavesResignalled: 0.96,   // autumn's line speed: leaves on the line, and with the new signals
};

const KINDS: Sky[] = ['sun', 'cloud', 'rain', 'fog', 'snow'];
/** The sim time `hours` of the clock's hours after sim time t. */
const after = (t: number, hours: number) => simAt(clockAt(t) + hours * 3600);

/** A fresh game's weather: its own random numbers from the seed, and a sunny first spell, so the opening is fair. */
export function freshWeather(seed: number, t: number): Weather {
  const w: Weather = { rngState: (seed ^ 0x5bd1e995) >>> 0, now: 'sun', was: 'sun', since: t, until: 0, wet: 0 };
  w.until = after(t, 2 + 2 * rand(w));
  return w;
}

/** Where in the year the game is at sim time t: 0 to 1 from the start of spring. */
export function yearAt(t: number): number { const days = clockAt(t) / 86400; return (WEATHER.yearStart + days / (4 * WEATHER.seasonDays)) % 1; }
/** The season at sim time t: 0 spring, 1 summer, 2 autumn, 3 winter. */
export function seasonAt(t: number): Season { return Math.floor(yearAt(t) * 4) % 4 as Season; }
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'] as const;

/** Once a step: when a spell ends, draw the next by the season, and count the wet time. */
export function stepWeather(g: GameState, dt: number): void {
  const w = g.weather;
  if (w.now === 'rain' || w.now === 'snow') w.wet += dt;
  if (g.t < w.until) return;
  const odds = WEATHER.odds[seasonAt(g.t)]!, hour = hourAt(g.t);
  let r = rand(w), next: Sky = 'cloud';
  for (const k of KINDS) { r -= odds[k]; if (r < 0) { next = k; break; } }
  // rain rarely lasts all day: a wet spell is followed by a dry one; fog lifts by late morning
  if ((next === 'rain' || next === 'snow') && (w.now === 'rain' || w.now === 'snow')) next = 'cloud';
  if (next === 'fog' && (hour < WEATHER.fogFrom || hour >= WEATHER.fogBefore)) next = 'cloud';
  if ((next === 'rain' || next === 'snow') && g.day < WEATHER.dryFrom) next = 'cloud';
  const [lo, hi] = WEATHER.lasts[next];
  w.was = w.now; w.now = next; w.since = g.t; w.until = after(g.t, lo + (hi - lo) * rand(w));
}

/** What the weather and season do to journeys now: walk, wait (open and under a canopy) as multiples of how they
 * usually feel, line speed and how many travel as shares of usual. */
export interface Feel { walk: number; wait: number; waitCanopy: number; speed: number; travel: number }
const FAIR: Feel = { walk: 1, wait: 1, waitCanopy: 1, speed: 1, travel: 1 };
const feelNow: Feel = { ...FAIR };
export function feel(g: GameState): Feel {
  if (!WEATHER.felt) return FAIR;
  const W = WEATHER, f = feelNow, now = g.weather.now;
  f.walk = now === 'rain' ? W.rainWalk : now === 'snow' ? W.snowWalk : 1;
  f.wait = now === 'rain' ? W.rainWait : now === 'snow' ? W.snowWait : 1;
  f.waitCanopy = now === 'rain' ? W.rainWaitCanopy : now === 'snow' ? W.snowWaitCanopy : 1;
  f.speed = (now === 'snow' ? W.snowSpeed : 1) * (seasonAt(g.t) === 2 ? (g.line.timetable ? W.leavesResignalled : W.leaves) : 1);
  f.travel = now === 'snow' ? W.snowHome : 1;
  return f;
}

/** A number that changes whenever what the weather does to journeys does: the spell and whether it's autumn. */
export function weatherKey(g: GameState): number { return WEATHER.felt ? KINDS.indexOf(g.weather.now) * 2 + (seasonAt(g.t) === 2 ? 1 : 0) : 0; }
