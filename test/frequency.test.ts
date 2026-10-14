// Frequency (docs/DESIGN.md, Frequency): each local service's timetable is stages to buy on its card, a second unit,
// then the real off-peak and peak patterns; every unit bought runs (and so shows on the map), and a peak unit rests
// at its end between the peaks, holding no platform and taking nobody on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.ts';
import { Sim } from '../src/sim/sim.ts';
import { simAtHour } from '../src/sim/day.ts';
import type { NetworkGeoDef } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const net = fromGeo(def);
const st = (id: string) => `station:${id}`;

test('frequency: every local service has its steps, a branch\'s offered once it runs, each bought unit in service', () => {
  for (const v of def.services ?? []) if (!v.through) assert.ok(v.frequency?.steps.length && v.frequency.note, `${v.id} has a frequency with a note`);
  const sim = new Sim(net, Sim.fresh(net, 1)); sim.g.cash = 1e7;
  const hg = sim.svc('hazel-grove');
  assert.equal(sim.price('route:hazel-grove', 'units'), 15000);
  assert.ok(!sim.canBuy('route:hazel-grove', 'units'), 'not before the line runs');
  sim.grant(st('davenport')); sim.grant(st('woodsmoor')); sim.grant(st('hazel-grove'));
  assert.equal(sim.unitsFor(hg), 1);
  assert.ok(sim.buy('route:hazel-grove', 'units')); sim.ensureTrains();
  assert.equal(sim.unitsFor(hg), 2); assert.equal(sim.g.trains.filter(t => t.svc === 'hazel-grove').length, 2);
  assert.ok(sim.buy('route:hazel-grove', 'units') && sim.buy('route:hazel-grove', 'units'));
  assert.equal(sim.unitsAllDay(hg), 3); assert.equal(sim.unitsPeak(hg), 1); assert.equal(sim.unitsFor(hg), 4);
  assert.equal(sim.price('route:hazel-grove', 'units'), undefined, 'all bought');
  assert.equal(sim.g.trains.filter(t => t.svc === 'hazel-grove').length, 4);
});

test('frequency: a peak unit runs in the peaks and rests in Stockport\'s sidings between them, holding no platform', () => {
  const sim = new Sim(net, Sim.fresh(net, 2)); sim.g.cash = 1e7;
  sim.grant(st('stockport'), 'crossing'); sim.grant(st('stockport'), 'platform2'); sim.grant(st('heaton-chapel'));
  for (let k = 0; k < 3; k++) assert.ok(sim.buy('route:stopper', 'units'));
  const v = sim.svc('stopper'); assert.equal(sim.unitsFor(v), 4); assert.equal(sim.unitsAllDay(v), 3);
  sim.ensureTrains();
  const peak = sim.g.trains.filter(t => t.svc === 'stopper')[3]!; assert.ok(sim.peakUnit(peak) && !sim.peakUnit(sim.g.trains[0]!));
  // play to midday: by then it has rested, away in the sidings
  let rested = false, ranInPeak = false;
  const until = (t: number) => { while (sim.g.t < t) { sim.step(2); if (peak.state === 'away') rested = true; if (peak.state === 'run' && sim.inPeak(sim.g.t)) ranInPeak = true; } };
  until(simAtHour(1, 13));
  assert.ok(rested && peak.state === 'away', 'rests between the peaks');
  assert.equal(peak.pfAt, -1, 'holding no platform');
  assert.ok(sim.headway('stopper') > 0);
  rested = false; until(simAtHour(1, 17.5));
  assert.ok(ranInPeak && peak.state !== 'away', 'out again in the evening peak');
  until(simAtHour(1, 22));
  assert.equal(peak.state, 'away', 'and back in the sidings after it');
  assert.equal(peak.onboard, 0);
});

test('frequency: the same seed plays the same with a peak timetable', () => {
  const run = () => {
    const sim = new Sim(net, Sim.fresh(net, 3)); sim.g.cash = 1e7;
    sim.grant(st('stockport'), 'crossing'); sim.grant(st('stockport'), 'platform2'); sim.grant(st('heaton-chapel')); sim.grant(st('levenshulme'));
    for (let k = 0; k < 3; k++) sim.buy('route:stopper', 'units');
    sim.advance(3 * 3600);
    return JSON.stringify([sim.g.stats, sim.g.trains.map(t => [t.state, Math.round(t.s)])]);
  };
  assert.equal(run(), run());
});
