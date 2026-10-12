// The expresses (docs/DESIGN.md, Expresses): Avanti West Coast and CrossCountry trains running through from beyond the
// map. Each comes on where the fast lines begin, south of Stockport, one every so often by its own timetable, calls at
// Stockport where the player has built a platform it uses that way (running through without stopping until then),
// turns round at Piccadilly, and goes back off the map. At a stop it takes a platform face like any train, so it can
// hold a stopper, and at a station the player owns it pays the access charge and its long-distance passengers pay a
// share of their fares there. They carry none of the line's own passengers: they're not in the journeys.
import { demandCurve, type Sim, type Tuning } from './sim.ts';
import { runTime } from './journeys.ts';
import { failed } from './trouble.ts';
import type { Train } from './types.ts';

/** When an express next comes on: the first of its slots (`at` into each `every`) after t. */
export function nextSlot(x: { every: number; at: number }, t: number): number { return Math.ceil((t - x.at) / x.every + 1e-9) * x.every + x.at; }

/** The next station an express calls at its way from where it is (not the one it's leaving, which it may stand a
 * little short of), or null going south with none left: it runs off. */
export function nextCall(sim: Sim, tr: Train, leaving = -1): number | null {
  const v = sim.svc(tr.svc), order = tr.dir > 0 ? v.route : [...v.route].reverse();
  for (const i of order) if (i !== leaving && (sim.station(i).s - tr.s) * tr.dir > 1 && sim.callsAt(tr, i)) return i;
  return tr.dir > 0 ? v.route[v.route.length - 1]! : null;
}

/** Seconds to run from s0 to s1 at the expresses' speed. */
const run = (T: Tuning, s0: number, s1: number) => runTime(Math.abs(s1 - s0), T.expressSpeed, T.accel, T.brake);

/** One step of an express: off the map until its slot (and not through the small hours), running, or standing. */
export function stepExpress(sim: Sim, T: Tuning, tr: Train, dt: number): void {
  const g = sim.g, v = sim.svc(tr.svc), x = v.express!;
  if (tr.state === 'away') {
    if (g.t < tr.due) return;
    const h = sim.hour();
    if (h >= T.expressFrom || h < T.expressTo) { tr.due = nextSlot(x, g.t); return; }
    // on the map at the start of the fast lines, heading for Manchester
    tr.state = 'run'; tr.dir = 1; tr.s = x.portal; tr.v = T.expressSpeed; tr.late = Math.max(0, g.t - tr.due);
    tr.next = nextCall(sim, tr); tr.bound = -1; tr.pfAt = -1;
    tr.onboard = Math.round(tr.cars * T.seatsPerCar * (0.3 + 0.4 * demandCurve(h) / 1.12));
    if (tr.next !== null) tr.due += run(T, x.portal, sim.station(tr.next).s) + (sim.isEnd(tr, tr.next) ? sim.turnaround() : T.expressDwell);
    return;
  }
  if (tr.state === 'dwell') {
    const i = tr.pfAt, end = sim.isEnd(tr, i);
    tr.stood += dt; tr.late = Math.max(0, g.t - tr.due);
    if (tr.stood < (end ? T.turnMin : T.dwellMin) || g.t < tr.due) return;
    sim.onDepart?.(tr, i, tr.late);
    tr.state = 'run'; tr.calling = null; tr.next = nextCall(sim, tr, i);
    const to = tr.next === null ? x.portal : sim.station(tr.next).s;
    tr.due += run(T, sim.station(i).s, to) + (tr.next === null ? 0 : sim.isEnd(tr, tr.next) ? sim.turnaround() : T.expressDwell);
    return;
  }
  if (failed(g, tr)) { tr.v = 0; return; }
  // a call that's no longer on (a platform not built) is passed by; going south past the last, it runs off the map
  if (tr.next !== null && !sim.callsAt(tr, tr.next)) { tr.next = nextCall(sim, tr, tr.pfAt); tr.bound = -1; }
  const i = tr.next;
  if (i === null) {
    if (sim.move(tr, dt, x.portal, null, T.expressSpeed)) { tr.state = 'away'; tr.due = nextSlot(x, g.t); tr.pfAt = -1; tr.onboard = 0; }
    return;
  }
  const target = tr.bound >= 0 ? sim.stopAt(tr, i, tr.bound) : sim.station(i).s;
  if (!sim.move(tr, dt, target, i, T.expressSpeed)) return;
  const end = sim.isEnd(tr, i);
  if (end) tr.dir = tr.dir > 0 ? -1 : 1;
  sim.standAt(tr, i);
  tr.state = 'dwell'; tr.stood = 0; tr.calling = i;
  call(sim, T, tr, i);
}

/** An express calls at station i: its long-distance passengers get off and on, and where the player owns the station
 * it pays the access charge and they pay a share of their fares. */
function call(sim: Sim, T: Tuning, tr: Train, i: number): void {
  const g = sim.g, S = sim.state(i), n = Math.round(T.expressPax * demandCurve(sim.hour()) * tr.cars / 9);
  if (!g.owned[i]) return;
  const rev = T.accessCharge + 2 * n * T.throughShare;
  S.through += 2 * n; g.stats.through += 2 * n;
  g.cash += rev; g.earned += rev; S.revenue += rev; g.stats.express += rev;
}

