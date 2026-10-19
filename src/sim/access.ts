// Car parks and bus links (docs/DESIGN.md, Car parks and bus links): the ground round a station bringing people from
// beyond a walk. Each station's census pools (`access` in the network data) are homes beyond a walk of every station:
// some would drive here and park, some would come by bus. Once the player builds a car park or a bus link they travel
// as everyone does, by how their trip feels door to door (Sim.reach), with the drive or the bus in place of the walk
// from home. A car park has spaces: each car takes one until the evening and pays a charge, and once it's full the rest
// don't come. At Stockport, whose buses already bring most of its homes, the Interchange makes their change onto the
// train quicker and covered, and its buses reach further. Pure and seeded like the rest of the sim.
import type { Sim, Tuning } from './sim.ts';
import type { Journey } from './journeys.ts';
import type { StationState, UpgradeId } from './types.ts';
import { feel } from './weather.ts';

const HOURS = 24;

/** The car park's spaces at station i as built: each stage's from its `grow` entry. */
export function spaces(sim: Sim, i: number): number {
  const ups = sim.ups(i), grow = sim.station(i).grow;
  return (ups.carpark ? grow?.carpark?.spaces ?? 0 : 0) + (ups.carpark2 ? grow?.carpark2?.spaces ?? 0 : 0);
}
/** Cars parked at station i now. */
export function parked(S: StationState): number { let n = 0; for (const c of S.parked) n += c; return n; }

/** How much longer than the walk from home a pool's way in feels, in felt seconds: the drive (felt as riding), parking
 * and the walk from the car park; or the bus ride, the wait for it and the change onto the train. */
export function extraFelt(sim: Sim, T: Tuning, i: number, by: 'drive' | 'bus'): number {
  const a = sim.station(i).access, f = feel(sim.g); if (!a) return Infinity;
  const walk = (s: number) => T.walkWeight * f.walk * s;
  if (by === 'drive') return a.driveTime + walk(T.parkWalk) - walk(T.walk);
  // at Stockport the Interchange's change is quicker and covered for its own buses too
  return a.busTime + T.waitWeight * f.wait * T.busWait * FEEDER_WAIT[sim.feederLevel(i)]! * STOP_WAIT[sim.shelterLevel(i)]! + T.busChange - BEE_CHANGE[sim.beeLevel()]! - (a.busShare ? T.busSave : 0) + walk(T.busWalk) - walk(T.walk);
}

/** A feeder route's steps (src/sim/places.ts, FEEDER): the wait for the bus, as a share of busWait, and the bus pool, as
 * a share of the census's, at each level from none. */
/** A bus stop's shelter and live times (src/sim/places.ts, SHELTER): the wait for the bus as it feels, as a share. */
export const STOP_WAIT = [1, 0.85, 0.72];
export const FEEDER_WAIT = [1, 0.6, 0.35, 0.35], FEEDER_POOL = [1, 1.4, 1.8, 2.3];
/** The Bee Network's steps (src/sim/places.ts, BEE): the bus pool at each, and the change from the bus felt shorter. */
export const BEE_POOL = [1, 1, 1.25, 1.6], BEE_CHANGE = [0, 0, 0, 120];
/** Trips an hour from station i's pool by car or bus at hour h, out of the homes there: like the walk-in homes'
 * (Sim.tripRates), each journey felt `extra` longer. With `fold`, its total towards Manchester and away. */
function poolRate(sim: Sim, T: Tuning, i: number, h: number, homes: number, extra: number, fold: [number, number]): number {
  fold[0] = fold[1] = 0;
  if (homes <= 0) return 0;
  const out = (h < 12 ? T.amOut : T.pmOut) * sim.tripScale(i, h) * homes;
  for (let j = 0; j < sim.S.length; j++) {
    const J = j === i ? null : sim.journey(i, j); if (!J) continue;
    fold[sim.dirIdx(i, j)] += out * sim.station(j).draw * sim.reach(sim.felt(J) + extra);
  }
  return fold[0] + fold[1];
}
/** The trips the Interchange adds for those already coming by bus: their change felt busSave shorter, so the trips that
 * now fit over those that did. */
function quickerRate(sim: Sim, T: Tuning, i: number, h: number, homes: number, fold: [number, number]): number {
  fold[0] = fold[1] = 0;
  if (homes <= 0) return 0;
  const out = (h < 12 ? T.amOut : T.pmOut) * sim.tripScale(i, h) * homes;
  for (let j = 0; j < sim.S.length; j++) {
    const J: Journey | null = j === i ? null : sim.journey(i, j); if (!J) continue;
    const felt = sim.felt(J);
    fold[sim.dirIdx(i, j)] += out * sim.station(j).draw * (sim.reach(felt - T.busSave) - sim.reach(felt));
  }
  return fold[0] + fold[1];
}

const carWay: [number, number] = [0, 0], busWay: [number, number] = [0, 0], quickWay: [number, number] = [0, 0];

/** n people from beyond a walk join station i's platforms, split by which way their trips go (the walk-in homes'
 * destinations, from the last Sim.tripRates, choose where each is going). */
function arrive(sim: Sim, i: number, n: number, way: [number, number]): void {
  const tot = way[0] + way[1]; if (n <= 0 || tot <= 0) return;
  const north = Math.round(n * way[0] / tot);
  sim.enqueue(i, 0, north); sim.enqueue(i, 1, n - north);
}

/** dt seconds at station i: the cars due away leave the car park, and the drivers and bus riders arrive. Called just
 * after Sim.generate, whose trip rates are station i's. */
export function stepAccess(sim: Sim, T: Tuning, i: number, dt: number): void {
  const ups = sim.ups(i), a = sim.station(i).access, S = sim.state(i), g = sim.g;
  if (!a || !(ups.carpark || ups.bus)) return;
  // the cars due away this clock hour leave (none park into the hour they're in: they stay parkStay hours); the hour
  // only through sim.hour(), so a clock whose rate varies through the day still empties them on time
  const h = sim.hour();
  if (S.parked.length) S.parked[Math.floor(h) % HOURS] = 0;
  if (ups.carpark && S.parked.length) {
    S.carAcc += poolRate(sim, T, i, h, a.drive, extraFelt(sim, T, i, 'drive'), carWay) * dt / 3600;
    const free = spaces(sim, i) - parked(S);
    if (free <= 0) S.carAcc = 0;                         // full: the rest don't come
    let n = Math.floor(S.carAcc);
    if (n > 0) {
      n = Math.min(n, free); S.carAcc -= n;
      // one to a car, staying the working day; each pays to park
      S.parked[(Math.floor(h) + T.parkStay) % HOURS]! += n;
      const rev = n * T.parkCharge; g.cash += rev; g.earned += rev; S.revenue += rev;
      S.car += n; g.stats.car += n; arrive(sim, i, n, carWay);
    }
  }
  if (ups.bus) {
    const r = poolRate(sim, T, i, h, a.bus * FEEDER_POOL[sim.feederLevel(i)]! * BEE_POOL[sim.beeLevel()]!, extraFelt(sim, T, i, 'bus'), busWay) + quickerRate(sim, T, i, h, (a.busShare ?? 0) * sim.homes(i), quickWay);
    S.busAcc += r * dt / 3600;
    const n = Math.floor(S.busAcc);
    if (n > 0) {
      S.busAcc -= n; S.bus += n; g.stats.bus += n;
      busWay[0] += quickWay[0]; busWay[1] += quickWay[1]; arrive(sim, i, n, busWay);
    }
  }
}

/** A car park opens empty. */
export function openAccess(sim: Sim, i: number, id: UpgradeId): void {
  const S = sim.state(i);
  if (id === 'carpark' && !S.parked.length) S.parked = new Array<number>(HOURS).fill(0);
}

/** How far out from station i its car park and bus link reach, in metres: the distance nine in ten of each pool live
 * within, while the trip to where people go still fits the budget for some of them (one in ten or more); 0 if neither
 * is built or reaches. For the map's outer ring. */
export function accessReach(sim: Sim, T: Tuning, i: number): number {
  const a = sim.station(i).access, ups = sim.ups(i); if (!a || !sim.g.owned[i]) return 0;
  const j = sim.destination(i), J = j === null ? null : sim.journey(i, j); if (!J) return 0;
  const fits = (by: 'drive' | 'bus') => sim.reach(J.felt + extraFelt(sim, T, i, by)) >= 0.1;
  let r = 0;
  if (ups.carpark && a.drive > 0 && fits('drive')) r = Math.max(r, a.driveR);
  if (ups.bus && a.bus > 0 && fits('bus')) r = Math.max(r, a.busR);
  return r;
}
