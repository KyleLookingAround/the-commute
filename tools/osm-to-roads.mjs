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
const from = opt('--from'), to = opt('--to'), every = +opt('--every', 40), via = opt('--via'), write = args.includes('--write'), underOnly = args.includes('--under'), main = opt('--main');
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!underOnly && !main && (!from || !to)) { console.error('usage: node tools/osm-to-roads.mjs --from <station id> --to <station id> [--every 40] [--write] [--via "..."] [osm.json]'); process.exit(1); }
const netFile = join(root, 'src/data/network.json'), text = readFileSync(netFile, 'utf8'), def = JSON.parse(text), net = fromGeo(def);
const origin = def.origin, kLat = 111320, kLon = 111320 * Math.cos(origin.lat * Math.PI / 180);
if (underOnly) { await markUnder(); process.exit(0); }
if (main) { await mainRoad(main); process.exit(0); }

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

// ---- the main roads (`mainRoads` in the network data): the A6, the M60 and the rest along their real courses ----
//
//   node tools/osm-to-roads.mjs --main a6 [--write]
//
// fetches OSM's main API in the same boxes (into data/raw/osm-tiles/main_*.json, the motorways to the tertiary roads
// and the railways, with their refs, lanes, one-ways, bridges and layers), growing out from the road's two ends along
// the ways carrying its ref (and any `also` it takes, the slip roads and the junctions' roundabouts), and writes the
// road: its carriageways as OpenStreetMap draws them (`ways`, each with its name, lanes, one-way and bridge, cut where
// any of those change and where another way joins, simplified to within a metre), its `course` (the middle of the road
// from one end to the other, every 20 m: what gridlock's cars drive, src/render/traffic.ts) and its `junctions` by
// name, each snapped to the real node where the roads meet. --write puts it into `mainRoads` in place of the road with
// the same id, nothing else touched.
/** The main roads the tool knows: each road's ref, its ends, the box it's fetched within and its junctions by name. */
function mainRoads() { return {
  a6: {
    ref: 'A6', name: 'A6', from: [53.3723, -2.1057], to: [53.4762, -2.2311], box: [53.368, -2.236, 53.481, -2.10],
    junctions: [
      { name: 'Hazel Grove, the A523', at: [53.37558, -2.11388] },
      { name: 'Torkington Road, the A627', at: [53.3773, -2.11635] },
      { name: 'New Moor Lane', at: [53.38444, -2.12732] },
      { name: 'Bramhall Lane, the A5102', at: [53.39845, -2.15283] },
      { name: 'Longshut Lane and Hempshaw Lane', at: [53.4012, -2.15597] },
      { name: 'Greek Street', at: [53.40517, -2.15876] },
      { name: 'Mersey Square', at: [53.4089, -2.1621] },
      { name: 'Heaton Lane', at: [53.4103, -2.16363] },
      { name: 'Travis Brow, the A5145', with: 'a5145', at: [53.41137, -2.16562] },
      { name: 'Heaton Chapel', at: [53.42679, -2.1768] },
      { name: 'Manchester Road, the A6188', at: [53.42989, -2.17909] },
      { name: 'Levenshulme', at: [53.44426, -2.19164] },
      { name: 'Longsight, the A5079', at: [53.45524, -2.1984] },
      { name: 'Dickenson Road, the A6010', at: [53.45651, -2.19993] },
      { name: 'Ardwick Green, the A57', with: 'a57', at: [53.4702, -2.22253] },
      { name: 'Mancunian Way, the A57(M)', at: [53.47404, -2.23008] },
      { name: 'Piccadilly', at: [53.4762, -2.2311] },
    ],
  },
  m60: {
    ref: 'M60', name: 'M60', from: [53.4058, -2.1913], to: [53.4219, -2.1290], box: [53.398, -2.205, 53.426, -2.125], rings: true,
    // the slip roads at junctions 1 and 27 (OpenStreetMap leaves some without the ref) and the junctions' roundabouts
    also: t => /^motorway_link$/.test(t.highway),
    junctions: [
      { name: 'Junction 1', with: 'a5145', at: [53.40914, -2.17514] },
      { name: 'Junction 27', with: 'a560', at: [53.4158, -2.1482] },
    ],
  },
  // from where today's real surroundings end in Heaton Mersey (2 km west of Stockport) to the A6
  a5145: {
    ref: 'A5145', name: 'A5145', from: [53.4128, -2.1925], to: [53.41137, -2.16562], box: [53.40, -2.20, 53.42, -2.16], rings: true,
    junctions: [
      { name: 'Junction 1', with: 'm60', at: [53.40914, -2.17514] },
      { name: 'Heaton Lane, the A560', with: 'a560', at: [53.40999, -2.16751] },
      { name: 'Travis Brow, the A6', with: 'a6', at: [53.41137, -2.16562] },
    ],
  },
  // Hyde Road from the A6 at Ardwick Green out past Belle Vue
  a57: {
    ref: 'A57', name: 'A57', from: [53.4702, -2.2225], to: [53.4620, -2.1785], box: [53.455, -2.23, 53.475, -2.17],
    junctions: [
      { name: 'Ardwick Green, the A6', with: 'a6', at: [53.4702, -2.22253] },
      { name: 'Ardwick, the A665', at: [53.4675, -2.2160] },
      { name: 'Pottery Lane, the A6010', at: [53.4652, -2.1964] },
      { name: 'Belle Vue', at: [53.4625, -2.1800] },
    ],
  },
  // from junction 1 through the town to Portwood and junction 27, and on out to Bredbury
  a560: {
    ref: 'A560', name: 'A560', from: [53.4091, -2.1745], to: [53.4240, -2.1050], box: [53.40, -2.18, 53.43, -2.10], rings: true,
    junctions: [
      { name: 'Junction 1', with: 'm60', at: [53.4086, -2.1736] },
      { name: 'Heaton Lane, the A5145', with: 'a5145', at: [53.40999, -2.16751] },
      { name: 'Junction 27', with: 'm60', at: [53.4158, -2.1482] },
      { name: 'Portwood, the A626', with: 'a626', at: [53.41658, -2.14982] },
      { name: 'Bredbury', at: [53.4240, -2.1050] },
    ],
  },
  // from the A560 at Portwood by St Mary's Way and Marple Road out to Marple
  a626: {
    ref: 'A626', name: 'A626', from: [53.41658, -2.14982], to: [53.4012, -2.0570], box: [53.39, -2.155, 53.42, -2.05], rings: true,
    junctions: [
      { name: 'Portwood, the A560', with: 'a560', at: [53.41658, -2.14982] },
      { name: 'Junction 27', with: 'm60', at: [53.4158, -2.1482] },
      { name: 'Offerton', at: [53.4040, -2.1340] },
      { name: 'Marple', at: [53.4012, -2.0570] },
    ],
  },
}; }
function mainHighway(t) { return /^(motorway|trunk|primary|secondary|tertiary)(_link)?$/.test(t ?? ''); }
/** A box of OSM's main API, its main roads and railways. */
async function mainTile(i, j) {
  const MAIN_T = 0.0125;
  const dir = join(root, 'data/raw/osm-tiles'); mkdirSync(dir, { recursive: true });
  const box = [j * MAIN_T, i * MAIN_T, (j + 1) * MAIN_T, (i + 1) * MAIN_T].map(n => n.toFixed(4)), f = join(dir, `main_${box.join('_')}.json`);
  if (!existsSync(f)) {
    let res = null;
    for (let k = 0; k < 4 && !res?.ok; k++) { if (k) await new Promise(r => setTimeout(r, 2000 * 2 ** k)); res = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${box.join(',')}`); }
    if (!res.ok) throw new Error(`OSM's main API said ${res.status} for ${box.join(',')}`);
    const all = (await res.json()).elements;
    const ways = all.filter(e => e.type === 'way' && (mainHighway(e.tags?.highway) || /^(rail|light_rail|tram)$/.test(e.tags?.railway ?? ''))), used = new Set(ways.flatMap(w => w.nodes));
    writeFileSync(f, JSON.stringify({ elements: [
      ...all.filter(e => e.type === 'node' && used.has(e.id)).map(({ id, lat, lon }) => ({ type: 'node', id, lat, lon })),
      ...ways.map(({ id, nodes, tags }) => ({ type: 'way', id, nodes, tags: Object.fromEntries(['highway', 'ref', 'name', 'lanes', 'oneway', 'bridge', 'layer', 'tunnel', 'junction', 'railway', 'service', 'usage'].filter(k => tags[k] !== undefined).map(k => [k, tags[k]])) })),
    ] }));
    console.error(`fetched ${box.join(',')}`);
  }
  return JSON.parse(readFileSync(f, 'utf8')).elements;
}
/** Every box the ways `take` picks run through, grown out from the seeds' boxes, within [south, west, north, east]. */
async function mainGrow(take, seeds, [S, W, N, E]) {
  const MAIN_T = 0.0125;
  const tileOf = (lat, lon) => [Math.floor(lat / MAIN_T), Math.floor(lon / MAIN_T)];
  const done = new Map(), queue = seeds.map(([la, lo]) => tileOf(la, lo));
  while (queue.length) {
    const [i, j] = queue.shift(), key = `${i},${j}`; if (done.has(key)) continue;
    const el = await mainTile(i, j); done.set(key, el);
    const nd = new Map(el.filter(e => e.type === 'node').map(e => [e.id, e]));
    for (const w of el) if (w.type === 'way' && take(w.tags)) for (const n of w.nodes) {
      const p = nd.get(n); if (!p || p.lat < S || p.lat > N || p.lon < W || p.lon > E) continue;
      const [a, b] = tileOf(p.lat, p.lon); if (!done.has(`${a},${b}`)) queue.push([a, b]);
    }
  }
  const nodes = new Map(), ways = new Map();
  for (const el of done.values()) for (const e of el) (e.type === 'node' ? nodes : ways).set(e.id, e);
  return { nodes, ways };
}
async function mainRoad(id) {
  const MAIN = mainRoads(), cfg = MAIN[id]; if (!cfg) { console.error(`no main road "${id}": one of ${Object.keys(MAIN).join(', ')}`); process.exit(1); }
  const refs = t => (t.ref ?? '').split(';').map(s => s.trim());
  const take = t => mainHighway(t.highway) && (refs(t).includes(cfg.ref) || (cfg.also?.(t) ?? false));
  const { nodes, ways } = await mainGrow(take, [cfg.from, cfg.to], cfg.box);
  const kx = 111320 * Math.cos(origin.lat * Math.PI / 180), xy = n => [(n.lon - origin.lon) * kx, (origin.lat - n.lat) * kLat];
  const mine = [...ways.values()].filter(w => take(w.tags) && w.nodes.every(n => nodes.has(n)));
  // the junctions' roundabouts: every roundabout way a slip road reaches, and the ring they make
  if (cfg.rings) for (let more = true; more;) {
    more = false; const at = new Set(mine.flatMap(w => w.nodes)), have = new Set(mine.map(w => w.id));
    for (const w of ways.values()) if (!have.has(w.id) && /^(roundabout|circular)$/.test(w.tags.junction ?? '') && mainHighway(w.tags.highway) && w.nodes.some(n => at.has(n)) && w.nodes.every(n => nodes.has(n))) { mine.push(w); more = true; }
  }
  // one-ways as OpenStreetMap means them: a motorway, a roundabout, oneway=yes (or -1, the other way)
  const one = w => w.tags.oneway === '-1' ? -1 : (w.tags.oneway === 'yes' || w.tags.junction === 'roundabout' || (/^motorway/.test(w.tags.highway) && w.tags.oneway !== 'no')) ? 1 : 0;
  // the ways it can be routed along: its own, and (dearer) any other main road's in the box, where OpenStreetMap leaves a
  // stretch of it without the ref (a link into a roundabout); those it uses join it
  const adjm = new Map(), edge = new Map(), link = (a, b, c, w) => { if (!adjm.has(a)) adjm.set(a, []); adjm.get(a).push([b, c]); edge.set(a + '>' + b, w); };
  const own = new Set(mine.map(w => w.id)), ownNodes = new Set(mine.flatMap(w => w.nodes)), [S0, W0, N0, E0] = cfg.box;
  const inBox = n => { const p = nodes.get(n); return p && p.lat >= S0 && p.lat <= N0 && p.lon >= W0 && p.lon <= E0; };
  for (const w of ways.values()) {
    if (!own.has(w.id) && !(mainHighway(w.tags.highway) && w.nodes.every(inBox))) continue;
    for (let i = 1; i < w.nodes.length; i++) {
      const a = w.nodes[i - 1], b = w.nodes[i], c = Math.hypot(...xy(nodes.get(a)).map((v, k) => v - xy(nodes.get(b))[k])) * (!own.has(w.id) ? 5 : refs(w.tags).includes(cfg.ref) ? 1 : 3), o = one(w);
      if (o >= 0) link(a, b, c, w); if (o <= 0) link(b, a, c, w);
    }
  }
  const near = ([lat, lon]) => { let best = null, bd = Infinity; for (const n of ownNodes) { const p = nodes.get(n), d = Math.hypot((p.lon - lon) * kx, (p.lat - lat) * kLat); if (d < bd) { bd = d; best = n; } } return best; };
  // the quickest way from near one point to near the other (within 30 m of each: a dual carriageway's two ways)
  const within = ([lat, lon], r) => { const s = new Set([...ownNodes].filter(n => { const p = nodes.get(n); return Math.hypot((p.lon - lon) * kx, (p.lat - lat) * kLat) < r; })); return s.size ? s : new Set([near([lat, lon])]); };
  const route = (from, to) => {
    const a = within(from, 30), b = within(to, 30), D = new Map([...a].map(n => [n, 0])), prev = new Map(), open = new Set(a);
    let end = null;
    while (open.size) {
      let u = null, du = Infinity; for (const n of open) if (D.get(n) < du) { du = D.get(n); u = n; }
      open.delete(u); if (b.has(u)) { const p = nodes.get(u), q = end === null ? null : nodes.get(end); if (!q || Math.hypot((p.lon - to[1]) * kx, (p.lat - to[0]) * kLat) < Math.hypot((q.lon - to[1]) * kx, (q.lat - to[0]) * kLat)) end = u; }
      for (const [v, c] of adjm.get(u) ?? []) if (du + c < (D.get(v) ?? Infinity)) { D.set(v, du + c); prev.set(v, u); open.add(v); }
    }
    if (end === null) {
      // how far it got: the reached node nearest the far end
      let far = null, fd = Infinity; for (const n of D.keys()) { const p = nodes.get(n), d = Math.hypot((p.lon - to[1]) * kx, (p.lat - to[0]) * kLat); if (d < fd) { fd = d; far = p; } }
      console.error(`no way along the ${cfg.name} from ${from} to ${to}: it gets to ${far.lat}, ${far.lon}, ${fd.toFixed(0)} m short`); process.exit(1);
    }
    const out = []; for (let u = end; u !== undefined; u = prev.get(u)) { out.push(xy(nodes.get(u))); const p = prev.get(u), w = p !== undefined && edge.get(p + '>' + u); if (w && !own.has(w.id)) { own.add(w.id); mine.push(w); } }
    return out.reverse();
  };
  const up = route(cfg.from, cfg.to), down = route(cfg.to, cfg.from).reverse();
  // the middle of the road: each step along the way up, halfway to the way down where they run apart (a dual
  // carriageway, a one-way pair) within 40 m
  const resample = (P, step) => {
    const out = [P[0]]; let left = step;
    for (let i = 1; i < P.length; i++) {
      let [ax, az] = P[i - 1]; const [bx, bz] = P[i]; let l = Math.hypot(bx - ax, bz - az);
      while (l >= left) { const t = left / l; ax += (bx - ax) * t; az += (bz - az) * t; out.push([ax, az]); l -= left; left = step; }
      left -= l;
    }
    if (Math.hypot(out.at(-1)[0] - P.at(-1)[0], out.at(-1)[1] - P.at(-1)[1]) > step / 3) out.push(P.at(-1)); else out[out.length - 1] = P.at(-1);
    return out;
  };
  const nearestOn = (P, [x, z]) => {
    let best = null, bd = Infinity;
    for (let i = 1; i < P.length; i++) {
      const [ax, az] = P[i - 1], [bx, bz] = P[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = [px, pz]; }
    }
    return { at: best, d: bd };
  };
  let mid = resample(up, 10).map(p => { const q = nearestOn(down, p); return q.d < 40 ? [(p[0] + q.at[0]) / 2, (p[1] + q.at[1]) / 2] : p; });
  for (let pass = 0; pass < 3; pass++) mid = mid.map((p, i) => i === 0 || i === mid.length - 1 ? p : [(mid[i - 1][0] + 2 * p[0] + mid[i + 1][0]) / 4, (mid[i - 1][1] + 2 * p[1] + mid[i + 1][1]) / 4]);
  const course = resample(mid, 20);
  const cum = [0]; for (let i = 1; i < course.length; i++) cum.push(cum[i - 1] + Math.hypot(course[i][0] - course[i - 1][0], course[i][1] - course[i - 1][1]));
  const along = p => {
    let best = 0, bd = Infinity;
    for (let i = 1; i < course.length; i++) {
      const [ax, az] = course[i - 1], [bx, bz] = course[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / l2)) : 0;
      const d = Math.hypot(ax + dx * t - p[0], az + dz * t - p[1]); if (d < bd) { bd = d; best = cum[i - 1] + t * (cum[i] - cum[i - 1]); }
    }
    return { s: best, d: bd };
  };
  // the carriageways: the road's ways beside the course between its ends, cut back where they run on past them
  const pinned = new Set(cfg.junctions.map(j => near(j.at)));
  const reach = w => refs(w.tags).includes(cfg.ref) && !/_link$/.test(w.tags.highway) ? 45 : 250;
  const kept = [];
  for (const w of mine) {
    const inside = n => { const q = along(xy(nodes.get(n))); return pinned.has(n) || (q.d < reach(w) && ((q.s > 1 && q.s < cum.at(-1) - 1) || q.d < 12)); };
    let a = 0, b = w.nodes.length - 1;
    while (a <= b && !inside(w.nodes[a])) a++;
    while (b >= a && !inside(w.nodes[b])) b--;
    if (a > 0) a--; if (b < w.nodes.length - 1) b++;
    if (b - a >= 1 && w.nodes.slice(a, b + 1).some(inside)) kept.push({ ...w, nodes: w.nodes.slice(a, b + 1) });
  }
  // joined end to end where nothing else meets and nothing about the road changes
  const deg = new Map(); for (const w of kept) for (const n of w.nodes) deg.set(n, (deg.get(n) ?? 0) + 1);
  const key = w => JSON.stringify([w.tags.name ?? '', w.tags.lanes ?? '', one(w) !== 0, w.tags.bridge && w.tags.bridge !== 'no' ? 1 : 0, w.tags.layer ?? '', w.tags.tunnel ?? '']);
  const runs = kept.map(w => ({ w, nodes: one(w) < 0 ? [...w.nodes].reverse() : [...w.nodes], k: key(w), two: one(w) === 0 }));
  for (let merged = true; merged;) {
    merged = false;
    for (const r of runs) for (const q of runs) {
      if (r === q || r.k !== q.k || !r.nodes.length || !q.nodes.length) continue;
      const end = r.nodes.at(-1);
      if (deg.get(end) !== 2) continue;
      if (q.nodes[0] === end) { r.nodes.push(...q.nodes.slice(1)); q.nodes = []; merged = true; }
      else if (r.two && q.two && q.nodes.at(-1) === end) { r.nodes.push(...[...q.nodes].reverse().slice(1)); q.nodes = []; merged = true; }
    }
  }
  // the junctions, each at the real node nearest where it's named
  const junctions = cfg.junctions.map(j => { const n = near(j.at), p = nodes.get(n); return { name: j.name, ...(j.with ? { with: j.with } : {}), at: [+p.lat.toFixed(6), +p.lon.toFixed(6)], node: n }; });
  const pin = new Set([...junctions.map(j => j.node), ...[...deg].filter(([, c]) => c > 2).map(([n]) => n)]);
  // simplified to within a metre, keeping where ways meet
  const simplify = ids => {
    const P = ids.map(n => xy(nodes.get(n))), keep = new Set([0, ids.length - 1]);
    ids.forEach((n, i) => { if (pin.has(n)) keep.add(i); });
    const dp = (a, b) => {
      let worst = -1, wd = 1.0; const [ax, az] = P[a], [bx, bz] = P[b], l = Math.hypot(bx - ax, bz - az) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((bx - ax) * (az - P[i][1]) - (ax - P[i][0]) * (bz - az)) / l; if (d > wd) { wd = d; worst = i; } }
      if (worst >= 0) { keep.add(worst); dp(a, worst); dp(worst, b); }
    };
    const order = [...keep].sort((a, b) => a - b); for (let i = 1; i < order.length; i++) dp(order[i - 1], order[i]);
    return [...keep].sort((a, b) => a - b).map(i => { const p = nodes.get(ids[i]); return [+p.lat.toFixed(6), +p.lon.toFixed(6)]; });
  };
  const out = runs.filter(r => r.nodes.length > 1).map(r => {
    const t = r.w.tags, o = one(r.w) !== 0, lanes = +t.lanes || (o ? 2 : 2);
    return { name: t.name ?? (t.junction === 'roundabout' ? 'roundabout' : t.highway), ...(refs(t).includes(cfg.ref) ? {} : { ref: t.ref ?? '' }), lanes, ...(o ? { oneway: true } : {}),
      ...(t.bridge && t.bridge !== 'no' ? { bridge: true } : {}), ...(t.tunnel && t.tunnel !== 'no' ? { tunnel: true } : {}), ...(t.layer ? { layer: +t.layer } : {}), points: simplify(r.nodes) };
  }).sort((a, b) => along(xy({ lat: a.points[0][0], lon: a.points[0][1] })).s - along(xy({ lat: b.points[0][0], lon: b.points[0][1] })).s);
  const ll = ([x, z]) => [+(origin.lat - z / kLat).toFixed(6), +(origin.lon + x / kx).toFixed(6)];
  const names = [...new Set(out.filter(w => !w.ref && !/^(trunk|primary|secondary|tertiary|motorway|roundabout)(_link)?$/.test(w.name)).map(w => w.name))];
  const road = { id, ref: cfg.ref, name: cfg.name, via: `from OpenStreetMap (tools/osm-to-roads.mjs --main ${id}, ${new Date().toISOString().slice(0, 10)}): ${names.join(', ')}`,
    junctions: junctions.map(({ node, ...j }) => j), course: course.map(ll), ways: out };
  const pts = out.reduce((n, w) => n + w.points.length, 0);
  // where it meets the other main roads in OpenStreetMap (a node shared with a way carrying another's ref), to name in
  // its junctions
  const keptNodes = new Set(kept.flatMap(w => w.nodes)), others = Object.entries(MAIN).filter(([k]) => k !== id), met = new Map();
  for (const w of ways.values()) for (const [k, o] of others) if (mainHighway(w.tags.highway) && refs(w.tags).includes(o.ref)) for (const n of w.nodes) if (keptNodes.has(n) && !met.has(k + n)) met.set(k + n, `  meets the ${o.name} (${k}) at ${nodes.get(n).lat}, ${nodes.get(n).lon}${road.junctions.some(j => j.with === k) ? '' : ': not named'}`);
  for (const m of new Set(met.values())) console.log(m);
  console.log(`${cfg.name}: ${(cum.at(-1) / 1000).toFixed(2)} km, ${out.length} ways (${pts} points), ${out.filter(w => w.bridge).length} on bridges, the course ${course.length} points; by ${names.join(', ')}`);
  for (const j of road.junctions) console.log(`  ${j.name}: ${j.at.join(', ')}`);
  if (!write) process.exit(0);
  // the main roads block, written whole, one way to a line
  const lines = text.split('\n'), cur = JSON.parse(text), list = (cur.mainRoads ?? []).filter(r => r.id !== id);
  const order = Object.keys(MAIN); list.push(road); list.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const pl = p => `[${p.map(q => `[${q[0]}, ${q[1]}]`).join(', ')}]`;
  const fmtRoad = r => [
    `    { "id": ${JSON.stringify(r.id)}, "ref": ${JSON.stringify(r.ref)}, "name": ${JSON.stringify(r.name)}, "via": ${JSON.stringify(r.via)},${r.note ? ` "note": ${JSON.stringify(r.note)},` : ''}`,
    `      "junctions": [${r.junctions.map(j => JSON.stringify(j).replace(/,"/g, ', "').replace(/":/g, '": ').replace(/,(?=-?\d)/g, ', ')).join(', ')}],`,
    `      "course": ${pl(r.course)},`,
    `      "ways": [`,
    ...r.ways.map((w, i) => `        { ${Object.entries(w).filter(([k]) => k !== 'points').map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(', ')}, "points": ${pl(w.points)} }${i < r.ways.length - 1 ? ',' : ''}`),
    `      ] }`,
  ].join('\n');
  const block = `  "mainRoads": [\n${list.map(fmtRoad).join(',\n')}\n  ],`;
  const at0 = lines.findIndex(l => l.startsWith('  "mainRoads": ['));
  if (at0 >= 0) { let at1 = at0; while (!lines[at1].startsWith('  ],')) at1++; lines.splice(at0, at1 - at0 + 1, ...block.split('\n')); }
  else { const c = lines.findIndex(l => l.startsWith('  "contract":')); lines.splice(c, 0, ...block.split('\n')); }
  writeFileSync(netFile, lines.join('\n'));
  JSON.parse(readFileSync(netFile, 'utf8'));
  console.log(`written into mainRoads in ${netFile}`);
}
