// The Commute: station tycoon simulation. Pure TypeScript, tick-based in sim seconds, no rendering here, nothing from the DOM.
// Trains move along a corridor by distance s (metres, increasing towards Manchester). Stations are at a known s.
// A sim second is a real second on the page at 1x, so trains, people and dwells move at real speed. The clock and the
// demand curve run TUNING.dayRate times faster than that: a game day is 24 / dayRate hours of sim time (four real hours),
// so the peaks and the night still come round while you watch.

import { rand, freshSeed } from './random.ts';
import { SAVE_VERSION } from './save.ts';
import type { Network } from './network.ts';
import type { GameState, LineUpgradeId, StageId, Station, StationState, Train, UpgradeId } from './types.ts';

/** A station upgrade. name null: the station names it (its retail, or its stage in `grow`). requires: upgrades at the
 * same station that must be built first; one the station doesn't offer counts as built. stage: offered only where the
 * station's `grow` lists it. */
export interface Upgrade { id: UpgradeId; name: string | null; price: number; desc: string; requires?: UpgradeId[]; stage?: boolean }
export interface LineUpgrade { id: LineUpgradeId; name: string; prices: number[]; desc: string; max: number }

// in the order a station grows: a bought station is a halt (one platform, one line) and these build it up
export const UPGRADES: Upgrade[] = [
  { id: 'crossing', name: null, price: 2000, desc: '+15% catchment: the other side of the line can walk in', stage: true },
  { id: 'platform2', name: null, price: 3500, desc: 'Trains call both ways, so the crowd going home too', requires: ['crossing'], stage: true },
  { id: 'building', name: null, price: 3000, desc: '90% of fares collected (82% at a halt)', stage: true },
  { id: 'kiosk', name: 'Kiosk', price: 1500, desc: '+£0.35 per boarding passenger' },
  { id: 'canopy', name: 'Canopy', price: 2500, desc: 'Passengers wait 45 min instead of 25' },
  { id: 'barriers', name: 'Ticket barriers', price: 4000, desc: 'Collect every fare', requires: ['building'] },
  { id: 'extend', name: 'Platform extension', price: 5000, desc: 'Platform holds 320 instead of 150' },
  { id: 'lifts', name: 'Lifts', price: 6000, desc: '+25% catchment', requires: ['crossing'] },
  { id: 'retail', name: null, price: 9000, desc: '+£0.80 per boarding passenger', requires: ['building'] },
  { id: 'platforms', name: null, price: 30000, desc: '+20% catchment', requires: ['platform2', 'building'], stage: true },
];
export const LINE_UPGRADES: LineUpgrade[] = [
  { id: 'units', name: 'Extra unit', prices: [6000, 20000, 50000], desc: 'One more train in service', max: 3 },
  { id: 'cars', name: 'Longer trains', prices: [12000, 40000], desc: '+2 cars per unit', max: 2 },
  { id: 'timetable', name: 'Faster timetable', prices: [20000], desc: 'Line speed 75 → 90 mph', max: 1 },
];

export const TUNING = {
  dayRate: 6,                                  // clock hours per sim hour: a game day is four hours of sim time
  fareBase: 1.5, farePerMile: 0.6, fareMult: 12.0,   // 6x the fare of the old 6x clock: the same money per real minute from a sixth of the trains
  seatsPerCar: 75, accel: 1.0, brake: 1.1, vmax: 33.5, vmaxFast: 40,
  dwell: 45, turnaround: 120,
  doorsPerCar: 2, boardPerDoor: 0.7,           // passengers a second through each door: a 2-car unit boards about 125 in a 45 s stop
  patience: 25 * 60, patienceCanopy: 45 * 60, platformCap: 150, platformCapExtended: 320,
  collectNoBarriers: 0.82, collectBooking: 0.9, liftsBonus: 1.25, crossingBonus: 1.15, platformsBonus: 1.2, kioskPerPax: 0.35, retailPerPax: 0.8,
};

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
  constructor(network: Network, state?: GameState) {
    this.net = network;
    this.S = network.stations;              // [{ id, name, s, miles, catchment, price, retail, index }]
    this.g = state || Sim.fresh(network);
    this.svcs = network.services().map(s => ({ id: s.def.id, route: s.route, home: s.home }));
    if (!this.svcs.length) throw new Error('network.json names no passenger service');
    this.fixedEnds = new Set(this.svcs.filter(v => v.home === null).flatMap(v => [v.route[0]!, v.route[v.route.length - 1]!]));
  }
  static fresh(network: Network, seed: number = freshSeed()): GameState {
    return {
      v: SAVE_VERSION, seed, rngState: seed >>> 0, t: 6.5 * 3600 / TUNING.dayRate, day: 1, cash: 3000, earned: 0,
      owned: network.stations.map((_, i) => i === 0),
      ups: network.stations.map(() => ({})),
      line: { units: 0, cars: 0, timetable: 0 },
      st: network.stations.map((): StationState => ({ acc: 0, q: [[], []], waiting: 0, boarded: 0, alighted: 0, changed: 0, revenue: 0, lost: 0 })),
      trains: [],
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
  patience(i: number): number { return this.ups(i).canopy ? TUNING.patienceCanopy : TUNING.patience; }
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
        g.trains.push({ id: g.trains.length, svc: v.id, dir, s, v: 0, state: 'run', dwell: 0, next: null, load: this.S.map(() => 0), onboard: 0, cars: this.carsPerUnit(), calling: null, boardAcc: 0 });
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
    if (this.isEnd(tr, i)) tr.load.forEach((n, j) => {
      if (n <= 0) return;
      tr.load[j] = 0; tr.onboard -= n; S.changed += n; S.waiting += n;
      S.q[this.dirIdx(i, j)].push({ t: g.t, dest: j, n, paid: true });
    });
    tr.calling = i; tr.boardAcc = 0;
  }
  /** Board a dwelling train for dt seconds: its doors take boardPerDoor passengers a second each, from the front of the
   * queue for its direction, until it's full; anyone who reaches the platform while it stands gets on too. A busy stop
   * leaves people behind for the next train, and more cars mean more doors as well as more room. */
  board(tr: Train, dt: number): void {
    const i = tr.calling; if (i === null) return;
    const g = this.g, S = this.state(i), ups = this.ups(i), q = S.q[tr.dir > 0 ? 0 : 1], seats = tr.cars * TUNING.seatsPerCar;
    tr.boardAcc += tr.cars * TUNING.doorsPerCar * TUNING.boardPerDoor * dt;
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
  }
  stepTrain(tr: Train, dt: number): void {
    if (tr.state === 'dwell') { this.board(tr, dt); tr.dwell -= dt; if (tr.dwell <= 0) { tr.state = 'run'; tr.next = null; tr.calling = null; } return; }
    if (tr.next === null) tr.next = this.nextStop(tr);
    const target = this.station(tr.next).s, rem = Math.abs(target - tr.s), last = this.isEnd(tr, tr.next);
    tr.v = Math.min(this.vmax(), tr.v + TUNING.accel * dt);
    tr.v = Math.max(0.5, Math.min(tr.v, Math.sqrt(2 * TUNING.brake * Math.max(rem, 0))));
    const step = tr.v * dt;
    if (step >= rem) {
      tr.s = target; tr.v = 0;
      if (last) tr.dir = tr.dir > 0 ? -1 : 1;      // reverse first so boarding uses the departure direction
      this.callAt(tr, tr.next);
      tr.state = 'dwell'; tr.dwell = last ? TUNING.turnaround : TUNING.dwell;
    } else tr.s += tr.dir * step;
  }

  // ---- passengers ----
  generate(i: number, dt: number): void {
    const st = this.station(i), S = this.state(i), h = this.hour();
    const ups = this.ups(i), bonus = (ups.crossing ? TUNING.crossingBonus : 1) * (ups.lifts ? TUNING.liftsBonus : 1) * (ups.platforms ? TUNING.platformsBonus : 1);
    const rate = st.catchment * demandCurve(h) * bonus / 3600;
    S.acc += rate * dt;
    const n = Math.floor(S.acc); if (n <= 0) return;
    S.acc -= n;
    const toMcr = this.northShare(i, h);
    // a halt only has a platform one way: the share heading the other way doesn't come
    const nN = Math.round(n * toMcr), nS = n - nN;
    if (this.serves(i, 0)) this.enqueue(i, 0, nN); if (this.serves(i, 1)) this.enqueue(i, 1, nS);
  }
  /** The share of a station's new passengers heading towards Manchester at hour h: all of them where there's nowhere
   * else to go, none where there's nowhere further; most in the morning and fewer in the evening where one train serves
   * both ways; and where different services go each way (Stockport, once the branch is open), by how many people live
   * each way too, so a short branch doesn't take half of Stockport. */
  northShare(i: number, h: number): number {
    const north: number[] = [], south: number[] = [];
    for (let j = 0; j < this.S.length; j++) if (j !== i && this.arrivable(j, this.dirIdx(i, j))) (this.dirIdx(i, j) === 0 ? north : south).push(j);
    if (!south.length) return 1; if (!north.length) return 0;
    const base = h < 12 ? 0.8 : 0.35, st = this.station(i).id;
    if (this.net.boardingService(st, 'north') === this.net.boardingService(st, 'south')) return base;
    const cat = (js: number[]) => js.reduce((a, j) => a + this.station(j).catchment, 0), wN = base * cat(north), wS = (1 - base) * cat(south);
    return wN / (wN + wS);
  }
  enqueue(i: number, dirIdx: 0 | 1, count: number): void {
    if (count <= 0) return;
    const g = this.g, S = this.state(i), cap = this.capacity(i);
    const room = Math.max(0, cap - S.waiting), take = Math.min(room, count);
    S.lost += count - take; g.stats.lost += count - take;
    if (take <= 0) return;
    const cands: number[] = [];
    for (let j = 0; j < this.S.length; j++) if (j !== i && this.dirIdx(i, j) === dirIdx && this.arrivable(j, dirIdx)) cands.push(j);
    if (!cands.length) return;
    const w = cands.map(j => this.station(j).catchment + 50), tot = w.reduce((a, b) => a + b, 0);
    let r = this.rand() * tot, dest = cands[0]!;
    for (let k = 0; k < cands.length; k++) { r -= w[k]!; if (r <= 0) { dest = cands[k]!; break; } }
    S.q[dirIdx].push({ t: g.t, dest, n: take }); S.waiting += take;
  }
  expire(i: number): void {
    const g = this.g, S = this.state(i), p = this.patience(i);
    for (const q of S.q) { let c: typeof q[number] | undefined; while ((c = q[0]) && g.t - c.t > p) { q.shift(); S.waiting -= c.n; S.lost += c.n; g.stats.lost += c.n; } }
  }
  rand(): number { return rand(this.g); }

  // ---- stepping ----
  step(dt: number): void {
    const g = this.g; this.ensureTrains();
    const dayLen = 86400 / TUNING.dayRate, d0 = Math.floor(g.t / dayLen); g.t += dt; if (Math.floor(g.t / dayLen) > d0) g.day++;
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
  buyStation(i: number): boolean { if (!this.canBuyStation(i)) return false; this.g.cash -= this.station(i).price; this.g.owned[i] = true; return true; }
  canBuyUpgrade(i: number, id: string): boolean {
    const u = UPGRADES.find(u => u.id === id), g = this.g, ups = g.ups[i];
    return !!u && !!ups && !!g.owned[i] && !ups[u.id] && this.offered(i, u) && this.ready(i, u) && g.cash >= this.upgradePrice(i, u);
  }
  buyUpgrade(i: number, id: string): boolean {
    const u = UPGRADES.find(u => u.id === id), ups = this.g.ups[i];
    if (!u || !ups || !this.canBuyUpgrade(i, id)) return false;
    this.g.cash -= this.upgradePrice(i, u); ups[u.id] = true; return true;
  }
  /** Whether a line upgrade can be seen yet: extra units need room for a second train to turn at the line's home
   * terminus (Stockport's platform 3). */
  lineReady(id: string): boolean { return id !== 'units' || !!this.ups(this.svcs[0]!.route[0]!).platform2; }
  buyLine(id: string): boolean {
    const u = LINE_UPGRADES.find(u => u.id === id), g = this.g; if (!u) return false;
    const lvl = g.line[u.id], price = u.prices[lvl];
    if (lvl >= u.max || price === undefined || g.cash < price || !this.lineReady(u.id)) return false;
    g.cash -= price; g.line[u.id]++; this.ensureTrains(); return true;
  }
}
