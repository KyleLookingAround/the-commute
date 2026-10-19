// The feeder buses (step 21, docs/DESIGN.md, Feeder buses): for each bus stop in the network data, one real bus route
// through it from OpenStreetMap's main API (© OpenStreetMap contributors, ODbL), the stretch of it within REACH m of the
// stop along the route each way, written into the stop as `feeder` ({ ref, name, points: [lat, lon] every STEP m or so, note }).
//
//    node tools/osm-to-feeders.mjs [stop-id ...]      (every stop with none yet, or those named)
//    add --fresh to fetch again what's in data/raw/osm-routes/
//
// 1. The bus stops (highway=bus_stop, or a platform for buses) within 200 m of the stop, from a small map box.
// 2. The bus routes (route=bus relations) each is on, by the API's node relations; the most local is kept: the lowest
//    route number, numbers with letters (express and school buses) last.
// 3. That route's ways in their order, joined end to end, cut to REACH m along it each way from its nearest point to the
//    stop, and thinned to a point every STEP m.
// Fetches a second apart into the git-ignored data/raw/osm-routes/; writes src/data/network.json's stop lines in place.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), raw = join(root, 'data/raw/osm-routes'), netPath = join(root, 'src/data/network.json');
const REACH = 3000, STEP = 40, API = 'https://api.openstreetmap.org/api/0.6';
const args = process.argv.slice(2), fresh = args.includes('--fresh'), only = args.filter(a => !a.startsWith('--'));
mkdirSync(raw, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(path, file) {
  const at = join(raw, file);
  if (!fresh && existsSync(at)) return JSON.parse(readFileSync(at, 'utf8'));
  await sleep(1000);
  const res = await fetch(API + path, { headers: { 'User-Agent': 'the-commute feeder tool (https://github.com/kylelookingaround/the-commute)' } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const text = await res.text(); writeFileSync(at, text); return JSON.parse(text);
}
const metres = (a, b) => { const R = 6371000, la = (b[0] - a[0]) * Math.PI / 180, lo = (b[1] - a[1]) * Math.PI / 180 * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180); return R * Math.hypot(la, lo); };

const text = readFileSync(netPath, 'utf8'), net = JSON.parse(text);
let out = text;
for (const stop of net.stops) {
  if (only.length ? !only.includes(stop.id) : stop.feeder) continue;
  const c = [stop.lat, stop.lon], d = 0.002;
  const map = await get(`/map.json?bbox=${c[1] - d * 1.6},${c[0] - d},${c[1] + d * 1.6},${c[0] + d}`, `map-${stop.id}.json`);
  const stops = map.elements.filter(e => e.type === 'node' && e.tags && (e.tags.highway === 'bus_stop' || (e.tags.public_transport === 'platform' && e.tags.bus === 'yes')))
    .filter(e => metres(c, [e.lat, e.lon]) < 200);
  const routes = new Map();
  for (const s of stops) {
    const rel = await get(`/node/${s.id}/relations.json`, `rel-${s.id}.json`);
    for (const r of rel.elements) if (r.tags?.route === 'bus' && r.tags.ref) routes.set(r.id, r.tags);
  }
  const key = ref => (/^\d+$/.test(ref) ? 0 : 1000) + (parseInt(ref, 10) || 999);
  const pick = [...routes].sort((a, b) => key(a[1].ref) - key(b[1].ref))[0];
  if (!pick) { console.log(`${stop.id}: no bus routes found at its stops`); continue; }
  const full = await get(`/relation/${pick[0]}/full.json`, `route-${pick[0]}.json`);
  const nodes = new Map(full.elements.filter(e => e.type === 'node').map(n => [n.id, [n.lat, n.lon]]));
  const ways = new Map(full.elements.filter(e => e.type === 'way').map(w => [w.id, w.nodes]));
  const rel = full.elements.find(e => e.type === 'relation' && e.id === pick[0]);
  // the ways in their order, each turned to follow on from the last
  const line = [];
  for (const m of rel.members.filter(m => m.type === 'way' && !/platform|stop/.test(m.role))) {
    let ns = ways.get(m.ref); if (!ns) continue; ns = ns.map(n => nodes.get(n)).filter(Boolean);
    if (line.length) { const end = line[line.length - 1]; if (metres(end, ns[ns.length - 1]) < metres(end, ns[0])) ns = [...ns].reverse(); }
    else if (rel.members.length > 1) { /* the first way's direction is settled by the second */ }
    for (const p of ns) if (!line.length || metres(line[line.length - 1], p) > 1) line.push(p);
  }
  // through the nearest point to the stop, out each way while within REACH
  let k = 0; line.forEach((p, i) => { if (metres(c, p) < metres(c, line[k])) k = i; });
  let a = k, b = k, la = 0, lb = 0;
  while (a > 0 && la < REACH) { la += metres(line[a - 1], line[a]); a--; } while (b < line.length - 1 && lb < REACH) { lb += metres(line[b], line[b + 1]); b++; }
  const cut = line.slice(a, b + 1), pts = [cut[0]];
  for (const p of cut) if (metres(pts[pts.length - 1], p) >= STEP) pts.push(p);
  if (pts[pts.length - 1] !== cut[cut.length - 1]) pts.push(cut[cut.length - 1]);
  const len = pts.reduce((s, p, i) => i ? s + metres(pts[i - 1], p) : 0, 0);
  const feeder = { ref: pick[1].ref, name: pick[1].name ?? `Bus ${pick[1].ref}`, points: pts.map(([la, lo]) => [+la.toFixed(5), +lo.toFixed(5)]), note: `OpenStreetMap route relation ${pick[0]}, ${REACH / 1000} km along it each way from the stop` };
  // the stop's line in the data, with its feeder in place of any it had
  const line0 = out.split('\n').find(l => l.includes(`"id":"${stop.id}"`));
  const obj = JSON.parse(line0.trim().replace(/,$/, '')); obj.feeder = feeder;
  out = out.replace(line0, line0.replace(/\{.*\}/, JSON.stringify(obj)));
  console.log(`${stop.id}: the ${feeder.ref} (${feeder.name}), ${pts.length} points, ${(len / 1000).toFixed(1)} km`);
}
writeFileSync(netPath, out);
