// The line between stations (docs/briefs/line-between-stations.md): each section's line speed starts where the game's
// is on the stopper's line and at the real speed where that's lower on the lines out, rises 15 mph a step to 90 once
// the section is the player's, and its trains run it (and the timetable plans it) at that speed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo, LAYOUT } from '../src/sim/network.ts';
import { Sim } from '../src/sim/sim.ts';
import type { NetworkGeoDef } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const net = fromGeo(def);
const fresh = () => { const sim = new Sim(net, Sim.fresh(net, 1)); sim.g.cash = 1e7; return sim; };
const sec = (sim: Sim, a: string, b: string) => sim.P.all.find(p => p.kind === 'section' && p.name.startsWith(a) && p.name.endsWith(b))!.id;

test('sections: the stopper\'s line starts at the game\'s 75 mph, the lines out at their real speed where lower', () => {
  const sim = fresh();
  assert.ok(sim.P.stopperSections.length >= 6, `the stopper runs over ${sim.P.stopperSections.length} sections`);
  for (const k of sim.P.stopperSections) { const x = sim.sectionAt(k)!; assert.equal(x.mph, 75, k); assert.equal(x.steps, 1, k); }
  const marple = sim.sectionAt(sec(sim, 'Romiley', 'Bredbury'))!;
  assert.ok(marple.mph === 50, `Romiley – Bredbury starts at its real 50 mph, not ${marple.mph}`);
  assert.ok(marple.steps >= 2 && marple.price! > 1000, 'and has steps to 90');
});

test('sections: the data has a speed for every section of every corridor, in order', () => {
  const sim = fresh();
  for (const c of def.corridors) assert.equal(def.sections?.[c.id]?.mph.length, sim.secs.filter(x => x.corridor === c.id).length, c.id);
});

test('sections: a step is offered once both ends are owned, raises the line speed, and speeds the rides through it', () => {
  const sim = fresh(), k = sec(sim, 'Heaton Chapel', 'Levenshulme'), stopper = sim.svcs[0]!;
  const hc = net.station('heaton-chapel').index, lev = net.station('levenshulme').index;
  assert.ok(!sim.canBuy(k, 'speed'), 'not before its stations are owned');
  assert.ok(sim.buyStation(hc) && sim.buyStation(lev));
  const v0 = sim.runSpeed(stopper, hc, lev), price = sim.price(k, 'speed')!;
  assert.ok(sim.canBuy(k, 'speed') && sim.buy(k, 'speed'));
  assert.equal(sim.sectionAt(k)!.mph, 90);
  assert.ok(sim.runSpeed(stopper, hc, lev) > 1.15 * v0, 'trains run it faster');
  assert.equal(sim.price(k, 'speed'), undefined, 'and it has no more steps');
  assert.ok(Math.abs(price - 3300 * sim.sectionAt(k)!.miles) <= 500, `a step costs about £3,300 a mile (${price})`);
  assert.equal(sim.g.line.timetable, 0, 'the new signals come once the whole stopper\'s line is raised');
  for (const s of sim.P.stopperSections) sim.grant(s, 'speed');
  assert.equal(sim.g.line.timetable, 1);
});

test('sections: resignalling re-lays its signal sites closer, no block shorter than a train and its overlap', () => {
  const sim = fresh(), k = sec(sim, 'Heaton Chapel', 'Levenshulme'), x = sim.secs.find(q => q.id === k)!;
  const inside = (a: number[]) => a.filter(s => s >= x.s0 && s <= x.s1);
  const before = inside(sim.sites(x.corridor)), blocks0 = sim.blocks('down-slow').at.length;
  assert.ok(!sim.canBuy(k, 'signals'), 'not before its stations are owned');
  assert.ok(sim.buyStation(net.station('heaton-chapel').index) && sim.buyStation(net.station('levenshulme').index));
  const price = sim.price(k, 'signals')!;
  assert.ok(Math.abs(price - 5000 * x.miles) <= 500, `it costs about £5,000 a mile (${price})`);
  assert.ok(sim.buy(k, 'signals') && sim.resignalled(k) && !sim.canBuy(k, 'signals'), 'bought once');
  const after = inside(sim.sites(x.corridor));
  assert.ok(after.length > before.length, `${before.length} sites -> ${after.length}`);
  assert.equal(after[0], before[0]); assert.equal(after[after.length - 1], before[before.length - 1], 'the run\'s ends stay where they were');
  const B = sim.blocks('down-slow');
  assert.ok(B.at.length > blocks0, 'the slow line has more blocks');
  for (let i = 1; i < B.at.length; i++) assert.ok(B.at[i]! - B.at[i - 1]! >= LAYOUT.block - 1e-6, `block ${i} is ${B.at[i]! - B.at[i - 1]!} m`);
});

test('sections: a resignalled section\'s signals fail less often', () => {
  // the same game twice to the same hour, the stopper's whole line resignalled in one: fewer signal failures there
  const run = (resignal: boolean) => {
    let n = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const sim = new Sim(net, Sim.fresh(net, seed)); sim.g.cash = 1e7;
      if (resignal) for (const k of sim.P.stopperSections) sim.grant(k, 'signals');
      for (let t = 0; t < 30 * 3600; t++) sim.step(1);
      n += sim.g.trouble.signals;
    }
    return n;
  };
  const plain = run(false), resignalled = run(true);
  assert.ok(resignalled < 0.75 * plain, `${plain} signal failures -> ${resignalled}`);
});
