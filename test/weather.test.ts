// The weather's tests: seeded and saved, spells by the season, the first day dry, and what rain, leaves and snow do
// to journeys. node:test, no browser; run with npm test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.ts';
import { Sim, TUNING } from '../src/sim/sim.ts';
import { WEATHER, seasonAt, yearAt, feel } from '../src/sim/weather.ts';
import type { NetworkGeoDef, Sky } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const net = () => fromGeo(def);
const DAY = 86400 / TUNING.dayRate;   // sim seconds in a game day

/** The spells a seed sees over some game days, a game minute at a time: how long each kind lasted, in game minutes. */
function spells(seed: number, days: number): { kinds: Record<string, number>; firstDay: Set<Sky>; sim: Sim } {
  const sim = new Sim(net(), Sim.fresh(net(), seed)), kinds: Record<string, number> = {}, firstDay = new Set<Sky>();
  for (let k = 0; k < days * 24 * 60; k++) {
    sim.advance(60 / TUNING.dayRate * 60 / 60);
    const w = sim.g.weather.now; kinds[w] = (kinds[w] ?? 0) + 1;
    if (sim.g.day === 1) firstDay.add(w);
  }
  return { kinds, firstDay, sim };
}

test('weather: the clock rate it keeps is the sim\'s', () => assert.equal(WEATHER.dayRate, TUNING.dayRate));

test('weather: the same seed brings the same weather, and the weather never moves the rest of the game\'s dice', () => {
  const a = new Sim(net(), Sim.fresh(net(), 7)), b = new Sim(net(), Sim.fresh(net(), 7));
  a.advance(3 * DAY); b.advance(3 * DAY);
  assert.deepEqual(a.g.weather, b.g.weather);
  // with nobody feeling it, a game plays exactly as one without weather would: its own random numbers
  WEATHER.felt = false;
  try {
    const c = new Sim(net(), Sim.fresh(net(), 7)), d = new Sim(net(), Sim.fresh(net(), 7));
    d.g.weather.rngState = 12345;   // other weather entirely
    c.advance(DAY); d.advance(DAY);
    assert.equal(c.g.rngState, d.g.rngState); assert.equal(c.g.stats.boarded, d.g.stats.boarded);
  } finally { WEATHER.felt = true; }
});

test('weather: the year turns a season every two game days from spring, and rain is common but rarely all day', () => {
  const t0 = Sim.fresh(net(), 1).t;
  assert.equal(seasonAt(t0), 0, 'a new game starts in spring');
  assert.equal(seasonAt(t0 + 2 * DAY), 1); assert.equal(seasonAt(t0 + 4 * DAY), 2); assert.equal(seasonAt(t0 + 6 * DAY), 3); assert.equal(seasonAt(t0 + 8 * DAY), 0);
  assert.ok(Math.abs(yearAt(t0 + 8 * DAY) - yearAt(t0)) < 1e-9, 'a year is eight game days');
  let wet = 0, all = 0, snow = 0;
  for (const seed of [1, 2, 3, 4]) {
    const { kinds, firstDay } = spells(seed, 8);
    assert.ok(!firstDay.has('rain') && !firstDay.has('snow'), `seed ${seed}: the first day stays dry`);
    wet += (kinds['rain'] ?? 0) + (kinds['snow'] ?? 0); snow += kinds['snow'] ?? 0;
    all += Object.values(kinds).reduce((p, q) => p + q, 0);
  }
  assert.ok(wet / all > 0.1 && wet / all < 0.35, `wet ${(100 * wet / all).toFixed(0)}% of the time`);
  assert.ok(snow > 0, 'some snow in a year of four seeds');
});

test('weather: rain makes the walk and an open wait feel longer, a canopy keeps it off; snow slows trains and keeps some home', () => {
  const sim = new Sim(net(), Sim.fresh(net(), 1)), g = sim.g;
  assert.ok(sim.buyStation(1) || (g.cash = 1e6, sim.buyStation(1)));
  const dry = sim.journey(0, 1)!.felt;
  g.weather.now = 'rain'; sim.refreshJourneys();
  const wet = sim.journey(0, 1)!.felt;
  assert.ok(wet > dry * 1.05 && wet < dry * 1.3, `rain: ${(dry / 60).toFixed(1)} to ${(wet / 60).toFixed(1)} felt minutes, gently`);
  g.cash = 1e6; for (const i of [0, 1]) sim.buyUpgrade(i, 'canopy'); sim.refreshJourneys();
  const covered = sim.journey(0, 1)!.felt;
  g.weather.now = 'sun'; sim.refreshJourneys();
  const coveredDry = sim.journey(0, 1)!.felt;
  assert.ok(covered - coveredDry < wet - dry, 'a canopy takes some of the rain away');
  const v = sim.vmax(); g.weather.now = 'snow';
  assert.ok(sim.vmax() < v && feel(g).travel < 1, 'snow slows the line and a few stay home');
});

test('weather: leaves on the line slow trains a little in autumn, less with the faster timetable', () => {
  const sim = new Sim(net(), Sim.fresh(net(), 1)), g = sim.g, v = sim.vmax();
  g.t += 4 * DAY; assert.equal(seasonAt(g.t), 2);
  g.weather.now = 'sun';
  assert.ok(sim.vmax() < v && sim.vmax() > 0.85 * v, 'leaves slow the line a little');
  const leaves = sim.vmax() / v; g.line.timetable = 1;
  assert.ok(sim.vmax() / TUNING.vmaxFast > leaves, 'the new signals help');
});
