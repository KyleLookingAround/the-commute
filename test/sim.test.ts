// The sim's tests: the network's geometry, the demand curve, boarding and money, termini, platforms, buying in order,
// pacing, taxi ranks, the seed, and saves. node:test, no browser; run with npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.ts';
import { Sim, demandCurve, TUNING } from '../src/sim/sim.ts';
import { migrate, SAVE_VERSION, SaveError } from '../src/sim/save.ts';
import type { NetworkGeoDef, Train } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const net = () => fromGeo(def);

test("network: each service's stations sit on the corridor in order, roughly the real distances apart", () => {
  const n = net();
  for (const v of n.services()) {
    const s = v.route.map(i => n.stations[i]!.s);
    for (let i = 1; i < s.length; i++) assert.ok(s[i]! > s[i - 1]!, `${v.def.id}: stations increase along the corridor`);
  }
  const total = n.station('piccadilly').s - n.station('stockport').s, branch = n.station('stockport').s - n.station('hazel-grove').s;
  assert.ok(total > 8500 && total < 11000, `Stockport to Piccadilly should be about 9.5 km, got ${total.toFixed(0)}`);
  assert.ok(branch > 4000 && branch < 5000, `Hazel Grove to Stockport should be about 4.5 km, got ${branch.toFixed(0)}`);
  // the origin is the station node from the map, which sits a few metres off the track the corridor follows
  const p = n.corridor('main').at(n.station('stockport').s);
  assert.ok(Math.hypot(p.x, p.z) < 40, `origin is Stockport: the corridor passes ${Math.hypot(p.x, p.z).toFixed(1)} m from it`);
});

test('network: track offsets are perpendicular to the corridor', () => {
  const n = net(), c = n.corridor('main');
  const a = c.at(5000, 0), b = c.at(5000, 19);
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 19) < 1e-6);
  assert.ok(Math.abs((b.x - a.x) * a.dx + (b.z - a.z) * a.dz) < 1e-6, 'offset is perpendicular to travel');
});

// the kits are the view's, but where their platforms stand against the network's tracks is a fact about the data
interface KitFaces { faces: Record<'north' | 'south', { v: number }>; parts: { type: string; v0?: number; v1?: number; u0?: number; u1?: number; upgrade?: string | string[] }[] }
/** Stockport grown to the stage where trains can run both ways from it and the branch can open. */
const growStockport = (sim: Sim) => { for (const id of ['crossing', 'platform2', 'building', 'platforms']) assert.ok(sim.buyUpgrade(0, id), `Stockport ${id}`); };
const kit = (id: string) => JSON.parse(readFileSync(new URL(`../src/data/kits/${id}.json`, import.meta.url), 'utf8')) as KitFaces;
const stopper = def.services?.find(s => s.id === 'stopper');

test('tracks: trains stand just clear of the platform their passengers wait on, at every station, each way', () => {
  const n = net();
  for (const st of n.stations) {
    const k = kit(st.kit);
    for (const dir of ['north', 'south'] as const) {
      const svc = n.boardingService(st.id, dir); if (!svc) throw new Error(`${st.id}: no service boards ${dir}`);
      const tv = n.offsetAt(svc.tracks[dir], st.s), fv = k.faces[dir].v, side = Math.sign(fv - tv);
      // the platform the face stands on: the one whose edge nearest the track is between the track and the face
      // the platforms a station grows (its halt and later stages), not the extensions beyond their ends
      const edges = k.parts.filter(p => p.type === 'platform' && p.v0 !== undefined && p.v1 !== undefined && ![p.upgrade ?? []].flat().includes('extend'))
        .map(p => side > 0 ? p.v0! : p.v1!).filter(e => (e - tv) * side > 0 && (fv - e) * side >= 0);
      assert.ok(edges.length, `${st.id} ${dir}: a platform between the track at ${tv.toFixed(2)} and the face at ${fv}`);
      const gap = Math.min(...edges.map(e => Math.abs(e - tv)));
      // trains are drawn 3.64 m wide: the edge clears half of that and is close enough to step across
      assert.ok(gap >= 1.95 && gap <= 3, `${st.id} ${dir}: platform edge ${gap.toFixed(2)} m from the track`);
    }
  }
});

test('tracks: a main-line train turning round at either end stays on the track it came in on', () => {
  const n = net();
  if (!stopper) throw new Error('no stopper');
  for (const st of [n.station('stockport'), n.station('piccadilly')])
    assert.equal(n.offsetAt(stopper.tracks.north, st.s), n.offsetAt(stopper.tracks.south, st.s), `${st.id}: both directions in one platform`);
});

test('tracks: on the open line and through the stations the tracks there keep clear of each other', () => {
  const n = net(), byS = [...n.stations].sort((a, b) => a.s - b.s), stockport = n.station('stockport').s;
  const between = byS.slice(1).map((st, i) => (st.s + byS[i]!.s) / 2);
  // not Stockport itself, where the Hazel Grove line crosses the main lines into platform 1
  // nor Piccadilly, where pairs of tracks run into one platform each
  const throat = n.station('piccadilly').at - 400;
  for (const s of [...byS.map(st => st.s), ...between].filter(s => Math.abs(s - stockport) > 1200 && s < throat)) {
    const o = n.tracks.filter(t => { const [e0, e1] = n.extent(t.id); return s >= e0 && s <= e1; }).map(t => n.offsetAt(t.id, s)).sort((a, b) => a - b);
    for (let i = 1; i < o.length; i++) assert.ok(o[i]! - o[i - 1]! >= 4.2, `at ${s.toFixed(0)} m two tracks are ${(o[i]! - o[i - 1]!).toFixed(2)} m apart`);
  }
});

test('tracks: no track steps sideways anywhere along the line', () => {
  const n = net(), L = n.corridor('main').length;
  for (const t of n.tracks) {
    let prev = n.offsetAt(t.id, 0);
    for (let s = 1; s <= L; s++) { const o = n.offsetAt(t.id, s); assert.ok(Math.abs(o - prev) < 0.6, `${t.id} jumps ${(o - prev).toFixed(2)} m at ${s} m`); prev = o; }
  }
});

test('demand: peaks in the morning and evening, quiet at night', () => {
  assert.ok(demandCurve(8) > demandCurve(12.5));
  assert.ok(demandCurve(17.5) > demandCurve(12.5));
  assert.equal(demandCurve(3), 0);
});

test('sim: the first train boards at Stockport and earns money within the first game hour', () => {
  const sim = new Sim(net());
  sim.advance(3600);
  assert.ok(sim.g.cash > 3000, 'cash should rise');
  assert.ok(sim.state(0).boarded > 0, 'passengers boarded at Stockport');
  assert.equal(sim.state(1).waiting, 0, 'locked stations generate nobody');
});

test('sim: trains reverse at termini and board the departure direction', () => {
  const sim = new Sim(net());
  const seenDirs = new Set<number>();
  for (let k = 0; k < 600; k++) { sim.advance(10); seenDirs.add(sim.g.trains[0]!.dir); }
  assert.deepEqual([...seenDirs].sort(), [-1, 1]);
  const tr = sim.g.trains[0]!;
  assert.ok(tr.s >= sim.station(0).s - 1 && tr.s <= sim.station(4).s + 1, 'train stays on the line');
});

test('sim: stations must be bought in order and cost what they say', () => {
  const sim = new Sim(net());
  sim.g.cash = 1e6;
  assert.equal(sim.canBuyStation(2), false, 'cannot skip Heaton Chapel');
  assert.equal(sim.buyStation(1), true);
  assert.equal(sim.g.cash, 1e6 - 9000);
  assert.equal(sim.canBuyStation(2), true);
});

test('sim: one unit cannot cope with Stockport at peak, so passengers are lost', () => {
  const sim = new Sim(net());
  sim.buyUpgrade(0, 'crossing');  // the subway brings the far side in
  sim.advance(4 * 3600 / 6);     // 06:30 to 10:30 on the clock, through the morning peak
  assert.ok(sim.g.stats.lost > 50, `expected lost passengers under pressure, got ${sim.g.stats.lost}`);
});

test('journeys: door to door, upgrades save minutes and minutes bring passengers', () => {
  const sim = new Sim(net()); sim.g.cash = 1e7;
  const J = () => { const j = sim.journey(0, 4); if (!j) throw new Error('no journey Stockport to Piccadilly'); return j; };
  const trips = () => sim.tripRates(0, 8);
  const start = J(), t0 = trips();
  // the whole trip at the start is about Marchetti's half hour each way
  const actual = (start.walk + start.wait + start.ride) / 60;
  assert.ok(actual > 25 && actual < 45, `Stockport to Piccadilly door to door takes ${actual.toFixed(1)} min`);
  assert.equal(sim.journey(0, 1), null, 'nowhere to go that is not served');
  assert.ok(sim.buyUpgrade(0, 'crossing'));
  assert.ok(J().walk < start.walk, 'a way across cuts the walk');
  const t1 = trips(); assert.ok(t1 > t0, 'and brings more people');
  assert.ok(sim.buyUpgrade(0, 'platform2') && sim.buyLine('units'));
  assert.ok(Math.abs(J().wait - start.wait / 2) < 1, 'a second unit halves the wait');
  const t2 = trips(); assert.ok(t2 > t1, 'and brings more people');
  assert.ok(sim.buyLine('timetable'));
  assert.ok(J().ride < start.ride && J().wait < start.wait / 2, 'the faster timetable shortens the ride and the wait');
  assert.ok(trips() > t2, 'and brings more people');
});

test('journeys: patience is the budget left, so a canopy or a shorter walk keeps people waiting', () => {
  const n = net(), sim = new Sim(n, Sim.fresh(n, 1)); sim.g.cash = 1e7;
  for (let i = 1; i <= 2; i++) assert.ok(sim.buyStation(i));
  // each group draws its own budget, so compare the means of many
  const mean = (i: number, j: number) => { let t = 0; for (let k = 0; k < 5000; k++) t += sim.patience(i, j); return t / 5000; };
  const bare = mean(2, 4);
  assert.ok(sim.buyUpgrade(2, 'canopy'));
  assert.ok(mean(2, 4) > bare, 'a canopy makes the wait feel shorter');
  const walkRound = mean(1, 4);
  assert.ok(sim.buyUpgrade(1, 'crossing'));
  assert.ok(mean(1, 4) > walkRound, "Heaton Chapel's footbridge leaves the far side more of their budget to wait with");
});

test('sim: a train boards through its stop, a door at a time, and a longer train boards more', () => {
  const boardAt = (cars: number) => {
    const sim = new Sim(net()); sim.g.cash = 1e6; sim.buyStation(1); sim.step(1);
    const tr = sim.g.trains[0]!, S = sim.state(1);
    // 200 people for Manchester on Heaton Chapel's platform, and a train calling there northbound
    S.q[0] = [{ t: sim.g.t, dest: 4, n: 200 }]; S.waiting = 200;
    Object.assign(tr, { dir: 1, s: sim.station(1).s, cars, onboard: 0, load: tr.load.map(() => 0) });
    sim.callAt(tr, 1);
    assert.equal(sim.state(1).boarded, 0, 'nobody is on the moment the doors open');
    for (let k = 0; k < 45; k++) sim.board(tr, 1);
    return S.boarded;
  };
  const two = boardAt(2), four = boardAt(4);
  assert.ok(two >= 100 && two <= 120, `a 2-car unit boards about 110 in a 45 s stop, slowing as it fills, got ${two}`);
  assert.equal(four, 200, 'four cars have the doors and the room for everyone');
});

/** The main line's first unit standing at Heaton Chapel northbound, with n people waiting for Manchester. */
const standing = (n: number, onboard = 0) => {
  const sim = new Sim(net()); sim.g.cash = 1e6; sim.buyStation(1); sim.step(1);
  const tr = sim.g.trains[0]!, S = sim.state(1);
  S.q[0] = n ? [{ t: sim.g.t, dest: 4, n }] : []; S.waiting = n;
  Object.assign(tr, { dir: 1, s: sim.station(1).s, v: 0, cars: 2, onboard, load: tr.load.map((_, j) => j === 4 ? onboard : 0), next: 1, state: 'run' });
  // arrive: the train is a hair short of the platform
  tr.s -= 0.1; sim.stepTrain(tr, 1);
  assert.equal(tr.state, 'dwell', 'it has arrived');
  return { sim, tr };
};
/** Stand a train until it leaves; how long it stood and how late it left. */
const leave = (sim: Sim, tr: ReturnType<typeof standing>['tr']) => { let late = -1; sim.onDepart = (_t, _i, l) => { late = l; }; for (let k = 0; k < 400 && tr.state === 'dwell'; k++) { sim.g.t += 1; sim.stepTrain(tr, 1); } return { stood: tr.stood, late }; };

test('timetable: a train never leaves before it is due, and a quiet stop keeps time', () => {
  const { sim, tr } = standing(0);
  const due = tr.due; assert.ok(due > sim.g.t, 'due away after it arrives');
  const r = leave(sim, tr);
  assert.ok(r.stood >= 44 && r.stood <= 46, `it stands its planned 45 s, stood ${r.stood}`);
  assert.equal(r.late, 0);
});

test('timetable: a crowded platform holds a train, it leaves late, and the lateness carries to its next stop', () => {
  const quiet = standing(20), busy = standing(140, 60);
  const q = leave(quiet.sim, quiet.tr), b = leave(busy.sim, busy.tr);
  assert.equal(q.late, 0, 'twenty people board in the planned stop');
  assert.ok(b.late > 30, `140 people for a train already 60 full hold it, left ${b.late} s late`);
  assert.ok(b.stood <= TUNING.dwellMin + TUNING.overrun + 1, 'never past the most a stop overruns');
  // its next departure is planned from when it was due, not when it left
  const tr = busy.tr, sim = busy.sim;
  for (let k = 0; k < 2000 && tr.state !== 'dwell'; k++) { sim.g.t += 1; sim.stepTrain(tr, 1); }
  assert.equal(tr.state, 'dwell', 'it reached its next stop');
  const planned = sim.isEnd(tr, tr.calling!) ? sim.turnaround() : TUNING.dwell;
  assert.ok(sim.g.t + planned - tr.due > 30, 'and arrived there still behind its timetable');
});

test('timetable: extra units spread out to an even gap at the ends', () => {
  const sim = new Sim(net()); sim.g.cash = 1e7; growStockport(sim); sim.buyLine('units'); sim.buyLine('units');
  const deps: number[] = [];
  sim.onDepart = (tr, i) => { if (i === 0 && tr.svc === 'stopper') deps.push(sim.g.t); };
  sim.advance(4 * 3600);
  const gaps = deps.slice(-4).map((t, k, a) => k ? t - a[k - 1]! : 0).slice(1), h = sim.headway('stopper');
  for (const gap of gaps) assert.ok(Math.abs(gap - h) < 60, `units leave Stockport about ${h.toFixed(0)} s apart, got ${gap.toFixed(0)}`);
});

/** Two main-line units: the first standing at station i (turned round there if it's the end of the run), held well past
 * its time, and the second running in towards it from 2 km out. */
const twoAt = (sim: Sim, i: number, dir: 1 | -1) => {
  sim.g.line.units = 1; sim.ensureTrains();
  const [a, b] = sim.g.trains as [Train, Train], at = sim.station(i).s, end = sim.isEnd(a, i);
  Object.assign(a, { dir: end ? -dir : dir, s: at, v: 0, state: 'dwell', calling: i, next: i, dwell: 0, due: sim.g.t + 600, stood: 0, quiet: 0, boardAcc: 0 });
  Object.assign(b, { dir, s: at - dir * 2000, v: 0, state: 'run', next: i, due: sim.g.t + 900 });
  return { a, b, gap: () => Math.abs(at - b.s) };
};
const tick = (sim: Sim, secs: number, until?: () => boolean) => { for (let k = 0; k < secs && !until?.(); k++) { sim.g.t += 1; for (const tr of sim.g.trains) sim.stepTrain(tr, 1); } };

test('platforms: a train for a halt where another stands waits at its signal, and runs in once the platform clears', () => {
  const sim = new Sim(net()); sim.g.cash = 1e7; growStockport(sim); assert.ok(sim.buyStation(1));
  const { a, b, gap } = twoAt(sim, 1, 1);
  tick(sim, 300);
  assert.equal(a.state, 'dwell', 'the first is still standing');
  assert.ok(b.v === 0 && Math.abs(gap() - TUNING.approach) < 1, `the second stands at the signal, ${gap().toFixed(0)} m out`);
  a.due = sim.g.t;
  let clearOf = -1;
  tick(sim, 600, () => { if (clearOf < 0 && gap() < TUNING.approach - 1) clearOf = (a.s - sim.station(1).s) * a.dir; return b.state === 'dwell'; });
  assert.equal(b.state, 'dwell', 'then it calls');
  assert.ok(clearOf >= TUNING.clear, `once the first is clear of the platform (${clearOf.toFixed(0)} m on)`);
});

test('platforms: at Stockport a second unit waits to turn until platform 3 gives it a face of its own', () => {
  const held = (p3: boolean) => {
    const sim = new Sim(net()); sim.g.cash = 1e7; assert.ok(sim.buyUpgrade(0, 'crossing'));
    if (p3) assert.ok(sim.buyUpgrade(0, 'platform2'));
    const { b, gap } = twoAt(sim, 0, -1);
    tick(sim, 300);
    return b.state === 'run' && Math.abs(gap() - TUNING.approach) < 1;
  };
  assert.ok(held(false), 'one face: it waits outside');
  assert.ok(!held(true), 'two faces: it runs straight in');
});

test('branch: buying Davenport after Piccadilly opens the Hazel Grove line, and each station after extends it', () => {
  const sim = new Sim(net()), n = sim.net, hg = sim.svc('hazel-grove');
  sim.g.cash = 1e7;
  const dav = n.station('davenport').index, wood = n.station('woodsmoor').index;
  assert.equal(sim.canBuyStation(dav), false, 'not before Piccadilly');
  for (let i = 1; i < dav; i++) assert.ok(sim.buyStation(i));
  assert.equal(sim.canBuyStation(dav), false, "not before Stockport's platforms 0, 1 and 2");
  assert.equal(sim.stationNeeds(dav)?.name, 'Platforms 0, 1 and 2');
  growStockport(sim);
  assert.equal(sim.unitsFor(hg), 0, 'no branch trains yet');
  assert.ok(sim.buyStation(dav)); sim.step(1);
  assert.deepEqual(sim.span(hg).map(i => n.stations[i]!.id), ['davenport', 'stockport']);
  assert.equal(sim.g.trains.filter(t => t.svc === 'hazel-grove').length, 1, 'one unit on the branch');
  assert.ok(sim.buyStation(wood));
  assert.deepEqual(sim.span(hg).map(i => n.stations[i]!.id), ['woodsmoor', 'davenport', 'stockport']);
  sim.advance(1200);
  const tr = sim.g.trains.find(t => t.svc === 'hazel-grove')!;
  assert.ok(tr.s >= n.station('woodsmoor').s - 1 && tr.s <= n.station('stockport').s + 1, 'the branch train stays on its run');
});

test('branch: passengers change at Stockport, pay once, and arrive', () => {
  const sim = new Sim(net(), Sim.fresh(net(), 5)), n = sim.net;
  sim.g.cash = 1e8; growStockport(sim);
  for (let i = 1; i < n.stations.length; i++) assert.ok(sim.buyStation(i));
  sim.advance(2 * 3600);
  const st = n.station('stockport').index, dav = n.station('davenport').index, hc = n.station('heaton-chapel').index;
  assert.ok(sim.state(st).changed > 0, 'people changed trains at Stockport');
  assert.equal(sim.state(hc).changed, 0, 'nobody changes where one train serves both ways');
  assert.ok(sim.state(dav).alighted > 0, 'people reached the branch');
  // every journey is either over, on a train, waiting to change, or given up (some of those changing)
  const paidWaiting = sim.g.st.reduce((a, S) => a + S.q.flat().filter(c => c.paid).reduce((b, c) => b + c.n, 0), 0);
  const done = sim.g.st.reduce((a, S) => a + S.alighted, 0) + sim.g.trains.reduce((a, t) => a + t.onboard, 0) + paidWaiting;
  assert.ok(done <= sim.g.stats.boarded && sim.g.stats.boarded <= done + sim.g.stats.lost, `journeys ${sim.g.stats.boarded}, accounted ${done} + lost ${sim.g.stats.lost}`);
});

test('halt: a bought station is one platform one way, until its second platform', () => {
  const sim = new Sim(net(), Sim.fresh(net(), 3)), hc = sim.net.station('heaton-chapel').index;
  sim.g.cash = 1e6; assert.ok(sim.buyStation(hc));
  assert.equal(sim.serves(hc, 0), true, 'towards Manchester'); assert.equal(sim.serves(hc, 1), false, 'not back to Stockport');
  sim.advance(3600);
  assert.ok(sim.state(hc).q[0].length > 0 || sim.state(hc).boarded > 0, 'people for Manchester come');
  assert.equal(sim.state(hc).q[1].length, 0, 'nobody waits for a train that never calls');
  // the stage before the second platform is needed first, and the second platform is hidden until then
  assert.equal(sim.canBuyUpgrade(hc, 'platform2'), false);
  assert.ok(!sim.visibleUpgrades(hc).some(u => u.id === 'platform2'), 'hidden until reachable');
  assert.deepEqual(sim.opens(hc, 'crossing'), ['Second platform', 'Lifts']);
  assert.ok(sim.buyUpgrade(hc, 'crossing') && sim.buyUpgrade(hc, 'platform2'));
  assert.equal(sim.serves(hc, 1), true);
  sim.advance(1800);
  assert.ok(sim.state(hc).q[1].length > 0 || sim.state(hc).boarded > 0, 'and now people going back to Stockport too');
});

test('halt: Piccadilly as a halt is the platform trains leave from, and offers only its own stages', () => {
  const sim = new Sim(net()), pic = sim.net.station('piccadilly').index;
  assert.equal(sim.haltDir(pic), 1);
  assert.deepEqual(sim.visibleUpgrades(pic).filter(u => u.stage).map(u => u.id), ['building', 'taxi']);
});

test('taxi rank: some who give up take a cab while one is in, earning a cut; the rest are lost; cabs come back', () => {
  const sim = new Sim(net(), Sim.fresh(net(), 5)), S = sim.state(0), pic = sim.net.station('piccadilly').index;
  assert.ok(!sim.visibleUpgrades(sim.net.station('ardwick').index).some(u => u.id === 'taxi'), 'only where a rank is offered');
  // without a rank everyone who gives up is lost
  sim.giveUp(0, pic, 5);
  assert.equal(S.lost, 5); assert.equal(S.cab, 0);
  sim.g.cash = 10000; assert.ok(sim.buyUpgrade(0, 'taxi'));
  assert.equal(sim.cabsIn(0), TUNING.cabs, 'the rank opens with every cab in');
  // a crowd gives up: cabs take parties until the rank is empty, and the rest still go home
  const cash = sim.g.cash; let gave = 0;
  for (let k = 0; k < 40; k++) { sim.giveUp(0, pic, 2); gave += 2; }
  assert.equal(sim.cabsIn(0), 0, 'a busy moment empties the rank');
  assert.ok(S.cab > 0 && S.cab <= TUNING.cabs * TUNING.cabSeats, `took ${S.cab} by cab`);
  assert.equal(S.cab + S.lost, gave + 5, 'everyone who gave up is counted, by cab or lost');
  assert.equal(sim.g.stats.cab, S.cab);
  assert.ok(Math.abs(sim.g.cash - cash - S.cab * sim.fare(0, pic) * TUNING.cabCut) < 1e-6, 'the player takes a cut of each fare');
  // the cabs come back from Piccadilly after the ride there and back
  const back = TUNING.cabRank + 2 * TUNING.cabMile * Math.abs(sim.station(0).miles - sim.station(pic).miles);
  sim.g.t += back - 1; assert.equal(sim.cabsIn(0), 0);
  sim.g.t += 2; assert.equal(sim.cabsIn(0), TUNING.cabs);
});

test('sim: line upgrades add units and lengthen trains', () => {
  const sim = new Sim(net());
  sim.g.cash = 1e6;
  assert.equal(sim.buyLine('units'), false, "an extra unit waits for Stockport's platform 3");
  assert.ok(sim.buyUpgrade(0, 'crossing') && sim.buyUpgrade(0, 'platform2'));
  assert.equal(sim.buyLine('units'), true); sim.step(1);
  assert.equal(sim.g.trains.length, 2);
  assert.equal(sim.buyLine('cars'), true); sim.step(1);
  assert.equal(sim.g.trains[0]!.cars, 4);
});

test('pacing: Heaton Chapel is affordable within about an hour of real time at 1x', () => {
  const sim = new Sim(net());
  let minutes: number | null = null;
  for (let m = 1; m <= 120; m++) { sim.advance(60); if (sim.g.cash >= 9000) { minutes = m; break; } }
  assert.ok(minutes !== null && minutes <= 75, `took ${minutes} real minutes`);
});

test('sim: the same seed gives the same game, and a different seed a different one', () => {
  const run = (seed: number) => { const n = net(); const sim = new Sim(n, Sim.fresh(n, seed)); sim.advance(6 * 3600); return `${sim.g.cash.toFixed(2)}|${sim.g.stats.boarded}|${sim.g.stats.lost}|${sim.g.rngState}`; };
  assert.equal(run(7), run(7));
  assert.notEqual(run(7), run(8));
});

test('save: a save from a newer version is refused and a current one passes through', () => {
  assert.throws(() => migrate({ v: SAVE_VERSION + 1 }), SaveError);
  const g = { v: SAVE_VERSION, cash: 1 };
  assert.equal(migrate(g), g);
});

test('sim: passengers who get off are counted at their destination', () => {
  const sim = new Sim(net());
  sim.g.cash = 1e6; sim.buyStation(1);
  sim.advance(3 * 3600);
  const off = sim.state(0).alighted + sim.state(1).alighted + sim.state(4).alighted;
  assert.ok(off > 0, 'someone has arrived somewhere');
  // on their way still: on a train, on a replacement bus, or set down by one to wait for the train on (fare paid)
  const onBus = sim.g.trouble.buses.reduce((a, b) => a + b.load.reduce((n, c) => n + c.n, 0), 0);
  const setDown = sim.g.st.reduce((a, s) => a + s.q.flat().reduce((n, c) => n + (c.paid ? c.n : 0), 0), 0);
  assert.equal(sim.g.st.reduce((a, s) => a + s.alighted, 0) + sim.g.trains.reduce((a, t) => a + t.onboard, 0) + onBus + setDown, sim.g.stats.boarded, 'everyone who boarded has either arrived or is still on their way');
});

// ---- things going wrong (src/sim/trouble.ts) ----
/** A game on seed 1 with Stockport grown, Heaton Chapel and Levenshulme bought and a second unit, run until something
 * goes wrong of the kind wanted (or not at all). */
const troubled = (kind: 'fail' | 'caution', seed = 1) => {
  const n = net(), sim = new Sim(n, Sim.fresh(n, seed)); sim.g.cash = 1e7; growStockport(sim);
  assert.ok(sim.buyStation(1) && sim.buyStation(2) && sim.buyLine('units'));
  for (let k = 0; k < 40 * 3600 && !sim.g.trouble[kind]; k += 10) sim.advance(10);
  return sim;
};

test('trouble: nothing goes wrong in the first sim hour, and the same seed brings the same trouble', () => {
  const run = (seed: number) => {
    const n = net(), sim = new Sim(n, Sim.fresh(n, seed)), t0 = sim.g.t; let first = -1;
    for (let k = 0; k < 24 * 360 && first < 0; k++) { sim.advance(10); if (sim.g.trouble.fail || sim.g.trouble.caution) first = sim.g.t - t0; }
    return { first, at: JSON.stringify(sim.g.trouble) };
  };
  for (const seed of [1, 2, 3, 4]) { const r = run(seed); assert.ok(r.first > TUNING.troubleFrom, `seed ${seed}: first trouble at ${r.first} s`); assert.equal(run(seed).at, r.at); }
});

test("trouble: nothing starts where it would still be going in a peak's busiest hour", () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const n = net(), sim = new Sim(n, Sim.fresh(n, seed)); let was = false;
    for (let k = 0; k < 16 * 360; k++) {
      sim.advance(10); const now = !!(sim.g.trouble.fail || sim.g.trouble.caution), h = sim.hour();
      if (now && !was) assert.ok(!TUNING.troubleCalm.some(([a, b]) => h > a + 0.02 && h < b), `seed ${seed}: trouble began at ${h.toFixed(2)}`);
      was = now;
    }
  }
});

test('trouble: a failed train stands with its line blocked, the one behind waits, buses carry people, and it runs again', () => {
  const sim = troubled('fail'), f = sim.g.trouble.fail!, tr = sim.g.trains.find(t => t.id === f.train)!, s0 = tr.s;
  assert.ok(f.until - f.from <= TUNING.rescue * 1.25 && f.a !== f.b, 'rescued within a few minutes, between two stations');
  // fill the platform behind it with people going its way, so the buses have someone to take
  const A = sim.state(f.a); A.q[f.d].push({ t: sim.g.t, dest: f.b, n: 30, give: sim.g.t + 3600 }); A.waiting += 30;
  let buses = 0;
  while (sim.g.trouble.fail) { sim.advance(5); buses = Math.max(buses, sim.g.trouble.buses.length); if (sim.g.trouble.fail) assert.equal(tr.s, s0, 'it stands where it failed'); }
  for (const o of sim.g.trains) if (o !== tr && o.svc === tr.svc && o.dir === tr.dir && o.state === 'run') assert.ok((tr.s - o.s) * tr.dir >= TUNING.separation - 1 || (tr.s - o.s) * tr.dir < 0, 'the one behind keeps its distance');
  sim.advance(120); assert.notEqual(tr.s, s0, 'rescued, it runs again');
  for (let k = 0; k < 360 && sim.g.trouble.buses.length; k++) sim.advance(10);
  assert.ok(buses > 0 && sim.g.trouble.bused > 0 && !sim.g.trouble.buses.length, `buses ran (${buses}), carried people (${sim.g.trouble.bused}) and went once the line was clear`);
});

test('trouble: a signal failure has trains crawl through the stretch at caution', () => {
  const sim = troubled('caution'), c = sim.g.trouble.caution!;
  let inside = 0;
  while (sim.g.trouble.caution) { sim.advance(2); for (const tr of sim.g.trains) if (tr.s > c.s0 + 50 && tr.s < c.s1 - 50 && tr.state === 'run') { inside++; assert.ok(tr.v <= TUNING.caution + 1e-9, `${tr.v} m/s at caution`); } }
  assert.ok(inside > 0, 'a train ran through it');
});

test('trouble: the spare unit is offered once a train has failed, and halves the rescue', () => {
  const sim = troubled('fail');
  assert.ok(sim.lineReady('spare'));
  const n = net(), fresh = new Sim(n, Sim.fresh(n, 1)); fresh.g.cash = 1e6;
  assert.ok(!fresh.lineReady('spare') && !fresh.buyLine('spare'), 'not before');
  const spareOn = troubled('fail', 2); assert.ok(spareOn.buyLine('spare'));
  while (spareOn.g.trouble.fail) spareOn.advance(10);
  for (let k = 0; k < 400 * 360 && !spareOn.g.trouble.fail; k++) spareOn.advance(10);
  const f = spareOn.g.trouble.fail!; assert.ok(f.until - f.from <= TUNING.rescueSpare * 1.25, `rescued in ${f.until - f.from} s`);
});

test('homes: an owned station grows towards its ceiling, faster with a quicker trip; a locked one stays as it was', () => {
  const run = (units: number) => {
    const sim = new Sim(net(), Sim.fresh(net(), 7)); sim.g.cash = 1e6;
    growStockport(sim); for (let k = 0; k < units; k++) assert.ok(sim.buyLine('units'));
    const q = sim.growthRate(0); sim.grow(3600 * 4);
    return { sim, q, grown: sim.homes(0) - sim.station(0).catchment };
  };
  const one = run(0), three = run(2);
  assert.ok(one.q > 0 && one.q < 1, `Stockport grows at ${one.q}`);
  assert.ok(three.q > one.q && three.grown > one.grown, `more units, shorter waits, quicker growth: ${one.grown.toFixed(1)} -> ${three.grown.toFixed(1)}`);
  for (let i = 1; i < one.sim.S.length; i++) assert.equal(one.sim.homes(i), one.sim.station(i).catchment, `${one.sim.S[i]!.id} is locked and doesn't grow`);
  // it closes on its ceiling and never passes it
  for (let k = 0; k < 50; k++) one.sim.grow(3600 * 4);
  assert.ok(one.sim.homes(0) <= one.sim.ceiling(0) && one.sim.homes(0) > one.sim.ceiling(0) - 2, `${one.sim.homes(0)} of ${one.sim.ceiling(0)}`);
  assert.ok(net().stations.every(s => (s.ceiling ?? 0) > s.catchment), 'every station has room to grow');
});

test('homes: growth is slow (a few game days, not minutes), saved, and brings more trips', () => {
  const sim = new Sim(net(), Sim.fresh(net(), 3));
  const before = sim.tripRates(0, 8), h0 = sim.homes(0);
  sim.advance(3600);   // a quarter of a game day
  const gap = sim.ceiling(0) - h0, grew = sim.homes(0) - h0;
  assert.ok(grew > 0 && grew < 0.05 * gap, `a sim hour closes ${(100 * grew / gap).toFixed(1)}% of the gap`);
  const g = JSON.parse(JSON.stringify(sim.g)), again = new Sim(net(), g);
  assert.equal(again.homes(0), sim.homes(0), 'homes are saved');
  sim.g.homes[0] = sim.ceiling(0);
  assert.ok(sim.tripRates(0, 8) > before * 1.05, 'more homes, more trips');
});
