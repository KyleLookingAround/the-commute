#!/usr/bin/env node
// Turn OpenStreetMap's streets into the road between two stations for `roads` in src/data/network.json, as
// tools/osm-to-network.mjs does for the line: the rail replacement buses drive it, and later trams and buses.
//
//   node tools/osm-to-roads.mjs --from stockport --to heaton-chapel [--every 40] [--write] [--via "..."] [osm.json]
//
// With no export given it fetches the streets itself from OSM's main API (api.openstreetmap.org/api/0.6/map.json), in
// boxes of 0.0125 degrees over the two stations and 900 m round them, into the git-ignored data/raw/osm-tiles/ (fetched
// once each; Overpass isn't needed). An export (Overpass's raw data, or a main API map.json) can be given instead.
//
// It finds the street nodes nearest each station's way out (the kit's `busstop` part, carried from the kit's frame into
// the world as src/render/buses.ts places it, else the station's own point), the quickest path between them by road
// (main roads count as shorter, so it keeps to the A6 as a bus would; no footways), and prints a road entry resampled
// every N metres along the real streets. --write puts it into `roads` in place of the entry for the same two stations,
// changing nothing else in the file (the road's `via` kept unless --via gives one).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

register();
const { fromGeo } = await import('../src/sim/network.ts');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const from = opt('--from'), to = opt('--to'), every = +opt('--every', 40), via = opt('--via'), write = args.includes('--write');
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!from || !to) { console.error('usage: node tools/osm-to-roads.mjs --from <station id> --to <station id> [--every 40] [--write] [--via "..."] [osm.json]'); process.exit(1); }
const netFile = join(root, 'src/data/network.json'), text = readFileSync(netFile, 'utf8'), def = JSON.parse(text), net = fromGeo(def);
const origin = def.origin, kLat = 111320, kLon = 111320 * Math.cos(origin.lat * Math.PI / 180);

const dist = (a, b) => { const kx = 111320 * Math.cos(a.lat * Math.PI / 180), ky = 111320; return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * ky); };
/** A station's way out in lat/lon: its kit's bus stop at (u, v) in the station's frame, else the station's own point. */
function wayOut(id) {
  const st = net.station(id), kit = JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8')), stop = kit.parts.find(p => p.type === 'busstop');
  if (!stop) return { lat: st.lat, lon: st.lon };
  const f = net.stationFrame(id), x = f.x + f.dx * stop.u + f.nx * stop.v, z = f.z + f.dz * stop.u + f.nz * stop.v;
  return { lat: origin.lat - z / kLat, lon: origin.lon + x / kLon };
}
const A = wayOut(from), B = wayOut(to);

// ---- the streets: an export, or OSM's main API in boxes over both stations ----
const ROADS = /^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service)(_link)?$/;
async function fetchTiles() {
  const T = 0.0125, pad = 0.008, dir = join(root, 'data/raw/osm-tiles'); mkdirSync(dir, { recursive: true });
  const la0 = Math.floor((Math.min(A.lat, B.lat) - pad) / T) * T, la1 = Math.max(A.lat, B.lat) + pad, lo0 = Math.floor((Math.min(A.lon, B.lon) - pad * 1.7) / T) * T, lo1 = Math.max(A.lon, B.lon) + pad * 1.7;
  const elements = [];
  for (let la = la0; la < la1; la += T) for (let lo = lo0; lo < lo1; lo += T) {
    const box = [lo, la, lo + T, la + T].map(n => n.toFixed(4)), f = join(dir, `streets_${box.join('_')}.json`);
    if (!existsSync(f)) {
      const res = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${box.join(',')}`);
      if (!res.ok) throw new Error(`OSM's main API said ${res.status} for ${box.join(',')}`);
      const all = (await res.json()).elements, ways = all.filter(e => e.type === 'way' && ROADS.test(e.tags?.highway ?? '')), used = new Set(ways.flatMap(w => w.nodes));
      writeFileSync(f, JSON.stringify({ elements: [...all.filter(e => e.type === 'node' && used.has(e.id)).map(({ id, lat, lon }) => ({ type: 'node', id, lat, lon })), ...ways.map(({ id, nodes, tags }) => ({ type: 'way', id, nodes, tags: { highway: tags.highway, ...(tags.name ? { name: tags.name } : {}), ...(tags.access ? { access: tags.access } : {}) } }))] }));
      console.error(`fetched ${box.join(',')}`);
    }
    elements.push(...JSON.parse(readFileSync(f, 'utf8')).elements);
  }
  return { elements };
}
const osm = file ? JSON.parse(readFileSync(file, 'utf8')) : await fetchTiles();

const nodes = new Map(), adj = new Map(), seen = new Set();
const weight = { motorway: 3, trunk: 0.7, primary: 0.75, secondary: 0.85, tertiary: 0.95, unclassified: 1.1, residential: 1.2, living_street: 1.5, service: 1.6 };
for (const el of osm.elements) if (el.type === 'node') nodes.set(el.id, el);
for (const el of osm.elements) if (el.type === 'way' && ROADS.test(el.tags?.highway ?? '') && !seen.has(el.id) && !['private', 'no'].includes(el.tags.access)) {
  seen.add(el.id);
  const w = weight[el.tags.highway.replace('_link', '')] ?? 2;
  for (let i = 0; i < el.nodes.length - 1; i++) {
    const a = el.nodes[i], b = el.nodes[i + 1], na = nodes.get(a), nb = nodes.get(b); if (!na || !nb) continue;
    const c = dist(na, nb) * w;
    for (const [p, q] of [[a, b], [b, a]]) { if (!adj.has(p)) adj.set(p, []); adj.get(p).push([q, c, el.tags.name ?? el.tags.highway]); }
  }
}
const nearest = pt => { let best = null, bd = Infinity; for (const id of adj.keys()) { const d = dist(pt, nodes.get(id)); if (d < bd) { bd = d; best = id; } } return best; };
const start = nearest(A), goal = nearest(B);

const D = new Map([[start, 0]]), prev = new Map(), name = new Map(), open = new Set([start]);
while (open.size) {
  let u = null, du = Infinity; for (const id of open) if (D.get(id) < du) { du = D.get(id); u = id; }
  open.delete(u); if (u === goal) break;
  for (const [v, c, nm] of adj.get(u) || []) { const nd = du + c; if (nd < (D.get(v) ?? Infinity)) { D.set(v, nd); prev.set(v, u); name.set(v, nm); open.add(v); } }
}
if (!D.has(goal)) { console.error('no road between the two stations in these streets'); process.exit(1); }
const path = []; for (let u = goal; u !== undefined; u = prev.get(u)) path.push(nodes.get(u)); path.reverse();
// every node where the street turns more than a little, and others no further apart than `every`
const out = [path[0]]; let acc = 0, len = 0;
for (let i = 1; i < path.length; i++) {
  const d = dist(path[i - 1], path[i]); acc += d; len += d;
  const a = out[out.length - 1], b = path[i], c = path[i + 1];
  const turn = c ? Math.abs(Math.atan2(c.lat - b.lat, (c.lon - b.lon) * 0.6) - Math.atan2(b.lat - a.lat, (b.lon - a.lon) * 0.6)) : 0;
  if (acc >= every || (Math.min(turn, 2 * Math.PI - turn) > 0.35 && acc > 8)) { out.push(b); acc = 0; }
}
if (out[out.length - 1] !== path[path.length - 1]) out.push(path[path.length - 1]);
const pts = out.map(p => [+p.lat.toFixed(6), +p.lon.toFixed(6)]);
const names = []; for (let u = goal; u !== undefined; u = prev.get(u)) { const n = name.get(u); if (n && n !== names[0]) names.unshift(n); }
console.log(`road ${from} -> ${to}: ${(len / 1000).toFixed(2)} km, ${pts.length} points, by ${names.join(', ')}`);
const old = def.roads?.find(r => (r.from === from && r.to === to) || (r.from === to && r.to === from));
const entry = { from, to, via: via ?? old?.via ?? 'from OpenStreetMap (tools/osm-to-roads.mjs)', points: pts };
if (!write) { console.log(JSON.stringify(entry)); process.exit(0); }
// in place of the old entry's two lines (its head and its points), nothing else in the file touched
const lines = text.split('\n'), at = lines.findIndex(l => l.includes(`"from": "${old?.from}", "to": "${old?.to}"`) && l.includes('"via"'));
const fmt = `    { "from": ${JSON.stringify(entry.from)}, "to": ${JSON.stringify(entry.to)}, "via": ${JSON.stringify(entry.via)},\n      "points": [${pts.map(p => `[${p[0]}, ${p[1]}]`).join(', ')}] }`;
if (old && at >= 0 && lines[at + 1]?.trim().startsWith('"points"')) {
  const comma = lines[at + 1].trimEnd().endsWith(',') ? ',' : '';
  lines.splice(at, 2, ...(fmt + comma).split('\n'));
} else { console.error('no entry for these two stations in roads to replace'); process.exit(1); }
writeFileSync(netFile, lines.join('\n'));
JSON.parse(readFileSync(netFile, 'utf8'));
console.log(`written into roads in ${netFile}`);
