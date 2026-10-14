// Places (src/sim/places.ts): touching along the lines and through junctions, real needs, what comes with what, buying
// a place and its stages, and the saved game's places round trip.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.ts';
import { Sim } from '../src/sim/sim.ts';
import type { NetworkGeoDef } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const net = fromGeo(def);
const fresh = () => { const sim = new Sim(net, Sim.fresh(net, 1)); sim.g.cash = 1e7; return sim; };
const st = (id: string) => `station:${id}`;

test('places: every station, route, stop and depot is a place, by kind:name', () => {
  const sim = fresh(), P = sim.P;
  assert.equal(P.station.length, net.stations.length);
  for (const id of ['station:stockport', 'route:stopper', 'route:hazel-grove', 'route:marple', 'route:rose-hill', 'depot:stockport-sidings', 'stop:stockport-interchange', 'stop:levenshulme-station-view', 'stop:hazel-grove-a6'])
    assert.ok(P.byId.has(id), id);
  assert.ok(!P.byId.has('route:avanti'), 'the expresses run through from off the map: not the player\'s');
  assert.ok(P.all.some(p => p.kind === 'section') && P.all.some(p => p.kind === 'junction'));
  assert.ok(P.byId.has('junction:edgeley') && P.byId.has('junction:ardwick') && P.byId.has('junction:marple-wharf'));
});

test('places: Stockport touches Heaton Chapel and, across Edgeley Junction, Davenport; Davenport waits on platforms 0, 1 and 2', () => {
  const sim = fresh(), P = sim.P;
  assert.deepEqual([...P.near.get(st('stockport'))!].sort(), [st('davenport'), st('heaton-chapel')]);
  assert.ok(sim.offerable(net.station('heaton-chapel').index) && sim.offerable(net.station('davenport').index));
  assert.ok(!sim.offerable(net.station('levenshulme').index), 'not yet: nothing next to it is owned');
  assert.deepEqual(sim.offeredPlaces().filter(id => id.startsWith('station:')), [st('heaton-chapel')], 'Davenport stands waiting');
  assert.ok(sim.stationNeeds(net.station('davenport').index), 'and says what on');
  assert.ok(!sim.buyStation(net.station('davenport').index));
  sim.grant(st('stockport'), 'platforms');
  assert.ok(sim.offeredPlaces().includes(st('davenport')));
  assert.ok(sim.buyStation(net.station('davenport').index), 'bought before Piccadilly: not in order up the line');
});

test('places: Middlewood once Hazel Grove is owned, Ashburys once Ardwick is, Rose Hill once Romiley or Marple is', () => {
  const sim = fresh(), P = sim.P;
  const offered = (id: string) => sim.offerable(net.station(id).index);
  assert.ok(!offered('middlewood') && !offered('ashburys') && !offered('rose-hill'));
  sim.grant(st('hazel-grove')); assert.ok(offered('middlewood'));
  sim.grant(st('ardwick')); assert.ok(offered('ashburys'), 'across Ardwick Junction');
  assert.deepEqual([...P.near.get(st('ashburys'))!].sort(), [st('ardwick'), st('belle-vue'), st('piccadilly')]);
  assert.deepEqual([...P.near.get(st('rose-hill'))!].sort(), [st('marple'), st('romiley')], 'across Marple Wharf Junction');
  sim.grant(st('romiley')); assert.ok(offered('rose-hill'));
});

test('places: what comes with what: the stopper and the sidings from the start, a branch with its first station, sections with both ends', () => {
  const sim = fresh();
  assert.ok(sim.owns('route:stopper') && sim.owns('depot:stockport-sidings'));
  assert.ok(!sim.owns('route:hazel-grove') && !sim.owns('route:marple') && !sim.owns('route:rose-hill'));
  const sections = (a: string) => sim.P.touching(st(a)).filter(id => id.startsWith('section:'));
  const toHC = 'section:main:stockport:heaton-norris-junction';
  assert.ok(sections('stockport').includes(toHC) && !sim.owns(toHC));
  sim.grant(st('heaton-chapel'));
  assert.ok(sim.owns(toHC), 'Stockport – Heaton Norris Junction comes with Heaton Chapel');
  assert.ok(sections('stockport').some(id => !sim.owns(id)), 'Stockport – Edgeley Junction waits for Davenport');
  sim.grant(st('davenport'));
  assert.ok(sections('stockport').every(id => sim.owns(id)) && sim.owns('junction:edgeley'));
  assert.ok(sim.owns('route:hazel-grove'), 'the Hazel Grove line runs once Davenport is owned');
  sim.grant(st('rose-hill'));
  assert.ok(!sim.owns('route:rose-hill'), 'its trains run out from Piccadilly, as far as stations are owned');
  sim.grant(st('ashburys'));
  assert.ok(sim.owns('route:rose-hill') && sim.owns('route:marple'));
  // a section through to Piccadilly isn't the player's while the stopper merely runs over it
  assert.ok(!sim.P.all.filter(p => p.kind === 'section' && p.ends!.includes(st('piccadilly'))).some(p => sim.owns(p.id)));
});

test('places: a stop is offered once its station is owned, and is the station\'s bus link', () => {
  const sim = fresh(), lev = net.station('levenshulme').index;
  assert.ok(sim.offeredPlaces().includes('stop:stockport-interchange'));
  assert.ok(!sim.offeredPlaces().includes('stop:levenshulme-station-view'));
  sim.grant(st('heaton-chapel')); sim.grant(st('levenshulme'));
  assert.ok(sim.offeredPlaces().includes('stop:levenshulme-station-view'));
  assert.equal(sim.price('stop:levenshulme-station-view'), 6000);
  assert.ok(!sim.g.ups[lev]!.bus);
  assert.ok(sim.buyUpgrade(lev, 'bus'), 'bought from the station\'s card, as before');
  assert.ok(sim.owns('stop:levenshulme-station-view') && sim.g.ups[lev]!.bus);
  assert.ok(!sim.g.places[st('levenshulme')]!['bus'], 'the stop is its own place, not a stage of the station');
});

test('places: stages are on the places they belong to: the stopper\'s units, the sidings\' spare unit', () => {
  const sim = fresh(), P = sim.P;
  assert.deepEqual(P.stagesFor(net, 'route:stopper').map(u => u.id), ['units', 'cars']);
  assert.deepEqual(P.stagesFor(net, 'depot:stockport-sidings').map(u => u.id), ['spare']);
  assert.deepEqual(P.stagesFor(net, 'route:hazel-grove').map(u => u.id), ['units'], 'every service its frequency');
  assert.ok(P.stagesFor(net, st('stockport')).every(u => u.id !== 'bus' && u.id !== 'spare'));
  assert.ok(!sim.buy('route:stopper', 'units'), 'waits on platform 3, as before');
  sim.grant(st('stockport'), 'crossing'); sim.grant(st('stockport'), 'platform2');
  assert.ok(sim.buy('route:stopper', 'units') && sim.buy('route:stopper', 'units'));
  assert.equal(sim.g.places['route:stopper']!['units'], 2); assert.equal(sim.g.line.units, 2); assert.equal(sim.unitsInService(), 3);
  assert.ok(!sim.buy('depot:stockport-sidings', 'spare'), 'offered once a train has failed');
  sim.g.trouble.fails = 1;
  assert.ok(sim.buyLine('spare')); assert.equal(sim.g.places['depot:stockport-sidings']!['spare'], 1); assert.equal(sim.g.line.spare, 1);
});

test('places: the save holds places only, and a game read back is the same game', () => {
  const sim = fresh();
  sim.grant(st('stockport'), 'crossing'); sim.grant(st('heaton-chapel')); sim.grant('stop:stockport-interchange'); sim.grant('route:stopper', 'units');
  const text = JSON.stringify(sim.g), raw = JSON.parse(text);
  for (const k of ['owned', 'ups', 'line']) assert.ok(!(k in raw), `${k} isn't saved`);
  assert.deepEqual(raw.places, { 'station:stockport': { crossing: 1 }, 'station:heaton-chapel': {}, 'stop:stockport-interchange': {}, 'route:stopper': { units: 1 } });
  const back = new Sim(net, raw);
  assert.deepEqual(back.g.owned, sim.g.owned); assert.deepEqual(back.g.ups, sim.g.ups); assert.deepEqual(back.g.line, sim.g.line);
  assert.ok(back.g.ups[0]!.bus && back.g.ups[0]!.crossing && back.g.line.units === 1);
  assert.throws(() => { (back.g as unknown as { owned: boolean[] }).owned = []; }, 'what\'s worked out from places can\'t be written over');
});
