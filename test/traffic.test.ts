// The car in the sim (src/sim/traffic.ts, docs/design/gridlock.md §2): who drives, the road stretches' loads and
// queues, and that working them out changes nothing the sim does. node:test, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.ts';
import { Sim, TUNING } from '../src/sim/sim.ts';
import { traffic, trafficKey, cars, wouldTravel, type TrafficDef } from '../src/sim/traffic.ts';
import type { NetworkGeoDef } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const D = JSON.parse(readFileSync(new URL('../src/data/traffic.json', import.meta.url), 'utf8')) as TrafficDef;
const net = fromGeo(def);
const fresh = (seed = 1) => { const sim = new Sim(net, Sim.halt(net, seed)); sim.g.cash = 1e7; return sim; };
const road = (sim: Sim, id: string, h = 8) => { const r = traffic(sim, TUNING, D, h).roads.find(x => x.id === id); assert.ok(r, id); return r; };
/** The main line to Piccadilly with everything bought: its stations, each one's stages, and the line's units and cars. */
function mainLine(): Sim {
  const sim = fresh();
  assert.ok(sim.buyUpgrade(0, 'crossing') && sim.buyUpgrade(0, 'platform2') && sim.buyLine('units'));
  for (const id of ['heaton-chapel', 'levenshulme', 'ardwick', 'piccadilly']) assert.ok(sim.buy(sim.P.station[net.station(id).index]!), id);
  for (let i = 0; i < sim.S.length; i++) if (sim.g.owned[i]) for (const u of ['crossing', 'platform2', 'building', 'barriers', 'lifts', 'canopy', 'platforms', 'carpark', 'carpark2'] as const) sim.buyUpgrade(i, u);
  assert.ok(sim.buyLine('units') && sim.buyLine('cars'));
  return sim;
}

test('traffic: pure, the same answer twice, and its key moves with a purchase and the clock', () => {
  const sim = fresh();
  assert.deepEqual(traffic(sim, TUNING, D, 8.25), traffic(sim, TUNING, D, 8.25));
  const k = trafficKey(sim, D);
  assert.equal(trafficKey(sim, D), k);
  assert.ok(sim.buyUpgrade(0, 'crossing'));
  assert.notEqual(trafficKey(sim, D), k);
});

test('traffic: every stretch is a real count with its source, and the network\'s drives land on the A6 and the M60', () => {
  for (const s of D.stretches) {
    assert.ok(s.countPoint > 0 && s.aadf > 0 && s.year === 2024, s.id);
    assert.ok(s.serves.flatMap(x => [...x.a, ...x.b]).every(n => n.startsWith('corridor:') || def.stations.some(st => st.id === n)), `${s.id} names only real stations or corridors`);
  }
  const t = traffic(fresh(), TUNING, D, 8);
  for (const r of t.roads) assert.ok(r.through >= 0 && r.cars >= r.through, r.id);
  assert.ok(road(fresh(), 'a6-mersey-square').cars > road(fresh(), 'a6-mersey-square').through, 'the network\'s would-be riders drive on the A6');
});

test('traffic: a shut station\'s pairs all drive', () => {
  const sim = fresh(), i = net.station('heaton-chapel').index, j = net.station('levenshulme').index;
  assert.ok(!sim.g.owned[i] && !sim.g.owned[j]);
  for (const h of [8, 17.5]) {
    assert.ok(wouldTravel(sim, TUNING, i, j, h) > 0);
    assert.equal(cars(sim, TUNING, i, j, h), wouldTravel(sim, TUNING, i, j, h) * TUNING.carShare);
  }
  // Stockport to Piccadilly runs from the start, so fewer of its people drive
  const s = 0, p = net.station('piccadilly').index;
  assert.ok(cars(sim, TUNING, s, p, 8) < wouldTravel(sim, TUNING, s, p, 8) * TUNING.carShare);
});

test('traffic: reopening the main line lowers the A6\'s load at the morning peak to about capacity, and leaves the M60 crawling', () => {
  const today = fresh(), main = mainLine();
  const before = road(today, 'a6-mersey-square'), after = road(main, 'a6-mersey-square');
  assert.ok(before.load > 1.05 && before.load <= 1.25, `the A6 at Mersey Square past capacity at the start: ${before.load}`);
  assert.ok(after.load < before.load && Math.abs(after.load - 0.95) < 0.05, `about 0.95 with the main line: ${after.load}`);
  for (const id of ['a6-heaton-chapel', 'a6-levenshulme', 'a6-longsight', 'a6-ardwick']) assert.ok(Math.abs(road(main, id).load - 0.95) < 0.05, id);
  assert.ok(road(main, 'm60-j1-j2').load > 1.1, 'the M60 is mostly traffic going round Manchester');
  const t = traffic(main, TUNING, D, 8);
  assert.ok(t.off > traffic(today, TUNING, D, 8).off && t.cars < t.start, 'more cars off the road');
});

test('traffic: queues grow past capacity and drain under it', () => {
  const sim = fresh(), id = 'a6-davenport';
  assert.equal(road(sim, id, 5).queue, 0, 'nothing queued at 05:00');
  const q730 = road(sim, id, 7.5), q830 = road(sim, id, 8.5), noon = road(sim, id, 13);
  assert.ok(q730.queue > 0 && q830.queue > q730.queue, `growing through the peak: ${q730.queue} then ${q830.queue}`);
  assert.equal(q830.speed, D.crawl, 'a crawl in the queue');
  assert.ok(q830.drive > q830.free);
  assert.equal(noon.queue, 0, 'drained by midday');
  assert.ok(noon.speed > D.crawl && noon.load < 1);
});

test('traffic: working it out changes nothing the sim does', () => {
  const a = fresh(2), b = fresh(2);
  for (let k = 0; k < 120; k++) { a.advance(60); b.advance(60); traffic(b, TUNING, D); trafficKey(b, D); }
  assert.equal(JSON.stringify(a.g), JSON.stringify(b.g));
});
