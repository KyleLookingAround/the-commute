// A sensible player, headless: plays the sim in Node from a seed, buying what a player would, and reports when each
// milestone lands against tools/baseline.json. The same seed and code always give the same run, so a change is
// judged on seeds 1-3 before and after (the `balance` playbook).
//   node tools/bot.mjs [--hours 8] [--seed 1 --seed 2 --seed 3] [--json build/bot.json]   (hours are sim hours: a game day is four)
// Prints per seed: SEED, REACHED {milestone: game hour}, MEASURES, PEAKS (at each morning and evening peak: who gave
// up at each station, and how late main-line trains left their stops), PLAY (a fingerprint of the saved state that
// affects play); then a table of every seed and their mean against the baseline, and the peaks' mean. Exit code 1 only
// on an error.
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
const hours = +opt('--hours', 8), jsonOut = opt('--json', null);

/** The sensible player's policy, in priority order: a second unit first (Stockport needs its subway and platform 3 for
 * it), then the next station (as a halt, building whatever it waits on elsewhere), then each station's way across and
 * second platform (trains both ways), its booking office and barriers, then cheap wins, and the faster timetable once
 * there's money to spare. */
export function act(sim) {
  const g = sim.g, home = sim.svcs[0].route[0];
  const up = (i, id) => g.owned[i] && !g.ups[i][id] && sim.buyUpgrade(i, id) ? `${id}:${sim.S[i].id}` : null;
  if (g.line.units < 1) { if (sim.buyLine('units')) return 'unit'; const r = up(home, 'crossing') || up(home, 'platform2'); if (r) return r; }
  for (let i = 1; i < sim.S.length; i++) if (!g.owned[i]) {
    if (sim.buyStation(i)) return 'station:' + sim.S[i].id;
    const needs = sim.stationNeeds(i); if (needs) { const r = up(needs.station.index, sim.S[i].needs.upgrade); if (r) return r; }
    break;
  }
  for (const id of ['crossing', 'platform2', 'building', 'barriers', 'kiosk']) for (let i = 0; i < sim.S.length; i++) { const r = up(i, id); if (r) return r; }
  if (g.line.units < 2 && g.cash > 30000 && sim.buyLine('units')) return 'unit';
  if (g.line.cars < 1 && g.cash > 25000 && sim.buyLine('cars')) return 'cars';
  if (g.line.timetable < 1 && g.cash > 45000 && sim.buyLine('timetable')) return 'timetable';
  for (let i = 0; i < sim.S.length; i++) if (g.st[i].lost > 200 && g.ups[i] && !g.ups[i].extend) { const r = up(i, 'extend'); if (r) return r; }
  if (g.cash > 12000) for (let i = 0; i < sim.S.length; i++) { const r = up(i, 'canopy'); if (r) return r; }
  return null;
}

/** The peak the game clock is in, as "day 1 am", or null between them: 06:00-10:00 and 16:00-19:30. */
function peakOf(sim) { const h = sim.hour(), k = h >= 6 && h < 10 ? 'am' : h >= 16 && h < 19.5 ? 'pm' : null; return k && `day ${sim.g.day} ${k}`; }

export function play(seed, hoursToPlay = hours) {
  const net = fromGeo(def), sim = new Sim(net, Sim.fresh(net, seed));
  const reached = {}; let lastCash = sim.g.cash, quietSince = 0, longestQuiet = 0, dayQuiet = 0, longestDayQuiet = 0;
  // lateness: every main-line departure, and at each peak who gave up where and how late trains ran
  const late = { deps: 0, within: 0, worst: 0 }, peaks = {}, main = sim.svcs[0].id;
  const peak = k => peaks[k] ??= { lost: {}, deps: 0, within: 0, worst: 0 };
  sim.onDepart = (tr, i, s) => {
    if (tr.svc !== main) return;
    late.deps++; if (s <= 300) late.within++; late.worst = Math.max(late.worst, s);
    const k = peakOf(sim); if (!k) return;
    const p = peak(k); p.deps++; if (s <= 300) p.within++; p.worst = Math.max(p.worst, s);
  };
  let lostWas = sim.g.st.map(S => S.lost);
  const mark = (k, h) => { if (reached[k] === undefined) reached[k] = +h.toFixed(2); };
  for (let step = 0; step < hoursToPlay * 60; step++) {          // one decision a game minute
    sim.advance(60);
    const h = step / 60, k = peakOf(sim);
    sim.g.st.forEach((S, i) => { const d = S.lost - lostWas[i]; if (k && d > 0) { const l = peak(k).lost; l[sim.S[i].id] = (l[sim.S[i].id] ?? 0) + d; } });
    lostWas = sim.g.st.map(S => S.lost);
    // daytime quiet: hours between 06:00 and 22:00 with nothing bought (the night is quiet by design)
    const clock = sim.hour(); dayQuiet = clock >= 6 && clock < 22 ? dayQuiet + 1 / 60 : 0;
    let did; while ((did = act(sim))) { mark(did, h); quietSince = h; dayQuiet = 0; }
    longestDayQuiet = Math.max(longestDayQuiet, dayQuiet);
    if (sim.g.cash !== lastCash) { lastCash = sim.g.cash; }
    longestQuiet = Math.max(longestQuiet, h - quietSince);
    for (let i = 1; i < sim.S.length; i++) if (sim.g.owned[i]) mark('owns:' + sim.S[i].id, h);
  }
  const g = sim.g, home = sim.svcs[0].route[0];
  const measures = { 'cash at end': Math.round(g.cash), 'boarded': g.stats.boarded, 'lost': g.stats.lost, 'longest quiet hours': +longestQuiet.toFixed(1), 'longest daytime quiet': +longestDayQuiet.toFixed(2),
    'lost beyond home %': g.stats.lost ? +(100 * (1 - g.st[home].lost / g.stats.lost)).toFixed(1) : 0,
    'within 5 min %': late.deps ? +(100 * late.within / late.deps).toFixed(1) : 100, 'worst late min': +(late.worst / 60).toFixed(1) };
  for (const p of Object.values(peaks)) { p.within = p.deps ? +(100 * p.within / p.deps).toFixed(1) : 100; p.worst = +(p.worst / 60).toFixed(1); }
  const play = fingerprint({ v: g.v, owned: g.owned, ups: g.ups, line: g.line, cash: Math.round(g.cash), boarded: g.stats.boarded, lost: g.stats.lost });
  return { seed, reached, measures, peaks, play };
}

function fingerprint(o) { const s = JSON.stringify(o); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16).padStart(8, '0'); }

function band(value, [lo, hi]) { if (value === undefined) return 'none'; if (value >= lo && value <= hi) return 'ok'; const tol = 0.15 * (hi - lo || Math.abs(hi) || 1); return value >= lo - tol && value <= hi + tol ? 'near' : 'off'; }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runs = seeds.map(s => play(s));
  for (const r of runs) { console.log(`SEED ${r.seed}`); console.log('REACHED ' + JSON.stringify(r.reached)); console.log('MEASURES ' + JSON.stringify(r.measures)); console.log('PEAKS ' + JSON.stringify(r.peaks)); console.log('PLAY ' + r.play); }
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
  // the peaks, mean of the seeds: who gave up at each station, and how late main-line trains left their stops
  const mean = xs => +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
  const pk = [...new Set(runs.flatMap(r => Object.keys(r.peaks)))], ids = [...new Set(runs.flatMap(r => Object.values(r.peaks).flatMap(p => Object.keys(p.lost))))];
  console.log(`\n| Peak (mean of seeds) | ${ids.map(i => 'lost ' + i).join(' | ')} | within 5 min % | worst late min |`);
  console.log(`| --- | ${ids.map(() => '---').join(' | ')} | --- | --- |`);
  for (const k of pk) {
    const ps = runs.map(r => r.peaks[k] ?? { lost: {}, within: 100, worst: 0 });
    console.log(`| ${k} | ${ids.map(i => mean(ps.map(p => p.lost[i] ?? 0))).join(' | ')} | ${mean(ps.map(p => p.within))} | ${mean(ps.map(p => p.worst))} |`);
  }
  console.log(off ? `\n${off} measure${off === 1 ? '' : 's'} off the baseline` : '\nall within the baseline');
  if (jsonOut) { mkdirSync(dirname(join(root, jsonOut)), { recursive: true }); writeFileSync(join(root, jsonOut), JSON.stringify(runs, null, 2)); }
}
