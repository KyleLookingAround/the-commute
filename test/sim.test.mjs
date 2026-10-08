import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.js';
import { Sim, demandCurve } from '../src/sim/sim.js';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8'));
const net = () => fromGeo(def);

test('network: stations sit on the corridor in order, roughly the real distances apart', () => {
  const n = net();
  const s = n.stations.map(x => x.s);
  for (let i = 1; i < s.length; i++) assert.ok(s[i] > s[i - 1], 'stations increase along the corridor');
  const total = s[s.length - 1] - s[0];
  assert.ok(total > 8500 && total < 11000, `Stockport to Piccadilly should be about 9.5 km, got ${total.toFixed(0)}`);
  const p = n.corridor('main').at(n.byId['stockport'].s);
  assert.ok(Math.abs(p.x) < 1 && Math.abs(p.z) < 1, 'origin is Stockport');
});

test('network: track offsets are perpendicular to the corridor', () => {
  const n = net(), c = n.corridor('main');
  const a = c.at(5000, 0), b = c.at(5000, 19);
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 19) < 1e-6);
  assert.ok(Math.abs((b.x - a.x) * a.dx + (b.z - a.z) * a.dz) < 1e-6, 'offset is perpendicular to travel');
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
  assert.ok(sim.g.st[0].boarded > 0, 'passengers boarded at Stockport');
  assert.equal(sim.g.st[1].waiting, 0, 'locked stations generate nobody');
});

test('sim: trains reverse at termini and board the departure direction', () => {
  const sim = new Sim(net());
  const seenDirs = new Set();
  for (let k = 0; k < 600; k++) { sim.advance(10); seenDirs.add(sim.g.trains[0].dir); }
  assert.deepEqual([...seenDirs].sort(), [-1, 1]);
  const tr = sim.g.trains[0];
  assert.ok(tr.s >= sim.S[0].s - 1 && tr.s <= sim.S[4].s + 1, 'train stays on the line');
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
  sim.advance(4 * 3600);     // 06:30 to 10:30, through the morning peak
  assert.ok(sim.g.stats.lost > 200, `expected lost passengers under pressure, got ${sim.g.stats.lost}`);
});

test('sim: line upgrades add units and lengthen trains', () => {
  const sim = new Sim(net());
  sim.g.cash = 1e6;
  assert.equal(sim.buyLine('units'), true); sim.step(1);
  assert.equal(sim.g.trains.length, 2);
  assert.equal(sim.buyLine('cars'), true); sim.step(1);
  assert.equal(sim.g.trains[0].cars, 4);
});

test('pacing: Heaton Chapel is affordable within about 20 real minutes at 6x game time', () => {
  const sim = new Sim(net());
  let minutes = null;
  for (let m = 1; m <= 60; m++) { sim.advance(60 * 6); if (sim.g.cash >= 9000) { minutes = m; break; } }
  assert.ok(minutes !== null && minutes <= 35, `took ${minutes} real minutes`);
});

test('sim: the same seed gives the same game, and a different seed a different one', () => {
  const run = seed => { const n = net(); const sim = new Sim(n, Sim.fresh(n, seed)); sim.advance(6 * 3600); return `${sim.g.cash.toFixed(2)}|${sim.g.stats.boarded}|${sim.g.stats.lost}|${sim.g.rngState}`; };
  assert.equal(run(7), run(7));
  assert.notEqual(run(7), run(8));
});

test('save: a save from a newer version is refused and a current one passes through', async () => {
  const { migrate, SAVE_VERSION, SaveError } = await import('../src/sim/save.js');
  assert.throws(() => migrate({ v: SAVE_VERSION + 1 }), SaveError);
  const g = { v: SAVE_VERSION, cash: 1 };
  assert.equal(migrate(g), g);
});
