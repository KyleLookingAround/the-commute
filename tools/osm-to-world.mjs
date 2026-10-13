#!/usr/bin/env node
// The real surroundings: every building from OpenStreetMap (© OpenStreetMap contributors, ODbL), its height from the
// Environment Agency's LIDAR where OSM has none (the Composite first-return DSM less the DTM, 1 m, Open Government
// Licence), into the world tiles the page draws (src/render/buildings.ts), one per kilometre square.
//
//    node tools/osm-to-world.mjs --station levenshulme --radius 600 [--station heaton-chapel --radius 600 ...]
//    node tools/osm-to-world.mjs --corridor 900 [--from heaton-chapel --to piccadilly]
//    node tools/osm-to-world.mjs --square 3_-41 [--square ...]
//    node tools/osm-to-world.mjs --all        (writes again every square already in src/data/world/)
//    node tools/osm-to-world.mjs --bridges --corridor 200 --from hazel-grove --to piccadilly
//                                             (lists the bridges over the line the LIDAR shows, against the kits'; writes nothing)
//    add --fresh to fetch again what's in data/raw/
//
// An area is a set of kilometre squares of the game's frame (x east, z south of the network's origin, in metres; square
// i_j covers x from 1000 i, z from 1000 j): every square a station's circle touches, every square within --corridor m
// of the line (or of its stretch between --from and --to), or the squares named. A line out runs it for its own
// stations or stretch the same way; squares already written and not in the area are left as they are.
//
// 1. Fetches, into the git-ignored data/raw/: OSM's main API (api.openstreetmap.org/api/0.6/map.json) in boxes of a
//    quarter square, a second apart (it refuses big boxes, and asks for a polite rate), and the DSM and DTM over the
//    WCS in 500 m chunks every 1 m (the DTM's chunks are tools/lidar-to-terrain.mjs's, shared).
// 2. Each building (a way or a multipolygon's outer ways tagged building, not underground): its outline in game metres
//    (real, as the ground is surveyed: the page moves it out by the line's extra width as the terrain does); fitted as an
//    oriented rectangle where it nearly is one (most British houses), its outline otherwise. Its walls: `height`, else
//    `building:levels` at 3 m a storey, else the DSM less the DTM over its footprint, else 2 storeys. Its roof:
//    `roof:shape`, else pitched for houses and terraces (flat over 4 storeys or 30 m across), else read from the DSM (a
//    level top is flat). Its colours from the area's palette (the photo library's "For the map" lists).
// 3. Terraces join into rows: rectangles sharing a wall (two nodes) with like heights and roofs become one block with one
//    roof, while the row stays nearly a rectangle, so a straight street of 20 is one piece.
// 4. Writes src/data/world/<i>_<j>.txt, a header line (JSON: what's in it, where it's from, what's filled in), then one
//    line a piece in a text encoding (decodeWorld in src/render/buildings.ts):
//    R  (x z w d yaw h roof wall top flags)*  the rectangles, one line: centre, size (w along yaw, d across), walls, roof
//    P  h roof wall top flags n (x z)*n        an outline, flat-roofed
//    T  (xz h r)*                               the trees, one line: each top's place (x and z every 1.25 m from 20 m
//                                               before the square's corner, as x * 832 + z), height (every 0.5 m) and
//                                               spread (every 0.2 m)
//    A  class n points                          an area of ground cover (cover() says the classes)
//    L  width n points                          a street, its width every 0.5 m
//    An area's or street's points: the first in full (x z, as a piece's), then each the step from the one before in
//    whole metres, a character each way (-44 to 44), or '~' and the point in full for a longer step.
//    Numbers are fixed-width base-90 digits (the terrain's alphabet): x, z every 0.25 m from 500 m before the square's
//    corner, w, d and h every 0.1 m, yaw in 8100ths of a half turn. roof: f flat, p pitched, h hipped. wall and top
//    name colours (the --map-bld-* tokens). flags: a digit of
//    the alphabet, the sum of 1 the height is guessed (2 storeys), 2 from the LIDAR, 4 the roof is assumed, 8 the outline
//    is from the LIDAR (OSM has no building there).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

register();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { fromGeo } = await import('../src/sim/network.ts');

const args = process.argv.slice(2), fresh = args.includes('--fresh');
const opts = name => args.flatMap((a, i) => a === name ? [args[i + 1]] : []);
const SQ = 1000, OSM_SPLIT = 2, CHUNK = 500;
const OSM = 'https://api.openstreetmap.org/api/0.6/map.json';
const WCS = {
  dsm: ['https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-first-return-dsm-1m/wcs', 'df4e3ec3-315e-48aa-aaaf-b5ae74d7b2bb__Lidar_Composite_Elevation_FZ_DSM_1m'],
  dtm: ['https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs', '13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m'],
  lst: ['https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-last-return-dsm-1m/wcs', '9ba4d5ac-d596-445a-9056-dae3ddec0178__Lidar_Composite_Elevation_LZ_DSM_1m'],
};
const STOREY = 3;
const outDir = join(root, 'src/data/world'), rawOsm = join(root, 'data/raw/osm'), rawDsm = join(root, 'data/raw/dsm'), rawDtm = join(root, 'data/raw/dtm'), rawLst = join(root, 'data/raw/dsm-last');
for (const d of [outDir, rawOsm, rawDsm, rawDtm, rawLst]) mkdirSync(d, { recursive: true });

// ---------------------------------------------------------------------------------------------------------------
// The network, and the map between game metres, WGS84 and the National Grid (as tools/lidar-to-terrain.mjs)
const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'));
const net = fromGeo(def), c = net.spine, O = def.origin;
const kLat = 111320, kLon = 111320 * Math.cos(O.lat * Math.PI / 180);
const toLatLon = (x, z) => [O.lat - z / kLat, O.lon + x / kLon];
const toGame = (lat, lon) => [(lon - O.lon) * kLon, (O.lat - lat) * kLat];
const rad = Math.PI / 180;
function toBNG(lat, lon) {
  let a = 6378137, f = 1 / 298.257223563, e2 = 2 * f - f * f;
  let p = lat * rad, l = lon * rad, nu = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const x1 = nu * Math.cos(p) * Math.cos(l), y1 = nu * Math.cos(p) * Math.sin(l), z1 = nu * (1 - e2) * Math.sin(p);
  const s = -20.4894e-6, rx = -0.1502 / 3600 * rad, ry = -0.2470 / 3600 * rad, rz = -0.8421 / 3600 * rad;
  const x2 = -446.448 + (1 + s) * x1 - rz * y1 + ry * z1, y2 = 125.157 + rz * x1 + (1 + s) * y1 - rx * z1, z2 = -542.060 - ry * x1 + rx * y1 + (1 + s) * z1;
  a = 6377563.396; const b = 6356256.909; e2 = 1 - (b * b) / (a * a);
  const pr = Math.hypot(x2, y2); l = Math.atan2(y2, x2); p = Math.atan2(z2, pr * (1 - e2));
  for (let i = 0; i < 10; i++) { nu = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2); p = Math.atan2(z2 + e2 * nu * Math.sin(p), pr); }
  const F0 = 0.9996012717, p0 = 49 * rad, l0 = -2 * rad, N0 = -100000, E0 = 400000, n = (a - b) / (a + b);
  const sp = Math.sin(p), cp = Math.cos(p), tp = Math.tan(p);
  nu = a * F0 / Math.sqrt(1 - e2 * sp * sp); const rho = a * F0 * (1 - e2) / Math.pow(1 - e2 * sp * sp, 1.5), eta2 = nu / rho - 1;
  const dp = p - p0, pp = p + p0;
  const M = b * F0 * ((1 + n + 5 / 4 * n * n + 5 / 4 * n ** 3) * dp - (3 * n + 3 * n * n + 21 / 8 * n ** 3) * Math.sin(dp) * Math.cos(pp)
    + (15 / 8 * n * n + 15 / 8 * n ** 3) * Math.sin(2 * dp) * Math.cos(2 * pp) - 35 / 24 * n ** 3 * Math.sin(3 * dp) * Math.cos(3 * pp));
  const I = M + N0, II = nu / 2 * sp * cp, III = nu / 24 * sp * cp ** 3 * (5 - tp * tp + 9 * eta2), IIIA = nu / 720 * sp * cp ** 5 * (61 - 58 * tp * tp + tp ** 4);
  const IV = nu * cp, V = nu / 6 * cp ** 3 * (nu / rho - tp * tp), VI = nu / 120 * cp ** 5 * (5 - 18 * tp * tp + tp ** 4 + 14 * eta2 - 58 * tp * tp * eta2);
  const dl = l - l0;
  return [E0 + IV * dl + V * dl ** 3 + VI * dl ** 5, I + II * dl * dl + III * dl ** 4 + IIIA * dl ** 6];
}
const gameToBNG = (x, z) => toBNG(...toLatLon(x, z));

// ---------------------------------------------------------------------------------------------------------------
// The area
const squares = new Set();
const addCircle = (x, z, r) => { for (let i = Math.floor((x - r) / SQ); i <= Math.floor((x + r) / SQ); i++) for (let j = Math.floor((z - r) / SQ); j <= Math.floor((z + r) / SQ); j++) {
  const dx = Math.max(i * SQ - x, 0, x - (i + 1) * SQ), dz = Math.max(j * SQ - z, 0, z - (j + 1) * SQ); if (Math.hypot(dx, dz) < r) squares.add(`${i}_${j}`);
} };
{
  const st = opts('--station'), rs = opts('--radius');
  st.forEach((id, k) => { const f = net.stationFrame(id); addCircle(f.x, f.z, +(rs[k] ?? rs[0] ?? 600)); });
  for (const r of opts('--corridor')) {
    const from = opts('--from')[0], to = opts('--to')[0];
    const a = from ? net.station(from).s : 0, b = to ? net.station(to).s : c.length;
    for (let s = Math.min(a, b); s <= Math.max(a, b); s += 50) { const p = c.at(s); addCircle(p.x, p.z, +r); }
  }
  for (const q of opts('--square')) squares.add(q);
  if (args.includes('--all')) for (const f of readdirSync(outDir)) if (f.endsWith('.txt')) squares.add(f.replace('.txt', ''));
}
if (!squares.size) { console.error('usage: node tools/osm-to-world.mjs (--station <id> [--radius <m>] | --corridor <m> [--from <id> --to <id>] | --square <i_j> | --all)... [--fresh]'); process.exit(1); }
console.log(`squares: ${[...squares].sort().join(' ')}`);

// ---------------------------------------------------------------------------------------------------------------
// Fetching
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, kind) {
  for (let tries = 0; ; tries++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'the-commute world tool (https://github.com/kylelookingaround/the-commute)' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return kind === 'json' ? await res.json() : await res.text();
    } catch (err) {
      if (tries >= 4) throw err;
      console.log(`  retrying: ${err.message}`); await sleep(2000 * 2 ** tries);
    }
  }
}
/** OSM's elements in a square, from its quarters' boxes (cached). */
async function osmSquare(key) {
  const [i, j] = key.split('_').map(Number), out = [], q = SQ / OSM_SPLIT;
  for (let a = 0; a < OSM_SPLIT; a++) for (let b = 0; b < OSM_SPLIT; b++) {
    const file = join(rawOsm, `${key}_${a}${b}.json`);
    if (fresh || !existsSync(file)) {
      const x0 = i * SQ + a * q, z0 = j * SQ + b * q, [n, w] = toLatLon(x0, z0), [s, e] = toLatLon(x0 + q, z0 + q);
      const data = await get(`${OSM}?bbox=${w.toFixed(6)},${s.toFixed(6)},${e.toFixed(6)},${n.toFixed(6)}`, 'json');
      writeFileSync(file, JSON.stringify(data.elements)); process.stdout.write('o'); await sleep(1000);
    }
    out.push(...JSON.parse(readFileSync(file, 'utf8')));
  }
  return out;
}
/** A raster chunk (500 m every 1 m, rows from the north) of the DSM or DTM, cached; NaN in a void. */
const chunks = new Map();
async function chunk(kind, e0, n0) {
  const key = `${kind}${e0},${n0}`; if (chunks.has(key)) return chunks.get(key);
  const file = join(kind === 'dsm' ? rawDsm : kind === 'lst' ? rawLst : rawDtm, `fine-${e0}-${n0}.f32`);
  let data;
  if (!fresh && existsSync(file)) data = new Float32Array(readFileSync(file).buffer.slice(0));
  else {
    const [url, cov] = WCS[kind];
    const text = await get(`${url}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${cov}&subset=E(${e0},${e0 + CHUNK})&subset=N(${n0},${n0 + CHUNK})&format=text/plain&scalesize=i(${CHUNK}),j(${CHUNK})`, 'text');
    const at = text.indexOf('Band 0:'); if (at < 0) throw new Error('no band in the answer: ' + text.slice(0, 200));
    const vals = text.slice(at + 7).trim().split(/\s+/).map(Number);
    if (vals.length !== CHUNK * CHUNK) throw new Error(`${vals.length} values for a ${CHUNK} m chunk`);
    data = Float32Array.from(vals, v => Number.isFinite(v) && v > -100 && v < 2000 ? v : NaN);
    writeFileSync(file, Buffer.from(data.buffer)); process.stdout.write(kind === 'dsm' ? 's' : kind === 'lst' ? 'l' : 't');
  }
  chunks.set(key, data); return data;
}
async function loadRasters(key) {
  const [i, j] = key.split('_').map(Number); let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (const [x, z] of [[i * SQ - 100, j * SQ - 100], [(i + 1) * SQ + 100, j * SQ - 100], [i * SQ - 100, (j + 1) * SQ + 100], [(i + 1) * SQ + 100, (j + 1) * SQ + 100]]) {
    const [E, N] = gameToBNG(x, z); e0 = Math.min(e0, E); e1 = Math.max(e1, E); n0 = Math.min(n0, N); n1 = Math.max(n1, N);
  }
  for (let e = Math.floor(e0 / CHUNK) * CHUNK; e < e1; e += CHUNK) for (let n = Math.floor(n0 / CHUNK) * CHUNK; n < n1; n += CHUNK) { await chunk('dsm', e, n); await chunk('dtm', e, n); await chunk('lst', e, n); }
}
/** The DSM or DTM at a game point (nearest sample): NaN where there's none. */
function lidar(kind, x, z) {
  const [E, N] = gameToBNG(x, z), e0 = Math.floor(E / CHUNK) * CHUNK, n0 = Math.floor(N / CHUNK) * CHUNK, d = chunks.get(`${kind}${e0},${n0}`);
  if (!d) return NaN;
  const i = Math.min(CHUNK - 1, Math.floor(E - e0)), j = Math.min(CHUNK - 1, Math.floor(n0 + CHUNK - N));
  return d[j * CHUNK + i];
}

// ---------------------------------------------------------------------------------------------------------------
// Geometry
const area = pts => { let s = 0; for (let k = 0; k < pts.length; k++) { const [ax, az] = pts[k], [bx, bz] = pts[(k + 1) % pts.length]; s += ax * bz - bx * az; } return s / 2; };
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/** The smallest rectangle round the points, its long side along yaw (0..PI): {x, z, w (long), d, yaw}. */
function minRect(pts, fixedYaw) {
  const h = hull(pts); let best = null;
  const yaws = fixedYaw !== undefined ? [fixedYaw] : h.map((a, k) => { const b = h[(k + 1) % h.length]; return Math.atan2(b[1] - a[1], b[0] - a[0]); });
  for (const t of yaws) {
    const ux = Math.cos(t), uz = Math.sin(t); let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of h) { const a = x * ux + z * uz, b = -x * uz + z * ux; a0 = Math.min(a0, a); a1 = Math.max(a1, a); b0 = Math.min(b0, b); b1 = Math.max(b1, b); }
    const ar = (a1 - a0) * (b1 - b0);
    if (!best || ar < best.area) {
      const am = (a0 + a1) / 2, bm = (b0 + b1) / 2;
      best = { area: ar, x: am * ux - bm * uz, z: am * uz + bm * ux, w: a1 - a0, d: b1 - b0, yaw: t };
    }
  }
  if (best.d > best.w) { const w = best.w; best.w = best.d; best.d = w; best.yaw += Math.PI / 2; }
  best.yaw = ((best.yaw % Math.PI) + Math.PI) % Math.PI;
  return best;
}
const inside = (x, z, pts) => { let k = false; for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { const [ax, az] = pts[a], [bx, bz] = pts[b]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) k = !k; } return k; };
/** Douglas-Peucker on a closed ring, to tol metres. */
function simplify(pts, tol) {
  if (pts.length <= 4) return pts;
  const dp = (a, b, list) => {
    let m = -1, at = -1; const [ax, az] = list[a], [bx, bz] = list[b], L = Math.hypot(bx - ax, bz - az) || 1e-9;
    for (let k = a + 1; k < b; k++) { const [x, z] = list[k], d = Math.abs((bx - ax) * (az - z) - (ax - x) * (bz - az)) / L; if (d > m) { m = d; at = k; } }
    return m > tol ? [...dp(a, at, list).slice(0, -1), ...dp(at, b, list)] : [list[a], list[b]];
  };
  // split at the point furthest from the first
  let far = 0; for (let k = 1; k < pts.length; k++) if (Math.hypot(pts[k][0] - pts[0][0], pts[k][1] - pts[0][1]) > Math.hypot(pts[far][0] - pts[0][0], pts[far][1] - pts[0][1])) far = k;
  const ring = [...pts, pts[0]];
  return [...dp(0, far, ring).slice(0, -1), ...dp(far, ring.length - 1, ring).slice(0, -1)];
}

// ---------------------------------------------------------------------------------------------------------------
// Buildings
const HOUSE = new Set(['house', 'terrace', 'semidetached_house', 'detached', 'bungalow', 'residential', 'cottage', 'farm']);
const SKIP = new Set(['no', 'construction', 'proposed', 'demolished', 'ruins', 'collapsed', 'roof', 'carport', 'canopy']);
const ROOF = { flat: 'f', gabled: 'p', 'half-hipped': 'h', hipped: 'h', pyramidal: 'h', mansard: 'h', gambrel: 'p', saltbox: 'p', skillion: 'f', dome: 'f', round: 'f', onion: 'h', cone: 'h' };
const hash = (n, k) => { const s = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return s - Math.floor(s); };

/** Every building in a square's elements whose middle is in the square: { id, ring (game metres), nodes (ids), tags }. */
function buildings(key, els) {
  const [i, j] = key.split('_').map(Number), nodes = new Map(), ways = new Map(), out = [], used = new Set();
  for (const e of els) { if (e.type === 'node') nodes.set(e.id, e); else if (e.type === 'way') ways.set(e.id, e); }
  const ring = ids => { const pts = []; for (const id of ids) { const n = nodes.get(id); if (!n) return null; pts.push(toGame(n.lat, n.lon)); } if (pts.length > 2 && ids[0] === ids[ids.length - 1]) pts.pop(); return pts.length >= 3 ? pts : null; };
  const add = (id, ids, tags) => {
    if (used.has(id)) return; used.add(id);
    if (SKIP.has(tags.building) || tags.location === 'underground' || +(tags.layer ?? 0) < 0 || tags['building:part']) return;
    const pts = ring(ids); if (!pts) return;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (Math.floor(cx / SQ) !== i || Math.floor(cz / SQ) !== j) return;
    if (area(pts) < 0) pts.reverse();
    if (Math.abs(area(pts)) < 6) return;   // a shed in a garden: too small to show
    out.push({ id, ring: pts, nodes: ids.slice(0, ids[0] === ids[ids.length - 1] ? -1 : undefined), tags });
  };
  for (const e of els) {
    if (e.type === 'way' && e.tags?.building) add(e.id, e.nodes, e.tags);
    if (e.type === 'relation' && e.tags?.building && e.tags.type === 'multipolygon')
      for (const m of e.members) if (m.type === 'way' && m.role === 'outer' && ways.has(m.ref)) add(m.ref, ways.get(m.ref).nodes, { ...ways.get(m.ref).tags, ...e.tags });
  }
  return out;
}

/** The DSM less the DTM inside a ring, sorted (metres standing above the ground). */
function standing(ring) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  const step = Math.max(1, Math.sqrt((x1 - x0) * (z1 - z0) / 400)), v = [];
  for (let x = x0 + step / 2; x < x1; x += step) for (let z = z0 + step / 2; z < z1; z += step) {
    if (!inside(x, z, ring)) continue;
    const h = lidar('dsm', x, z) - lidar('dtm', x, z); if (Number.isFinite(h)) v.push(h);
  }
  return v.sort((a, b) => a - b);
}
const pct = (v, p) => v.length ? v[Math.min(v.length - 1, Math.floor(p * v.length))] : NaN;

/** A building's shape, walls, roof and colours. */
function describe(b, palette) {
  const t = b.tags, rect = minRect(b.ring), ar = area(b.ring), fill = ar / (rect.w * rect.d), type = t.building;
  const house = HOUSE.has(type) || (type === 'yes' && ar < 160);
  let flags = 0, h, roof;
  const lv = parseFloat(t['building:levels']), ht = parseFloat(t.height), st = standing(b.ring);
  const flatTop = st.length > 6 && pct(st, 0.85) - pct(st, 0.25) < 1.0;
  // roof first: the walls stand under it
  if (ROOF[t['roof:shape']]) roof = ROOF[t['roof:shape']];
  else {
    flags |= 4;
    const levels = Number.isFinite(lv) ? lv : Number.isFinite(ht) ? ht / STOREY : st.length ? pct(st, 0.8) / STOREY : 2;
    if (house) roof = levels > 4 || rect.d > 30 ? 'f' : 'p';
    else roof = flatTop || rect.d > 22 || levels > 4 ? 'f' : rect.d > 14 ? 'h' : 'p';
  }
  const rise = roof === 'f' ? 0 : Math.min(5, rect.d * 0.35);
  if (Number.isFinite(ht)) h = Math.max(2.5, ht - rise);
  else if (Number.isFinite(lv)) h = Math.max(2.5, lv * STOREY);
  else if (st.length >= 4) {
    // the roof's top from the LIDAR: the walls are the top less the roof's rise (a pitched roof's average is half of it)
    const top = roof === 'f' ? pct(st, 0.6) : pct(st, 0.75) + rise * 0.25;
    h = Math.max(2.5, Math.min(120, top - rise)); flags |= 2;
  } else { h = 2 * STOREY; flags |= 1; }
  if (roof !== 'f' && rect.d > 30) roof = 'f';
  const { wall, top } = palette(b, house, roof, h, rect);
  return { id: b.id, ring: b.ring, nodes: b.nodes, rect, fill, h, roof, wall, top, flags, house };
}

/** The suburbs' palette: red brick and slate, some render and buff, tiled 1930s hips; sheds and the bigger blocks plain.
 * (The city's palette is city() below.) Colours: wall b brick, d dark brick, u buff, r render, s stone, c concrete, g glass, m metal shed; top l slate,
 * t tile, f felt (a flat roof), m metal. */
function suburb(b, house, roof, h, rect) {
  const t = b.tags, r = hash(b.id, 1), type = t.building;
  const mat = t['building:material'] ?? '', col = t['building:colour'] ?? '';
  let wall = mat === 'stone' || mat === 'sandstone' ? 's' : mat === 'concrete' ? 'c' : mat === 'glass' ? 'g' : mat === 'plaster' || mat === 'render' || /white|cream/.test(col) ? 'r' : null;
  if (!wall) {
    if (['industrial', 'warehouse', 'hangar', 'storage_tank'].includes(type)) wall = r < 0.7 ? 'm' : 'b';
    else if (['retail', 'supermarket', 'service'].includes(type) || (!house && rect.d > 20 && h < 12)) wall = r < 0.4 ? 'b' : r < 0.65 ? 'u' : r < 0.85 ? 'r' : 'm';
    else if (['church', 'chapel', 'cathedral'].includes(type) || t.amenity === 'place_of_worship') wall = r < 0.5 ? 's' : 'd';
    else if (['office', 'commercial', 'hospital', 'university', 'college', 'apartments'].includes(type) && h > 12) wall = r < 0.5 ? 'c' : r < 0.8 ? 'u' : 'b';
    else wall = r < 0.62 ? 'b' : r < 0.8 ? 'd' : r < 0.9 ? 'r' : 'u';
  }
  const top = roof === 'f' ? (wall === 'm' ? 'm' : 'f') : roof === 'h' ? (hash(b.id, 2) < 0.65 ? 't' : 'l') : (hash(b.id, 2) < 0.8 ? 'l' : 't');
  return { wall, top };
}

/** The city's palette, towards Piccadilly: Victorian warehouses in red and dark brick, buff and stone, the newer blocks in
 * concrete and glass, the tall ones mostly glass; flat roofs in felt. */
function city(b, house, roof, h, rect) {
  const t = b.tags, r = hash(b.id, 1), mat = t['building:material'] ?? '';
  if (house) return suburb(b, house, roof, h, rect);
  let wall = mat === 'glass' ? 'g' : mat === 'concrete' ? 'c' : mat === 'stone' || mat === 'sandstone' ? 's' : mat === 'brick' ? (r < 0.6 ? 'b' : 'd') : null;
  if (!wall) {
    if (['industrial', 'warehouse', 'retail', 'supermarket', 'service'].includes(t.building) && h < 12) wall = r < 0.55 ? 'm' : 'b';
    else if (h > 24) wall = r < 0.55 ? 'g' : r < 0.85 ? 'c' : 'u';
    else wall = r < 0.38 ? 'b' : r < 0.58 ? 'd' : r < 0.72 ? 'c' : r < 0.84 ? 'u' : r < 0.93 ? 's' : 'g';
  }
  const top = roof === 'f' ? (wall === 'm' ? 'm' : 'f') : hash(b.id, 2) < 0.75 ? 'l' : 't';
  return { wall, top };
}
/** Each square's palette: the city's within 1.6 km of Piccadilly, the suburbs' elsewhere. */
const pic = net.stationFrame('piccadilly');
const paletteFor = key => { const [i, j] = key.split('_').map(Number); return Math.hypot((i + 0.5) * SQ - pic.x, (j + 0.5) * SQ - pic.z) < 1600 ? city : suburb; };

/** Join terraces: rectangles sharing a wall, alike, into rows that stay nearly rectangles. */
function join_(list) {
  const parent = list.map((_, k) => k), find = k => parent[k] === k ? k : (parent[k] = find(parent[k]));
  const byNode = new Map();
  list.forEach((b, k) => { for (const n of b.nodes) { if (!byNode.has(n)) byNode.set(n, []); byNode.get(n).push(k); } });
  const shared = new Map();
  for (const ks of byNode.values()) for (let a = 0; a < ks.length; a++) for (let b = a + 1; b < ks.length; b++) { const key = ks[a] < ks[b] ? `${ks[a]},${ks[b]}` : `${ks[b]},${ks[a]}`; shared.set(key, (shared.get(key) ?? 0) + 1); }
  const angle = (a, b) => { const d = Math.abs(((a - b) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2)); return Math.min(d, Math.PI / 2 - d); };
  for (const [key, n] of shared) {
    if (n < 2) continue;
    const [a, b] = key.split(',').map(Number), A = list[a], B = list[b];
    if (A.fill < 0.8 || B.fill < 0.8 || A.roof !== B.roof || Math.abs(A.h - B.h) > 1.6 || angle(A.rect.yaw, B.rect.yaw) > 0.2) continue;
    parent[find(a)] = find(b);
  }
  const groups = new Map(); list.forEach((_, k) => { const r = find(k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(k); });
  const out = [];
  for (const ks of groups.values()) {
    if (ks.length === 1) { out.push(list[ks[0]]); continue; }
    // along the row's own direction, each house in turn while the row stays nearly a rectangle
    const all = ks.flatMap(k => list[k].ring), R = minRect(all), ux = Math.cos(R.yaw), uz = Math.sin(R.yaw);
    const order = ks.map(k => [k, list[k].rect.x * ux + list[k].rect.z * uz]).sort((p, q) => p[1] - q[1]).map(p => p[0]);
    let run = [];
    const flush = () => {
      if (!run.length) return;
      if (run.length === 1) { out.push(list[run[0]]); run = []; return; }
      const pts = run.flatMap(k => list[k].ring), r = minRect(pts), m = list[run[0]];
      const hs = run.map(k => list[k].h).sort((a, b) => a - b);
      out.push({ ...m, ring: hull(pts), rect: r, fill: 1, h: hs[hs.length >> 1], flags: run.reduce((f, k) => f | list[k].flags, 0), joined: run.length });
      run = [];
    };
    for (const k of order) {
      const next = [...run, k], pts = next.flatMap(q => list[q].ring), r = minRect(pts), ar = next.reduce((s, q) => s + area(list[q].ring), 0);
      if (run.length && ar / (r.w * r.d) < 0.86) { flush(); run = [k]; } else run = next;
    }
    flush();
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Buildings OSM doesn't have (it maps few round Davenport and Woodsmoor), from the LIDAR: where the DSM stands 2.5 m or
// more over the DTM and is smooth (a roof's planes, not a tree's crown), away from OSM's buildings and bridges, each
// patch fitted as a rectangle if it nearly is one. Flagged 8 in the tile.
function lidarBuildings(key, raw, els) {
  const [i, j] = key.split('_').map(Number), N = SQ, X = i * SQ, Z = j * SQ;
  // the game's frame to the National Grid is as good as affine across a square
  const [E0, N0] = gameToBNG(X, Z), [E1, N1] = gameToBNG(X + SQ, Z), [E2, N2] = gameToBNG(X, Z + SQ);
  const ex = (E1 - E0) / SQ, ez = (E2 - E0) / SQ, nx = (N1 - N0) / SQ, nz = (N2 - N0) / SQ;
  const at = (kind, E, Nn) => { const e0 = Math.floor(E / CHUNK) * CHUNK, n0 = Math.floor(Nn / CHUNK) * CHUNK, d = chunks.get(`${kind}${e0},${n0}`); if (!d) return NaN; return d[Math.min(CHUNK - 1, Math.floor(n0 + CHUNK - Nn)) * CHUNK + Math.min(CHUNK - 1, Math.floor(E - e0))]; };
  // h: standing over the ground (first return less the DTM); pierce: how far the laser went on through it (first less
  // last return), a metre or more through a crown, next to nothing on a roof
  const h = new Float32Array(N * N), pierce = new Float32Array(N * N);
  for (let b = 0; b < N; b++) for (let a = 0; a < N; a++) {
    const x = a + 0.5, z = b + 0.5, E = E0 + ex * x + ez * z, Nn = N0 + nx * x + nz * z, f = at('dsm', E, Nn), v = f - at('dtm', E, Nn), l = f - at('lst', E, Nn);
    h[b * N + a] = Number.isFinite(v) ? v : 0; pierce[b * N + a] = Number.isFinite(l) ? l : 9;
  }
  // what's taken: OSM's buildings (2 m round), its bridges and raised roads and railways (6 m round)
  const taken = new Uint8Array(N * N);
  const mark = (x, z, r) => { for (let b = Math.max(0, Math.floor(z - Z - r)); b <= Math.min(N - 1, Math.floor(z - Z + r)); b++) for (let a = Math.max(0, Math.floor(x - X - r)); a <= Math.min(N - 1, Math.floor(x - X + r)); a++) taken[b * N + a] = 1; };
  for (const bd of raw) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of bd.ring) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let z = z0 - 2; z <= z1 + 2; z += 1) for (let x = x0 - 2; x <= x1 + 2; x += 1) if (inside(x, z, bd.ring) || bd.ring.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.5)) mark(x, z, 0);
    for (let k = 0; k < bd.ring.length; k++) { const [ax, az] = bd.ring[k], [bx, bz] = bd.ring[(k + 1) % bd.ring.length], L = Math.hypot(bx - ax, bz - az); for (let t = 0; t <= L; t += 1) mark(ax + (bx - ax) * t / L, az + (bz - az) * t / L, 2); }
  }
  const nodes = new Map(); for (const e of els) if (e.type === 'node') nodes.set(e.id, e);
  for (const e of els) {
    const t = e.tags; if (e.type !== 'way' || !t) continue;
    if (!(t.bridge || +(t.layer ?? 0) > 0 || t.railway || t.man_made === 'bridge')) continue;
    const pts = e.nodes.map(id => nodes.get(id)).filter(Boolean).map(n => toGame(n.lat, n.lon));
    for (let k = 1; k < pts.length; k++) { const [ax, az] = pts[k - 1], [bx, bz] = pts[k], L = Math.hypot(bx - ax, bz - az) || 1; for (let q = 0; q <= L; q += 2) mark(ax + (bx - ax) * q / L, az + (bz - az) * q / L, 6); }
  }
  // smooth and raised: a roof
  const rough = new Float32Array(N * N), roof = new Uint8Array(N * N);
  // (across a roof's edge to the ground is a drop, not roughness: each way counts only between raised neighbours)
  for (let b = 1; b < N - 1; b++) for (let a = 1; a < N - 1; a++) {
    const k = b * N + a, c = h[k], up = v => v >= 2.5;
    rough[k] = (up(h[k - 1]) && up(h[k + 1]) ? Math.abs(h[k - 1] + h[k + 1] - 2 * c) : 0) + (up(h[k - N]) && up(h[k + N]) ? Math.abs(h[k - N] + h[k + N] - 2 * c) : 0);
  }
  // a roof: raised, the laser stopped at its first return (the 3 m round mostly so), and not rough all through
  for (let b = 1; b < N - 1; b++) for (let a = 1; a < N - 1; a++) {
    const k = b * N + a; if (h[k] < 2.5 || taken[k]) continue;
    let s = 0, solid = 0; for (let db = -1; db <= 1; db++) for (let da = -1; da <= 1; da++) { const q = k + db * N + da; s += rough[q]; if (pierce[q] < 0.5) solid++; }
    if (solid >= 6 && s / 9 < 1.5) roof[k] = 1;
  }
  // opened (eroded then dilated a cell) so a roof touching a tree comes apart from it
  const er = new Uint8Array(N * N);
  for (let b = 1; b < N - 1; b++) for (let a = 1; a < N - 1; a++) { const k = b * N + a; er[k] = roof[k] && roof[k - 1] && roof[k + 1] && roof[k - N] && roof[k + N] ? 1 : 0; }
  for (let b = 1; b < N - 1; b++) for (let a = 1; a < N - 1; a++) { const k = b * N + a; roof[k] = roof[k] && (er[k] || er[k - 1] || er[k + 1] || er[k - N] || er[k + N]) ? 1 : 0; }
  // each patch
  const seen = new Uint8Array(N * N), out = [], stack = [], why = { small: 0, big: 0, fill: 0, thin: 0 };
  for (let k0 = 0; k0 < N * N; k0++) {
    if (!roof[k0] || seen[k0]) continue;
    const cells = []; stack.push(k0); seen[k0] = 1;
    while (stack.length) { const k = stack.pop(); cells.push(k); for (const n of [k - 1, k + 1, k - N, k + N]) if (n >= 0 && n < N * N && roof[n] && !seen[n] && Math.abs((n % N) - (k % N)) <= 1) { seen[n] = 1; stack.push(n); } }
    if (cells.length < 24) { why.small++; continue; } if (cells.length > 20000) { why.big++; continue; }
    const pts = []; for (const k of cells) { const a = k % N, b = (k / N) | 0; pts.push([X + a, Z + b], [X + a + 1, Z + b], [X + a, Z + b + 1], [X + a + 1, Z + b + 1]); }
    const r = minRect(pts), fill = cells.length / (r.w * r.d);
    if (fill < 0.55) { why.fill++; continue; } if (r.d < 4 || (r.w / r.d > 6 && r.d < 8)) { why.thin++; continue; }
    const ux = Math.cos(r.yaw), uz = Math.sin(r.yaw), A = r.w / 2, B = r.d / 2;
    const ring = [[r.x - ux * A + uz * B, r.z - uz * A - ux * B], [r.x + ux * A + uz * B, r.z + uz * A - ux * B], [r.x + ux * A - uz * B, r.z + uz * A + ux * B], [r.x - ux * A - uz * B, r.z - uz * A + ux * B]];
    if (area(ring) < 0) ring.reverse();
    out.push({ id: 9e9 + i * 1e7 + j * 1e5 + out.length, ring, nodes: [], tags: { building: r.w * r.d < 160 ? 'house' : 'yes' }, lidar: true });
  }
  out.rasters = { h, pierce, rough, roof, taken, X, Z };
  if (process.env.DUMP) { const img = new Uint8Array(N * N); for (let k = 0; k < N * N; k++) img[k] = roof[k] ? 255 : taken[k] ? 60 : h[k] >= 2.5 ? 130 : 0; writeFileSync(process.env.DUMP + key + '.raw', img); }
  if (process.env.DEBUG) { let raised = 0, free = 0, rf = 0; for (let k = 0; k < N * N; k++) { if (h[k] >= 2.5) { raised++; if (!taken[k]) free++; } if (roof[k]) rf++; } console.log(key, { raised, free, roof: rf, kept: out.length, ...why }); }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Trees, from the same rasters: standing 3 m or more where the laser went on through (or the top is rough), clear of
// every building; one tree at each crown's top (the highest point within a radius that grows with height), its spread
// how far the crown reaches round it. Crowns that overlap most of the way join into one clump (a wood, a garden row),
// so the map draws what it can afford: each clump at the tallest top, as wide as their crowns together.
function lidarTrees(key, R, extra) {
  const { h, pierce, rough, roof, taken, X, Z } = R, N = SQ;
  const veg = new Uint8Array(N * N);
  const block = new Uint8Array(N * N);
  for (const b of extra) { const r = minRect(b.ring); for (let dz = -r.d / 2 - 1; dz <= r.d / 2 + 1; dz += 1) for (let dw = -r.w / 2 - 1; dw <= r.w / 2 + 1; dw += 1) {
    const x = r.x + Math.cos(r.yaw) * dw - Math.sin(r.yaw) * dz - X, z = r.z + Math.sin(r.yaw) * dw + Math.cos(r.yaw) * dz - Z;
    if (x >= 0 && z >= 0 && x < N && z < N) block[Math.floor(z) * N + Math.floor(x)] = 1;
  } }
  for (let k = 0; k < N * N; k++) if (h[k] >= 3 && !taken[k] && !roof[k] && !block[k] && (pierce[k] >= 0.5 || rough[k] >= 1.5)) veg[k] = 1;
  // the crowns' heights a little smoothed, so a top is a crown's and not one twig's
  const hs = new Float32Array(N * N);
  for (let b = 1; b < N - 1; b++) for (let a = 1; a < N - 1; a++) { const k = b * N + a; if (!veg[k]) continue; let s = 0, n = 0; for (let db = -1; db <= 1; db++) for (let da = -1; da <= 1; da++) { const q = k + db * N + da; if (veg[q]) { s += h[q]; n++; } } hs[k] = s / n; }
  const tops = [];
  for (let b = 2; b < N - 2; b++) for (let a = 2; a < N - 2; a++) {
    const k = b * N + a; if (!veg[k]) continue;
    const v = hs[k], w = Math.round(Math.max(2, Math.min(5, 1.5 + v * 0.12))); let top = true;
    for (let db = -w; db <= w && top; db++) for (let da = -w; da <= w; da++) { const aa = a + da, bb = b + db; if (aa < 0 || bb < 0 || aa >= N || bb >= N) continue; const q = bb * N + aa; if (hs[q] > v || (hs[q] === v && q < k)) { top = false; break; } }
    if (!top) continue;
    // the spread: eight ways out until the crown ends or falls below half its height
    let sum = 0;
    for (let d = 0; d < 8; d++) {
      const ca = Math.cos(d * Math.PI / 4), sb = Math.sin(d * Math.PI / 4); let r = 1;
      for (; r < 9; r++) { const aa = Math.round(a + ca * r), bb = Math.round(b + sb * r); if (aa < 0 || bb < 0 || aa >= N || bb >= N) break; const q = bb * N + aa; if (!veg[q] || hs[q] < v * 0.5) break; }
      sum += r;
    }
    tops.push({ x: X + a + 0.5, z: Z + b + 0.5, h: v, r: Math.max(1.5, Math.min(8, sum / 8)) });
  }
  // the tallest first; a top inside a taller crown's middle is that tree's
  tops.sort((p, q) => q.h - p.h);
  const kept = [], grid = new Map(), cell = 20, key2 = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`;
  for (const t of tops) {
    let into = null;
    for (let i = -1; i <= 1 && !into; i++) for (let j = -1; j <= 1 && !into; j++) for (const o of grid.get(`${Math.floor(t.x / cell) + i},${Math.floor(t.z / cell) + j}`) ?? []) {
      if (Math.hypot(t.x - o.x, t.z - o.z) < 1.0 * (o.r + t.r)) { into = o; break; }
    }
    if (into) { const a2 = into.r * into.r + t.r * t.r * 0.5; into.r = Math.min(16, Math.sqrt(a2)); into.n++; continue; }
    const o = { ...t, n: 1 }; kept.push(o); const g = key2(o.x, o.z); if (!grid.has(g)) grid.set(g, []); grid.get(g).push(o);
  }
  return kept.filter(t => t.h >= 4 && t.r >= 1.5);
}

// ---------------------------------------------------------------------------------------------------------------
// The ground's cover, from OSM's areas and streets: each area's class and outline (clipped to the square and 20 m round
// it), each street's class, width and line. Classes (the --map-cover-* tokens): p park and grass, h pitches, f fields,
// w woods, s scrub, a water, y paved yards (industry, retail, commerce), c car parks, b brownfield and building sites,
// e greenfield, g cemeteries and allotments; r streets.
const AREA = [
  [t => t.amenity === 'parking' || t.parking === 'surface', 'c'],
  [t => t.natural === 'water' || t.waterway === 'riverbank' || ['reservoir', 'basin'].includes(t.landuse) || t.leisure === 'swimming_pool', 'a'],
  [t => ['pitch', 'track', 'sports_centre'].includes(t.leisure), 'h'],
  [t => ['brownfield', 'construction', 'landfill'].includes(t.landuse), 'b'],
  [t => t.landuse === 'greenfield', 'e'],
  [t => ['forest'].includes(t.landuse) || t.natural === 'wood', 'w'],
  [t => t.natural === 'scrub' || t.natural === 'heath', 's'],
  [t => ['cemetery', 'allotments'].includes(t.landuse) || t.amenity === 'grave_yard', 'g'],
  [t => ['farmland', 'meadow', 'farmyard', 'orchard'].includes(t.landuse) || t.natural === 'grassland', 'f'],
  [t => ['park', 'garden', 'recreation_ground', 'golf_course', 'common', 'nature_reserve', 'playground'].includes(t.leisure) || ['grass', 'village_green', 'recreation_ground'].includes(t.landuse), 'p'],
  [t => ['industrial', 'commercial', 'retail', 'depot'].includes(t.landuse), 'y'],
];
const STREET = { motorway: 22, trunk: 16, primary: 14, secondary: 12, tertiary: 10, unclassified: 8, residential: 8, living_street: 6, pedestrian: 6, motorway_link: 8, trunk_link: 8, primary_link: 8, secondary_link: 7, tertiary_link: 7 };
/** A ring clipped to a box (Sutherland-Hodgman). */
function clip(ring, x0, z0, x1, z1) {
  let pts = ring;
  for (const [axis, v, keep] of [[0, x0, 1], [0, x1, -1], [1, z0, 1], [1, z1, -1]]) {
    const out = [];
    for (let k = 0; k < pts.length; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length], ina = (a[axis] - v) * keep >= 0, inb = (b[axis] - v) * keep >= 0;
      if (ina) out.push(a);
      if (ina !== inb) { const t = (v - a[axis]) / (b[axis] - a[axis]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    pts = out; if (pts.length < 3) return [];
  }
  return pts;
}
function cover(key, els) {
  const [i, j] = key.split('_').map(Number), x0 = i * SQ - 20, z0 = j * SQ - 20, x1 = (i + 1) * SQ + 20, z1 = (j + 1) * SQ + 20;
  const nodes = new Map(), ways = new Map(); for (const e of els) { if (e.type === 'node') nodes.set(e.id, e); else if (e.type === 'way') ways.set(e.id, e); }
  const line = ids => ids.map(id => nodes.get(id)).filter(Boolean).map(n => toGame(n.lat, n.lon));
  const areas = [], streets = [], seen = new Set();
  const area = (id, ids, t) => {
    const cls = AREA.find(([f]) => f(t))?.[1]; if (!cls || seen.has(id)) return; seen.add(id);
    if (ids[0] !== ids[ids.length - 1]) return;
    const r = clip(simplify(line(ids).slice(0, -1), 1.0), x0, z0, x1, z1); if (r.length >= 3 && Math.abs(area_(r)) > 40) areas.push({ cls, ring: r, a: Math.abs(area_(r)) });
  };
  for (const e of els) {
    if (e.type === 'way' && e.tags && !e.tags.building) area(e.id, e.nodes, e.tags);
    if (e.type === 'relation' && e.tags?.type === 'multipolygon') for (const m of e.members) if (m.type === 'way' && m.role === 'outer' && ways.has(m.ref)) area(m.ref, ways.get(m.ref).nodes, { ...ways.get(m.ref).tags, ...e.tags });
    const t = e.tags;
    if (e.type === 'way' && t && STREET[t.highway] && !t.bridge && !t.tunnel && !(+(t.layer ?? 0) > 0) && t.area !== 'yes') {
      const pts = line(e.nodes); if (pts.length < 2) continue;
      if (!pts.some(([x, z]) => x > x0 && x < x1 && z > z0 && z < z1)) continue;
      streets.push({ w: STREET[t.highway], pts: simplifyLine(pts, 1.2) });
    }
  }
  // the big areas first, so a park's pond or a yard's car park draws over it
  areas.sort((a, b) => b.a - a.a);
  return { areas, streets };
}
const area_ = area;
/** Douglas-Peucker on an open line. */
function simplifyLine(pts, tol) {
  if (pts.length <= 2) return pts;
  const [ax, az] = pts[0], [bx, bz] = pts[pts.length - 1], L = Math.hypot(bx - ax, bz - az) || 1e-9;
  let m = -1, at = -1; for (let k = 1; k < pts.length - 1; k++) { const [x, z] = pts[k], d = Math.abs((bx - ax) * (az - z) - (ax - x) * (bz - az)) / L; if (d > m) { m = d; at = k; } }
  return m > tol ? [...simplifyLine(pts.slice(0, at + 1), tol).slice(0, -1), ...simplifyLine(pts.slice(at), tol)] : [pts[0], pts[pts.length - 1]];
}

// ---------------------------------------------------------------------------------------------------------------
// The encoding
const ALPHA = []; for (let k = 35; k <= 125; k++) if (k !== 92) ALPHA.push(String.fromCharCode(k));
const num = (v, digits) => { let n = Math.max(0, Math.min(90 ** digits - 1, Math.round(v))), s = ''; for (let k = 0; k < digits; k++) { s = ALPHA[n % 90] + s; n = Math.floor(n / 90); } return s; };
function encode(key, pieces) {
  const [i, j] = key.split('_').map(Number), X = i * SQ - 500, Z = j * SQ - 500;
  const xz = (x, z) => num((x - X) * 4, 2) + num((z - Z) * 4, 2);
  const rects = pieces.filter(p => p.fill >= 0.8).map(p => xz(p.rect.x, p.rect.z) + num(p.rect.w * 10, 2) + num(p.rect.d * 10, 2) + num(p.rect.yaw / Math.PI * 8100, 2) + num(p.h * 10, 2) + p.roof + p.wall + p.top + ALPHA[p.flags]);
  return ['R' + rects.join(''), ...pieces.filter(p => p.fill < 0.8).map(p => {
    const ring = simplify(p.ring, 0.4).slice(0, 89);
    return 'P' + num(p.h * 10, 2) + 'f' + p.wall + (p.top === 'f' || p.top === 'm' ? p.top : 'f') + ALPHA[p.flags] + ALPHA[ring.length] + ring.map(([x, z]) => xz(x, z)).join('');
  })].join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// --bridges: the structures over the line the DSM shows (standing 3.5 m or more over the rail across most of its tracks,
// the laser stopping there, not going on through as through a tree), along the corridor asked for, against the bridges
// the station kits draw; printed as a table for the audit, nothing written
if (args.includes('--bridges')) {
  for (const key of [...squares].sort()) await loadRasters(key);
  const from = opts('--from')[0], to = opts('--to')[0], a0 = from ? net.station(from).s : 0, b0 = to ? net.station(to).s : c.length;
  const kitBridges = [];
  for (const st of net.stations) {
    if (st.corridor && !net.onLine?.(st.corridor, c) && net.lineOf?.(st.corridor) !== c) continue;
    const kit = JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8'));
    // what a kit draws over its tracks: a road on arches, a footbridge, a canopy or train shed, a deck (a box up high)
    for (const p of kit.parts) if (['arches', 'lattice', 'footbridge', 'canopy', 'shed'].includes(p.type) || (p.type === 'box' && (p.y0 ?? 0) >= 3)) {
      const us = [p.u0, p.u1, p.u].filter(v => typeof v === 'number'), half = (p.d ?? 4) / 2;
      if (us.length) kitBridges.push({ st: st.id, type: p.type, s0: st.s + Math.min(...us) - half - 4, s1: st.s + Math.max(...us) + half + 4 });
    }
  }
  const { bridgesOf } = await import('../src/render/landmarks.ts'), spans = bridgesOf(c, def);
  const runs = []; let run = null;
  for (let s = Math.min(a0, b0); s <= Math.max(a0, b0); s += 2) {
    // on the viaduct and the arches the DTM is the ground below, not the rail
    if (spans.some(([p, q]) => s > p - 20 && s < q + 20)) { if (run) { runs.push(run); run = null; } continue; }
    let n = 0, high = 0, top = 0;
    for (const t of net.tracks) {
      const [e0, e1] = net.extent(t.id); if (s < e0 || s > e1 || !(net.onLine ? net.onLine(t.corridor, c) : true)) continue;
      const p = c.at(s, net.offsetAt(t.id, s) / 1.25), h = lidar('dsm', p.x, p.z) - lidar('dtm', p.x, p.z), l = lidar('dsm', p.x, p.z) - lidar('lst', p.x, p.z);
      n++; if (h >= 3.5 && l < 0.5) { high++; top = Math.max(top, h); }
    }
    const on = n > 0 && high >= Math.max(1, Math.ceil(n * 0.7));
    if (on) { if (!run) run = { s0: s, s1: s, top: 0 }; run.s1 = s; run.top = Math.max(run.top, top); } else if (run) { runs.push(run); run = null; }
  }
  if (run) runs.push(run);
  const near = s => { let best = null; for (const st of net.stations) { const d = s - st.at; if (!best || Math.abs(d) < Math.abs(best.d)) best = { id: st.id, d }; } return best; };
  console.log('| Along the line (m) | Width along (m) | Height over the rail (m) | Nearest station | Drawn by a kit |\n| --- | --- | --- | --- | --- |');
  const long = runs.filter(r => r.s1 - r.s0 > 60);
  for (const r of runs) {
    // a bridge is a few metres to 60 m along the line; longer is the arches or an embankment the DTM has as ground
    if (r.s1 - r.s0 < 3 || r.s1 - r.s0 > 60) continue;
    const k = kitBridges.find(b => b.s1 > r.s0 && b.s0 < r.s1), nr = near((r.s0 + r.s1) / 2);
    const [lat, lon] = toLatLon(c.at((r.s0 + r.s1) / 2).x, c.at((r.s0 + r.s1) / 2).z);
    console.log(`| ${r.s0.toFixed(0)}-${r.s1.toFixed(0)} (${lat.toFixed(5)}, ${lon.toFixed(5)}) | ${(r.s1 - r.s0 + 2).toFixed(0)} | ${r.top.toFixed(1)} | ${nr.id} ${nr.d >= 0 ? '+' : ''}${nr.d.toFixed(0)} m | ${k ? `${k.st}'s ${k.type}` : 'no'} |`);
  }
  console.log(`\nLonger than 60 m, left out as arches or embankments: ${long.map(r => `${r.s0.toFixed(0)}-${r.s1.toFixed(0)}`).join(', ')}`);
  process.exit(0);
}

for (const key of [...squares].sort()) {
  const els = await osmSquare(key); await loadRasters(key);
  const osm = buildings(key, els), extra = lidarBuildings(key, osm, els), raw = [...osm, ...extra], trees = lidarTrees(key, extra.rasters, extra);
  const described = raw.map(b => { const d = describe(b, paletteFor(key)); if (b.lidar) d.flags |= 8; return d; }), pieces = join_(described);
  const n = { buildings: raw.length, fromLidar: extra.length, trees: trees.length, pieces: pieces.length, rects: pieces.filter(p => p.fill >= 0.8).length, joined: pieces.filter(p => p.joined).reduce((s, p) => s + p.joined, 0),
    levels: described.filter(b => !(b.flags & 3)).length, lidar: described.filter(b => b.flags & 2).length, guessed: described.filter(b => b.flags & 1).length, roofAssumed: described.filter(b => b.flags & 4).length };
  const head = { v: 1, square: key, src: 'OpenStreetMap (© OpenStreetMap contributors, ODbL) and the Environment Agency LIDAR Composite DSM and DTM 1 m (Open Government Licence), by tools/osm-to-world.mjs', note: `${n.buildings} buildings (${n.fromLidar} outlined from the LIDAR where OSM has none) as ${n.pieces} pieces (${n.joined} houses joined into rows); walls from OSM's height or levels for ${n.levels}, the LIDAR for ${n.lidar}, guessed at 2 storeys for ${n.guessed}; roofs assumed for ${n.roofAssumed} (flags in each line); ${n.trees} trees and clumps from the LIDAR`, n };
  const [si, sj] = key.split('_').map(Number), TX = si * SQ - 500, TZ = sj * SQ - 500;
  // a line's points: the first every 0.25 m from the square's corner less 500 m, then each the step from the last in
  // whole metres, one character each way while it's within 44 m ('~' and the point in full otherwise)
  const pts = list => { let out = '', px = 0, pz = 0; list.forEach(([x, z], k) => {
    let qx = Math.round(x - TX), qz = Math.round(z - TZ);
    if (k && Math.abs(qx - px) <= 44 && Math.abs(qz - pz) <= 44) out += ALPHA[qx - px + 44] + ALPHA[qz - pz + 44];
    else {
      // in full, and the steps after it from where it's read back (to the quarter metre)
      const fx = Math.round((x - TX) * 4), fz = Math.round((z - TZ) * 4); out += (k ? '~' : '') + num(fx, 2) + num(fz, 2);
      qx = Math.round(fx / 4); qz = Math.round(fz / 4);
    }
    px = qx; pz = qz;
  }); return out; };
  const cov = cover(key, els);
  const coverLines = [...cov.areas.map(a => 'A' + a.cls + num(a.ring.length, 2) + pts(a.ring)), ...cov.streets.map(r => 'L' + num(r.w * 2, 1) + num(r.pts.length, 2) + pts(r.pts))];
  n.areas = cov.areas.length; n.streets = cov.streets.length;
  // a tree's place every 1.25 m from 20 m before the square's corner, x and z in three characters together
  const treeLine = 'T' + trees.map(t => num(Math.round((t.x - si * SQ + 20) / 1.25) * 832 + Math.round((t.z - sj * SQ + 20) / 1.25), 3) + num(t.h * 2, 1) + num(t.r * 5, 1)).join('');
  const text = JSON.stringify(head) + '\n' + encode(key, pieces) + '\n' + treeLine + '\n' + coverLines.join('\n') + '\n';
  writeFileSync(join(outDir, `${key}.txt`), text);
  console.log(`\n${key}: ${head.note}; ${(text.length / 1024).toFixed(1)} KB`);
}
