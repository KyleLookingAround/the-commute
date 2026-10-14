// Where a station's trouble comes from (roadmap step 25): when Strain sees something wrong at a station, the places
// behind it, each a chip under the card's what's-wrong line that opens that place's card. Facts about the network as
// Strain reads it (src/ui/strain.ts), never a buy to make: a service whose trains leave the station full, a service
// leaving it late this clock hour, and a section of line behind it where trains lose time. Only the view: it reads the
// sim and Strain's tallies and changes nothing in the game.
import { TUNING, type Sim } from '../sim/sim.ts';
import type { StrainRead } from './strain.ts';

/** A train calling at or running to the station that will still be this full of its seats once those getting off
 * there have, leaves it full: little room for the crowd on the platform. */
export const FULL_FROM = 0.9;
/** The most chips a card shows. */
const MOST = 3;

export interface Cause { text: string; place: string }

/** The places behind what's wrong at a place (only a station's, and only while Strain sees something there). */
export function causes(sim: Sim, read: StrainRead, id: string): Cause[] {
  const p = sim.P.byId.get(id); if (!p || p.kind !== 'station' || read.line(id) === null) return [];
  const i = p.station!, st = sim.station(i), out: Cause[] = [], seen = new Set<string>();
  const add = (text: string, place: string) => { if (!seen.has(place) && sim.P.byId.has(place) && out.length < MOST) { seen.add(place); out.push({ text, place }); } };
  const name = (place: string) => sim.P.byId.get(place)?.name ?? place;
  // a service whose trains leave the station full (calling there, or on their way to it, counting who stays on)
  for (const v of sim.svcs) {
    if (v.express || !v.route.includes(i)) continue;
    const full = sim.g.trains.some(t => t.svc === v.id && t.state !== 'away' && (t.calling === i || t.next === i) && t.onboard - (t.load[i] ?? 0) >= FULL_FROM * t.cars * TUNING.seatsPerCar);
    if (full) add(`Trains leave full · ${name(`route:${v.id}`)}`, `route:${v.id}`);
  }
  // a service leaving it late this clock hour, and where trains lost time on the line behind
  let worst: { back: number; min: number } | null = null;
  for (const L of read.late.values()) if (L.i === i) { add(`Trains late · ${name(`route:${L.svc}`)}`, `route:${L.svc}`); if (!worst || L.min > worst.min) worst = { back: L.back, min: L.min }; }
  if (worst) {
    const b = sim.station(worst.back), s0 = Math.min(b.s, st.s), s1 = Math.max(b.s, st.s);
    let slow: { id: string; m: number } | null = null;
    for (const x of sim.secs) if (x.s1 > s0 && x.s0 < s1) { const m = read.slowOn(x.id); if (m && (!slow || m > slow.m)) slow = { id: x.id, m }; }
    if (slow) add(`Trains slowed · ${name(slow.id)}`, slow.id);
  }
  return out;
}
