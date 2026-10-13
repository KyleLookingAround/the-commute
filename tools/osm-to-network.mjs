#!/usr/bin/env node
// Turn an OSM export into corridor waypoints for src/data/network.json.
//
// 1. Get the raw data (Overpass, in a browser at https://overpass-turbo.eu, Export > raw data):
//
//    [out:json][timeout:90];
//    ( way["railway"="rail"](53.39,-2.25,53.49,-2.14);
//      node["railway"="station"](53.39,-2.25,53.49,-2.14);
//      way["railway"="platform"](53.39,-2.25,53.49,-2.14); );
//    out body; >; out skel qt;
//
//    Save it as data/raw/corridor.json (that folder is gitignored).
//
// 2. Run:  node tools/osm-to-network.mjs data/raw/corridor.json --from "Stockport" --to "Manchester Piccadilly"
//
//    It stitches the rail ways into a graph, finds the shortest path between the two station nodes, and prints
//    a `waypoints` array (lat, lon) to paste into the corridor in network.json, plus the station lat/lons it saw
//    (the corridor for one line, drawn towards Manchester: run it from the far end to the junction, and keep a couple
//    of waypoints past the junction a corridor starts or ends at, which the network cuts it at; `corridorNote`)
//    and every railway=platform way near the path (useful for station kits).
//
//    --via "Belle Vue,Reddish North" makes the path call at those stations on the way (so it keeps to one line where
//    another runs between the same ends), and --from or --to may name a junction (a node named "... Junction") rather
//    than a station, or a point as "@lat,lon" (the nearest track to it). The export can also be OpenStreetMap's main API's tiles merged (`elements` of nodes and ways).
//
// This is a first pass: it picks one track of a multi-track line as the centreline. That is fine for the
// corridor (tracks are offsets from it); if it chooses the wrong side, nudge the track offsets in network.json.

import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args[0];
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
if (!file) { console.error('usage: node tools/osm-to-network.mjs <osm.json> [--from "Stockport"] [--to "Manchester Piccadilly"] [--every 60]'); process.exit(1); }
const fromName = opt('--from', 'Stockport'), toName = opt('--to', 'Manchester Piccadilly'), every = +opt('--every', 60);
const via = (opt('--via', '') || '').split(',').map(v => v.trim()).filter(Boolean);

const osm = JSON.parse(readFileSync(file, 'utf8'));
const nodes = new Map(), ways = [], stations = [], platforms = [];
for (const el of osm.elements) {
  if (el.type === 'node') { nodes.set(el.id, el); if (el.tags && (el.tags.railway === 'station' || /Junction$/.test(el.tags.name || ''))) stations.push(el); }
  else if (el.type === 'way' && el.tags) {
    if (el.tags.railway === 'rail') ways.push(el);
    if (el.tags.railway === 'platform') platforms.push(el);
  }
}
const dist = (a, b) => { const kx = 111320 * Math.cos(a.lat * Math.PI / 180), ky = 111320; return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * ky); };

// graph of rail nodes
const adj = new Map();
const link = (a, b, extra = 0) => { if (!adj.has(a)) adj.set(a, []); adj.get(a).push(b); if (extra) penalty.set(`${a},${b}`, extra); };
/** What crossing a bridged gap costs on top of its length, so the path keeps to one track and only bridges a real gap. */
const penalty = new Map();
for (const w of ways) for (let i = 0; i < w.nodes.length - 1; i++) { const a = w.nodes[i], b = w.nodes[i + 1]; link(a, b); link(b, a); }
// --bridge m: also link rail nodes within m metres of each other (a gap in the export, or a station's node on a track
// that only reaches the path the long way round a crossover), so the path keeps to the line
const bridge = +opt('--bridge', 0);
if (bridge) {
  const cell = new Map(), key = (n, i = 0, j = 0) => `${Math.floor(n.lat * 2000) + i},${Math.floor(n.lon * 1200) + j}`;
  for (const id of adj.keys()) { const n = nodes.get(id); if (!n) continue; const k = key(n); if (!cell.has(k)) cell.set(k, []); cell.get(k).push(id); }
  for (const id of adj.keys()) {
    const n = nodes.get(id); if (!n) continue;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of cell.get(key(n, i, j)) ?? []) if (o !== id && dist(n, nodes.get(o)) < bridge) link(id, o, 500);
  }
}

function nearestRailNode(pt) { let best = null, bd = Infinity; for (const id of adj.keys()) { const n = nodes.get(id); if (!n) continue; const d = dist(pt, n); if (d < bd) { bd = d; best = id; } } return best; }
const findStation = name => /^@/.test(name) ? (([lat, lon]) => ({ lat, lon, tags: { name } }))(name.slice(1).split(',').map(Number)) : stations.find(s => (s.tags.name || '').toLowerCase() === name.toLowerCase()) ?? stations.find(s => (s.tags.name || '').toLowerCase().includes(name.toLowerCase()));
const sFrom = findStation(fromName), sTo = findStation(toName);
if (!sFrom || !sTo) { console.error('stations found:', stations.map(s => s.tags.name).join(', ')); console.error(`could not find both "${fromName}" and "${toName}"`); process.exit(1); }
const stops = [sFrom, ...via.map(v => findStation(v) ?? (() => { console.error(`no station "${v}"`); process.exit(1); })()), sTo].map(nearestRailNode);
function shortest(start, goal) {
  const D = new Map([[start, 0]]), prev = new Map(), open = new Set([start]);
  while (open.size) {
    let u = null, du = Infinity; for (const id of open) if (D.get(id) < du) { du = D.get(id); u = id; }
    open.delete(u); if (u === goal) break;
    for (const v of adj.get(u) || []) { const nd = du + dist(nodes.get(u), nodes.get(v)) + (penalty.get(`${u},${v}`) ?? 0); if (nd < (D.get(v) ?? Infinity)) { D.set(v, nd); prev.set(v, u); open.add(v); } }
  }
  if (!D.has(goal)) { console.error('no rail path between the two stations in this export'); process.exit(1); }
  const out = []; for (let u = goal; u !== undefined; u = prev.get(u)) out.push(u); return [out.reverse(), D.get(goal)];
}
const path = [], D = new Map(); let total = 0;
for (let k = 1; k < stops.length; k++) { const [p, d] = shortest(stops[k - 1], stops[k]); path.push(...(k > 1 ? p.slice(1) : p)); total += d; }
const goal = stops[stops.length - 1]; D.set(goal, total);

// resample every N metres
const pts = path.map(id => nodes.get(id)); const out = [pts[0]]; let acc = 0;
for (let i = 1; i < pts.length; i++) { acc += dist(pts[i - 1], pts[i]); if (acc >= every) { out.push(pts[i]); acc = 0; } }
out.push(pts[pts.length - 1]);

let length = 0; for (let i = 1; i < pts.length; i++) length += dist(pts[i - 1], pts[i]);
console.log(`path ${fromName} -> ${toName}: ${(length / 1000).toFixed(2)} km, ${out.length} waypoints${D.get(goal) - length > 1 ? `, ${Math.round((D.get(goal) - length) / 500)} gaps bridged` : ''}`);
console.log('\n"waypoints": ' + JSON.stringify(out.map(p => [+p.lat.toFixed(6), +p.lon.toFixed(6)])) + '\n');
console.log('stations in export:');
for (const s of stations) console.log(`  ${s.tags.name}: ${s.lat}, ${s.lon}`);
console.log(`\nrailway=platform ways near the path: ${platforms.length} (ids: ${platforms.slice(0, 40).map(p => p.id).join(', ')}${platforms.length > 40 ? ', ...' : ''})`);
