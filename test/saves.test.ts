// Saves you can carry (src/app/storage.ts): a game written to a file comes back the same and plays on the same, and a
// file that isn't a save, or is from a newer or an older version, is refused without writing anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromGeo } from '../src/sim/network.ts';
import { Sim } from '../src/sim/sim.ts';
import { SAVE_VERSION } from '../src/sim/save.ts';
import { toFile, fromFile, fileName, put, load, SAVE_KEY } from '../src/app/storage.ts';
import type { NetworkGeoDef } from '../src/sim/types.ts';

const def = JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef;
const net = () => fromGeo(def);
/** A stand-in for the device's store, so put and load can be tried outside a browser. */
function device(): Map<string, string> {
  const m = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
  return m;
}
const played = () => { const n = net(), sim = new Sim(n, Sim.halt(n, 3)); sim.g.cash = 1e6; sim.buyUpgrade(0, 'crossing'); sim.buyStation(1); sim.advance(2 * 3600); return sim; };

test('saves: a game to a file and back is the same game, named after its day, and plays on the same', () => {
  const sim = played(), text = toFile({ g: sim.g, selected: 1 });
  assert.equal(fileName(sim.g), `the-commute-day-${sim.g.day}.json`);
  const r = fromFile(text);
  assert.ok(r.ok, 'the file loads');
  assert.equal(r.saved.selected, 1);
  assert.ok(typeof r.saved.at === 'number' && Math.abs(r.saved.at - Date.now()) < 5000, 'it says when it was written');
  assert.deepEqual(r.saved.g, JSON.parse(JSON.stringify(sim.g)));
  const again = new Sim(net(), r.saved.g);
  sim.advance(3600); again.advance(3600);
  assert.equal(again.g.cash, sim.g.cash); assert.equal(again.g.rngState, sim.g.rngState);
  assert.ok(text.length < 400_000, `the file is small: ${Math.round(text.length / 1000)} kB`);
});

test('saves: a file put on the device loads as the device\'s own save does, keeping when it was written', () => {
  const m = device(), sim = played(), r = fromFile(toFile({ g: sim.g, selected: 1 }));
  assert.ok(r.ok);
  const at = Date.now() - 3600_000; r.saved.at = at;
  assert.ok(put(r.saved));
  assert.ok(m.has(SAVE_KEY));
  const back = load();
  assert.equal(back?.at, at); assert.equal(back?.selected, 1); assert.equal(back?.g.cash, sim.g.cash);
});

test('saves: a bad file, or one from a newer or an older version, is refused and nothing is written', () => {
  const m = device(); m.set(SAVE_KEY, 'the game in progress');
  const g = played().g, as = (v: number) => toFile({ g: { ...g, v } });
  const cases: [string, string][] = [['not json {', 'bad'], ['[]', 'bad'], ['{"g":3}', 'bad'], ['{"g":{"cash":1}}', 'bad'], [JSON.stringify({ g: { v: SAVE_VERSION } }), 'bad'],
    [as(SAVE_VERSION + 1), 'newer'], [as(SAVE_VERSION - 1), 'older']];
  for (const [text, why] of cases) {
    const r = fromFile(text);
    assert.ok(!r.ok, `refused: ${text.slice(0, 40)}`);
    assert.equal(r.why, why, text.slice(0, 40));
  }
  assert.equal(m.get(SAVE_KEY), 'the game in progress', 'the game in progress is untouched');
});
