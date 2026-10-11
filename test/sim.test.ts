// The sim's tests: the network's geometry, the demand curve, boarding and money, termini, buying in order, pacing, the
// seed, and saves. node:test, no browser; run with npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.ts';
import { Sim, demandCurve } from '../src/sim/sim.ts';
import { migrate, SAVE_VERSION, SaveError } from '../src/sim/save.ts';
import type { NetworkGeoDef } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const net = () => fromGeo(def);

test('network: stations sit on the corridor in order, roughly the real distances apart', () => {
  const n = net();
  const s = n.stations.map(x => x.s);
  for (let i = 1; i < s.length; i++) assert.ok(s[i]! > s[i - 1]!, 'stations increase along the corridor');
  const total = s[s.length - 1]! - s[0]!;
  assert.ok(total > 8500 && total < 11000, `Stockport to Piccadilly should be about 9.5 km, got ${total.toFixed(0)}`);
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
interface KitFaces { faces: Record<'north' | 'south', { v: number }>; parts: { type: string; v0?: number; v1?: number; u0?: number; u1?: number }[] }
const kit = (id: string) => JSON.parse(readFileSync(new URL(`../src/data/kits/${id}.json`, import.meta.url), 'utf8')) as KitFaces;
const stopper = def.services?.find(s => s.id === 'stopper');

test('tracks: the stopper stands just clear of the platform its passengers wait on, at every station', () => {
  const n = net();
  if (!stopper) throw new Error('no stopper');
  for (const st of n.stations) {
    const k = kit(st.kit);
    for (const dir of ['north', 'south'] as const) {
      const tv = n.offsetAt(stopper.tracks[dir], st.s), fv = k.faces[dir].v, side = Math.sign(fv - tv);
      // the platform the face stands on: the one whose edge nearest the track is between the track and the face
      const edges = k.parts.filter(p => p.type === 'platform' && p.v0 !== undefined && p.v1 !== undefined && !('upgrade' in p))
        .map(p => side > 0 ? p.v0! : p.v1!).filter(e => (e - tv) * side > 0 && (fv - e) * side >= 0);
      assert.ok(edges.length, `${st.id} ${dir}: a platform between the track at ${tv.toFixed(2)} and the face at ${fv}`);
      const gap = Math.min(...edges.map(e => Math.abs(e - tv)));
      // trains are drawn 3.64 m wide: the edge clears half of that and is close enough to step across
      assert.ok(gap >= 1.95 && gap <= 3, `${st.id} ${dir}: platform edge ${gap.toFixed(2)} m from the track`);
    }
  }
});

test('tracks: a train turning round at either end stays on the track it came in on', () => {
  const n = net();
  if (!stopper) throw new Error('no stopper');
  for (const st of [n.stations[0]!, n.stations[n.stations.length - 1]!])
    assert.equal(n.offsetAt(stopper.tracks.north, st.s), n.offsetAt(stopper.tracks.south, st.s), `${st.id}: both directions in one platform`);
});

test('tracks: on the open line and through the stations the four tracks keep clear of each other', () => {
  const n = net(), ids = n.tracks.map(t => t.id);
  const between = n.stations.slice(1).map((st, i) => (st.s + n.stations[i]!.s) / 2);
  for (const s of [...n.stations.slice(1, -1).map(st => st.s), ...between]) {
    const o = ids.map(id => n.offsetAt(id, s)).sort((a, b) => a - b);
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
  sim.advance(4 * 3600 / 6);     // 06:30 to 10:30 on the clock, through the morning peak
  assert.ok(sim.g.stats.lost > 50, `expected lost passengers under pressure, got ${sim.g.stats.lost}`);
});

test('sim: line upgrades add units and lengthen trains', () => {
  const sim = new Sim(net());
  sim.g.cash = 1e6;
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
  assert.equal(sim.g.st.reduce((a, s) => a + s.alighted, 0) + sim.g.trains.reduce((a, t) => a + t.onboard, 0), sim.g.stats.boarded, 'everyone who boarded has either arrived or is still on a train');
});
