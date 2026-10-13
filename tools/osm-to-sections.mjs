#!/usr/bin/env node
// The real line speed and wires of every section of line (docs/briefs/line-between-stations.md), from OpenStreetMap,
// for the network data's `sections`. A section is the line between two neighbouring stations or a station and a
// junction along one corridor, as src/sim/places.ts makes them; run this for every corridor the data has, after a line
// out is added:
//
//    node tools/osm-to-sections.mjs            reads what's cached in data/raw/osm-sections/, fetching what isn't
//    node tools/osm-to-sections.mjs --write    and writes `sections` into src/data/network.json
//
// Along each section every SAMPLE metres of chainage it fetches a box BOX metres across round the corridor from OSM's
// main API (api.openstreetmap.org/api/0.6/map.json, one request a second, cached in the git-ignored data/raw/), and
// reads the running lines (railway=rail without a service tag) within NEAR metres of the corridor: their `maxspeed`
// (the fastest line there, since the corridor's centre sits between the tracks) and `electrified`. Each section gets
// the speed a train would average over it at the lines' own speeds (the time-weighted mean, to the nearest 5 mph),
// and how much of it is wired (to a tenth); it prints the slowest stretch and how many samples read a speed. A sample that
// reads none is left out; a section none of whose samples read one gets no speed, and the game's own holds there.
import { register } from 'tsx/esm/api';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

register();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { fromGeo } = await import('../src/sim/network.ts');
const { Sim } = await import('../src/sim/sim.ts');

const SAMPLE = 250, BOX = 160, NEAR = 30;
const OSM = 'https://api.openstreetmap.org/api/0.6/map.json';
const raw = join(root, 'data/raw/osm-sections'); mkdirSync(raw, { recursive: true });
const file = join(root, 'src/data/network.json'), def = JSON.parse(readFileSync(file, 'utf8')), net = fromGeo(def);
const O = def.origin, kLat = 111320, kLon = 111320 * Math.cos(O.lat * Math.PI / 180);
const toLatLon = (x, z) => [O.lat - z / kLat, O.lon + x / kLon];
const toGame = (lat, lon) => [(lon - O.lon) * kLon, (O.lat - lat) * kLat];

/** OSM's elements in a box round (x, z), cached by the box's corners. */
async function box(x, z) {
  const [s, w] = toLatLon(x - BOX / 2, z + BOX / 2), [n, e] = toLatLon(x + BOX / 2, z - BOX / 2);
  const bb = [w, s, e, n].map(v => v.toFixed(5)).join(','), path = join(raw, bb.replace(/,/g, '_') + '.json');
  if (existsSync(path)) return JSON.parse(readFileSync(path, 'utf8')).elements;
  for (let tries = 0; ; tries++) {
    const r = await fetch(`${OSM}?bbox=${bb}`, { headers: { 'user-agent': 'the-commute osm-to-sections (a game of the real line)' } });
    if (r.ok) { const text = await r.text(); writeFileSync(path, text); await new Promise(res => setTimeout(res, 1000)); return JSON.parse(text).elements; }
    if (tries > 3) throw new Error(`OSM ${r.status} for ${bb}`);
    await new Promise(res => setTimeout(res, 5000 * (tries + 1)));
  }
}
/** A maxspeed tag in mph ("75 mph", or km/h as a bare number), or null. */
function mph(v) {
  if (!v) return null;
  const m = /^(\d+(?:\.\d+)?)\s*(mph)?/.exec(v.trim()); if (!m) return null;
  return m[2] ? +m[1] : +m[1] / 1.609;
}
/** The running lines near (x, z): the fastest one's speed and whether any is wired, or null. */
function read(els, x, z) {
  const nodes = new Map(); for (const e of els) if (e.type === 'node') nodes.set(e.id, toGame(e.lat, e.lon));
  let speed = null, wired = false, any = false;
  for (const w of els) {
    if (w.type !== 'way' || w.tags?.railway !== 'rail' || w.tags.service) continue;
    let d = Infinity;
    for (let k = 1; k < w.nodes.length; k++) {
      const a = nodes.get(w.nodes[k - 1]), b = nodes.get(w.nodes[k]); if (!a || !b) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1], L = dx * dx + dz * dz, u = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L)) : 0;
      d = Math.min(d, Math.hypot(x - a[0] - u * dx, z - a[1] - u * dz));
    }
    if (d > NEAR) continue;
    any = true;
    const v = mph(w.tags.maxspeed); if (v !== null) speed = Math.max(speed ?? 0, v);
    if (w.tags.electrified && w.tags.electrified !== 'no') wired = true;
  }
  return any ? { speed, wired } : null;
}

const sim = new Sim(net, Sim.fresh(net, 1)), P = sim.P;
/** Where a section's end (a station or junction place) is along its corridor. */
function at(k, c) {
  const C = net.corridor(c);
  if (k.startsWith('station:')) return net.station(k.slice('station:'.length)).s;
  const j = net.junction(k.slice('junction:'.length)), cd = def.corridors.find(d => d.id === c);
  return j.corridor === c ? j.s : cd.from === j.id ? C.start : C.end;
}
const out = {}, f = { x: 0, z: 0 };
for (const p of P.all) {
  if (p.kind !== 'section') continue;
  const a = at(p.ends[0], p.corridor), b = at(p.ends[1], p.corridor), lo = Math.min(a, b), hi = Math.max(a, b);
  const n = Math.max(2, Math.ceil((hi - lo) / SAMPLE));
  let time = 0, dist = 0, slowest = Infinity, wiredN = 0, readN = 0, seen = 0;
  for (let k = 0; k <= n; k++) {
    const s = lo + (hi - lo) * k / n, q = net.corridor(p.corridor).at(s, 0, { ...f, heading: 0, dx: 0, dz: 0, nx: 0, nz: 0 });
    const r = read(await box(q.x, q.z), q.x, q.z); if (!r) continue;
    seen++; if (r.wired) wiredN++;
    if (r.speed !== null) { readN++; time += 1 / r.speed; dist += 1; slowest = Math.min(slowest, r.speed); }
  }
  const id = p.id.slice('section:'.length), mean = dist ? Math.round(dist / time / 5) * 5 : null;
  // only the figures the game reads (the network data is in the script before the first frame); the rest is printed
  out[id] = { ...(mean !== null ? { mph: mean } : {}), wired: seen ? +(wiredN / seen).toFixed(1) : 0 };
  console.log(`${p.id.padEnd(58)} ${((hi - lo) / 1609.34).toFixed(2).padStart(5)} mi  ${mean ?? '–'} mph (slowest ${mean ? Math.round(slowest) : '–'})  wired ${out[id].wired}  ${readN}/${n + 1}`);
}
// written as text before the data's closing brace (or over the sections already there), a section to a line, so the
// rest of the file keeps its own layout and another session's edits merge
if (process.argv.includes('--write')) {
  let text = readFileSync(file, 'utf8').replace(/,\n  "sectionNote": [\s\S]*?\n  "sections": \{[\s\S]*?\n  \}(?=\n\}\s*$)/, '');
  // each corridor's sections in chainage order (as src/sim/places.ts makes them): their speeds, and the share wired
  const by = {};
  for (const [id, v] of Object.entries(out)) { const c = id.split(':')[0]; (by[c] ??= { mph: [], wired: [] }); by[c].mph.push(v.mph ?? null); by[c].wired.push(v.wired); }
  const note = 'Sections by corridor, in chainage order: real mph and share wired (tools/osm-to-sections.mjs).';
  const body = Object.entries(by).map(([k, v]) => `    ${JSON.stringify(k)}: { "mph": ${JSON.stringify(v.mph).replace(/,/g, ', ')}, "wired": ${JSON.stringify(v.wired).replace(/,/g, ', ')} }`).join(',\n');
  text = text.replace(/\n\}\s*$/, `,\n  "sectionNote": ${JSON.stringify(note)},\n  "sections": {\n${body}\n  }\n}\n`);
  JSON.parse(text);
  writeFileSync(file, text);
  console.log(`wrote ${Object.keys(out).length} sections on ${Object.keys(by).length} corridors to src/data/network.json`);
}
