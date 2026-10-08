// A sensible player, headless: plays the sim in Node from a seed, buying what a player would, and reports when each
// milestone lands against tools/baseline.json. The same seed and code always give the same run, so a change is
// judged on seeds 1-3 before and after (the `balance` playbook).
//   node tools/bot.mjs [--hours 48] [--seed 1 --seed 2 --seed 3] [--json build/bot.json]
// Prints per seed: SEED, REACHED {milestone: game hour}, PLAY (a fingerprint of the saved state that affects play);
// then a table of every seed and their mean against the baseline. Exit code 1 only on an error.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

// the sim is TypeScript; tsx loads it as Node can't, registered here so `node tools/bot.mjs` needs no flag
register();
const { fromGeo } = await import('../src/sim/network.ts');
const { Sim } = await import('../src/sim/sim.ts');

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'));
const baseline = JSON.parse(readFileSync(join(root, 'tools/baseline.json'), 'utf8'));

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const seeds = args.flatMap((a, i) => a === '--seed' ? [+args[i + 1]] : []);
if (!seeds.length) seeds.push(1);
const hours = +opt('--hours', 48), jsonOut = opt('--json', null);

/** The sensible player's policy, in priority order: a second unit first, then the next station, then barriers, then cheap wins. */
function act(sim) {
  const g = sim.g;
  if (g.line.units < 1 && sim.buyLine('units')) return 'unit';
  for (let i = 1; i < sim.S.length; i++) if (!g.owned[i]) { if (sim.buyStation(i)) return 'station:' + sim.S[i].id; break; }
  for (let i = 0; i < sim.S.length; i++) if (g.owned[i] && !g.ups[i].barriers && sim.buyUpgrade(i, 'barriers')) return 'barriers:' + sim.S[i].id;
  for (let i = 0; i < sim.S.length; i++) if (g.owned[i] && !g.ups[i].kiosk && sim.buyUpgrade(i, 'kiosk')) return 'kiosk:' + sim.S[i].id;
  if (g.line.units < 2 && g.cash > 30000 && sim.buyLine('units')) return 'unit';
  if (g.line.cars < 1 && g.cash > 25000 && sim.buyLine('cars')) return 'cars';
  for (let i = 0; i < sim.S.length; i++) if (g.owned[i] && !g.ups[i].extend && g.st[i].lost > 200 && sim.buyUpgrade(i, 'extend')) return 'extend:' + sim.S[i].id;
  for (let i = 0; i < sim.S.length; i++) if (g.owned[i] && !g.ups[i].canopy && g.cash > 12000 && sim.buyUpgrade(i, 'canopy')) return 'canopy:' + sim.S[i].id;
  return null;
}

export function play(seed, hoursToPlay = hours) {
  const net = fromGeo(def), sim = new Sim(net, Sim.fresh(net, seed));
  const reached = {}; let lastCash = sim.g.cash, quietSince = 0, longestQuiet = 0;
  const mark = (k, h) => { if (reached[k] === undefined) reached[k] = +h.toFixed(2); };
  for (let step = 0; step < hoursToPlay * 60; step++) {          // one decision a game minute
    sim.advance(60);
    const h = step / 60;
    let did; while ((did = act(sim))) { mark(did, h); quietSince = h; }
    if (sim.g.cash !== lastCash) { lastCash = sim.g.cash; }
    longestQuiet = Math.max(longestQuiet, h - quietSince);
    for (let i = 1; i < sim.S.length; i++) if (sim.g.owned[i]) mark('owns:' + sim.S[i].id, h);
  }
  const g = sim.g;
  const measures = { 'cash at end': Math.round(g.cash), 'boarded': g.stats.boarded, 'lost': g.stats.lost, 'longest quiet hours': +longestQuiet.toFixed(1) };
  const play = fingerprint({ v: g.v, owned: g.owned, ups: g.ups, line: g.line, cash: Math.round(g.cash), boarded: g.stats.boarded, lost: g.stats.lost });
  return { seed, reached, measures, play };
}

function fingerprint(o) { const s = JSON.stringify(o); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); }

function band(value, [lo, hi]) { if (value === undefined) return 'none'; if (value >= lo && value <= hi) return 'ok'; const tol = 0.15 * (hi - lo || Math.abs(hi) || 1); return value >= lo - tol && value <= hi + tol ? 'near' : 'off'; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runs = seeds.map(s => play(s));
  for (const r of runs) { console.log(`SEED ${r.seed}`); console.log('REACHED ' + JSON.stringify(r.reached)); console.log('MEASURES ' + JSON.stringify(r.measures)); console.log('PLAY ' + r.play); }
  const keys = Object.keys(baseline.ranges);
  console.log(`\n| Milestone or measure (${hours} game hours) | Range | ${runs.map(r => 'seed ' + r.seed).join(' | ')} | Mean | Band |`);
  console.log(`| --- | --- | ${runs.map(() => '---').join(' | ')} | --- | --- |`);
  let off = 0;
  for (const k of keys) {
    const vals = runs.map(r => r.reached[k] !== undefined ? r.reached[k] : r.measures[k]);
    const nums = vals.filter(v => typeof v === 'number'), mean = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : undefined;
    const b = band(mean, baseline.ranges[k]); if (b === 'off') off++;
    console.log(`| ${k} | ${baseline.ranges[k].join('–')} | ${vals.map(v => v === undefined ? 'none' : v).join(' | ')} | ${mean === undefined ? 'none' : +mean.toFixed(1)} | ${b} |`);
  }
  console.log(off ? `\n${off} measure${off === 1 ? '' : 's'} off the baseline` : '\nall within the baseline');
  if (jsonOut) { mkdirSync(dirname(join(root, jsonOut)), { recursive: true }); writeFileSync(join(root, jsonOut), JSON.stringify(runs, null, 2)); }
}
