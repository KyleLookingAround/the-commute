// The game's clock (src/sim/day.ts): the peaks at the old rate, the hours between about twice as fast, the night in
// about two real minutes, eased so it never jumps, and each clock hour carrying the trips it did. node:test, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.ts';
import { Sim } from '../src/sim/sim.ts';
import { BASE, DAY, clockAt, clockText, dayAt, hourAt, pace, rateAtHour, simAt, simAtHour } from '../src/sim/day.ts';
import type { NetworkGeoDef } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const REAL = 3;   // sim seconds a real second at 1x (GAME_PER_REAL)
const realMin = (a: number, b: number) => (b - a) / REAL / 60;

test('day: the peaks run as before, the night passes in about two real minutes, and a day is about 45 minutes at 1x', () => {
  for (const h of [7, 8, 9, 16.5, 17.5, 18.5]) assert.equal(rateAtHour(h), BASE, `the peak at ${h}`);
  for (const h of [11, 13, 15, 20, 21]) assert.ok(Math.abs(rateAtHour(h) - 2 * BASE) < 1e-9, `between the peaks at ${h}`);
  const night = realMin(simAtHour(1, 23), simAtHour(2, 5));
  assert.ok(night > 1.5 && night < 3, `the night took ${night.toFixed(2)} real minutes`);
  const day = DAY / REAL / 60;
  assert.ok(day >= 40 && day <= 46, `a day took ${day.toFixed(1)} real minutes`);
});

test('day: the clock and sim time map both ways, the clock never jumps or runs back, and days count from 1', () => {
  let was = -1, most = 0;
  for (let t = 0; t < 3 * DAY; t += 1.7) {
    const c = clockAt(t);
    assert.ok(Math.abs(simAt(c) - t) < 1e-6, `round trip at ${t}`);
    assert.ok(c > was, `the clock ran back at ${t}`);
    if (was >= 0) most = Math.max(most, (c - was) / 1.7);
    was = c;
  }
  assert.ok(most < 61, `the fastest the clock ran was ${most.toFixed(1)} clock seconds a sim second`);
  // the rate eases: no step of a clock minute changes it by more than a twentieth
  for (let m = 0; m < 1440; m++) { const a = rateAtHour(m / 60), b = rateAtHour((m + 1) / 60); assert.ok(Math.abs(b / a - 1) < 0.05, `the rate jumped at minute ${m}`); }
  assert.equal(dayAt(0), 1); assert.equal(dayAt(DAY - 1e-6), 1); assert.equal(dayAt(DAY), 2);
  assert.equal(clockText(simAtHour(2, 6.5)), '06:30'); assert.ok(Math.abs(hourAt(simAtHour(3, 17.25)) - 17.25) < 1e-9);
  assert.equal(pace(simAtHour(1, 8)), 1); assert.ok(pace(simAtHour(1, 2)) > 5);
});

test('day: the sim counts days and reads the hour by the clock', () => {
  const n = fromGeo(def), sim = new Sim(n, Sim.fresh(n, 1));
  assert.equal(sim.clock(), '06:30'); assert.equal(sim.g.day, 1);
  sim.advance(simAtHour(2, 0) + 0.5 - sim.g.t);
  assert.equal(sim.g.day, 2); assert.equal(sim.clock(), '00:00');
  sim.advance(simAtHour(2, 12) + 0.5 - sim.g.t);
  assert.equal(sim.clock(), '12:00'); assert.equal(sim.g.day, 2);
});

test('day: each clock hour carries the trips it did, however fast the clock runs', () => {
  // a clock hour between the peaks is half the sim time it was, and brings the trips it did: tripRates' sim hour at
  // the peaks' rate is BASE clock hours
  const n = fromGeo(def), sim = new Sim(n, Sim.fresh(n, 1)); sim.g.t = simAtHour(1, 12);
  const t1 = simAtHour(1, 13), want = sim.tripRates(0, 12.5) / BASE;
  assert.ok(Math.abs((t1 - sim.g.t) - 3600 / (2 * BASE)) < 1e-6, 'an hour between the peaks is 300 sim seconds');
  while (sim.g.t < t1) { sim.generate(0, (clockAt(sim.g.t + 2) - clockAt(sim.g.t)) / BASE); sim.g.t += 2; }
  const got = sim.state(0).waiting + sim.state(0).lost;
  assert.ok(Math.abs(got - want) / want < 0.1, `an hour brought ${got}, about ${want.toFixed(0)} expected`);
});
