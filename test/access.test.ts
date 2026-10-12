// Car parks and bus links (src/sim/access.ts): drivers and bus riders from beyond a walk, the car park's spaces filling
// and emptying, the charge, and the Interchange. node:test, no browser.
import { test } from 'node:test';
import { clockAt, simAt, simAtHour } from '../src/sim/day.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.ts';
import { Sim, TUNING } from '../src/sim/sim.ts';
import { spaces, parked, accessReach } from '../src/sim/access.ts';
import type { NetworkGeoDef } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const net = () => fromGeo(def);
/** A game with Stockport built up (a way across, platform 3 and a second unit) and money to spend. */
function built(seed = 3): Sim {
  const sim = new Sim(net(), Sim.fresh(net(), seed)); sim.g.cash = 1e6;
  assert.ok(sim.buyUpgrade(0, 'crossing') && sim.buyUpgrade(0, 'platform2') && sim.buyLine('units'));
  return sim;
}

test('access: no pool travels until a car park or bus link is built, and nothing else changes', () => {
  const a = built(), b = built();
  a.advance(1800); b.advance(1800);
  assert.equal(a.g.stats.car + a.g.stats.bus, 0);
  assert.equal(a.g.stats.boarded, b.g.stats.boarded);
  assert.ok(!a.visibleUpgrades(0).some(u => u.id === 'carpark2'), 'the bigger car park waits on the first');
  assert.ok(!a.visibleUpgrades(a.net.station('ardwick').index).some(u => u.id === 'carpark'), 'only where the real station has one');
});

test('access: a car park fills over the morning, charges each car, turns the rest away once full, and empties by night', () => {
  const sim = built(), S = sim.state(0), cash = sim.g.cash;
  assert.ok(sim.buyUpgrade(0, 'carpark'));
  assert.equal(parked(S), 0, 'it opens empty');
  const cap = spaces(sim, 0); assert.ok(cap > 0);
  // from 06:30 to midday by the clock
  sim.advance(simAtHour(1, 12) - sim.g.t);
  assert.ok(S.car > 0, 'drivers came'); assert.equal(sim.g.stats.car, S.car);
  assert.ok(parked(S) <= cap, 'never more cars than spaces');
  assert.equal(parked(S), cap, 'full by midday at Stockport');
  assert.ok(S.revenue >= S.car * TUNING.parkCharge, 'each car pays'); void cash;
  const came = S.car; sim.advance(simAt(clockAt(sim.g.t) + 3600) - sim.g.t);
  assert.equal(S.car, came, 'once full, the rest don\'t come');
  // through the evening and the night
  sim.advance(simAtHour(2, 2) - sim.g.t);
  assert.ok(parked(S) < cap / 2, `emptied in the evening (${parked(S)} left)`);
  assert.ok(sim.buyUpgrade(0, 'carpark2')); assert.ok(spaces(sim, 0) > cap, 'the second stage adds spaces');
});

test('access: the Interchange brings people by bus and its buses reach further', () => {
  const sim = built(), S = sim.state(0);
  assert.equal(accessReach(sim, TUNING, 0), 0);
  assert.ok(sim.buyUpgrade(0, 'bus'));
  sim.advance(simAtHour(1, 8.5) - sim.g.t);
  assert.ok(S.bus > 0, 'people came by bus'); assert.equal(sim.g.stats.bus, S.bus);
  assert.ok(accessReach(sim, TUNING, 0) > 2000, 'the outer ring reaches kilometres out');
});

test('access: the same seed gives the same game with car parks and buses', () => {
  const run = () => { const sim = built(7); sim.buyUpgrade(0, 'carpark'); sim.buyUpgrade(0, 'bus'); sim.advance(3600); return JSON.stringify(sim.g); };
  assert.equal(run(), run());
});
