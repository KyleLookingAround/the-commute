// Where a station's trouble comes from (src/ui/cause.ts): from the bot's busy game, strained stations name the places
// behind it, each a place with a card, and only while Strain sees something wrong there; reading them changes nothing
// in the game. node:test, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fromGeo } from '../src/sim/network.ts';
import { Sim, TUNING } from '../src/sim/sim.ts';
import { simAtHour } from '../src/sim/day.ts';
import { StrainRead } from '../src/ui/strain.ts';
import { causes } from '../src/ui/cause.ts';
import type { NetworkGeoDef } from '../src/sim/types.ts';
// @ts-expect-error the bot is plain JavaScript
import { act } from '../tools/bot.mjs';

// word of mouth held still, so the bot's busy line stays strained enough to name causes (this file runs on its own)
(TUNING as { wordCut: number }).wordCut = 0;
const net = fromGeo(JSON.parse(readFileSync(new URL('../src/data/network.json', import.meta.url), 'utf8')) as NetworkGeoDef);
/** The bot's game on seed 1 to day 5's morning, then an hour on, read as the page reads it (or not). */
function play(read: boolean): { sim: Sim; seen: Map<string, Set<string>>; hash: string } {
  const sim = new Sim(net, Sim.halt(net, 1)), end = simAtHour(5, 7.5);
  while (sim.g.t < end) { sim.advance(60); for (let k = 0; k < 5 && act(sim); k++); }
  const r = read ? new StrainRead(sim) : null, seen = new Map<string, Set<string>>();
  for (let k = 0; k < 3600; k++) {
    sim.advance(1); if (!r || k % 3) continue;
    r.tick(sim);
    for (const p of sim.P.all) {
      const c = causes(sim, r, p.id);
      if (c.length) assert.ok(p.kind === 'station' && r.line(p.id) !== null, `${p.id} has causes with nothing wrong`);
      for (const x of c) { assert.ok(sim.P.byId.has(x.place), `${x.place} has no card`); (seen.get(p.id) ?? seen.set(p.id, new Set()).get(p.id)!).add(x.text); }
    }
  }
  return { sim, seen, hash: createHash('sha256').update(JSON.stringify(sim.g)).digest('hex') };
}

test('strained stations name the places behind their trouble, and reading them changes nothing', () => {
  const a = play(true), b = play(false);
  assert.equal(a.hash, b.hash, 'reading the causes changed the game');
  const all = [...a.seen.values()].flatMap(s => [...s]);
  assert.ok(a.seen.size >= 2, `causes at ${a.seen.size} stations`);
  assert.ok(all.some(t => /^Trains leave full · /.test(t)), `no full trains named: ${all.join('; ')}`);
  assert.ok(all.some(t => /^Trains late · /.test(t)), `no late service named: ${all.join('; ')}`);
});
