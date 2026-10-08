// Draft a station kit from an OSM export: the platforms, buildings, footbridges, subways and steps near a station,
// projected into the kit's local frame (u along the line towards Manchester, v across it, y up) from the network in
// src/data/network.json. Prints parts to paste into src/data/kits/<station>.json and tidy by hand; it never writes a kit.
//   node tools/osm-to-kit.mjs data/raw/station-1.json stockport [--reach 300]
// Platforms (railway=platform areas) become `platform` parts from their extents along and across the line. Buildings
// become `footprint` parts: their outline in (u, v) and a height from building:levels (3.2 m a storey, 6 m if unknown).
// Footways on a bridge become `footbridge` parts, footways in a tunnel `subway` parts, both from their span across the line.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

register();
const { fromGeo } = await import('../src/sim/network.ts');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), file = args[0], stationId = args[1];
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? +args[i + 1] : d; };
if (!file || !stationId) { console.error('usage: node tools/osm-to-kit.mjs <osm.json> <station id> [--reach 300]'); process.exit(1); }
const reach = opt('--reach', 300);

const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')));
const st = net.station(stationId), c = net.corridor(st.corridor), frame = c.at(st.s), origin = net.def.origin;
const kLat = 111320, kLon = 111320 * Math.cos(origin.lat * Math.PI / 180);
// a lat/lon to the station's (u, v): u along the corridor's direction at the station, v along its normal
function uv(lat, lon) {
  const x = (lon - origin.lon) * kLon - frame.x, z = -(lat - origin.lat) * kLat - frame.z;
  return [x * frame.dx + z * frame.dz, x * frame.nx + z * frame.nz];
}
const osm = JSON.parse(readFileSync(file, 'utf8'));
const nodes = new Map(); for (const e of osm.elements) if (e.type === 'node') nodes.set(e.id, e);
const r1 = n => Math.round(n * 10) / 10;
const parts = [], skipped = [];
for (const w of osm.elements) {
  if (w.type !== 'way' || !w.tags) continue;
  const pts = w.nodes.map(id => nodes.get(id)).filter(Boolean).map(n => uv(n.lat, n.lon));
  if (!pts.length) continue;
  const us = pts.map(p => p[0]), vs = pts.map(p => p[1]);
  const u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
  if (Math.max(Math.abs(u0), Math.abs(u1)) > reach || Math.max(Math.abs(v0), Math.abs(v1)) > reach * 0.6) { skipped.push(w.id); continue; }
  const t = w.tags, name = t.name || t.ref || '';
  if (t.railway === 'platform' && t.train !== 'no' && !t.tram) {
    parts.push({ type: 'platform', u0: r1(u0), u1: r1(u1), v0: r1(v0), v1: r1(v1), osm: w.id, ref: name });
  } else if (t.building) {
    const levels = parseFloat(t['building:levels']), h = Number.isFinite(levels) ? levels * 3.2 : 6;
    const outline = pts.map(p => [r1(p[0]), r1(p[1])]);
    if (outline.length > 1 && outline[0][0] === outline.at(-1)[0] && outline[0][1] === outline.at(-1)[1]) outline.pop();
    parts.push({ type: 'footprint', outline, y0: 0, y1: r1(h), mat: 'brick', osm: w.id, name: name || t.building });
  } else if (t.highway && t.bridge) {
    parts.push({ type: 'footbridge', u: r1((u0 + u1) / 2), v0: r1(v0), v1: r1(v1), towers: [], osm: w.id, name });
  } else if (t.highway && t.tunnel) {
    parts.push({ type: 'subway', u: r1((u0 + u1) / 2), v0: r1(v0), v1: r1(v1), osm: w.id, name });
  } else if (t.highway === 'steps') {
    parts.push({ type: 'steps', u: r1((u0 + u1) / 2), v: r1((v0 + v1) / 2), osm: w.id, name });
  }
}
parts.sort((a, b) => a.type.localeCompare(b.type) || (a.u0 ?? a.u) - (b.u0 ?? b.u));
console.log(`${st.name}: ${parts.length} parts within ${reach} m along the line (${skipped.length} ways further out)`);
for (const p of parts) console.log(JSON.stringify(p));
