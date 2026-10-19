// Contract renewal (src/sim/contract.ts): reputation rewards a well-run line, renewing banks it and keeps the career
// apart from the run, perks are bought in order within a branch, and a new run starts from halts with them in effect
// through the sim's own numbers. A run with no perks plays as it always did.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.ts';
import { Sim } from '../src/sim/sim.ts';
import { freshCareer, reputation, renew, renewable, buyPerk, perkState, canBuyPerk, readCareer, effects, careerEmpty, CAREER_VERSION, targetsMet } from '../src/sim/contract.ts';
import type { ContractDef, NetworkGeoDef } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const net = () => fromGeo(def), tree = def.contract as ContractDef;
const picc = () => net().station('piccadilly').index;
/** A run with the whole line bought and a few hours played. */
function played(perks: string[] = []): Sim {
  const n = net(), sim = new Sim(n, Sim.halt(n, 4, perks)); sim.g.cash = 1e7;
  sim.buyUpgrade(0, 'crossing'); sim.buyUpgrade(0, 'platform2');
  for (let i = 1; i < sim.S.length; i++) { const need = sim.stationNeeds(i); if (need) sim.buyUpgrade(need.station.index, sim.S[i]!.needs!.upgrade); sim.buyStation(i); }
  for (let i = 0; i < sim.S.length; i++) for (const id of ['crossing', 'platform2', 'building', 'extend']) sim.buyUpgrade(i, id);
  for (const id of ['units', 'units', 'cars'] as const) sim.buyLine(id);
  sim.advance(3 * 3600); return sim;
}

test('contract: the tree has three or four branches of eight to twelve perks, each dearer than the last in its branch', () => {
  assert.ok(tree.branches.length >= 3 && tree.branches.length <= 4);
  assert.ok(tree.perks.length >= 8 && tree.perks.length <= 12);
  for (const b of tree.branches) {
    const ps = tree.perks.filter(p => p.branch === b.id); assert.ok(ps.length >= 2, b.id);
    ps.forEach((p, k) => { if (k) assert.ok(p.price > ps[k - 1]!.price, `${p.id} dearer than the one before`); });
  }
  for (const p of tree.perks) assert.ok(tree.branches.some(b => b.id === p.branch), `${p.id}'s branch`);
});

test('contract: reputation counts passengers carried and how well (times the share on time), so a well-run line banks more than one run badly', () => {
  const g = Sim.halt(net(), 1);
  g.stats.boarded = 10000; const good = reputation(g);
  g.stats.lost = 1500; const lossy = reputation(g);
  g.stats.lost = 0; g.stats.deps = 400; g.stats.late = 100; const late = reputation(g);
  assert.equal(good, 100); assert.equal(late, 75, 'three in four on time');
  assert.ok(lossy < good && late < good, `${good} ${lossy} ${late}`);
  g.stats.boarded = 100; g.stats.lost = 5000; assert.equal(reputation(g), 0, 'never below nothing');
});

test('contract: renewal is offered once Piccadilly is owned, and banks the run into the career without touching it', () => {
  const n = net(), fresh = new Sim(n, Sim.halt(n, 4));
  assert.equal(renewable(fresh.g, picc()), false);
  const sim = played(); assert.ok(renewable(sim.g, picc()));
  const rep = reputation(sim.g); assert.ok(rep > 0, 'a run with the whole line earns reputation');
  const c0 = freshCareer(), c = renew(c0, sim.g, sim.S.map(s => s.id)), t = targetsMet(sim.g, sim.S.map(s => s.id));
  assert.equal(c.rep, rep + t.rep, 'the run\'s reputation and its targets\''); assert.equal(c.renewals, 1); assert.deepEqual(c.contracts, [{ n: 1, day: sim.g.day, rep: rep + t.rep }]);
  for (const id of t.met) assert.ok(c.milestones.includes('target:' + id));
  assert.ok(c.milestones.includes('owns:piccadilly') && c.milestones.includes('renewed'));
  assert.deepEqual(c0, freshCareer(), 'the career renewed from is left as it was');
  assert.ok(careerEmpty(c0) && !careerEmpty(c));
  // a second renewal keeps the milestones once and adds its contract
  const c2 = renew(c, sim.g, sim.S.map(s => s.id));
  assert.equal(c2.renewals, 2); assert.equal(c2.contracts.length, 2); assert.equal(new Set(c2.milestones).size, c2.milestones.length);
});

test('contract: perks are bought in order within a branch, with reputation, and only once', () => {
  let c = { ...freshCareer(), rep: 1000 };
  const [first, second] = tree.perks.filter(p => p.branch === 'works');
  assert.equal(perkState(tree, c, second!.id), 'locked');
  assert.equal(buyPerk(tree, c, second!.id), null, 'not before the one before it');
  c = buyPerk(tree, c, first!.id)!; assert.ok(c);
  assert.equal(c.rep, 1000 - first!.price); assert.equal(perkState(tree, c, first!.id), 'owned'); assert.equal(perkState(tree, c, second!.id), 'next');
  assert.equal(buyPerk(tree, c, first!.id), null, 'not twice');
  assert.equal(canBuyPerk(tree, { ...c, rep: second!.price - 1 }, second!.id), false, 'not without the reputation');
});

test('contract: a new run starts from the start, Stockport shut, with the perks in effect through the sim\'s own numbers', () => {
  const n = net(), all = tree.perks.map(p => p.id), fx = effects(tree, all), base = new Sim(n, Sim.fresh(n, 4)), sim = new Sim(n, Sim.fresh(n, 4, all));
  assert.ok(!sim.g.owned.some(Boolean), 'nothing open');
  assert.deepEqual(sim.g.owned, base.g.owned); assert.deepEqual(sim.g.ups, base.g.ups);
  assert.equal(sim.g.cash, base.g.cash + fx.cash, 'starting cash');
  assert.equal(sim.g.line.spare, 1, 'the spare unit stands by');
  assert.ok(sim.stationPrice(1) < base.stationPrice(1) && sim.upgradePrice(0, { id: 'crossing', name: null, price: 2000, desc: '' }) < 2000, 'quicker building: cheaper');
  assert.equal(sim.linePrice('units'), 0, 'the unit in the sidings is free to put in service');
  assert.ok(sim.journey(0, picc())!.felt < base.journey(0, picc())!.felt, 'a shorter walk: a wider reach');
  // the run keeps its perks through a save
  assert.deepEqual(new Sim(n, JSON.parse(JSON.stringify(sim.g))).fx, sim.fx);
});

test('contract: a run with no perks plays exactly as one made before perks existed', () => {
  const n = net(), a = new Sim(n, Sim.halt(n, 6)), b = new Sim(n, Sim.halt(n, 6, []));
  assert.deepEqual(a.fx, effects(tree, []));
  a.advance(2 * 3600); b.advance(2 * 3600);
  assert.deepEqual(a.g, b.g);
  assert.equal(a.stationPrice(1), a.station(1).price);
});

test('contract: a career reads back from JSON, and one from another version starts afresh', () => {
  const c = { ...freshCareer(), rep: 12, perks: ['works1'], renewals: 1 };
  assert.deepEqual(readCareer(JSON.parse(JSON.stringify(c))), c);
  assert.equal(readCareer({ ...c, v: CAREER_VERSION + 1 }), null);
  assert.equal(readCareer('nope'), null);
});

test('contract: a save file carries the career beside the run, and putting it on the device keeps them apart', async () => {
  const { toFile, fromFile, put, load, loadCareer, CAREER_KEY, SAVE_KEY } = await import('../src/app/storage.ts');
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
  const n = net(), sim = new Sim(n, Sim.halt(n, 5, ['works1'])), career = { ...freshCareer(), rep: 7, perks: ['works1'], renewals: 2 };
  const r = fromFile(toFile({ g: sim.g, selected: 0, career }));
  assert.ok(r.ok); assert.deepEqual(r.saved.career, career);
  assert.ok(put(r.saved));
  assert.equal(JSON.parse(m.get(SAVE_KEY)!).career, undefined, 'the run is saved without the career');
  assert.deepEqual(loadCareer(), career); assert.ok(m.has(CAREER_KEY));
  assert.deepEqual(load()?.g.perks, ['works1']);
  // a file whose career is from another version still loads its run
  const odd = fromFile(toFile({ g: sim.g, career: { ...career, v: 99 } }));
  assert.ok(odd.ok); assert.equal(odd.saved.career, undefined);
});

test('contract: the franchise\'s targets each bank more when met: on time, few giving up, the main line', () => {
  const g = Sim.halt(net(), 1), ids = net().stations.map(s => s.id);
  assert.deepEqual(targetsMet(g, ids).met, [], 'a new run has met none');
  g.stats.boarded = 10000; g.stats.lost = 100; g.stats.deps = 200; g.stats.late = 10;
  assert.deepEqual(targetsMet(g, ids).met, ['ontime', 'fewlost']);
  g.stats.late = 40; assert.deepEqual(targetsMet(g, ids).met, ['fewlost'], 'four in five on time misses it');
});
