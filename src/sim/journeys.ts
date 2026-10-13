// Door-to-door journey times between every pair of stations, as the network stands: the walk to the station, the wait
// for a train (half the gap between trains that way), the ride (distance along its route at line speed plus a dwell at
// each stop between), a change wherever the best way needs one (Stockport, between the Hazel Grove line and the main
// line, today), and the walk at the far end. A trip is a path through the graph of rides on services and changes
// between them, the quickest as people feel it, as many changes as that takes. All in sim seconds, which are real
// seconds: trains run at real speed, and people's time budget is real time. Recomputed only when what it depends on
// changes (a purchase, units in service), never every tick.
import type { Sim, Tuning } from './sim.ts';
import { feel } from './weather.ts';

/** One way from one station to another. walk: both ends; wait: for the first train and any at the changes; felt: the
 * whole journey as people feel it, before crowding (walking and waiting weigh more than riding); firstWait: the felt
 * part of the wait on the first platform, which is what patience runs out on. legs: the services ridden, whose
 * crowding makes the ride feel longer; at: the stations changed at between them. */
export interface Journey { walk: number; wait: number; ride: number; changes: number; felt: number; firstWait: number; legs: Leg[]; at: number[] }
/** A ride on one service one way (d 0 towards Manchester, 1 away) and how long it takes. */
export interface Leg { svc: number; d: 0 | 1; ride: number }

/** Seconds to run d metres from a stand to a stand at line speed v, accelerating at a and braking at b. */
export function runTime(d: number, v: number, a: number, b: number): number {
  if (d <= 0) return 0;
  const crit = v * v / (2 * a) + v * v / (2 * b);
  if (d >= crit) return d / v + v / (2 * a) + v / (2 * b);
  const peak = Math.sqrt(2 * d / (1 / a + 1 / b));
  return peak / a + peak / b;
}

/** When a service's train reaches (arr) and leaves (dep) each station it calls at, one way, from leaving the start of
 * its run; and the whole run's time. */
interface Run { arr: Map<number, number>; dep: Map<number, number>; total: number }

function run(sim: Sim, T: Tuning, svc: number, d: 0 | 1): Run {
  const v = sim.svcs[svc]!, sp = sim.span(v), order = d === 0 ? sp : [...sp].reverse();
  const arr = new Map<number, number>(), dep = new Map<number, number>();
  const first = order[0], last = order[order.length - 1];
  if (first === undefined || last === undefined) return { arr, dep, total: 0 };
  const calls = (i: number) => i === first || i === last || (!!sim.g.owned[i] && sim.serves(i, d));
  let t = 0, at = sim.station(first).s, prev = first;
  dep.set(first, 0);
  for (const i of order.slice(1)) {
    if (!calls(i)) continue;
    const s = sim.station(i).s;
    t += runTime(Math.abs(s - at), sim.runSpeed(v, prev, i), sim.runAccel(v, prev, i), T.brake); at = s; prev = i;
    arr.set(i, t);
    if (i !== last) { t += T.dwell; dep.set(i, t); }
  }
  return { arr, dep, total: t };
}

/** The average walk between a station and the homes or work around it: the near side walks straight in; the far
 * side, half of them, walks round until there's a way across, and lifts make that and the platform quicker for all. */
export function walk(sim: Sim, T: Tuning, i: number): number {
  const ups = sim.ups(i), crossing = !!sim.station(i).grow?.crossing;
  const far = !crossing ? 0 : !ups.crossing ? T.walkRound : ups.lifts ? 0 : T.walkStairs;
  return T.walk - sim.fx.walk + 0.5 * far - (ups.lifts ? T.liftsSave : 0);
}

/** How much a second of waiting at a station weighs against one riding: less under a canopy, more in the rain or
 * snow, and a canopy keeps most of that off. */
export function waitWeight(sim: Sim, T: Tuning, i: number): number { const f = feel(sim.g); return sim.ups(i).canopy ? T.waitCanopy * f.waitCanopy : T.waitWeight * f.wait; }

/** A service's planned round trip as the timetable has it: each way's running and stops, and the turnaround (with
 * its recovery time) at each end. Its units share it, so the gap between them is the cycle over the units. */
export function cycle(sim: Sim, T: Tuning, svc: number): number { return run(sim, T, svc, 0).total + run(sim, T, svc, 1).total + 2 * sim.turnaround(); }

/** Every station to every other, door to door; null where no train goes that way from there. */
export function journeys(sim: Sim, T: Tuning): (Journey | null)[][] {
  const n = sim.S.length, runs: Run[][] = [], waits: number[] = [];
  sim.svcs.forEach((v, k) => {
    // the expresses carry the line's own passengers nowhere: long-distance tickets only, as the game has it
    if (v.express) { const none = { arr: new Map(), dep: new Map(), total: 0 }; runs[k] = [none, none]; waits[k] = Infinity; return; }
    runs[k] = [run(sim, T, k, 0), run(sim, T, k, 1)];
    const units = sim.unitsFor(v);
    waits[k] = units ? cycle(sim, T, k) / units / 2 : Infinity;
  });
  /** A ride from i to j on service k, if its trains call at both going that way (along its route, 0 towards Manchester). */
  const leg = (k: number, i: number, j: number): Leg | null => {
    const route = sim.svcs[k]!.route, a = route.indexOf(i), b = route.indexOf(j); if (a < 0 || b < 0 || a === b) return null;
    const d: 0 | 1 = b > a ? 0 : 1, r = runs[k]![d]!, from = r.dep.get(i), to = r.arr.get(j);
    return from === undefined || to === undefined || !isFinite(waits[k]!) ? null : { svc: k, d, ride: to - from };
  };
  const walks = sim.S.map((_, i) => walk(sim, T, i)), ww = sim.S.map((_, i) => waitWeight(sim, T, i)), walkFeel = feel(sim.g).walk;
  // every ride there is: from each station, on each service its trains call at both ends of going that way
  const rides: { to: number; leg: Leg }[][] = sim.S.map(() => []);
  for (let k = 0; k < sim.svcs.length; k++) for (const x of sim.svcs[k]!.route) for (const y of sim.svcs[k]!.route) {
    const l = x === y ? null : leg(k, x, y); if (l) rides[x]!.push({ to: y, leg: l });
  }
  const table: (Journey | null)[][] = [];
  // the search's nodes: a station and the service ridden there (m = 0 at the start), so a change is always onto another
  // service: riding past and coming back on the same line isn't a journey people make
  const m = sim.svcs.length + 1, N = n * m;
  const felt = new Float64Array(N), via = new Int32Array(N), by = new Array<Leg | null>(N), done = new Uint8Array(N);
  for (let i = 0; i < n; i++) {
    // the quickest way as people feel it from i to everywhere: rides and changes, each ride's wait felt where it's
    // boarded, a change costing its own five minutes on top (Dijkstra)
    felt.fill(Infinity); via.fill(-1); by.fill(null); done.fill(0);
    if (sim.reachable(i)) felt[i * m] = 0;
    for (;;) {
      let u = -1; for (let y = 0; y < N; y++) if (!done[y] && felt[y]! < Infinity && (u < 0 || felt[y]! < felt[u]!)) u = y;
      if (u < 0) break;
      done[u] = 1;
      const x = Math.floor(u / m), came = u % m - 1;
      // a change only where two services meet at a station people can travel to and from
      if (x !== i && !sim.reachable(x)) continue;
      for (const { to, leg: l } of rides[x]!) {
        if (l.svc === came) continue;
        const f = felt[u]! + ww[x]! * waits[l.svc]! + (x === i ? 0 : T.change) + l.ride, w = to * m + l.svc + 1;
        if (f < felt[w]!) { felt[w] = f; via[w] = u; by[w] = l; }
      }
    }
    const row: (Journey | null)[] = [];
    for (let j = 0; j < n; j++) {
      let end = -1; for (let k = 1; k < m; k++) if (by[j * m + k] && (end < 0 || felt[j * m + k]! < felt[end]!)) end = j * m + k;
      if (i === j || end < 0 || !sim.reachable(i) || !sim.reachable(j)) { row.push(null); continue; }
      // the path back from j: its rides in order, and the stations changed at
      const legs: Leg[] = [], at: number[] = [];
      for (let u = end; u >= 0 && by[u];) { const v = via[u]!; legs.unshift(by[u]!); if (Math.floor(v / m) !== i) at.unshift(Math.floor(v / m)); u = v; }
      const w = walks[i]! + walks[j]!, ride = legs.reduce((a, l) => a + l.ride, 0), changes = legs.length - 1;
      const wait = legs.reduce((a, l) => a + waits[l.svc]!, 0), firstWait = ww[i]! * waits[legs[0]!.svc]!;
      const f = T.walkWeight * walkFeel * w + firstWait + legs.slice(1).reduce((a, l, k) => a + ww[at[k]!]! * waits[l.svc]!, 0) + ride + changes * T.change;
      row.push({ walk: w, wait, ride, changes, felt: f, firstWait, legs, at });
    }
    table.push(row);
  }
  return table;
}
