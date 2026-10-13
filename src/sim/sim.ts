// The Commute: station tycoon simulation. Pure TypeScript, tick-based in sim seconds, no rendering here, nothing from the DOM.
// Trains move along their service's route through the network, leg by leg, by chainage s (metres, increasing towards
// Manchester on every corridor, src/sim/network.ts). Stations are at a known s on their corridor.
// A sim second is a real second on the page at 1x, so trains, people and dwells move at real speed. The clock and the
// demand curve run faster than that, and fastest at night (src/sim/day.ts): a game day is about two hours of sim time,
// so the peaks and the night still come round while you watch, and the night doesn't keep you waiting.

import { rand, freshSeed } from './random.ts';
import { BASE, DAY, clockAt, clockText, hourAt, simAtHour } from './day.ts';
import { SAVE_VERSION } from './save.ts';
import type { Movement, Network, Route } from './network.ts';
import { journeys, cycle, runTime, waitWeight, type Journey } from './journeys.ts';
import { freshWeather, stepWeather, feel, weatherKey } from './weather.ts';
import { freshTrouble, stepTrouble, failed, cautionLimit } from './trouble.ts';
import { stepExpress, nextSlot, EXPRESS_UNITS } from './expresses.ts';
import { stepAccess, openAccess } from './access.ts';
import { effects, type Effects } from './contract.ts';
import type { GameState, LineUpgradeId, PlatformDef, ServiceDef, StageId, Station, StationState, Train, UpgradeId } from './types.ts';

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
  { id: 'taxi', name: null, price: 1200, desc: 'Cabs take some who’d give up on the train: a cut of each fare', stage: true },
  { id: 'carpark', name: null, price: 4000, desc: 'Drivers from beyond a walk park and ride, while there are spaces: a charge a car', stage: true },
  { id: 'carpark2', name: null, price: 7000, desc: 'More spaces, so the car park fills later', requires: ['carpark'], stage: true },
  { id: 'bus', name: null, price: 3000, desc: 'Buses bring people from beyond a walk', stage: true },
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
  { id: 'timetable', name: 'Faster timetable', prices: [20000], desc: 'Line speed 75 → 90 mph and new signals: quicker rides, fewer signal failures', max: 1 },
  { id: 'spare', name: 'Spare unit', prices: [8000], desc: 'Stands by in Stockport’s sidings: a failed train is moving again in half the time', max: 1 },
];

export const TUNING = {
  fareBase: 1.5, farePerMile: 0.6, fareMult: 13.5,   // 6x the old 6x clock's fare, then 12 to 13.5 when homes and draw came from the census (Stockport draws less than guessed)
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
  // signalling (docs/DESIGN.md, Signalling): a train stands signalStand metres short of a signal at red, where the block
  // beyond holds another train, or where its way through a junction crosses one set for another train
  signalStand: 10,
  // platforms that block (docs/DESIGN.md, Platforms): one train at a platform face at a time. A train for a stop whose
  // faces are all taken stands at its signal, approach metres short of where it stops, until one is free, and a face is
  // free once the train leaving it has run clear metres on (its tail off the platform)
  approach: 450, clear: 150,
  claim: 700,                                  // metres out a train claims the platform it will stand at (the view draws it there)
  carPitch: 23.6,                              // metres from one car's middle to the next's
  // the expresses (src/sim/expresses.ts, docs/DESIGN.md, Expresses): they run at expressSpeed and stand expressDwell at a
  // stop, coming on by the clock (`through` in the network data). At each call at a station the player owns one pays the access charge, and its long-distance passengers
  // (expressPax a call at the peak's height, by the demand curve, off and as many on) each pay throughShare of their
  // fare to the station
  expressSpeed: 40, expressDwell: 60, accessCharge: 40, expressPax: 30, throughShare: 2,
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
  patienceMin: 3 * 60,                         // someone gives up once their wait has used what's left of their own budget
                                               // (never sooner than this); past the timetabled gap, a late or full train,
  delayWeight: 3,                              // waiting feels three times riding (UK appraisal weighs lateness about so)
  demand: 1.95,                                // trips an hour for a station's catchment, at peak, with the city on its doorstep
  amOut: 0.8, pmOut: 0.35,                     // the share of trips from home rather than going home, before and after noon
  // taxi ranks (docs/DESIGN.md, Taxi ranks): of a party giving up on the train, each takes a cab with chance cabShare
  // while one's in; a cab takes up to cabSeats going the same way and is away cabRank plus the ride there and back at
  // cabMile seconds a mile (town traffic), and the player takes a cut of the cab fare: half of it, and a cab fare is
  // about three times the train's, so cabCut times the train fare
  cabs: 6, cabSeats: 4, cabShare: 0.6, cabRank: 3 * 60, cabMile: 2 * 60, cabCut: 1.5,
  // things going wrong (src/sim/trouble.ts): nothing in the first sim hour, then on average one every troubleEvery,
  // never within troubleGap of the last ending, and only by the game's daylight hours. A share failShare are failed
  // trains, more than failMargin from a station, rescued in about `rescue` (rescueSpare with a spare unit standing by);
  // the rest signal failures, a stretch between two stations at caution for about signalFor, which the faster
  // timetable's new signals stop with chance resignalHolds. Nothing starts in troubleCalm (clock hours), where it would
  // still be going in a peak's busiest hour (07:30-08:30, 17:00-18:00): a failure lasts about an hour by the clock
  troubleFrom: 3600, troubleEvery: 2.5 * 3600, troubleGap: 40 * 60, troubleDayFrom: 6, troubleDayTo: 21,
  troubleCalm: [[6.5, 8.5], [16, 18]] as [number, number][],
  failShare: 0.5, failMargin: 300, rescue: 9 * 60, rescueSpare: 4 * 60,
  signalFor: 12 * 60, caution: 9, resignalHolds: 0.6,
  // rail replacement buses: from busAfter into a failure, one every busGap up to busFleet, busSeats each, loading for
  // busDwell, on the road at busSpeed (town traffic and stops)
  busAfter: 4 * 60, busGap: 2 * 60, busFleet: 3, busSeats: 70, busDwell: 60, busSpeed: 6,
  // homes that grow (docs/DESIGN.md): an owned station's homes close this share of the gap to its ceiling each sim hour
  // when its trip to where its people go fits everyone's budget, scaled by the share it fits (the reach curve), so a
  // station whose trip feels about the hour grows at half this and one with long waits barely at all
  grow: 0.06,
  // car parks and bus links (src/sim/access.ts, docs/DESIGN.md): the census's pools beyond a walk travel when their trip
  // fits as everyone's does, the drive or bus taking the place of the walk from home. A driver drives (felt as riding),
  // parks and walks parkWalk; a car takes one space until parkStay clock hours later and pays parkCharge. A bus rider
  // waits busWait for the bus (felt as waiting) and changes onto the train (busChange felt) after a short busWalk; at
  // Stockport the Interchange makes that change busSave quicker and covered for those who already come by bus
  parkWalk: 3 * 60, parkStay: 9, parkCharge: 20, busWait: 6 * 60, busWalk: 2 * 60, busChange: 5 * 60, busSave: 4 * 60,
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

/** A passenger service as the sim runs it: its route as station indices south to north, its way through the graph
 * (path: its legs of corridor and track), and its home if it only runs as far as stations are owned from there. The
 * first service is the main line, whose units the line upgrades buy.
 * plats: its platforms (indices into the station's `plats`) at the stations its data lists. An express runs through
 * from off the map (src/sim/expresses.ts): portal is where it comes on and goes off, along the corridor. */
export interface Svc {
  id: string; route: number[]; home: number | null; def: ServiceDef; path: Route;
  plats: Map<number, { north?: number[]; south?: number[]; turn?: number[] }>;
  express: { south: string; first: number; every: number; last: number; portal: number } | null;
}
/** A platform face as the sim knows it: its data, and which ways trains call at it where no service says. */
export interface Plat { def: PlatformDef; ways: (0 | 1)[] }

export class Sim {
  net: Network;
  S: Station[];
  g: GameState;
  svcs: Svc[];
  /** Each station's platform faces: its data's, or the halt's (1) and the second platform's (2). */
  plats: Plat[][];
  /** Stations always served whether owned or not: the ends of the services that run their whole route (Stockport and
   * Piccadilly), so there's somewhere to go from the start. */
  fixedEnds: Set<number>;
  /** Door-to-door journeys between stations, and what they were worked out for (see `journeyKey`). */
  private jt: (Journey | null)[][] = []; private jkey = -1;
  /** Called as a train leaves a stop, with how late it is (seconds past its timetabled departure); for measuring. */
  onDepart: ((tr: Train, i: number, late: number) => void) | null = null;
  /** Each service's planned round trip, worked out with the journeys. */
  private cycles: number[] = [];
  /** How fast each station's homes grow, as a share of TUNING.grow: the reach of its trip to where its people go,
   * worked out with the journeys. */
  private growth: Float64Array;
  /** Each track's blocks this step: the id of the train in each (-1 none, -2 more than one). */
  private occ = new Map<string, Int32Array>();
  /** Scratch for generate: trips an hour to each station, and how full each service runs each way. */
  private rates: Float64Array; private crowding: Float64Array; private trainsEachWay: Float64Array;
  private hourT = NaN; private hourNow = 0;
  /** What the run's perks do (src/sim/contract.ts): nothing at all without any. */
  fx: Effects;
  constructor(network: Network, state?: GameState) {
    this.net = network;
    this.S = network.stations;              // [{ id, name, s, miles, catchment, price, retail, index }]
    this.g = state || Sim.fresh(network);
    this.fx = effects(network.def.contract, this.g.perks);
    this.svcs = network.services().map(s => ({ id: s.def.id, route: s.route, home: s.home, def: s.def, path: network.route(s.def), plats: new Map(), express: null }));
    if (!this.svcs.length || this.svcs[0]!.def.through) throw new Error('network.json names no passenger service first');
    this.fixedEnds = new Set(this.local().filter(v => v.home === null).flatMap(v => [v.route[0]!, v.route[v.route.length - 1]!]));
    this.plats = this.S.map((st, i) => st.platforms?.map(def => ({ def, ways: (def.ways ?? ['north', 'south']).map(w => w === 'north' ? 0 : 1) as (0 | 1)[] }))
      ?? [{ def: { id: '1' }, ways: [this.haltDir(i)] }, ...(st.grow?.platform2 ? [{ def: { id: '2', upgrade: 'platform2' as const }, ways: [1 - this.haltDir(i) as 0 | 1] }] : [])]);
    for (const v of this.svcs) {
      for (const [id, P] of Object.entries(v.def.platforms ?? {})) {
        if (!P) continue;
        const i = network.station(id).index, ix = (ids?: string[]) => ids?.map(p => { const k = this.plats[i]!.findIndex(q => q.def.id === p); if (k < 0) throw new Error(`${v.id}: no platform ${p} at ${id}`); return k; });
        v.plats.set(i, { north: ix(P.north), south: ix(P.south), turn: ix(P.turn) });
      }
      const th = v.def.through;
      if (th) v.express = { ...th, portal: v.path.start + v.def.cars * TUNING.carPitch / 2 };
    }
    this.rates = new Float64Array(this.S.length); this.crowding = new Float64Array(this.svcs.length * 2); this.trainsEachWay = new Float64Array(this.svcs.length * 2);
    this.growth = new Float64Array(this.S.length);
  }
  /** A new run from Stockport as a halt, with the perks the career has bought (none on a first contract). */
  static fresh(network: Network, seed: number = freshSeed(), perks: readonly string[] = []): GameState {
    const fx = effects(network.def.contract, perks);
    return {
      v: SAVE_VERSION, seed, rngState: seed >>> 0, t: simAtHour(1, 6.5), day: 1, cash: 3000 + fx.cash, earned: 0,
      owned: network.stations.map((_, i) => i === 0),
      ups: network.stations.map(() => ({})),
      line: { units: 0, cars: 0, timetable: 0, spare: fx.spare ? 1 : 0 }, perks: [...perks],
      st: network.stations.map((): StationState => ({ acc: 0, q: [[], []], waiting: 0, boarded: 0, alighted: 0, changed: 0, revenue: 0, lost: 0, cab: 0, cabs: [], through: 0, car: 0, bus: 0, carAcc: 0, busAcc: 0, parked: [] })),
      trains: [], ends: {}, trouble: freshTrouble(), weather: freshWeather(seed, simAtHour(1, 6.5)),
      stats: { boarded: 0, lost: 0, cab: 0, through: 0, express: 0, car: 0, bus: 0, late: 0 },
      homes: network.stations.map(s => s.catchment),
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
  vmax(): number { return (this.g.line.timetable ? TUNING.vmaxFast : TUNING.vmax) * feel(this.g).speed; }
  /** The timetabled turnaround at the end of a run, recovery included. */
  turnaround(): number { return TUNING.turnaround + (this.g.line.timetable ? TUNING.recoveryFast : 0); }
  capacity(i: number): number { return this.ups(i).extend ? TUNING.platformCapExtended : TUNING.platformCap; }
  /** The game clock's hour of the day (src/sim/day.ts), worked out once a step. */
  hour(): number { if (this.hourT !== this.g.t) { this.hourT = this.g.t; this.hourNow = hourAt(this.g.t); } return this.hourNow; }
  clock(): string { return clockText(this.g.t); }
  /** A station passengers can travel to: one that's owned, or one always served. */
  reachable(i: number): boolean { return !!this.g.owned[i] || this.fixedEnds.has(i); }
  /** Which way someone at station i sets out for station j: the way their journey's first train goes (0 towards
   * Manchester, 1 away), or with no journey there, which way it lies along the line. */
  dirIdx(i: number, j: number): 0 | 1 { const J = this.jt[i]?.[j]; return J ? J.legs[0]!.d : this.station(j).s > this.station(i).s ? 0 : 1; }
  /** The one way a halt's platform serves: towards Manchester where any train goes on that way, otherwise away. */
  haltDir(i: number): 0 | 1 { return this.local().some(v => { const k = v.route.indexOf(i); return k >= 0 && k < v.route.length - 1; }) ? 0 : 1; }
  /** Whether trains travelling one way (0 towards Manchester, 1 away) have a platform here: a halt only its one way,
   * both once it has a second platform. */
  serves(i: number, d: 0 | 1): boolean { return !!this.ups(i).platform2 || d === this.haltDir(i); }
  /** Whether a train turns round here, at the end of a run (a terminus, or as far as a branch is owned). */
  runEnd(i: number): boolean { return this.fixedEnds.has(i) || this.local().some(v => { const sp = this.span(v); return sp[0] === i || sp[sp.length - 1] === i; }); }
  /** Whether a passenger travelling one way can get off here: a platform for that way, or a train turning round. */
  arrivable(i: number, d: 0 | 1): boolean { return this.reachable(i) && (this.serves(i, d) || this.runEnd(i)); }

  // ---- what a station grows into ----
  /** Whether a station offers an upgrade: every station the everyday ones, and the stages its `grow` lists. */
  offered(i: number, u: Upgrade): boolean { return !u.stage || !!this.station(i).grow?.[u.id as StageId]; }
  upgradeName(i: number, u: Upgrade): string { return (u.stage ? this.station(i).grow?.[u.id as StageId]?.name : null) ?? u.name ?? this.station(i).retail; }
  upgradeDesc(i: number, u: Upgrade): string { return (u.stage ? this.station(i).grow?.[u.id as StageId]?.desc : null) ?? u.desc; }
  upgradePrice(i: number, u: Upgrade): number { return this.cost((u.stage ? this.station(i).grow?.[u.id as StageId]?.price : null) ?? u.price); }
  /** A price as this run pays it: less the share the career's quicker building takes off (src/sim/contract.ts). */
  cost(price: number): number { return this.fx.build ? Math.round(price * (1 - this.fx.build) / 10) * 10 : price; }
  /** What station i costs to buy as a halt. */
  stationPrice(i: number): number { return this.cost(this.station(i).price); }
  /** What the next step of a line upgrade costs, or undefined once it's all bought; a unit standing in the sidings from
   * the start (a perk) is the first extra unit, free to put in service. */
  linePrice(id: LineUpgradeId): number | undefined {
    const u = LINE_UPGRADES.find(x => x.id === id), lvl = this.g.line[id], p = u?.prices[lvl];
    return p === undefined ? undefined : id === 'units' && lvl === 0 && this.fx.unit ? 0 : this.cost(p);
  }
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
  /** The services that carry the line's own passengers: all but the expresses. */
  local(): Svc[] { return this.svcs.filter(v => !v.express); }
  svc(id: string): Svc { const v = this.svcs.find(v => v.id === id); if (!v) throw new Error(`no service "${id}"`); return v; }
  /** The stations a service runs between now, in route order: its whole route, or from its home as far each way as
   * stations are owned (none until one beyond home is). */
  span(v: Svc): number[] {
    if (v.home === null) return v.route;
    // a service that opens with a station runs nowhere until it's owned
    if (v.def.opens && !this.g.owned[this.net.station(v.def.opens).index]) return [];
    const g = this.g, k = v.route.indexOf(v.home); let lo = k, hi = k;
    while (lo > 0 && g.owned[v.route[lo - 1]!]) lo--;
    while (hi < v.route.length - 1 && g.owned[v.route[hi + 1]!]) hi++;
    return lo === hi ? [] : v.route.slice(lo, hi + 1);
  }
  /** Units a service runs: the main line's are bought with the line upgrades; a branch runs one once it's open. */
  unitsFor(v: Svc): number { return this.span(v).length < 2 ? 0 : v === this.svcs[0] ? this.unitsInService() : 1; }
  /** Whether a station is the end of a train's run, where it turns round. */
  isEnd(tr: Train, i: number): boolean {
    const v = this.svc(tr.svc), sp = this.span(v);
    return v.express ? i === sp[sp.length - 1] : i === sp[0] || i === sp[sp.length - 1];
  }

  // ---- trains ----
  ensureTrains(): void {
    const g = this.g;
    for (const v of this.svcs) {
      const n = this.unitsFor(v), sp = this.span(v); if (!n) continue;
      // an express's units come on at their next slots
      if (v.express) {
        for (let k = g.trains.filter(t => t.svc === v.id).length; k < EXPRESS_UNITS; k++) g.trains.push({ ...this.unit(v, v.express.portal, 1), state: 'away', due: nextSlot(v.express, g.t, k), onboard: 0 });
        continue;
      }
      const s0 = this.station(sp[0]!).s, s1 = this.station(sp[sp.length - 1]!).s;
      for (let k = g.trains.filter(t => t.svc === v.id).length; k < n; k++) {
        // the main line's units spread along it, alternate ways; a branch's unit starts at its home, heading out
        const out = v.home !== null && v.route.indexOf(v.home) > 0 ? -1 : 1;
        const [s, dir] = v.home === null ? [s0 + (s1 - s0) * ((k + 0.5) / n), (k % 2 === 0 ? 1 : -1) as 1 | -1] : [this.station(v.home).s, out as 1 | -1];
        g.trains.push(this.unit(v, s, dir));
      }
    }
    for (const tr of g.trains) if (!this.svc(tr.svc).express) tr.cars = this.carsPerUnit();
  }
  /** A new unit of a service at s, heading dir. */
  private unit(v: Svc, s: number, dir: 1 | -1): Train {
    return { id: this.g.trains.length, svc: v.id, dir, s, leg: v.path.legAt(s), v: 0, state: 'run', dwell: 0, next: null, load: this.S.map(() => 0), onboard: 0,
      cars: v.express ? v.def.cars : this.carsPerUnit(), calling: null, boardAcc: 0, due: -1, late: 0, stood: 0, quiet: 0, pf: -1, pfAt: -1, bound: -1 };
  }
  nextStop(tr: Train): number {
    // the next station the train calls at in its direction (dir +1 = towards Manchester, increasing s): one on its
    // service's run that's owned, or the end of the run
    const sp = this.span(this.svc(tr.svc)), first = sp[0]!, last = sp[sp.length - 1]!;
    const d: 0 | 1 = tr.dir > 0 ? 0 : 1, calls = (i: number) => this.svc(tr.svc).express ? this.callsAt(tr, i) : i === first || i === last || (!!this.g.owned[i] && this.serves(i, d));
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
    const g = this.g, v = this.svc(tr.svc);
    if (tr.due < 0) tr.due = g.t + (end ? this.turnaround() : TUNING.dwell);
    if (!end) return;
    const ends = g.ends[tr.svc] ??= [-1e9, -1e9], e = i === this.span(v)[0] ? 0 : 1, h = this.headway(tr.svc);
    tr.due = Math.max(tr.due, ends[e]! + h);
    // due away after the last train, it stands here overnight (a service with a home runs out to its far end first);
    // the first to stand at an end leaves with the first train, the rest the headway apart, so nothing bunches at dawn
    const dawn = i === v.home ? null : this.dawn(v, tr.due);
    if (dawn !== null) tr.due = ends[e]! >= dawn ? ends[e]! + h : dawn;
    ends[e] = tr.due;
  }
  /** If sim time t is after a service's last train or before its first (`hours`), when its first train next leaves,
   * as sim time; otherwise null. */
  dawn(v: Svc, t: number): number | null {
    const hrs = v.def.hours; if (!hrs) return null;
    const c = clockAt(t), day = Math.floor(c / 86400), h = c / 3600 - day * 24;
    return h >= hrs.last ? simAtHour(day + 2, hrs.first) : h < hrs.first ? simAtHour(day + 1, hrs.first) : null;
  }
  /** When a train planned to leave the end of its run at t leaves: then, or with the first train if t is overnight. */
  leaves(svc: string, t: number): number { return this.dawn(this.svc(svc), t) ?? t; }
  /** Whether the main line's last train of the day has gone (until midnight; demand is nil from then until 04:00). */
  lastGone(): boolean { const hrs = this.svcs[0]!.def.hours; return !!hrs && this.hour() >= hrs.last; }
  /** Whether a unit is standing overnight at the end of its run, waiting for the first train. */
  stabled(tr: Train): boolean {
    return tr.state === 'dwell' && tr.pfAt >= 0 && this.isEnd(tr, tr.pfAt) && this.dawn(this.svc(tr.svc), this.g.t) !== null && tr.due > this.g.t;
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
      if (tr.late > 300) g.stats.late++;
      const j = tr.next, run = runTime(Math.abs(this.station(j).s - this.station(i).s), this.vmax(), TUNING.accel, TUNING.brake);
      tr.due += run + (this.isEnd(tr, j) ? this.turnaround() : TUNING.dwell);
    }
  }
  // ---- platforms ----
  /** Whether a train calls at station i: an owned station with a platform its way, or either end of its run; an
   * express wherever its route has a platform built for it its way, and always at the end of its run. */
  callsAt(tr: Train, i: number): boolean {
    if (this.isEnd(tr, i)) return true;
    const v = this.svc(tr.svc);
    if (v.express) return v.route.includes(i) && this.platsFor(tr, i, tr.dir > 0 ? 'north' : 'south').length > 0;
    return !!this.g.owned[i] && this.serves(i, tr.dir > 0 ? 0 : 1);
  }
  /** Whether platform p at station i is built: every platform at a station the player doesn't own (the railway's,
   * fully built), and at one they do, once its stage is bought. */
  built(i: number, p: number): boolean {
    if (!this.g.owned[i]) return true;
    const up = this.plats[i]?.[p]?.def.upgrade, ups = this.ups(i);
    return up === undefined || [up].flat().every(u => !!ups[u as UpgradeId]);
  }
  /** The platforms a train of this service can use at station i, calling one way or turning round, built ones only,
   * the one to try first first: its service's list there (a turning list shared out by unit, so each unit has its own
   * first choice and every platform built is in use), or the station's faces that way. */
  platsFor(tr: Train, i: number, kind: 'north' | 'south' | 'turn'): number[] {
    const v = this.svc(tr.svc), P = this.plats[i] ?? [], own = v.plats.get(i)?.[kind];
    const all = own ?? P.flatMap((f, k) => kind === 'turn' || f.ways.includes(kind === 'north' ? 0 : 1) ? [k] : []);
    const ok = all.filter(p => this.built(i, p));
    if (kind !== 'turn' || !own || ok.length < 2) return ok;
    let unit = 0; for (const o of this.g.trains) { if (o === tr) break; if (o.svc === tr.svc) unit++; }
    const k = unit % ok.length; return [...ok.slice(k), ...ok.slice(0, k)];
  }
  /** What a train running in to station i will stand at: turning round there, or calling its way. */
  kindAt(tr: Train, i: number): 'north' | 'south' | 'turn' { return this.isEnd(tr, i) ? 'turn' : tr.dir > 0 ? 'north' : 'south'; }
  /** Where along the line a train stands at station i on platform p: the station's stop, or the platform's own; an
   * express turning round stands with its front where the longest stopping unit's would, so it clears the buffers. */
  stopAt(tr: Train, i: number, p: number): number {
    const st = this.station(i), u = this.plats[i]?.[p]?.def.stop;
    let s = u === undefined ? st.s : st.at + u;
    if (this.svc(tr.svc).express && this.isEnd(tr, i)) s += tr.dir * (this.longest() - tr.cars) * TUNING.carPitch / 2;
    return s;
  }
  /** The most cars a stopping unit can have. */
  longest(): number { return 2 + 2 * (LINE_UPGRADES.find(u => u.id === 'cars')?.max ?? 0); }
  /** Whether train o takes platform p at station i: standing there, running in having claimed it, or not yet clear of
   * the platform leaving. */
  holds(o: Train, i: number, p: number): boolean {
    if (o.state === 'away') return false;
    if (o.state === 'dwell') return o.pfAt === i && o.pf === p;
    const d = (this.station(i).s - o.s) * o.dir;
    if (o.next === i && o.bound === p && d < TUNING.claim) return true;
    return o.pfAt === i && o.pf === p && d <= 0 && d > -TUNING.clear;
  }
  /** A train running in to station i claims the first of its platforms there nobody else holds; at a station the
   * player doesn't own (the railway's, which never holds a train) or once it's too close to stop, its first choice
   * whether or not it's free. Returns whether it has one. */
  claim(tr: Train, i: number, force: boolean): boolean {
    if (tr.bound >= 0) return true;
    const ps = this.platsFor(tr, i, this.kindAt(tr, i));
    for (const p of ps) if (!this.g.trains.some(o => o !== tr && this.holds(o, i, p))) { tr.bound = p; return true; }
    if (force || !this.g.owned[i]) { tr.bound = ps[0] ?? 0; return true; }
    return false;
  }
  /** How far a running train can go before it closes on the one ahead of it on its line (the same track, same way). */
  clear(tr: Train): number {
    let gap = Infinity; const track = this.trackOf(tr);
    for (const o of this.g.trains) if (o !== tr && o.state !== 'away' && o.dir === tr.dir && this.trackOf(o) === track) { const d = (o.s - tr.s) * tr.dir; if (d > 0 && d < gap) gap = d; }
    return gap - TUNING.separation;
  }
  /** The track a train runs on: its route's, where it is, the way it's heading. */
  trackOf(tr: Train): string { return this.svc(tr.svc).path.track(tr.s, tr.dir, tr.leg); }
  /** The corridor a train is on: its route's leg's there. */
  corridorOf(tr: Train): string { return this.svc(tr.svc).path.leg(tr.s, tr.leg).corridor; }
  /** A train goes to chainage s along its route, passing onto the next leg (or back onto the last) at a junction. */
  goTo(tr: Train, s: number): void { tr.s = s; tr.leg = this.svc(tr.svc).path.legAt(s, tr.leg); }
  /** Run a train towards `target` (s along the line) for dt, as far as the train ahead and its signal allow; where it
   * hasn't a platform yet at `stop`, it claims one from `claim` metres out and stands at its signal, approach metres
   * short, until it has. Returns whether it has arrived. */
  move(tr: Train, dt: number, target: number, stop: number | null, limit: number): boolean {
    let rem = Math.abs(target - tr.s);
    if (stop !== null && tr.bound < 0 && rem < TUNING.claim) {
      if (this.claim(tr, stop, rem < TUNING.approach)) { target = this.stopAt(tr, stop, tr.bound); rem = Math.abs(target - tr.s); }
    }
    // it can go as far as the train ahead allows, and no further than its signal while it has no platform
    const held = stop !== null && tr.bound < 0 && rem >= TUNING.approach;
    const room = Math.min(held ? Math.min(this.clear(tr), rem - TUNING.approach) : this.clear(tr), this.signalRoom(tr, rem));
    tr.v = Math.min(limit, tr.v + TUNING.accel * dt, cautionLimit(this, TUNING, tr));
    tr.v = Math.max(0.5, Math.min(tr.v, Math.sqrt(2 * TUNING.brake * Math.max(rem, 0))));
    // a train closing on the one ahead, or on a red signal, brakes to stand behind it
    if (room < rem) tr.v = Math.min(tr.v, Math.sqrt(2 * TUNING.brake * Math.max(room, 0)));
    const step = room < rem ? Math.min(tr.v * dt, Math.max(room, 0)) : tr.v * dt;
    if (step >= rem) { this.goTo(tr, target); tr.v = 0; return true; }
    this.goTo(tr, tr.s + tr.dir * step); return false;
  }
  // ---- signalling ----
  /** Half a train's length: from its middle (s) to either end. */
  half(tr: Train): number { return tr.cars * TUNING.carPitch / 2; }
  /** Which train is in each block of every track (once a step, before the trains move): a train is in every block its
   * length covers, on each leg's track it spans. */
  occupy(): void {
    for (const a of this.occ.values()) a.fill(-1);
    for (const tr of this.g.trains) {
      if (tr.state === 'away') continue;
      const P = this.svc(tr.svc).path, L = this.half(tr), lo = tr.s - L, hi = tr.s + L;
      for (const l of P.legs) {
        if (l.s1 < lo || l.s0 > hi) continue;
        const track = tr.dir > 0 ? l.north : l.south, B = this.net.blocks(track), a0 = Math.max(lo, l.s0), a1 = Math.min(hi, l.s1);
        let o = this.occ.get(track); if (!o) { o = new Int32Array(B.open.length).fill(-1); this.occ.set(track, o); }
        for (let k = 0; k < B.open.length; k++) if (B.at[k + 1]! > a0 && B.at[k]! < a1) o[k] = o[k] === -1 || o[k] === tr.id ? tr.id : -2;
      }
    }
  }
  /** Whether block k of a track holds a train other than tr. */
  private taken(track: string, k: number, tr: Train | null): boolean { const v = this.occ.get(track)?.[k] ?? -1; return v !== -1 && (!tr || v !== tr.id); }
  /** How far a running train's middle can go before it stands at a signal at red: the next signal ahead whose block
   * beyond (open line) holds another train, or a junction whose way through for it crosses one set for another. Only
   * as far ahead as `rem`, where it's going. */
  signalRoom(tr: Train, rem: number): number {
    const v = this.svc(tr.svc), P = v.path, L = this.half(tr), head = tr.s + tr.dir * L, d = tr.dir;
    let room = Infinity;
    for (let k = P.legAt(head, tr.leg); k >= 0 && k < P.legs.length && room === Infinity; k += d) {
      const leg = P.legs[k]!, B = this.net.blocks(d > 0 ? leg.north : leg.south), n = B.at.length;
      for (let q = 0; q < n; q++) {
        const i = d > 0 ? q : n - 1 - q, b = B.at[i]!, ahead = (b - head) * d;
        if (ahead <= 0.5 || b < leg.s0 - 0.5 || b > leg.s1 + 0.5) continue;
        if (ahead > rem + 1) break;
        const beyond = d > 0 ? i : i - 1;
        if (beyond >= 0 && beyond < B.open.length && B.open[beyond] && this.taken(d > 0 ? leg.north : leg.south, beyond, tr)) { room = ahead - TUNING.signalStand; break; }
      }
    }
    // the junctions ahead it's coming up to
    for (const m of this.net.movements(v.def, d)) {
      const ahead = (m.s - head) * d; if (ahead <= 0.5) continue; if (ahead > Math.min(rem + 1, TUNING.claim)) break;
      if (this.junctionHeld(tr, m, ahead)) room = Math.min(room, ahead - TUNING.signalStand);
      break;
    }
    return room;
  }
  /** Whether another train holds a junction a train is coming up to (`ahead` metres off) on a way that conflicts with
   * its own: one across it now, or nearer it coming up (the first there goes first). */
  junctionHeld(tr: Train, m: Movement, ahead: number): boolean {
    for (const o of this.g.trains) {
      if (o === tr || o.state === 'away') continue;
      const L = this.half(o);
      for (const p of this.net.movements(this.svc(o.svc).def, o.dir)) {
        if (p.junction !== m.junction || !this.net.conflicts(m, p)) continue;
        const head = (p.s - (o.s + o.dir * L)) * o.dir, tail = (p.s - (o.s - o.dir * L)) * o.dir;
        if ((head <= 0 && tail > 0) || (head > 0 && head <= TUNING.claim && o.state === 'run' && (head < ahead || (head === ahead && o.id < tr.id)))) return true;
      }
    }
    return false;
  }
  /** What a signal shows to trains running along a track (its own way) at site s: 0 red (the block beyond holds a
   * train), 1 yellow (the one after does, or the block beyond is a station's with a train in it: on at caution), 2
   * green; null where the track has no signal there. */
  aspect(track: string, s: number): 0 | 1 | 2 | null {
    const B = this.net.blocks(track), d = this.net.way(track), i = B.at.findIndex(b => Math.abs(b - s) < 0.5);
    if (i < 0) return null;
    const k = d > 0 ? i : i - 1, k2 = k + d;
    if (k < 0 || k >= B.open.length) return null;
    if (this.taken(track, k, null)) return B.open[k] ? 0 : 1;
    return k2 >= 0 && k2 < B.open.length && this.taken(track, k2, null) ? 1 : 2;
  }
  /** A train stands at the platform it claimed: it's the one it holds now. */
  standAt(tr: Train, i: number): void { if (tr.bound < 0) this.claim(tr, i, true); tr.pf = tr.bound; tr.pfAt = i; tr.bound = -1; }
  stepTrain(tr: Train, dt: number): void {
    if (this.svc(tr.svc).express) { stepExpress(this, TUNING, tr, dt); return; }
    if (tr.state === 'dwell') { this.depart(tr, dt); return; }
    // a failed unit stands where it is until it's rescued, and the trains behind it wait
    if (failed(this.g, tr)) { tr.v = 0; return; }
    if (tr.next === null) tr.next = this.nextStop(tr);
    const i = tr.next, last = this.isEnd(tr, i);
    const target = tr.bound >= 0 ? this.stopAt(tr, i, tr.bound) : this.station(i).s;
    if (this.move(tr, dt, target, i, this.vmax())) {
      if (last) tr.dir = tr.dir > 0 ? -1 : 1;      // reverse first so boarding uses the departure direction
      this.standAt(tr, i);
      this.callAt(tr, i);
      tr.state = 'dwell'; tr.dwell = last ? TUNING.turnMin : TUNING.dwellMin; tr.stood = 0; tr.quiet = 0;
      this.timetable(tr, i, last);
    }
  }

  // ---- journeys ----
  /** A number that changes whenever something journeys depend on does: what's owned, the upgrades that change walks,
   * waits and platforms, the line's units and speed, and the weather and season. */
  journeyKey(): number {
    const g = this.g; let h = g.line.units * 7 + g.line.timetable + 97 * weatherKey(g);
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
    for (let i = 0; i < this.S.length; i++) {
      const j = this.destination(i), J = j === null ? null : this.jt[i]?.[j];
      this.growth[i] = this.g.owned[i] && J ? this.reach(J.felt) : 0;
    }
  }
  /** The share of people whose budget a trip felt this long (seconds, each way) fits: half at the budget, fewer beyond. */
  reach(felt: number): number { return 1 / (1 + Math.exp((felt - TUNING.budget) / TUNING.budgetSoft)); }
  /** Where people from station i mostly go: the station a train reaches from i that draws the most people (Piccadilly
   * for every station but itself), or null if no train goes anywhere from there. */
  destination(i: number): number | null {
    let best: number | null = null;
    for (let j = 0; j < this.S.length; j++) if (j !== i && this.journey(i, j) && (best === null || this.station(j).draw > this.station(best).draw)) best = j;
    return best;
  }

  // ---- homes that grow ----
  /** Station i's homes now (its census catchment, grown). */
  homes(i: number): number { return this.g.homes[i] ?? this.station(i).catchment; }
  /** The most homes station i's land could hold. */
  ceiling(i: number): number { const s = this.station(i); return Math.max(s.catchment, s.ceiling ?? s.catchment); }
  /** How fast station i's homes are growing now, as a share of the most they could (0 to 1): the reach of its trip. */
  growthRate(i: number): number { if (this.jkey < 0) this.refreshJourneys(); return this.growth[i]!; }
  /** dt seconds of growth (the peaks' sim seconds by the clock): each owned station's homes close on its ceiling, the
   * quicker the better its trip. */
  grow(dt: number): void {
    const H = this.g.homes, k = TUNING.grow * dt / 3600;
    for (let i = 0; i < this.S.length; i++) {
      const q = this.growth[i]!; if (q <= 0) continue;
      const h = H[i] ?? this.station(i).catchment; H[i] = h + (this.ceiling(i) - h) * q * k;
    }
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
  /** What scales station i's trips an hour at hour h: the hour's demand, its platforms, the weather, over Piccadilly's draw. */
  tripScale(i: number, h: number): number { return demandCurve(h) * TUNING.demand * (this.ups(i).platforms ? TUNING.platformsBonus : 1) * feel(this.g).travel / this.net.station('piccadilly').draw; }
  tripRates(i: number, h: number): number {
    const a = this.station(i), out = h < 12 ? TUNING.amOut : TUNING.pmOut, scale = this.tripScale(i, h);
    let tot = 0;
    for (let j = 0; j < this.S.length; j++) {
      const J = j === i ? null : this.journey(i, j);
      if (!J) { this.rates[j] = 0; continue; }
      const b = this.station(j), reach = this.reach(this.felt(J));
      tot += this.rates[j] = scale * reach * (out * this.homes(i) * b.draw + (1 - out) * a.draw * this.homes(j));
    }
    return tot;
  }

  // ---- passengers ----
  /** New passengers at a station for dt seconds (the peaks' sim seconds by the clock), by the trips an hour to each
   * place it reaches; a halt only has a platform one way, so nobody comes for the other. */
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
   * the last `tripRates`); a full platform turns the rest away, and so does the night once the last train has gone. */
  enqueue(i: number, dirIdx: 0 | 1, count: number): void {
    if (count <= 0) return;
    const g = this.g, S = this.state(i), cap = this.lastGone() ? 0 : this.capacity(i);
    const room = Math.max(0, cap - S.waiting), take = Math.min(room, count);
    let tot = 0; for (let j = 0; j < this.S.length; j++) if (this.dirIdx(i, j) === dirIdx) tot += this.rates[j]!;
    // those turned away only need somewhere to go if there's a cab to take them there
    if (take < count) this.giveUp(i, S.cabs.length && tot > 0 ? this.pickDest(i, dirIdx, tot) : -1, count - take);
    if (take <= 0 || tot <= 0) return;
    const dest = this.pickDest(i, dirIdx, tot);
    S.q[dirIdx].push({ t: g.t, dest, n: take, give: g.t + this.patience(i, dest) }); S.waiting += take;
  }
  /** Where a group setting out from station i one way is going, chosen by the trips to each place (the last
   * `tripRates`), tot being their sum that way. */
  pickDest(i: number, dirIdx: 0 | 1, tot: number): number {
    let r = this.rand() * tot, dest = -1;
    for (let j = 0; j < this.S.length; j++) { if (this.dirIdx(i, j) !== dirIdx || !this.rates[j]) continue; dest = j; r -= this.rates[j]!; if (r <= 0) break; }
    return dest;
  }
  /** n people at station i bound for dest give up on the train: turned away by a full platform, or out of patience.
   * Where there's a taxi rank each takes a cab with chance cabShare, while there's a cab in: a cab takes up to cabSeats
   * of them and is away for the ride there and back, and the player takes a cut of each fare. The rest go home, lost;
   * a busy peak empties the rank. */
  giveUp(i: number, dest: number, n: number): void {
    const g = this.g, S = this.state(i);
    if (S.cabs.length && dest >= 0) {
      let want = 0; for (let k = 0; k < n; k++) if (this.rand() < TUNING.cabShare) want++;
      const away = TUNING.cabRank + 2 * TUNING.cabMile * Math.abs(this.station(i).miles - this.station(dest).miles);
      for (let k = 0; k < S.cabs.length && want > 0; k++) {
        if (S.cabs[k]! > g.t) continue;
        const m = Math.min(want, TUNING.cabSeats), rev = m * this.fare(i, dest) * TUNING.cabCut;
        S.cabs[k] = g.t + away; want -= m; n -= m; S.cab += m; g.stats.cab += m;
        g.cash += rev; g.earned += rev; S.revenue += rev;
      }
    }
    S.lost += n; g.stats.lost += n;
  }
  /** How many of a station's cabs stand at its rank now. */
  cabsIn(i: number): number { const S = this.state(i); let n = 0; for (const t of S.cabs) if (t <= this.g.t) n++; return n; }
  /** How long a group setting out from station i for station j will wait. Their own time budget is drawn from the
   * people who'd make this journey at all (the fall-off in tripRates is how budgets spread: half of people's exceed
   * TUNING.budget), and they wait until what's left of it after the walks, the ride and any change is used up. So
   * those for whom the trip only just fits give up first, and a long wait bites hardest where journeys are longest. */
  patience(i: number, j: number): number {
    const J = this.journey(i, j); if (!J) return TUNING.patienceMin;
    const felt = this.felt(J), B = TUNING.budget, s = TUNING.budgetSoft;
    const least = 1 / (1 + Math.exp(-(felt - B) / s)), u = Math.min(1 - 1e-9, least + (1 - least) * this.rand());
    const budget = B + s * Math.log(u / (1 - u)), ww = waitWeight(this, TUNING, i);
    // the wait the timetable promises (up to a whole gap between trains) feels as waiting does; past that, a late or
    // full train, it feels delayWeight times riding (a canopy takes the same share off)
    const left = budget - (felt - J.firstWait), gap = this.headway(this.svcs[J.legs[0]!.svc]!.id);
    const dw = TUNING.delayWeight * ww / TUNING.waitWeight;
    return Math.max(TUNING.patienceMin, left <= ww * gap ? left / ww : gap + (left - ww * gap) / dw);
  }
  /** Whoever has waited past their patience goes home; each group has its own, so the whole queue is looked at. Someone
   * changing trains has come too far to turn back. */
  expire(i: number): void {
    const g = this.g, S = this.state(i);
    for (const q of S.q) {
      let k = 0;
      for (const c of q) { if (c.give !== undefined && g.t > c.give) { S.waiting -= c.n; this.giveUp(i, c.dest, c.n); } else q[k++] = c; }
      q.length = k;
    }
  }
  rand(): number { return rand(this.g); }

  // ---- stepping ----
  step(dt: number): void {
    const g = this.g; this.ensureTrains();
    const d0 = Math.floor(g.t / DAY), t0 = g.t; g.t += dt; if (Math.floor(g.t / DAY) > d0) g.day++;
    // what the clock paces (demand, car parks and buses, homes growing) steps by the clock: dt in the peaks' sim seconds, more when the clock
    // runs fast, so each clock hour carries what it did before the clock sped up
    const dc = (clockAt(g.t) - clockAt(t0)) / BASE;
    stepWeather(g, dt); this.refreshJourneys(); this.measureCrowding(); this.grow(dc);
    for (let i = 0; i < this.S.length; i++) { if (!g.owned[i]) continue; this.generate(i, dc); stepAccess(this, TUNING, i, dc); this.expire(i); }
    stepTrouble(this, TUNING);
    this.occupy();
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
  /** The station that must be owned before station i can be bought: its `after`, or the one before it in the list
   * (none for the first). */
  prior(i: number): number { const a = this.station(i).after; return a ? this.net.station(a).index : i - 1; }
  /** Whether station i is next to buy: not owned, and the station before it is. */
  offerable(i: number): boolean { const p = this.prior(i); return !this.g.owned[i] && (p < 0 || !!this.g.owned[p]); }
  canBuyStation(i: number): boolean { const g = this.g, s = this.S[i]; return !!s && this.offerable(i) && g.cash >= this.stationPrice(i) && !this.stationNeeds(i); }
  buyStation(i: number): boolean { if (!this.canBuyStation(i)) return false; this.g.cash -= this.stationPrice(i); this.g.owned[i] = true; this.refreshJourneys(); return true; }
  canBuyUpgrade(i: number, id: string): boolean {
    const u = UPGRADES.find(u => u.id === id), g = this.g, ups = g.ups[i];
    return !!u && !!ups && !!g.owned[i] && !ups[u.id] && this.offered(i, u) && this.ready(i, u) && g.cash >= this.upgradePrice(i, u);
  }
  buyUpgrade(i: number, id: string): boolean {
    const u = UPGRADES.find(u => u.id === id), ups = this.g.ups[i];
    if (!u || !ups || !this.canBuyUpgrade(i, id)) return false;
    this.g.cash -= this.upgradePrice(i, u); ups[u.id] = true;
    if (u.id === 'taxi') this.state(i).cabs = new Array<number>(TUNING.cabs).fill(0);   // the rank opens with every cab in
    openAccess(this, i, u.id);
    this.refreshJourneys(); return true;
  }
  /** Whether a line upgrade can be seen yet: extra units need room for a second train to turn at the line's home
   * terminus (Stockport's platform 3), and a spare unit comes once a train has failed. */
  lineReady(id: string): boolean {
    if (id === 'spare') return this.g.trouble.fails > 0;    // offered once a train has failed: the fix for what you've seen
    return id !== 'units' || !!this.ups(this.svcs[0]!.route[0]!).platform2;
  }
  buyLine(id: string): boolean {
    const u = LINE_UPGRADES.find(u => u.id === id), g = this.g; if (!u) return false;
    const lvl = g.line[u.id], price = this.linePrice(u.id);
    if (lvl >= u.max || price === undefined || g.cash < price || !this.lineReady(u.id)) return false;
    g.cash -= price; g.line[u.id]++; this.ensureTrains(); this.refreshJourneys(); return true;
  }
}
