// The start (docs/design/gridlock.md, sections 1, 4 and 7): a fresh game opens from the network data's first start,
// Stockport shut: nothing owned, £4,000, Reopen Stockport the one thing offered at £1,000, the stopper standing dark
// at platform 4 and the expresses running through. Reopening releases the stopper from there with the people who'd
// gathered aboard, and from then on the game plays as the halt's opening did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.ts';
import { Sim } from '../src/sim/sim.ts';
import type { NetworkGeoDef } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const net = fromGeo(def);
const shut = (seed = 1) => new Sim(net, Sim.fresh(net, seed));
const stopper = (sim: Sim) => sim.g.trains.find(t => t.svc === 'stopper')!;

test('start: a fresh game owns nothing, holds £4,000 and is offered only Reopen Stockport, at £1,000', () => {
  const sim = shut(), start = def.starts![0]!;
  assert.equal(sim.g.start, start.id);
  assert.ok(!sim.g.owned.some(Boolean), 'no station owned');
  assert.equal(sim.g.cash, 4000);
  assert.deepEqual(sim.offeredPlaces(), ['station:stockport']);
  assert.equal(sim.price('station:stockport'), 1000);
  assert.equal(sim.stationPrice(1), sim.station(1).price, 'the start prices only what it offers');
  assert.ok(!sim.owns('route:stopper'), 'the stopper is not the player\'s while it stands held');
  assert.ok(!sim.canBuy('route:stopper', 'cars'), 'nor are its stages');
});

test('start: the stopper stands dark at platform 4, nothing local runs and the expresses pass, until Stockport reopens', () => {
  const sim = shut(); sim.advance(1800);
  const tr = stopper(sim);
  assert.equal(sim.g.trains.filter(t => t.svc === 'stopper').length, 1);
  assert.equal(tr.state, 'dwell'); assert.equal(tr.pfAt, 0); assert.equal(sim.plats[0]![tr.pf]!.def.id, '4');
  assert.equal(tr.calling, null); assert.equal(tr.due, -1);
  assert.equal(sim.g.earned, 0); assert.equal(sim.g.stats.boarded, 0);
  for (const t of sim.g.trains.filter(t => sim.svc(t.svc).express)) assert.ok(!sim.callsAt(t, 0) || sim.isEnd(t, 0), `${t.svc} does not call at shut Stockport`);
  // a save of the shut game loads shut
  const again = new Sim(net, JSON.parse(JSON.stringify(sim.g)));
  again.advance(60); assert.equal(stopper(again).due, -1);
});

test('start: reopening Stockport takes £1,000, boards the gathered crowd at once and runs the stopper from platform 4', () => {
  const sim = shut(); sim.advance(10);
  assert.ok(sim.buy('station:stockport'));
  assert.equal(sim.g.cash, 3000);
  assert.ok(sim.state(0).waiting > 10 && sim.state(0).waiting <= 80, `gathered ${sim.state(0).waiting}`);
  const tr = stopper(sim);
  assert.equal(tr.calling, 0); assert.ok(tr.due > sim.g.t);
  sim.advance(4); assert.ok(sim.g.earned > 0, 'the first fares within seconds');
  sim.advance(300); assert.equal(tr.state, 'run'); assert.ok(tr.s > sim.station(0).s, 'away towards Manchester');
  assert.ok(sim.owns('route:stopper'));
  assert.deepEqual(sim.offeredPlaces().filter(k => k.startsWith('station:')), ['station:heaton-chapel'], 'its neighbours, as the halt offered them');
});

test('start: the same seed gives the same game, and a start named that the data lacks is the first', () => {
  const run = (seed: number) => { const sim = shut(seed); sim.buy('station:stockport'); sim.advance(4 * 3600); return `${sim.g.cash.toFixed(2)}|${sim.g.stats.boarded}|${sim.g.rngState}`; };
  assert.equal(run(2), run(2));
  assert.equal(Sim.fresh(net, 1, [], 'nowhere').start, def.starts![0]!.id);
});

test('start: halt opens as the shut start reopened, cash and all', () => {
  const g = Sim.halt(net, 1);
  assert.equal(g.cash, 3000); assert.ok(g.owned[0]); assert.ok(!g.owned.slice(1).some(Boolean));
});
