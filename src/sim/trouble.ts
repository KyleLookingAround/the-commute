// Things going wrong (docs/DESIGN.md, Things going wrong): now and then a unit fails between stations and blocks its
// line until it's rescued, or a stretch of line runs at caution after a signal failure. Few and fair: nothing in the
// first sim hour, nothing at night, one at a time and a while apart, all drawn from the game's seeded random numbers.
// When a failed train stops its line for long enough, rail replacement buses carry people between the stations either
// side along the road (`roads` in the network data), slower than the train. A spare unit standing by rescues a failed
// one sooner; the faster timetable's new signals fail less often.
import type { Sim, Tuning } from './sim.ts';
import type { Bus, Train, Trouble } from './types.ts';

export function freshTrouble(): Trouble { return { next: -1, fails: 0, signals: 0, bused: 0, fail: null, caution: null, buses: [] }; }

/** Seconds until the next thing might go wrong: exponential about the mean, never sooner than the gap after the last. */
function after(sim: Sim, T: Tuning): number { return T.troubleGap - Math.log(1 - sim.rand()) * (T.troubleEvery - T.troubleGap); }

/** The stations either side of a running train: the nearest on its run behind it and ahead of it, whether or not it
 * calls there (neighbours on the line, so there's a road between them); null if it's within `margin` metres of either,
 * or isn't between two. */
export function stationsEither(sim: Sim, tr: Train, margin: number): { a: number; b: number } | null {
  if (tr.state !== 'run') return null;
  let a = -1, b = -1, behind = Infinity, ahead = Infinity;
  for (const i of sim.span(sim.svc(tr.svc))) {
    const d = (sim.station(i).s - tr.s) * tr.dir;
    if (Math.abs(d) < margin) return null;
    if (d > 0 && d < ahead) { ahead = d; b = i; }
    if (d < 0 && -d < behind) { behind = -d; a = i; }
  }
  return a < 0 || b < 0 ? null : { a, b };
}

/** Start something going wrong, if it's time: a failed train or a signal failure, by their shares. */
function start(sim: Sim, T: Tuning): void {
  const g = sim.g, tb = g.trouble, h = sim.hour();
  if (tb.fail || tb.caution || g.t < tb.next) return;
  // nothing at night, when nobody would see it or be hurt by it: try again later
  if (h < T.troubleDayFrom || h >= T.troubleDayTo) { tb.next = g.t + after(sim, T) / 2; return; }
  if (sim.rand() < T.failShare) {
    const ok = g.trains.filter(tr => stationsEither(sim, tr, T.failMargin));
    if (!ok.length) { tb.next = g.t + 120; return; }
    const tr = ok[Math.floor(sim.rand() * ok.length)]!, ab = stationsEither(sim, tr, T.failMargin)!;
    const fix = g.line.spare ? T.rescueSpare : T.rescue;
    tb.fail = { train: tr.id, from: g.t, until: g.t + fix * (0.75 + 0.5 * sim.rand()), a: ab.a, b: ab.b, d: tr.dir > 0 ? 0 : 1 };
    tb.fails++;
  } else {
    // the faster timetable's new signals mostly hold
    if (g.line.timetable && sim.rand() < T.resignalHolds) { tb.next = g.t + after(sim, T); return; }
    const pairs: [number, number][] = [];
    for (const v of sim.svcs) {
      if (!sim.unitsFor(v)) continue;
      const sp = sim.span(v);
      for (let k = 1; k < sp.length; k++) { const s0 = sim.station(sp[k - 1]!).s, s1 = sim.station(sp[k]!).s; if (s1 - s0 > 3 * T.failMargin) pairs.push([s0 + T.failMargin, s1 - T.failMargin]); }
    }
    if (!pairs.length) { tb.next = g.t + 120; return; }
    const [s0, s1] = pairs[Math.floor(sim.rand() * pairs.length)]!;
    tb.caution = { s0, s1, from: g.t, until: g.t + T.signalFor * (0.75 + 0.5 * sim.rand()) };
    tb.signals++;
  }
}

/** Once a step: start and end what's going wrong, and run the replacement buses. */
export function stepTrouble(sim: Sim, T: Tuning): void {
  const g = sim.g, tb = g.trouble;
  if (tb.next < 0) tb.next = g.t + T.troubleFrom + after(sim, T);
  if (tb.fail && g.t >= tb.fail.until) { tb.fail = null; tb.next = Math.max(tb.next, g.t + after(sim, T)); }
  if (tb.caution && g.t >= tb.caution.until) { tb.caution = null; tb.next = Math.max(tb.next, g.t + after(sim, T)); }
  start(sim, T);
  buses(sim, T);
}

/** Whether a train has failed and stands where it is. */
export function failed(g: { trouble: Trouble }, tr: Train): boolean { return g.trouble.fail?.train === tr.id; }

/** The fastest a train at s may run for a signal failure: at caution inside the stretch, braking to it before. */
export function cautionLimit(g: { trouble: Trouble }, T: Tuning, s: number, dir: 1 | -1): number {
  const c = g.trouble.caution; if (!c) return Infinity;
  if (s >= c.s0 && s <= c.s1) return T.caution;
  const d = dir > 0 ? c.s0 - s : s - c.s1;
  return d > 0 ? Math.sqrt(T.caution * T.caution + 2 * T.brake * d) : Infinity;
}

/** How long a bus takes between two stations: along the road where the data has one, otherwise a third longer than
 * the line. */
export function busRun(sim: Sim, T: Tuning, a: number, b: number): number {
  const r = sim.net.road(sim.station(a).id, sim.station(b).id);
  return (r ? r.road.length : 1.33 * Math.abs(sim.station(a).s - sim.station(b).s)) / T.busSpeed;
}

/** The replacement buses. Once a failed train has stopped its line for busAfter, a bus pulls in at the station behind
 * it every busGap, up to busFleet of them, and shuttles by road to the station ahead and back while the line's blocked:
 * at each end it stands busDwell, sets down who it carried (those going further wait for the train on, fare paid, as
 * someone changing does) and takes up to busSeats of the people waiting its way (the fare taken as for the train). */
function buses(sim: Sim, T: Tuning): void {
  const g = sim.g, tb = g.trouble, f = tb.fail;
  if (f && g.t >= f.from + T.busAfter) {
    const k = Math.floor((g.t - f.from - T.busAfter) / T.busGap);
    let mine = 0; for (const b of tb.buses) if (b.a === f.a && b.b === f.b) mine++;
    if (k >= mine && mine < T.busFleet && g.t < f.until) {
      const id = tb.buses.reduce((m, b) => Math.max(m, b.id + 1), 0);
      tb.buses.push({ id, a: f.a, b: f.b, d: f.d, leg: 'load', t0: g.t, t1: g.t + T.busDwell, load: [] });
    }
  }
  let k = 0;
  for (const bus of tb.buses) {
    if (g.t >= bus.t1 && !leg(sim, T, bus)) continue;
    tb.buses[k++] = bus;
  }
  tb.buses.length = k;
}

/** A bus finishes its leg and starts the next; false once it's done for good (empty, with the line clear). */
function leg(sim: Sim, T: Tuning, bus: Bus): boolean {
  const g = sim.g, f = g.trouble.fail, blocked = !!f && f.a === bus.a && f.b === bus.b, run = busRun(sim, T, bus.a, bus.b);
  const next = (l: Bus['leg'], dt: number) => { bus.leg = l; bus.t0 = g.t; bus.t1 = g.t + dt; return true; };
  switch (bus.leg) {
    case 'load': board(sim, T, bus, bus.a, bus.d); return bus.load.length || blocked ? next('out', run) : false;
    case 'out': setDown(sim, bus, bus.b); return next('drop', T.busDwell);
    case 'drop': board(sim, T, bus, bus.b, bus.d === 0 ? 1 : 0); return bus.load.length || blocked ? next('back', run) : false;
    case 'back': setDown(sim, bus, bus.a); return blocked && next('load', T.busDwell);
  }
}

/** A bus takes whoever is waiting its way at station i, front of the queue first, up to its seats, the fare taken as
 * for the train. */
function board(sim: Sim, T: Tuning, bus: Bus, i: number, d: 0 | 1): void {
  const g = sim.g, S = sim.state(i), q = S.q[d], ups = sim.ups(i);
  const collect = ups.barriers ? 1 : ups.building ? T.collectBooking : T.collectNoBarriers;
  let room = T.busSeats, c: (typeof q)[number] | undefined;
  while ((c = q[0]) && room > 0) {
    const n = Math.min(c.n, room);
    c.n -= n; room -= n; S.waiting -= n;
    if (g.owned[i] && !c.paid) { const rev = n * sim.fare(i, c.dest) * collect; g.cash += rev; g.earned += rev; S.revenue += rev; S.boarded += n; g.stats.boarded += n; }
    bus.load.push({ t: g.t, dest: c.dest, n, paid: true });
    if (c.n <= 0) q.shift();
  }
}

/** A bus sets everyone down at station i: those going there are there; the rest wait for the train on, fare paid. */
function setDown(sim: Sim, bus: Bus, i: number): void {
  const g = sim.g, S = sim.state(i);
  for (const c of bus.load) {
    g.trouble.bused += c.n;
    if (c.dest === i) { S.alighted += c.n; continue; }
    S.waiting += c.n; S.q[sim.dirIdx(i, c.dest)].push({ t: g.t, dest: c.dest, n: c.n, paid: true });
  }
  bus.load = [];
}
