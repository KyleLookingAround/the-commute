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
// changing nothing else in the file, its `via` the streets it takes (or --via's).
//
//   node tools/osm-to-roads.mjs --under [--write]
//
// marks where every road in `roads` passes under the line: each place it crosses a railway OpenStreetMap has on a
// bridge (railway=rail on bridge=* or layer >= 1, from the main API into data/raw/osm-tiles/rail_*.json), the road's
// points within UNDER_REACH m of it either side, as its `under` stretches ([first, last] point index) that the page
// lets pass under the railway's land (src/render/buses.ts). --write puts them on each entry's first line, nothing
// else touched.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

register();
const { fromGeo } = await import('../src/sim/network.ts');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const from = opt('--from'), to = opt('--to'), every = +opt('--every', 40), via = opt('--via'), write = args.includes('--write'), underOnly = args.includes('--under');
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!underOnly && (!from || !to)) { console.error('usage: node tools/osm-to-roads.mjs --from <station id> --to <station id> [--every 40] [--write] [--via "..."] [osm.json]'); process.exit(1); }
const netFile = join(root, 'src/data/network.json'), text = readFileSync(netFile, 'utf8'), def = JSON.parse(text), net = fromGeo(def);
const origin = def.origin, kLat = 111320, kLon = 111320 * Math.cos(origin.lat * Math.PI / 180);
if (underOnly) { await markUnder(); process.exit(0); }

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
// each way out joins the streets at the nearest point on any of them (not only at a node: a long straight street has
// few), as a node of its own between that stretch's two ends
const nearest = (pt, id) => {
  let best = null, bd = Infinity;
  for (const [a, list] of adj) for (const [b] of list) {
    const na = nodes.get(a), nb = nodes.get(b), kx = 111320 * Math.cos(pt.lat * Math.PI / 180), ky = 111320;
    const ax = (na.lon - pt.lon) * kx, ay = (na.lat - pt.lat) * ky, bx = (nb.lon - pt.lon) * kx, by = (nb.lat - pt.lat) * ky, dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const f = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0, d = Math.hypot(ax + dx * f, ay + dy * f);
    if (d < bd) { bd = d; best = { a, b, f, lat: na.lat + (nb.lat - na.lat) * f, lon: na.lon + (nb.lon - na.lon) * f }; }
  }
  const n = { id, lat: best.lat, lon: best.lon }; nodes.set(id, n); adj.set(id, []);
  for (const end of [best.a, best.b]) { const c = dist(n, nodes.get(end)) * 0.9; adj.get(id).push([end, c, null]); adj.get(end).push([id, c, null]); }
  return id;
};
const start = nearest(A, 'way out a'), goal = nearest(B, 'way out b');

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
const named = names.filter(n => !/^(service|primary|secondary|tertiary|trunk|unclassified|residential)(_link)?$/.test(n));
const entry = { from, to, via: via ?? `from OpenStreetMap (tools/osm-to-roads.mjs, ${new Date().toISOString().slice(0, 10)}): ${named.join(', ')}`, points: pts };
if (!write) { console.log(JSON.stringify(entry)); process.exit(0); }
// in place of the old entry's two lines (its head and its points), nothing else in the file touched
const lines = text.split('\n'), at = lines.findIndex(l => l.includes(`"from": "${old?.from}", "to": "${old?.to}"`) && l.includes('"via"'));
const fmt = `    { "from": ${JSON.stringify(entry.from)}, "to": ${JSON.stringify(entry.to)}, "via": ${JSON.stringify(entry.via)},\n      "points": [${pts.map(p => `[${p[0]}, ${p[1]}]`).join(', ')}] }`;
const n = lines[at]?.includes('"points"') ? 1 : lines[at + 1]?.trim().startsWith('"points"') ? 2 : 0;   // on one line, or two
if (old && at >= 0 && n) {
  const comma = lines[at + n - 1].trimEnd().endsWith(',') ? ',' : '';
  lines.splice(at, n, ...(fmt + comma).split('\n'));
} else { console.error('no entry for these two stations in roads to replace'); process.exit(1); }
writeFileSync(netFile, lines.join('\n'));
JSON.parse(readFileSync(netFile, 'utf8'));
console.log(`written into roads in ${netFile}`);

// ---- where each road passes under the line ----
async function markUnder() {
  const UNDER_REACH = 60, T = 0.0125, dir = join(root, 'data/raw/osm-tiles'); mkdirSync(dir, { recursive: true });
  const k = 111320, kx = 111320 * Math.cos(origin.lat * Math.PI / 180), xy = ([lat, lon]) => [(lon - origin.lon) * kx, (lat - origin.lat) * k];
  const tiles = new Map();
  /** The railway's bridges in a tile of the main API: each a list of [lat, lon]. */
  const railIn = async (la, lo) => {
    const box = [lo, la, lo + T, la + T].map(n => n.toFixed(4)), key = box.join('_'), f = join(dir, `rail_${key}.json`);
    if (tiles.has(key)) return tiles.get(key);
    if (!existsSync(f)) {
      const res = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${box.join(',')}`);
      if (!res.ok) throw new Error(`OSM's main API said ${res.status} for ${box.join(',')}`);
      const all = (await res.json()).elements, nd = new Map(all.filter(e => e.type === 'node').map(e => [e.id, e]));
      const ways = all.filter(e => e.type === 'way' && /^(rail|light_rail|narrow_gauge)$/.test(e.tags?.railway ?? '') && ((e.tags.bridge && e.tags.bridge !== 'no') || +(e.tags.layer ?? 0) >= 1));
      writeFileSync(f, JSON.stringify(ways.map(w => w.nodes.map(n => nd.get(n)).filter(Boolean).map(n => [n.lat, n.lon]))));
      console.error(`fetched ${box.join(',')}`);
    }
    const got = JSON.parse(readFileSync(f, 'utf8')); tiles.set(key, got); return got;
  };
  const cross = (a, b, c, d) => {
    const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]], den = r[0] * q[1] - r[1] * q[0]; if (!den) return null;
    const t = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
  };
  const lines = text.split('\n'), found = [];
  for (const r of def.roads ?? []) {
    const P = r.points.map(xy), d = [0]; for (let i = 1; i < P.length; i++) d.push(d[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const keys = new Set(r.points.flatMap(([la, lo]) => [-1, 0, 1].flatMap(di => [-1, 0, 1].map(dj => `${Math.floor(la / T) + di},${Math.floor(lo / T) + dj}`)))), bridges = [];
    for (const key of keys) { const [i, j] = key.split(',').map(Number); bridges.push(...(await railIn(i * T, j * T)).map(w => w.map(xy))); }
    // the distance along the road of every crossing with a railway on a bridge
    const at = [];
    for (let i = 1; i < P.length; i++) for (const w of bridges) for (let j = 1; j < w.length; j++) { const t = cross(P[i - 1], P[i], w[j - 1], w[j]); if (t !== null) at.push(d[i - 1] + t * (d[i] - d[i - 1])); }
    // each crossing's stretch: from the last point UNDER_REACH m or more before it to the first as far after it
    const runs = [];
    for (const s of at.sort((a, b) => a - b)) {
      let a = 0; while (a + 1 < P.length && d[a + 1] <= s - UNDER_REACH) a++;
      let b = P.length - 1; while (b - 1 >= 0 && d[b - 1] >= s + UNDER_REACH) b--;
      const last = runs.at(-1); if (last && a <= last[1]) last[1] = Math.max(last[1], b); else runs.push([a, b]);
    }
    found.push(`${r.from} -> ${r.to}: ${runs.length ? runs.map(([a, b]) => `${a}-${b}`).join(', ') : 'none'}`);
    const li = lines.findIndex(l => l.includes(`"from": "${r.from}", "to": "${r.to}"`) && l.includes('"via"'));
    if (li < 0) { console.error(`no line for ${r.from} -> ${r.to}`); continue; }
    lines[li] = lines[li].replace(/, "under": \[[^\]]*(\][^\]]*)*?\]\]/, '').replace(/, "under": \[\]/, '');
    if (runs.length) lines[li] = lines[li].replace(/("via": "(?:[^"\\]|\\.)*")/, `$1, "under": ${JSON.stringify(runs).replace(/,/g, ', ')}`);
  }
  console.log(found.join('\n'));
  if (write) { writeFileSync(netFile, lines.join('\n')); JSON.parse(readFileSync(netFile, 'utf8')); console.log(`written into roads in ${netFile}`); }
}
