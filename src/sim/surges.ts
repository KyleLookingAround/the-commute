// Surges (step 26, docs/DESIGN.md, Surges): days when one place draws far more than its census says, from the seed and
// the calendar alone, so the same game has the same days. On a match day the home club's ground pulls its crowd
// through the station nearest it before a three o'clock kick-off and after the final whistle (the view dresses them in
// the club's colours, src/render/passengers.ts); in December Christmas shopping at Merseyway pulls through Stockport by
// day. Pure: nothing here draws on the game's rng (a fixed hash of the seed and the day).

/** A fixed hash in [0, 1) of two numbers. */
const hash = (a: number, b: number) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };

/** The clubs whose crowds ride the line: the station their fans travel to (City's ground at Eastlands is a walk from
 * Ashburys, or from Piccadilly before Ashburys is open; United's is beyond Piccadilly; County's Edgeley Park is by
 * Stockport), how much more that station draws with the whole crowd about (`pull`: a small station's draw grows most,
 * Piccadilly's least), which way that is from the line's south end, and the coat their fans wear (the view's coats). */
export const CLUBS = [
  { name: 'City', station: 'ashburys', else: 'piccadilly', pull: 4, ground: 'north', coat: 8 },
  { name: 'United', station: 'piccadilly', else: 'piccadilly', pull: 0.6, ground: 'north', coat: 9 },
  { name: 'County', station: 'stockport', else: 'stockport', pull: 0.8, ground: 'south', coat: 10 },
] as const;

/** The club playing at home on a game day (0 the first), by its place in CLUBS, or -1: about one day in six, the same
 * every time for a seed. */
export function matchOn(seed: number, day: number): number {
  if (hash(seed % 9973, day * 3.17) >= 0.17) return -1;
  const h = hash(day, seed % 9973 + 5); return h < 0.45 ? 0 : h < 0.8 ? 1 : 2;
}
/** How much of a match day's crowd is about at an hour: going to the ground before a three o'clock kick-off, coming
 * home after the final whistle; 0 outside those. */
export function crowdAt(hour: number): { share: number; going: boolean } {
  if (hour >= 12 && hour < 15) return { share: 0.45, going: true };
  if (hour >= 16.8 && hour < 19) return { share: 0.45, going: false };
  return { share: 0, going: true };
}
/** Whether the year (0 to 1 from the start of spring, src/sim/weather.ts) is in December: the first third of winter. */
export const isDecember = (year: number): boolean => year >= 0.75 && year < 0.75 + 1 / 12;
