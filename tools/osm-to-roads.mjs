#!/usr/bin/env node
// Turn an OSM export into the road between two stations for `roads` in src/data/network.json, as tools/osm-to-network.mjs
// does for the line: the rail replacement buses drive it, and later trams and buses.
//
// 1. Get the raw data (Overpass, in a browser at https://overpass-turbo.eu, Export > raw data):
//
//    [out:json][timeout:90];
//    ( way["highway"~"^(trunk|primary|secondary|tertiary|unclassified|residential|service)$"](53.37,-2.24,53.48,-2.11); );
//    out body; >; out skel qt;
//
//    Save it as data/raw/roads.json (that folder is gitignored).
//
// 2. Run:  node tools/osm-to-roads.mjs data/raw/roads.json --from stockport --to heaton-chapel [--every 40]
//
//    It finds the road nodes nearest each station's way out (the kit's `busstop` part, else the station's own point),
//    the quickest path between them by road (main roads count as shorter, so it keeps to the A6 as a bus would), and
//    prints a road entry to paste into `roads`, resampled every N metres.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), file = args[0];
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
if (!file) { console.error('usage: node tools/osm-to-roads.mjs <osm.json> --from <station id> --to <station id> [--every 40]'); process.exit(1); }
const from = opt('--from'), to = opt('--to'), every = +opt('--every', 40);
const net = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'));

const dist = (a, b) => { const kx = 111320 * Math.cos(a.lat * Math.PI / 180), ky = 111320; return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * ky); };
/** A station's way out in lat/lon: its kit's bus stop, carried from the kit's frame by the corridor's heading there. */
function wayOut(id) {
  const st = net.stations.find(s => s.id === id); if (!st) throw new Error(`no station "${id}"`);
  const kit = JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8')), stop = kit.parts.find(p => p.type === 'busstop');
  if (!stop) return { lat: st.lat, lon: st.lon };
  // the line's heading at the station, from the corridor's nearest waypoints
  const wp = net.corridors[0].waypoints.map(([lat, lon]) => ({ lat, lon }));
  let k = 0; for (let i = 1; i < wp.length; i++) if (dist(wp[i], st) < dist(wp[k], st)) k = i;
  const a = wp[Math.max(0, k - 1)], b = wp[Math.min(wp.length - 1, k + 1)], kx = 111320 * Math.cos(st.lat * Math.PI / 180);
  let dx = (b.lon - a.lon) * kx, dy = (b.lat - a.lat) * 111320; const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  // u along the line towards Manchester (the waypoints run that way), v across it to the right, both real
  const e = stop.u * dx + stop.v * dy, n = stop.u * dy - stop.v * dx;
  return { lat: st.lat + n / 111320, lon: st.lon + e / kx };
}

const osm = JSON.parse(readFileSync(file, 'utf8'));
const nodes = new Map(), adj = new Map();
const weight = { trunk: 0.7, primary: 0.75, secondary: 0.85, tertiary: 0.95, unclassified: 1.1, residential: 1.2, service: 1.5 };
for (const el of osm.elements) if (el.type === 'node') nodes.set(el.id, el);
for (const el of osm.elements) if (el.type === 'way' && el.tags?.highway) {
  const w = weight[el.tags.highway] ?? 2;
  for (let i = 0; i < el.nodes.length - 1; i++) {
    const a = el.nodes[i], b = el.nodes[i + 1], na = nodes.get(a), nb = nodes.get(b); if (!na || !nb) continue;
    const c = dist(na, nb) * w;
    for (const [p, q] of [[a, b], [b, a]]) { if (!adj.has(p)) adj.set(p, []); adj.get(p).push([q, c]); }
  }
}
const nearest = pt => { let best = null, bd = Infinity; for (const id of adj.keys()) { const d = dist(pt, nodes.get(id)); if (d < bd) { bd = d; best = id; } } return best; };
const A = wayOut(from), Bp = wayOut(to), start = nearest(A), goal = nearest(Bp);

const D = new Map([[start, 0]]), prev = new Map(), open = new Set([start]);
while (open.size) {
  let u = null, du = Infinity; for (const id of open) if (D.get(id) < du) { du = D.get(id); u = id; }
  open.delete(u); if (u === goal) break;
  for (const [v, c] of adj.get(u) || []) { const nd = du + c; if (nd < (D.get(v) ?? Infinity)) { D.set(v, nd); prev.set(v, u); open.add(v); } }
}
if (!D.has(goal)) { console.error('no road between the two stations in this export'); process.exit(1); }
const path = []; for (let u = goal; u !== undefined; u = prev.get(u)) path.push(nodes.get(u)); path.reverse();
const out = [path[0]]; let acc = 0, len = 0;
for (let i = 1; i < path.length; i++) { const d = dist(path[i - 1], path[i]); acc += d; len += d; if (acc >= every) { out.push(path[i]); acc = 0; } }
if (out[out.length - 1] !== path[path.length - 1]) out.push(path[path.length - 1]);
console.log(`road ${from} -> ${to}: ${(len / 1000).toFixed(2)} km, ${out.length} points`);
console.log(JSON.stringify({ from, to, via: 'from OpenStreetMap (tools/osm-to-roads.mjs)', points: out.map(p => [+p.lat.toFixed(6), +p.lon.toFixed(6)]) }));
