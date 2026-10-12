// The Commute: station tycoon simulation. Pure TypeScript, tick-based in sim seconds, no rendering here, nothing from the DOM.
// Trains move along a corridor by distance s (metres, increasing towards Manchester). Stations are at a known s.
// A sim second is a real second on the page at 1x, so trains, people and dwells move at real speed. The clock and the
// demand curve run TUNING.dayRate times faster than that: a game day is 24 / dayRate hours of sim time (four real hours),
// so the peaks and the night still come round while you watch.

import { rand, freshSeed } from './random.ts';
import { SAVE_VERSION } from './save.ts';
import type { Network } from './network.ts';
import { journeys, cycle, runTime, type Journey } from './journeys.ts';
import type { GameState, LineUpgradeId, StageId, Station, StationState, Train, UpgradeId } from './types.ts';

/** A station upgrade. name null: the station names it (its retail, or its stage in `grow`). requires: upgrades at the
 * same station that must be built first; one the station doesn't offer counts as built. stage: offered only where the
 * station's `grow` lists it. */
export interface Upgrade { id: UpgradeId; name: string | null; price: number; desc: string; requires?: UpgradeId[]; stage?: boolean }
export interface LineUpgrade { id: LineUpgradeId; name: string; prices: number[]; desc: string; max: number }

// in the order a station grows: a bought station is a halt (one platform, one line) and these build it up
export const UPGRADES: Upgrade[] = [
  { id: 'crossing', name: null, price: 2000, desc: 'The far side walks across, not round: 5 min off their walk', stage: true },
  { id: 'platform2', name: null, price: 3500, desc: 'Trains call both ways, so the crowd going home too', requires: ['crossing'], stage: true },
  { id: 'building', name: null, price: 3000, desc: '90% of fares collected (82% at a halt)', stage: true },
  { id: 'kiosk', name: 'Kiosk', price: 1500, desc: '+£0.35 per boarding passenger' },
  { id: 'canopy', name: 'Canopy', price: 2500, desc: 'Waiting in the dry feels a quarter shorter' },
  { id: 'barriers', name: 'Ticket barriers', price: 4000, desc: 'Collect every fare', requires: ['building'] },
  { id: 'extend', name: 'Platform extension', price: 5000, desc: 'Platform holds 320 instead of 150' },
  { id: 'lifts', name: 'Lifts', price: 6000, desc: 'Step-free: 3 min off the far side’s walk, 1 off everyone’s', requires: ['crossing'] },
  { id: 'retail', name: null, price: 9000, desc: '+£0.80 per boarding passenger', requires: ['building'] },
  { id: 'platforms', name: null, price: 30000, desc: '+20% catchment', requires: ['platform2', 'building'], stage: true },
];
export const LINE_UPGRADES: LineUpgrade[] = [
  { id: 'units', name: 'Extra unit', prices: [6000, 20000, 50000], desc: 'One more train in service: shorter waits, more passengers', max: 3 },
  { id: 'cars', name: 'Longer trains', prices: [12000, 40000], desc: '+2 cars per unit', max: 2 },
  { id: 'timetable', name: 'Faster timetable', prices: [20000], desc: 'Line speed 75 → 90 mph: quicker rides, shorter waits', max: 1 },
];

export const TUNING = {
  dayRate: 6,                                  // clock hours per sim hour: a game day is four hours of sim time
  fareBase: 1.5, farePerMile: 0.6, fareMult: 12.0,   // 6x the fare of the old 6x clock: the same money per real minute from a sixth of the trains
  seatsPerCar: 75, accel: 1.0, brake: 1.1, vmax: 33.5, vmaxFast: 40,
  // the timetable (docs/DESIGN.md, Timetable): a stop is planned at dwell and a turnaround at turnaround, but a train
  // can do them in dwellMin and turnMin when nobody's about, so a late one makes time up (the rest of a turnaround is
  // recovery); it never leaves early, and stays while people are still getting on and off, up to overrun past the least
  dwell: 45, turnaround: 120, dwellMin: 30, turnMin: 60, overrun: 120,
  recoveryFast: 30,                            // the faster timetable keeps some of its saving as recovery at each end
  alight: 0.5,                                 // someone getting off takes half the door time of someone getting on
  squeeze: 1.0,                                // seconds a full train is held for each person left trying to get on
  dispatch: 15,                                // seconds from the platform clearing to leaving: doors shut, all clear
  separation: 400,                             // metres a train keeps behind the one ahead on its line
  doorsPerCar: 2, boardPerDoor: 0.7,           // passengers a second through each door: a 2-car unit boards about 110 in a 45 s stop
  doorsCrowd: 0.7,                             // ...slowing as it fills, to 30% of that when full: people squeeze in
  platformCap: 150, platformCapExtended: 320,
  collectNoBarriers: 0.82, collectBooking: 0.9, platformsBonus: 1.2, kioskPerPax: 0.35, retailPerPax: 0.8,
  // door to door (src/sim/journeys.ts), in sim seconds, which are real ones: people travel when the whole journey fits
  // about half an hour each way (Marchetti's constant), and walking and waiting weigh twice riding (UK appraisal practice)
  walk: 8 * 60, walkRound: 8 * 60, walkStairs: 3 * 60, liftsSave: 60,   // the walk each end; the far side's extra, round or over the stairs
  walkWeight: 2, waitWeight: 2, waitCanopy: 1.5, change: 5 * 60,          // felt time: a change at Stockport costs five minutes on top of its wait
  crowd: 0.6,                                  // a full train's ride feels 1.6 times as long, rising from 60% full
  budget: 60 * 60, budgetSoft: 12 * 60,         // felt seconds each way: half of people travel at the budget, fewer beyond, more within
  grace: 6 * 60, patienceMin: 3 * 60,          // someone gives up once their wait has used what's left of their own budget and this
                                               // (they've walked there already), never sooner than patienceMin
  demand: 1.9,                                 // trips an hour for a station's catchment, at peak, with the city on its doorstep
  amOut: 0.8, pmOut: 0.35,                     // the share of trips from home rather than going home, before and after noon
};
export type Tuning = typeof TUNING;

export function demandCurve(h: number): number {
  // share of catchment per hour by hour of day: morning peak to Manchester, evening peak home, quiet nights
  const g = (c: number, s: number) => Math.exp(-((h - c) * (h - c)) / (2 * s * s));
  let v = 0.12 + 1.0 * g(8, 1.2) + 0.85 * g(17.5, 1.5) + 0.25 * g(12.5, 2);
  if (h < 5.5) v *= Math.max(0, (h - 4) / 1.5);
  if (h > 23) v *= Math.max(0, 24 - h);
  return v;
}

/** A passenger service as the sim runs it: its route as station indices south to north, and its home if it only runs
 * as far as stations are owned from there. The first service is the main line, whose units the line upgrades buy. */
interface Svc { id: string; route: number[]; home: number | null }

export class Sim {
  net: Network;
  S: Station[];
  g: GameState;
  svcs: Svc[];
  /** Stations always served whether owned or not: the ends of the services that run their whole route (Stockport and
   * Piccadilly), so there's somewhere to go from the start. */
  fixedEnds: Set<number>;
  /** Door-to-door journeys between stations, and what they were worked out for (see `journeyKey`). */
  private jt: (Journey | null)[][] = []; private jkey = -1;
  /** Called as a train leaves a stop, with how late it is (seconds past its timetabled departure); for measuring. */
  onDepart: ((tr: Train, i: number, late: number) => void) | null = null;
  /** Each service's planned round trip, worked out with the journeys. */
  private cycles: number[] = [];
  /** Scratch for generate: trips an hour to each station, and how full each service runs each way. */
  private rates: Float64Array; private crowding: Float64Array; private trainsEachWay: Float64Array;
  constructor(network: Network, state?: GameState) {
    this.net = network;
    this.S = network.stations;              // [{ id, name, s, miles, catchment, price, retail, index }]
    this.g = state || Sim.fresh(network);
    this.svcs = network.services().map(s => ({ id: s.def.id, route: s.route, home: s.home }));
    if (!this.svcs.length) throw new Error('network.json names no passenger service');
    this.fixedEnds = new Set(this.svcs.filter(v => v.home === null).flatMap(v => [v.route[0]!, v.route[v.route.length - 1]!]));
    this.rates = new Float64Array(this.S.length); this.crowding = new Float64Array(this.svcs.length * 2); this.trainsEachWay = new Float64Array(this.svcs.length * 2);
  }
  static fresh(network: Network, seed: number = freshSeed()): GameState {
    return {
      v: SAVE_VERSION, seed, rngState: seed >>> 0, t: 6.5 * 3600 / TUNING.dayRate, day: 1, cash: 3000, earned: 0,
      owned: network.stations.map((_, i) => i === 0),
      ups: network.stations.map(() => ({})),
      line: { units: 0, cars: 0, timetable: 0 },
      st: network.stations.map((): StationState => ({ acc: 0, q: [[], []], waiting: 0, boarded: 0, alighted: 0, changed: 0, revenue: 0, lost: 0 })),
      trains: [], ends: {},
      stats: { boarded: 0, lost: 0 },
    };
  }

  // ---- lookups: the sim only ever indexes stations it created, so a miss is a bug, not a case ----
  station(i: number): Station { const s = this.S[i]; if (!s) throw new Error(`no station ${i}`); return s; }
  state(i: number): StationState { const s = this.g.st[i]; if (!s) throw new Error(`no station state ${i}`); return s; }
  ups(i: number): Partial<Record<UpgradeId, boolean>> { const u = this.g.ups[i]; if (!u) throw new Error(`no upgrades for station ${i}`); return u; }

  // ---- derived ----
  fare(a: number, b: number): number { return (TUNING.fareBase + TUNING.farePerMile * Math.abs(this.station(a).miles - this.station(b).miles)) * TUNING.fareMult; }
  /** Units on the main line. */
  unitsInService(): number { return 1 + this.g.line.units; }
  carsPerUnit(): number { return 2 + 2 * this.g.line.cars; }
  vmax(): number { return this.g.line.timetable ? TUNING.vmaxFast : TUNING.vmax; }
  /** The timetabled turnaround at the end of a run, recovery included. */
  turnaround(): number { return TUNING.turnaround + (this.g.line.timetable ? TUNING.recoveryFast : 0); }
  capacity(i: number): number { return this.ups(i).extend ? TUNING.platformCapExtended : TUNING.platformCap; }
  /** The game clock's hour of the day, which runs dayRate times faster than the sim's seconds. */
  hour(): number { return (this.g.t * TUNING.dayRate / 3600) % 24; }
  clock(): string { const s = Math.floor((this.g.t * TUNING.dayRate) % 86400); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`; }
  /** A station passengers can travel to: one that's owned, or one always served. */
  reachable(i: number): boolean { return !!this.g.owned[i] || this.fixedEnds.has(i); }
  /** Which way station j lies from station i: 0 towards Manchester (further along the corridor), 1 away. */
  dirIdx(i: number, j: number): 0 | 1 { return this.station(j).s > this.station(i).s ? 0 : 1; }
  /** The one way a halt's platform serves: towards Manchester where any train goes on that way, otherwise away. */
  haltDir(i: number): 0 | 1 { return this.svcs.some(v => { const k = v.route.indexOf(i); return k >= 0 && k < v.route.length - 1; }) ? 0 : 1; }
  /** Whether trains travelling one way (0 towards Manchester, 1 away) have a platform here: a halt only its one way,
   * both once it has a second platform. */
  serves(i: number, d: 0 | 1): boolean { return !!this.ups(i).platform2 || d === this.haltDir(i); }
  /** Whether a train turns round here, at the end of a run (a terminus, or as far as a branch is owned). */
  runEnd(i: number): boolean { return this.fixedEnds.has(i) || this.svcs.some(v => { const sp = this.span(v); return sp[0] === i || sp[sp.length - 1] === i; }); }
  /** Whether a passenger travelling one way can get off here: a platform for that way, or a train turning round. */
  arrivable(i: number, d: 0 | 1): boolean { return this.reachable(i) && (this.serves(i, d) || this.runEnd(i)); }

  // ---- what a station grows into ----
  /** Whether a station offers an upgrade: every station the everyday ones, and the stages its `grow` lists. */
  offered(i: number, u: Upgrade): boolean { return !u.stage || !!this.station(i).grow?.[u.id as StageId]; }
  upgradeName(i: number, u: Upgrade): string { return (u.stage ? this.station(i).grow?.[u.id as StageId]?.name : null) ?? u.name ?? this.station(i).retail; }
  upgradeDesc(i: number, u: Upgrade): string { return (u.stage ? this.station(i).grow?.[u.id as StageId]?.desc : null) ?? u.desc; }
  upgradePrice(i: number, u: Upgrade): number { return (u.stage ? this.station(i).grow?.[u.id as StageId]?.price : null) ?? u.price; }
  /** Whether what an upgrade needs at its station is built (a need the station doesn't offer counts as built). */
  ready(i: number, u: Upgrade): boolean {
    const ups = this.ups(i);
    return (u.requires ?? []).every(r => { const ru = UPGRADES.find(x => x.id === r); return !ru || !this.offered(i, ru) || !!ups[r]; });
  }
  /** The upgrades a player can see at a station: bought or ready to buy. The rest stay hidden until they're reachable. */
  visibleUpgrades(i: number): Upgrade[] { return UPGRADES.filter(u => this.offered(i, u) && (this.ups(i)[u.id] || this.ready(i, u))); }
  /** What building an upgrade opens up next: upgrades here that wait on it, the line's extra units, stations elsewhere. */
  opens(i: number, id: UpgradeId): string[] {
    const here = UPGRADES.filter(u => u.requires?.includes(id) && this.offered(i, u)).map(u => this.upgradeName(i, u));
    const units = id === 'platform2' && i === this.svcs[0]!.route[0] ? ['Extra units'] : [];
    const stations = this.S.filter(s => s.needs?.station === this.station(i).id && s.needs.upgrade === id).map(s => s.name);
    return [...here, ...units, ...stations];
  }

  // ---- services ----
  svc(id: string): Svc { const v = this.svcs.find(v => v.id === id); if (!v) throw new Error(`no service "${id}"`); return v; }
  /** The stations a service runs between now, in route order: its whole route, or from its home as far each way as
   * stations are owned (none until one beyond home is). */
  span(v: Svc): number[] {
    if (v.home === null) return v.route;
    const g = this.g, k = v.route.indexOf(v.home); let lo = k, hi = k;
    while (lo > 0 && g.owned[v.route[lo - 1]!]) lo--;
    while (hi < v.route.length - 1 && g.owned[v.route[hi + 1]!]) hi++;
    return lo === hi ? [] : v.route.slice(lo, hi + 1);
  }
  /** Units a service runs: the main line's are bought with the line upgrades; a branch runs one once it's open. */
  unitsFor(v: Svc): number { return this.span(v).length < 2 ? 0 : v === this.svcs[0] ? this.unitsInService() : 1; }
  /** Whether a station is the end of a train's run, where it turns round. */
  isEnd(tr: Train, i: number): boolean { const sp = this.span(this.svc(tr.svc)); return i === sp[0] || i === sp[sp.length - 1]; }

  // ---- trains ----
  ensureTrains(): void {
    const g = this.g;
    for (const v of this.svcs) {
      const n = this.unitsFor(v), sp = this.span(v); if (!n) continue;
      const s0 = this.station(sp[0]!).s, s1 = this.station(sp[sp.length - 1]!).s;
      for (let k = g.trains.filter(t => t.svc === v.id).length; k < n; k++) {
        // the main line's units spread along it, alternate ways; a branch's unit starts at its home, heading out
        const out = v.home !== null && v.route.indexOf(v.home) > 0 ? -1 : 1;
        const [s, dir] = v.home === null ? [s0 + (s1 - s0) * ((k + 0.5) / n), (k % 2 === 0 ? 1 : -1) as 1 | -1] : [this.station(v.home).s, out as 1 | -1];
        g.trains.push({ id: g.trains.length, svc: v.id, dir, s, v: 0, state: 'run', dwell: 0, next: null, load: this.S.map(() => 0), onboard: 0, cars: this.carsPerUnit(), calling: null, boardAcc: 0, due: -1, late: 0, stood: 0, quiet: 0 });
      }
    }
    for (const tr of g.trains) tr.cars = this.carsPerUnit();
  }
  nextStop(tr: Train): number {
    // the next station the train calls at in its direction (dir +1 = towards Manchester, increasing s): one on its
    // service's run that's owned, or the end of the run
    const sp = this.span(this.svc(tr.svc)), first = sp[0]!, last = sp[sp.length - 1]!;
    const d: 0 | 1 = tr.dir > 0 ? 0 : 1, calls = (i: number) => i === first || i === last || (!!this.g.owned[i] && this.serves(i, d));
    if (tr.dir > 0) { for (const i of sp) if (this.station(i).s > tr.s + 1 && calls(i)) return i; return last; }
    for (let k = sp.length - 1; k >= 0; k--) { const i = sp[k]!; if (this.station(i).s < tr.s - 1 && calls(i)) return i; }
    return first;
  }
  /** A train arrives: whoever's for here gets off, and boarding opens for the stop. At the end of its run everyone
   * still aboard gets off to change, and waits on the platform for the train that goes their way, fare paid. */
  callAt(tr: Train, i: number): void {
    const g = this.g, S = this.state(i);
    const off = tr.load[i] ?? 0; tr.onboard -= off; tr.load[i] = 0; S.alighted += off;
    let out = off;
    if (this.isEnd(tr, i)) tr.load.forEach((n, j) => {
      if (n <= 0) return;
      tr.load[j] = 0; tr.onboard -= n; S.changed += n; S.waiting += n; out += n;
      S.q[this.dirIdx(i, j)].push({ t: g.t, dest: j, n, paid: true });
    });
    // the doors let everyone off before anyone gets on
    tr.calling = i; tr.boardAcc = -out * TUNING.alight;
  }
  /** Whether people are still getting on or off a train that has stood `least` seconds: some still to get off, some
   * waiting its way and room for them, or, once it's full, a crowd still trying the doors (the bigger, the longer). */
  busy(tr: Train, least: number): boolean {
    const i = tr.calling; if (i === null) return false;
    if (tr.boardAcc < 0 || tr.quiet < TUNING.dispatch) return true;
    let left = 0; for (const c of this.state(i).q[tr.dir > 0 ? 0 : 1]) left += c.n;
    return left > 0 && (tr.onboard < tr.cars * TUNING.seatsPerCar || tr.stood < least + TUNING.squeeze * left);
  }
  /** The planned gap between a service's units, from its round trip. */
  headway(svc: string): number {
    const k = this.svcs.findIndex(v => v.id === svc), v = this.svcs[k]!, n = this.unitsFor(v);
    if (this.jkey < 0) this.refreshJourneys();
    return n ? (this.cycles[k] ?? 0) / n : 0;
  }
  /** A train stands at a stop: when it's due away from there by the timetable. A train with no plan yet (a new unit)
   * starts on time from here. At the end of its run it also keeps the gap behind the unit that last left this end, so
   * the units spread out evenly round the line. */
  timetable(tr: Train, i: number, end: boolean): void {
    const g = this.g;
    if (tr.due < 0) tr.due = g.t + (end ? this.turnaround() : TUNING.dwell);
    if (!end) return;
    const ends = g.ends[tr.svc] ??= [-1e9, -1e9], e = i === this.span(this.svc(tr.svc))[0] ? 0 : 1;
    tr.due = Math.max(tr.due, ends[e]! + this.headway(tr.svc)); ends[e] = tr.due;
  }
  /** Board a dwelling train for dt seconds: its doors take boardPerDoor passengers a second each, from the front of the
   * queue for its direction, until it's full; anyone who reaches the platform while it stands gets on too. A busy stop
   * leaves people behind for the next train, and more cars mean more doors as well as more room. */
  board(tr: Train, dt: number): void {
    const i = tr.calling; if (i === null) return;
    const g = this.g, S = this.state(i), ups = this.ups(i), q = S.q[tr.dir > 0 ? 0 : 1], seats = tr.cars * TUNING.seatsPerCar;
    tr.boardAcc += tr.cars * TUNING.doorsPerCar * TUNING.boardPerDoor * (1 - TUNING.doorsCrowd * (tr.onboard / seats) ** 2) * dt;
    let room = Math.min(Math.floor(tr.boardAcc), seats - tr.onboard);
    const collect = ups.barriers ? 1 : ups.building ? TUNING.collectBooking : TUNING.collectNoBarriers;
    const retail = (ups.kiosk ? TUNING.kioskPerPax : 0) + (ups.retail ? TUNING.retailPerPax : 0);
    let c: typeof q[number] | undefined;
    while ((c = q[0]) && room > 0) {
      const n = Math.min(c.n, room);
      c.n -= n; room -= n; tr.boardAcc -= n; S.waiting -= n; tr.onboard += n; tr.load[c.dest] = (tr.load[c.dest] ?? 0) + n;
      // the fare is taken where a journey starts; someone changing trains only buys a coffee
      if (g.owned[i]) { const rev = n * ((c.paid ? 0 : this.fare(i, c.dest) * collect) + retail); g.cash += rev; g.earned += rev; S.revenue += rev; }
      if (!c.paid) { S.boarded += n; g.stats.boarded += n; }
      if (c.n <= 0) q.shift();
    }
    // a door with nobody at it doesn't save up for later
    if (!q.length) tr.boardAcc = Math.min(tr.boardAcc, 1);
    // once everyone's off and the platform has cleared (or the train's full), the doors start closing; anyone arriving
    // in the meantime still gets on, but doesn't hold it
    if (tr.boardAcc >= 0 && (!q.length || tr.onboard >= seats)) tr.quiet += dt;
  }
  /** A standing train boards, and leaves once it has stood its least, it's due away, and nobody is still getting on or
   * off (or it has overrun as far as it will). Leaving, it plans its next departure: the run there at line speed and
   * the stop or turnaround there, from when it was due away here, so lateness carries on down the line. */
  depart(tr: Train, dt: number): void {
    const g = this.g, i = tr.calling ?? tr.next;
    this.board(tr, dt); tr.dwell -= dt; tr.stood += dt;
    const end = i !== null && this.isEnd(tr, i), least = end ? TUNING.turnMin : TUNING.dwellMin;
    tr.late = Math.max(0, g.t - tr.due);
    if (tr.dwell > 0 || g.t < tr.due || (this.busy(tr, least) && tr.stood < least + TUNING.overrun)) return;
    tr.state = 'run'; tr.calling = null; tr.next = this.nextStop(tr);
    if (i !== null) {
      this.onDepart?.(tr, i, tr.late);
      const j = tr.next, run = runTime(Math.abs(this.station(j).s - this.station(i).s), this.vmax(), TUNING.accel, TUNING.brake);
      tr.due += run + (this.isEnd(tr, j) ? this.turnaround() : TUNING.dwell);
    }
  }
  /** How far a running train can go before it closes on the one ahead of it on its line (same service, same way). */
  clear(tr: Train): number {
    let gap = Infinity;
    for (const o of this.g.trains) if (o !== tr && o.svc === tr.svc && o.dir === tr.dir) { const d = (o.s - tr.s) * tr.dir; if (d > 0 && d < gap) gap = d; }
    return gap - TUNING.separation;
  }
  stepTrain(tr: Train, dt: number): void {
    if (tr.state === 'dwell') { this.depart(tr, dt); return; }
    if (tr.next === null) tr.next = this.nextStop(tr);
    const target = this.station(tr.next).s, rem = Math.abs(target - tr.s), last = this.isEnd(tr, tr.next), room = this.clear(tr);
    tr.v = Math.min(this.vmax(), tr.v + TUNING.accel * dt);
    tr.v = Math.max(0.5, Math.min(tr.v, Math.sqrt(2 * TUNING.brake * Math.max(rem, 0))));
    // a train closing on the one ahead brakes to stand behind it
    if (room < rem) tr.v = Math.min(tr.v, Math.sqrt(2 * TUNING.brake * Math.max(room, 0)));
    const step = room < rem ? Math.min(tr.v * dt, Math.max(room, 0)) : tr.v * dt;
    if (step >= rem) {
      tr.s = target; tr.v = 0;
      if (last) tr.dir = tr.dir > 0 ? -1 : 1;      // reverse first so boarding uses the departure direction
      this.callAt(tr, tr.next);
      tr.state = 'dwell'; tr.dwell = last ? TUNING.turnMin : TUNING.dwellMin; tr.stood = 0; tr.quiet = 0;
      this.timetable(tr, tr.next, last);
    } else tr.s += tr.dir * step;
  }

  // ---- journeys ----
  /** A number that changes whenever something journeys depend on does: what's owned, the upgrades that change walks,
   * waits and platforms, and the line's units and speed. */
  journeyKey(): number {
    const g = this.g; let h = g.line.units * 7 + g.line.timetable;
    for (let i = 0; i < this.S.length; i++) {
      const u = g.ups[i] ?? {};
      h = (Math.imul(h, 31) + (g.owned[i] ? 1 : 0) + (u.crossing ? 2 : 0) + (u.lifts ? 4 : 0) + (u.canopy ? 8 : 0) + (u.platform2 ? 16 : 0) + (u.platforms ? 32 : 0)) | 0;
    }
    return h >>> 0;
  }
  /** The door-to-door journey from station i to station j as the line stands, or null if no train goes that way. */
  journey(i: number, j: number): Journey | null { if (this.jkey < 0) this.refreshJourneys(); return this.jt[i]?.[j] ?? null; }
  /** Work the journeys out again if anything they depend on has changed: once a step, and after every purchase. */
  refreshJourneys(): void {
    const k = this.journeyKey(); if (k === this.jkey) return;
    this.jt = journeys(this, TUNING); this.jkey = k;
    this.cycles = this.svcs.map((_, v) => cycle(this, TUNING, v));
  }
  /** How a journey feels, in seconds: its felt time, and the ride longer on a crowded train. */
  felt(J: Journey): number {
    let f = J.felt;
    for (const l of J.legs) f += l.ride * TUNING.crowd * Math.min(1, Math.max(0, (this.crowding[l.svc * 2 + l.d]! - 0.6) / 0.4));
    return f;
  }
  /** How full each service's trains run each way just now, as a share of their seats. */
  measureCrowding(): void {
    const n = this.trainsEachWay; this.crowding.fill(0); n.fill(0);
    for (const tr of this.g.trains) {
      let v = 0; while (v < this.svcs.length - 1 && this.svcs[v]!.id !== tr.svc) v++;
      const k = v * 2 + (tr.dir > 0 ? 0 : 1);
      this.crowding[k]! += tr.onboard / (tr.cars * TUNING.seatsPerCar); n[k]! += 1;
    }
    for (let k = 0; k < n.length; k++) if (n[k]) this.crowding[k]! /= n[k]!;
  }
  /** Trips an hour at hour h from station i to each other station, into `rates`: from the homes at one end to what
   * draws people at the other (and in the evening home again), times the hour's demand, falling away smoothly as the
   * door-to-door journey passes the time budget. Returns the total. */
  tripRates(i: number, h: number): number {
    const a = this.station(i), ups = this.ups(i), out = h < 12 ? TUNING.amOut : TUNING.pmOut, ref = this.net.station('piccadilly').draw;
    const scale = demandCurve(h) * TUNING.demand * (ups.platforms ? TUNING.platformsBonus : 1) / ref;
    let tot = 0;
    for (let j = 0; j < this.S.length; j++) {
      const J = j === i ? null : this.journey(i, j);
      if (!J) { this.rates[j] = 0; continue; }
      const b = this.station(j), reach = 1 / (1 + Math.exp((this.felt(J) - TUNING.budget) / TUNING.budgetSoft));
      tot += this.rates[j] = scale * reach * (out * a.catchment * b.draw + (1 - out) * a.draw * b.catchment);
    }
    return tot;
  }

  // ---- passengers ----
  /** New passengers at a station for dt seconds, by the trips an hour to each place it reaches; a halt only has a
   * platform one way, so nobody comes for the other. */
  generate(i: number, dt: number): void {
    const S = this.state(i), rate = this.tripRates(i, this.hour());
    S.acc += rate * dt / 3600;
    const n = Math.floor(S.acc); if (n <= 0) return;
    S.acc -= n;
    let north = 0; for (let j = 0; j < this.S.length; j++) if (this.dirIdx(i, j) === 0) north += this.rates[j]!;
    const nN = Math.round(n * north / rate), nS = n - nN;
    this.enqueue(i, 0, nN); this.enqueue(i, 1, nS);
  }
  /** count passengers join the platform for one way, each group bound for a station chosen by the trips to it (from
   * the last `tripRates`); a full platform turns the rest away. */
  enqueue(i: number, dirIdx: 0 | 1, count: number): void {
    if (count <= 0) return;
    const g = this.g, S = this.state(i), cap = this.capacity(i);
    const room = Math.max(0, cap - S.waiting), take = Math.min(room, count);
    S.lost += count - take; g.stats.lost += count - take;
    if (take <= 0) return;
    let tot = 0; for (let j = 0; j < this.S.length; j++) if (this.dirIdx(i, j) === dirIdx) tot += this.rates[j]!;
    if (tot <= 0) return;
    let r = this.rand() * tot, dest = -1;
    for (let j = 0; j < this.S.length; j++) { if (this.dirIdx(i, j) !== dirIdx || !this.rates[j]) continue; dest = j; r -= this.rates[j]!; if (r <= 0) break; }
    S.q[dirIdx].push({ t: g.t, dest, n: take, give: g.t + this.patience(i, dest) }); S.waiting += take;
  }
  /** How long a group setting out from station i for station j will wait. Their own time budget is drawn from the
   * people who'd make this journey at all (the fall-off in tripRates is how budgets spread: half of people's exceed
   * TUNING.budget), and they wait until what's left of it after the walks, the ride and any change is used up. So
   * those for whom the trip only just fits give up first, and a long wait bites hardest where journeys are longest. */
  patience(i: number, j: number): number {
    const J = this.journey(i, j); if (!J) return TUNING.patienceMin;
    const felt = this.felt(J), B = TUNING.budget, s = TUNING.budgetSoft;
    const least = 1 / (1 + Math.exp(-(felt - B) / s)), u = Math.min(1 - 1e-9, least + (1 - least) * this.rand());
    const budget = B + s * Math.log(u / (1 - u)), ww = this.ups(i).canopy ? TUNING.waitCanopy : TUNING.waitWeight;
    return Math.max(TUNING.patienceMin, (budget + TUNING.grace - (felt - J.firstWait)) / ww);
  }
  /** Whoever has waited past their patience goes home; each group has its own, so the whole queue is looked at. Someone
   * changing trains has come too far to turn back. */
  expire(i: number): void {
    const g = this.g, S = this.state(i);
    for (const q of S.q) {
      let k = 0;
      for (const c of q) { if (c.give !== undefined && g.t > c.give) { S.waiting -= c.n; S.lost += c.n; g.stats.lost += c.n; } else q[k++] = c; }
      q.length = k;
    }
  }
  rand(): number { return rand(this.g); }

  // ---- stepping ----
  step(dt: number): void {
    const g = this.g; this.ensureTrains();
    const dayLen = 86400 / TUNING.dayRate, d0 = Math.floor(g.t / dayLen); g.t += dt; if (Math.floor(g.t / dayLen) > d0) g.day++;
    this.refreshJourneys(); this.measureCrowding();
    for (let i = 0; i < this.S.length; i++) { if (!g.owned[i]) continue; this.generate(i, dt); this.expire(i); }
    for (const tr of g.trains) this.stepTrain(tr, dt);
  }
  advance(gameSeconds: number, maxStep = 2): void { let left = gameSeconds; while (left > 0) { const d = Math.min(maxStep, left); this.step(d); left -= d; } }

  // ---- actions ----
  /** What a station waits on elsewhere before it can be bought, if anything not yet built. */
  stationNeeds(i: number): { station: Station; name: string } | null {
    const n = this.station(i).needs; if (!n) return null;
    const st = this.net.station(n.station), u = UPGRADES.find(x => x.id === n.upgrade);
    return u && !this.ups(st.index)[u.id] ? { station: st, name: this.upgradeName(st.index, u) } : null;
  }
  canBuyStation(i: number): boolean { const g = this.g, s = this.S[i]; return !!s && !g.owned[i] && g.cash >= s.price && (i === 0 || !!g.owned[i - 1]) && !this.stationNeeds(i); }
  buyStation(i: number): boolean { if (!this.canBuyStation(i)) return false; this.g.cash -= this.station(i).price; this.g.owned[i] = true; this.refreshJourneys(); return true; }
  canBuyUpgrade(i: number, id: string): boolean {
    const u = UPGRADES.find(u => u.id === id), g = this.g, ups = g.ups[i];
    return !!u && !!ups && !!g.owned[i] && !ups[u.id] && this.offered(i, u) && this.ready(i, u) && g.cash >= this.upgradePrice(i, u);
  }
  buyUpgrade(i: number, id: string): boolean {
    const u = UPGRADES.find(u => u.id === id), ups = this.g.ups[i];
    if (!u || !ups || !this.canBuyUpgrade(i, id)) return false;
    this.g.cash -= this.upgradePrice(i, u); ups[u.id] = true; this.refreshJourneys(); return true;
  }
  /** Whether a line upgrade can be seen yet: extra units need room for a second train to turn at the line's home
   * terminus (Stockport's platform 3). */
  lineReady(id: string): boolean { return id !== 'units' || !!this.ups(this.svcs[0]!.route[0]!).platform2; }
  buyLine(id: string): boolean {
    const u = LINE_UPGRADES.find(u => u.id === id), g = this.g; if (!u) return false;
    const lvl = g.line[u.id], price = u.prices[lvl];
    if (lvl >= u.max || price === undefined || g.cash < price || !this.lineReady(u.id)) return false;
    g.cash -= price; g.line[u.id]++; this.ensureTrains(); this.refreshJourneys(); return true;
  }
}
