// Through to Manchester (docs/DESIGN.md, Through to Manchester): the Hazel Grove line's stage, offered once Piccadilly's
// shed and bays are built, runs its trains on from Stockport to Piccadilly by Heaton Chapel and Levenshulme, so nobody changes at
// Stockport, and its units carry on from where they are.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.ts';
import { Sim } from '../src/sim/sim.ts';
import type { NetworkGeoDef } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const net = fromGeo(def);
const st = (id: string) => `station:${id}`;
const idx = (id: string) => net.station(id).index;

test('through: offered once Piccadilly\'s shed and bays are built, it runs the Hazel Grove trains on to Piccadilly with no change', () => {
  const sim = new Sim(net, Sim.halt(net, 1)); sim.g.cash = 1e7;
  for (const id of ['heaton-chapel', 'levenshulme', 'ardwick', 'davenport', 'woodsmoor']) sim.grant(st(id));
  sim.grant(st('stockport'), 'crossing'); sim.grant(st('stockport'), 'platform2'); sim.grant(st('stockport'), 'platforms');
  for (const id of ['davenport', 'woodsmoor', 'levenshulme', 'heaton-chapel']) { sim.grant(st(id), 'crossing'); sim.grant(st(id), 'platform2'); }
  assert.ok(!sim.canBuy('route:hazel-grove', 'through'), 'not before Piccadilly');
  sim.grant(st('piccadilly'));
  assert.ok(!sim.canBuy('route:hazel-grove', 'through'), 'not before its shed and bays');
  sim.grant(st('piccadilly'), 'platforms');
  const before = sim.journey(idx('woodsmoor'), idx('levenshulme'));
  assert.equal(before?.changes, 1, 'a change at Stockport before');
  sim.advance(600);
  assert.ok(sim.buy('route:hazel-grove', 'through'));
  const v = sim.svc('hazel-grove');
  assert.deepEqual(sim.span(v).map(i => sim.station(i).id), ['woodsmoor', 'davenport', 'stockport', 'heaton-chapel', 'levenshulme', 'piccadilly']);
  assert.equal(sim.journey(idx('woodsmoor'), idx('levenshulme'))?.changes, 0, 'no change after');
  assert.equal(v.path.track(net.station('levenshulme').s, 1), 'down-slow');
  assert.equal(v.path.track(net.station('stockport').s - 300, 1), 'branch-north');
  assert.equal(sim.price('route:hazel-grove', 'through'), undefined, 'bought once');
  // its unit reaches Piccadilly and comes back to the Buxton line
  const tr = sim.g.trains.find(t => t.svc === 'hazel-grove')!; let north = false, back = false;
  for (let k = 0; k < 9000 && !(north && back); k++) { sim.step(2); if (tr.pfAt === idx('piccadilly')) north = true; if (north && tr.pfAt === idx('woodsmoor')) back = true; }
  assert.ok(north && back, 'runs Woodsmoor to Piccadilly and back');
});

test('through: a save with it bought loads running through', () => {
  const sim = new Sim(net, Sim.halt(net, 2)); sim.g.cash = 1e7;
  for (const id of ['heaton-chapel', 'levenshulme', 'ardwick', 'piccadilly', 'davenport']) sim.grant(st(id));
  sim.grant(st('stockport'), 'platforms'); sim.grant('route:hazel-grove', 'through');
  const again = new Sim(net, JSON.parse(JSON.stringify(sim.g)));
  assert.ok(again.runsThrough(again.svc('hazel-grove')));
  assert.ok(again.span(again.svc('hazel-grove')).includes(idx('piccadilly')));
});
