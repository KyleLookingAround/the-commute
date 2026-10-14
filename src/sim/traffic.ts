// The car in the sim (docs/design/gridlock.md §2): the roads, worked out from what the sim already knows. Everyone who'd
// make a trip between two places at all (the trip rates without the reach: wouldTravel) and whom the network doesn't
// carry drives, carShare of them to a car; each road stretch (src/data/traffic.json, real DfT counts) carries the drives
// between the pairs of places it serves, plus the traffic the network never touches, and fills to its load against its
// capacity; past it a queue grows, and drains once the load falls back. Derived, never stepped: nothing in Sim.step
// reads it, so play is the same with or without it. Pure: no random numbers, no DOM, nothing from the view. The data is
// passed in, so the page can load it after the first frame.
import type { Sim, Tuning } from './sim.ts';
import { demandCurve } from './sim.ts';
import { extraFelt } from './access.ts';

/** Pairs of places whose drive uses a stretch, both ways: station ids or `corridor:<id>`, and the share of those
 * drives that go this way. */
export interface ServeDef { a: string[]; b: string[]; share?: number }
/** A road stretch: a DfT count point's flow (both ways, a day), its lanes each way, free speed (km/h), length (km), and
 * its load at 08:00 with no public transport (`start`). */
export interface StretchDef {
  id: string; name: string; road: string; countPoint: number; year: number; aadf: number; estimated: boolean;
  from: string; to: string; km: number; lanes: number; free: number; start: number; serves: ServeDef[];
}
export interface TrafficDef {
  peakShare: number; peakLoad: number; peakHour: number; dayFrom: number; step: number; crawl: number; carLength: number;
  profile: number[]; stretches: StretchDef[];
}

/** A stretch as it stands at an hour, in real vehicles: an hour both ways (cars, of them through), its load against
 * capacity, speed (km/h), the queue (vehicles, and metres of road in each lane), and the drive along it now and when
 * clear (minutes). */
export interface Road {
  id: string; name: string; cars: number; through: number; capacity: number; load: number; speed: number;
  queue: number; queueM: number; drive: number; free: number;
}
/** The roads at an hour: each stretch, the cars an hour over them all, the same with nothing running (the gridlock
 * opening), and the cars off the road at the morning peak (the start's total less today's, at peakHour). */
export interface Traffic { hour: number; roads: Road[]; cars: number; start: number; off: number }

/** A stretch with what's fixed about it: its capacity, the traffic the network never touches at the peak, and its
 * pairs of places (i to j, flattened, with their shares). */
interface Fixed { def: StretchDef; capacity: number; through: number; pairs: number[]; shares: number[] }

const fixedFor = new WeakMap<TrafficDef, WeakMap<Sim['net'], Fixed[]>>();

/** The stations a serve list names, by index. */
function resolve(sim: Sim, names: string[]): number[] {
  const out: number[] = [];
  sim.S.forEach((s, i) => { if (names.some(n => n === s.id || n === `corridor:${s.corridor}`)) out.push(i); });
  return out;
}

/** What scales every trip an hour at hour h: the demand curve over Piccadilly's draw, as Sim.tripScale without the
 * platforms or the weather (they change who takes the train, not who travels). */
function scale(sim: Sim, T: Tuning, h: number): number { return demandCurve(h) * T.demand / sim.net.station('piccadilly').draw; }

/** Trips an hour from i to j at the peak's shape, split as Sim.tripRates splits them: out, from homes at i to what
 * draws people at j; back, from what draws them at i to homes at j. Without the demand curve's height (`scale`). */
interface Split { out: number; back: number }

/** Per stretch, the drives' two halves, summed over its pairs: out × Σ(homes at i × draw at j × the share who don't
 * take the train) and back the same for going home. `open`: as the network stands; otherwise nothing running and every
 * station's census homes. */
function drives(sim: Sim, T: Tuning, F: Fixed[], open: boolean): Split[] {
  const n = sim.S.length, out = new Float64Array(n * n), back = new Float64Array(n * n);
  const homes = (i: number) => open ? sim.homes(i) : sim.station(i).catchment;
  const pool = (i: number) => sim.station(i).access?.drive ?? 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if (i === j) continue;
    const J = open ? sim.journey(i, j) : null, r = J ? sim.reach(J.felt) : 0;
    // the drive pools beyond a walk drive the whole way until their station's car park is built, then only to it
    const park = (k: number) => J && sim.ups(k).carpark ? sim.reach(J.felt + extraFelt(sim, T, k, 'drive')) : 0;
    out[i * n + j] = homes(i) * sim.station(j).draw * (1 - r) + pool(i) * sim.station(j).draw * (1 - park(i));
    back[i * n + j] = sim.station(i).draw * homes(j) * (1 - r) + sim.station(i).draw * pool(j) * (1 - park(j));
  }
  return F.map(f => {
    let o = 0, b = 0;
    for (let k = 0; k < f.shares.length; k++) { const p = f.pairs[k]!; o += f.shares[k]! * out[p]!; b += f.shares[k]! * back[p]!; }
    return { out: o, back: b };
  });
}

/** Real cars an hour on a stretch at hour h from its drives: the game's people at the hour's demand, carShare of them
 * to a car, carScale real cars to each of the game's. */
function carsAt(sim: Sim, T: Tuning, d: Split, h: number): number {
  const o = h < 12 ? T.amOut : T.pmOut;
  return T.carScale * T.carShare * scale(sim, T, h) * (o * d.out + (1 - o) * d.back);
}

/** The shape of the traffic the network never touches through the day at clock hour h, as a share of the morning
 * peak's (each profile value is the hour from its index, so it's read at the half hour). */
function profileAt(D: TrafficDef, h: number): number {
  const p = D.profile, x = h - 0.5, k = Math.floor(x), f = x - k, at = (i: number) => p[((i % 24) + 24) % 24]!;
  return at(k) * (1 - f) + at(k + 1) * f;
}
function profile(D: TrafficDef, h: number): number { return profileAt(D, h) / profileAt(D, D.peakHour); }

/** The stretches' fixed parts for this network: capacity from the real flow, and the traffic the network never
 * touches set so that, with nothing running, each stands at its `start` load at the morning peak. */
function fixed(sim: Sim, T: Tuning, D: TrafficDef): Fixed[] {
  let byNet = fixedFor.get(D); if (!byNet) fixedFor.set(D, byNet = new WeakMap());
  const had = byNet.get(sim.net); if (had) return had;
  const n = sim.S.length;
  const F: Fixed[] = D.stretches.map(def => {
    const share = new Map<number, number>();
    for (const s of def.serves) {
      const A = resolve(sim, s.a), B = resolve(sim, s.b), w = s.share ?? 1;
      for (const a of A) for (const b of B) if (a !== b) for (const p of [a * n + b, b * n + a]) share.set(p, Math.max(share.get(p) ?? 0, w));
    }
    return { def, capacity: def.aadf * D.peakShare / D.peakLoad, through: 0, pairs: [...share.keys()], shares: [...share.values()] };
  });
  const shut = drives(sim, T, F, false);
  F.forEach((f, k) => { f.through = Math.max(0, f.def.start * f.capacity - carsAt(sim, T, shut[k]!, D.peakHour)); });
  byNet.set(sim.net, F);
  return F;
}

/** Real cars an hour on each stretch, as the network stands (or with nothing running), at hour h. */
function flows(sim: Sim, T: Tuning, D: TrafficDef, F: Fixed[], d: Split[], h: number): { cars: number; through: number }[] {
  const p = profile(D, h);
  return F.map((f, k) => { const th = f.through * p; return { cars: th + carsAt(sim, T, d[k]!, h), through: th }; });
}

/** The roads at clock hour h (the sim's hour if not given), as the network stands. The queues are worked out from
 * dayFrom (05:00) to h in `step` clock-minute steps, as if the network had stood as it does all morning. */
export function traffic(sim: Sim, T: Tuning, D: TrafficDef, h: number = sim.hour()): Traffic {
  const F = fixed(sim, T, D), now = drives(sim, T, F, true), shut = drives(sim, T, F, false);
  const queue = F.map(() => 0), dt = D.step / 60;
  for (let t = D.dayFrom; t < h; t += dt) {
    const step = Math.min(dt, h - t), q = flows(sim, T, D, F, now, t + step / 2);
    F.forEach((f, k) => { queue[k] = Math.max(0, queue[k]! + (q[k]!.cars - f.capacity) * step); });
  }
  const at = flows(sim, T, D, F, now, h);
  const roads = F.map((f, k): Road => {
    const { cars, through } = at[k]!, load = cars / f.capacity, q = queue[k]!, def = f.def;
    const speed = q > 0 ? D.crawl : def.free / (1 + 0.15 * load ** 4);
    const free = 60 * def.km / def.free, drive = 60 * def.km / speed + (q > 0 ? 60 * q / f.capacity : 0);
    return { id: def.id, name: def.name, cars, through, capacity: f.capacity, load, speed, queue: q, queueM: q * D.carLength / (2 * def.lanes), drive, free };
  });
  const sum = (xs: { cars: number }[]) => xs.reduce((a, x) => a + x.cars, 0);
  const off = sum(flows(sim, T, D, F, shut, D.peakHour)) - sum(flows(sim, T, D, F, now, D.peakHour));
  return { hour: h, roads, cars: sum(roads), start: sum(flows(sim, T, D, F, shut, h)), off };
}

/** A number that changes whenever the roads would: the journeys (what's bought, the line, the weather), the homes,
 * and the clock to the queues' step. Work the traffic out again when it does, as Sim.journeyKey is used. */
export function trafficKey(sim: Sim, D: TrafficDef): number {
  let k = sim.journeyKey();
  for (let i = 0; i < sim.S.length; i++) k = (Math.imul(k, 31) + Math.round(sim.homes(i)) + (sim.ups(i).carpark ? 1 : 0)) | 0;
  return (Math.imul(k, 31) + sim.g.day * 1440 + Math.floor(sim.hour() * 60 / D.step)) >>> 0;
}

/** Everyone who'd make the trip from station i to station j at hour h at all, trips an hour: Sim.tripRates without
 * the reach, with each station's homes now (the census catchment where nothing's grown). */
export function wouldTravel(sim: Sim, T: Tuning, i: number, j: number, h: number): number {
  if (i === j) return 0;
  const o = h < 12 ? T.amOut : T.pmOut, a = sim.station(i), b = sim.station(j);
  return scale(sim, T, h) * (o * sim.homes(i) * b.draw + (1 - o) * a.draw * sim.homes(j));
}

/** The drives from station i to station j at hour h, game people an hour: whoever would travel that the network
 * doesn't carry (the walk-in homes' trips, by the reach of the journey), carShare of them to a car. */
export function cars(sim: Sim, T: Tuning, i: number, j: number, h: number): number {
  const J = i === j ? null : sim.journey(i, j);
  return wouldTravel(sim, T, i, j, h) * (1 - (J ? sim.reach(J.felt) : 0)) * T.carShare;
}
