// The track layout keeps its rule (src/sim/layout.ts, docs/DESIGN.md, Where the tracks run): no sharp shifts, no
// tracks crossing but at a turnout, room between throats, junctions and crossovers, every rail on its deck, and blocks
// as long as a train. Fails naming the place.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Network, fromGeo } from '../src/sim/network.ts';
import { layoutFaults, type KitRails } from '../src/sim/layout.ts';
import type { NetworkDef, NetworkGeoDef } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const dir = new URL('../src/data/kits/', import.meta.url);
const kits = Object.fromEntries(readdirSync(dir).filter(f => f.endsWith('.json')).map(f => [f.replace('.json', ''), JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as KitRails]));

/** What's still to re-lay, by rule and place: each goes once its place keeps the rule (and must, once it does). */
const PENDING: [string, string][] = [
  ['cross', 'Manchester Piccadilly'], ['turnout', 'Manchester Piccadilly'], ['rails', 'Manchester Piccadilly'],
];

test('layout: the line keeps the track layout rule, but for what is still to re-lay', () => {
  const faults = layoutFaults(fromGeo(def), kits, def);
  const pending = (f: { rule: string; at: string }) => PENDING.some(([r, p]) => f.rule === r && f.at.includes(p));
  const bad = faults.filter(f => !pending(f));
  assert.equal(bad.length, 0, `${bad.length} faults:\n${bad.slice(0, 20).map(f => `  ${f.rule}: ${f.at}`).join('\n')}`);
  const done = PENDING.filter(([r, p]) => !faults.some(f => f.rule === r && f.at.includes(p)));
  assert.equal(done.length, 0, `re-laid, so off the pending list: ${done.map(d => d.join(' at ')).join(', ')}`);
});

test('layout: the rule finds tracks crossing, a sharp shift and a crowded junction on a made-up line', () => {
  const st = (id: string, z: number) => ({ id, name: id, corridor: 'line', x: 0, z, lat: 0, lon: 0, miles: 0, catchment: 100, draw: 100, price: 0, kit: id, retail: '' });
  const make = (layout: unknown[], junctionZ: number) => new Network({
    origin: { lat: 0, lon: 0 }, corridors: [{ id: 'line', points: [[0, 0], [0, -6000]] }],
    junctions: [{ id: 'j', name: 'J Junction', corridor: 'line', x: 0, z: junctionZ }],
    tracks: [{ id: 'a', corridor: 'line', offset: 0 }, { id: 'b', corridor: 'line', offset: 4.4 }, { id: 'c', corridor: 'line', offset: 0, start: { station: 'south', u: 2700 }, end: { station: 'south', u: 2850 } }],
    stations: [st('south', -100), st('north', -5900)], services: [], layout,
  } as unknown as NetworkDef);
  const tidy = make([], -5000), none = layoutFaults(tidy, {}, { origin: { lat: 0, lon: 0 }, corridors: [] } as never).filter(f => f.rule !== 'block');
  assert.deepEqual(none, [], 'two straight tracks keep it');
  // a swaps sides with b over 40 m, near the junction
  const messy = make([{ corridor: 'line', s0: 3000, s1: 3100, ease: 40, offsets: { a: 8.8 } }], -2950);
  const rules = new Set(layoutFaults(messy, {}, { origin: { lat: 0, lon: 0 }, corridors: [] } as never).map(f => f.rule));
  for (const r of ['cross', 'slope', 'room']) assert.ok(rules.has(r as never), `finds ${r}: ${[...rules].join(', ')}`);
});
