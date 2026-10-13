#!/usr/bin/env node
// The lie of the land under the line, from the Environment Agency's LIDAR Composite DTM (1 m, Open Government Licence:
// "Contains Environment Agency information © Environment Agency and/or database right"), into the terrain tiles the page
// draws (src/render/terrain.ts).
//
//    node tools/lidar-to-terrain.mjs [--fresh]
//    node tools/lidar-to-terrain.mjs --coarsen    (no fetching: gives a base.json from before the far ring its far ring)
//
// 1. Fetches the DTM over the map's area from the Environment Agency's WCS into data/raw/dtm/ (gitignored; --fresh
//    fetches again): every 4 m over the whole area, every 1 m within FINE_BAND of the line. About 120 requests, a minute
//    or two.
// 2. Works out the railway's real level along the corridor: the DTM under each track, the lowest track at each point
//    (the cutting floor, the embankment's top), spikes and short dips (bridges over and under the line) taken out,
//    linear over the viaducts (a DTM has no bridges, so it gives the ground beneath), and smoothed. This is the game's
//    zero: the page draws the ground relative to it, so the tracks, stations and trains stay where they are.
// 3. Writes the tiles, in game metres (x east, z south of the network's origin), heights in decimetres above Ordnance
//    Datum, so a wider map (phase 8) can reuse them:
//    - src/data/terrain/base.json: every FAR_CELL m over the whole area (tiles of TILE cells of BASE_CELL m) and every
//      BASE_CELL m within FAR_RING of the line (`near`, in blocks of BLOCK cells), the rail level every
//      RAIL_STEP m along the corridor, and the datum, a smooth field of the rail level away from the line (DATUM_CELL);
//      bundled with the page, since the world is built from it at start.
//    - src/data/terrain/fine/<i>_<j>.txt: every FINE_CELL m within FINE_BAND of the line, fetched by the page as the
//      camera comes near.
//    The text encoding is decodeGrid's in src/render/terrain.ts: each sample's difference from a plane through its
//    neighbours, one character each when it's small.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

register();
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { fromGeo } = await import('../src/sim/network.ts');
const { viaductOf } = await import('../src/render/landmarks.ts');

const WCS = 'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-terrain-model-dtm-1m/wcs';
const COVERAGE = '13787b9a-26a4-4775-8523-806d13af58fc__Lidar_Composite_Elevation_DTM_1m';
const PAD = 1500;          // metres of ground round the corridor's bounding box
const BASE_CELL = 32, FINE_CELL = 2, TILE = 128;
const FINE_BAND = 100;     // fine samples within this many metres of the corridor (the line's widest layouts reach 80 m)
const RAIL_STEP = 5, DATUM_CELL = 64;
const FAR_CELL = 64, BLOCK = 32, FAR_RING = 1500;   // the far ring: see nearBlock
const LATERAL = 1.25;      // the tracks and kits are drawn this many times real across the line
const COARSE_CHUNK = 2000, COARSE_RES = 4, FINE_CHUNK = 500;

const fresh = process.argv.includes('--fresh');
const rawDir = join(root, 'data/raw/dtm');
mkdirSync(rawDir, { recursive: true });

// ---------------------------------------------------------------------------------------------------------------
// The network, and the map between game metres, WGS84 and the British National Grid
const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'));
const net = fromGeo(def), c = net.spine, O = def.origin;
const kLat = 111320, kLon = 111320 * Math.cos(O.lat * Math.PI / 180);
const toLatLon = (x, z) => [O.lat - z / kLat, O.lon + x / kLon];
const rad = Math.PI / 180;
/** WGS84 latitude and longitude to OSGB36 National Grid eastings and northings (Helmert, then Transverse Mercator; a few
 * metres at worst, well inside the DTM's use here). */
function toBNG(lat, lon) {
  // WGS84 to cartesian
  let a = 6378137, f = 1 / 298.257223563, e2 = 2 * f - f * f;
  let p = lat * rad, l = lon * rad, nu = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2);
  const x1 = nu * Math.cos(p) * Math.cos(l), y1 = nu * Math.cos(p) * Math.sin(l), z1 = nu * (1 - e2) * Math.sin(p);
  // Helmert to OSGB36
  const s = -20.4894e-6, rx = -0.1502 / 3600 * rad, ry = -0.2470 / 3600 * rad, rz = -0.8421 / 3600 * rad;
  const x2 = -446.448 + (1 + s) * x1 - rz * y1 + ry * z1, y2 = 125.157 + rz * x1 + (1 + s) * y1 - rx * z1, z2 = -542.060 - ry * x1 + rx * y1 + (1 + s) * z1;
  // cartesian to Airy 1830
  a = 6377563.396; const b = 6356256.909; e2 = 1 - (b * b) / (a * a);
  const pr = Math.hypot(x2, y2); l = Math.atan2(y2, x2); p = Math.atan2(z2, pr * (1 - e2));
  for (let i = 0; i < 10; i++) { nu = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2); p = Math.atan2(z2 + e2 * nu * Math.sin(p), pr); }
  // Transverse Mercator, the National Grid's
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
// The encoding (decodeGrid in src/render/terrain.ts): rows of samples, each the difference from left + up - up-left
// (or the one neighbour there is), as one of 89 characters for -44..44, else '~' and three base-64 digits; '!' and a
// count (one character, 1..90) for a run of samples with none.
const ALPHA = []; for (let k = 35; k <= 125; k++) if (k !== 92) ALPHA.push(String.fromCharCode(k));   // 90: no '"' or '\'
const ESC = ALPHA[89], NONE = '!';
function encodeGrid(v, w, h) {
  let out = '';
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = v[j * w + i];
    if (x === null) { let k = 1; while (k < 90 && i + k < w && v[j * w + i + k] === null) k++; out += NONE + ALPHA[k - 1]; i += k - 1; continue; }
    const L = i > 0 ? v[j * w + i - 1] : null, U = j > 0 ? v[(j - 1) * w + i] : null, UL = i > 0 && j > 0 ? v[(j - 1) * w + i - 1] : null;
    const pred = L !== null && U !== null && UL !== null ? L + U - UL : L !== null ? L : U !== null ? U : 0, r = x - pred;
    if (r >= -44 && r <= 44) out += ALPHA[r + 44];
    else { const q = r + 131072; out += ESC + ALPHA[(q >> 12) & 63] + ALPHA[(q >> 6) & 63] + ALPHA[q & 63]; }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The far ring: the base tiles are every FAR_CELL m, and only the BLOCK-cell blocks within FAR_RING of the line are
// every BASE_CELL m besides, since further out the base mesh (every 48 m) is all that's drawn, seen from a kilometre off
const linePts = []; for (let s = 0; s <= c.length; s += 20) linePts.push(c.at(Math.min(s, c.length)));
const BS = BASE_CELL * BLOCK;
/** Whether the near block (bi, bj) has any of it within FAR_RING of the line. */
const nearBlock = (bi, bj) => {
  const x0 = bi * BS, z0 = bj * BS, x1 = x0 + BS, z1 = z0 + BS;
  return linePts.some(p => Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(z0 - p.z, 0, p.z - z1)) < FAR_RING);
};
// --coarsen: no fetching; rewrite a base.json written before the far ring (every tile every BASE_CELL m) from its own
// samples: every other one for the tiles, and the near blocks cut out as they are
if (process.argv.includes('--coarsen')) {
  const { decodeGrid } = await import('../src/render/terrain.ts');
  const file = join(root, 'src/data/terrain/base.json'), b = JSON.parse(readFileSync(file, 'utf8')), was = statSync(file).size;
  if (b.near) { console.log('base.json already has its far ring'); process.exit(0); }
  const step = FAR_CELL / b.cell, N0 = b.tile + 1, N1 = b.tile / step + 1, per = b.tile / BLOCK, tiles = {}, near = {};
  const cut = (v, i0, j0, n, k) => { const w = new Array(n * n); for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const h = v[(j0 + j * k) * N0 + i0 + i * k]; w[j * n + i] = h === h ? Math.round(h * 10) : null; } return encodeGrid(w, n, n); };
  for (const [key, text] of Object.entries(b.tiles)) {
    const [ti, tj] = key.split(',').map(Number), v = decodeGrid(text, N0, N0);
    tiles[key] = cut(v, 0, 0, N1, step);
    for (let a = 0; a < per; a++) for (let c2 = 0; c2 < per; c2++) {
      const bi = ti * per + a, bj = tj * per + c2;
      if (nearBlock(bi, bj)) near[`${bi},${bj}`] = cut(v, a * BLOCK, c2 * BLOCK, BLOCK + 1, 1);
    }
  }
  const { tiles: _, rail, datum, ...rest } = b;
  writeFileSync(file, JSON.stringify({ ...rest, farCell: FAR_CELL, block: BLOCK, tiles, near, rail, datum }) + '\n');
  console.log(`base.json: tiles every ${FAR_CELL} m and ${Object.keys(near).length} near blocks every ${b.cell} m, ${(was / 1024).toFixed(0)} KB to ${(statSync(file).size / 1024).toFixed(0)} KB`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------------------------------
// The area, in game metres, snapped out to whole base tiles
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const p of c.pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
const BT = BASE_CELL * TILE;
const ti0 = Math.floor((minX - PAD) / BT), ti1 = Math.ceil((maxX + PAD) / BT) - 1, tj0 = Math.floor((minZ - PAD) / BT), tj1 = Math.ceil((maxZ + PAD) / BT) - 1;
console.log(`area: base tiles ${ti0}..${ti1} by ${tj0}..${tj1} (${(ti1 - ti0 + 1) * BT / 1000} by ${(tj1 - tj0 + 1) * BT / 1000} km)`);

// ---------------------------------------------------------------------------------------------------------------
// Fetching: the WCS answers a box in National Grid metres as text, scaled to the size asked for
async function fetchGrid(e0, n0, e1, n1, w, h) {
  const url = `${WCS}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${COVERAGE}&subset=E(${e0},${e1})&subset=N(${n0},${n1})&format=text/plain&scalesize=i(${w}),j(${h})`;
  for (let tries = 0; ; tries++) {
    try {
      const res = await fetch(url); if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text(), at = text.indexOf('Band 0:'); if (at < 0) throw new Error('no band in the answer: ' + text.slice(0, 200));
      const vals = text.slice(at + 7).trim().split(/\s+/).map(Number);
      if (vals.length !== w * h) throw new Error(`${vals.length} values for ${w}x${h}`);
      // the DTM's voids (water, mostly) come back as huge negatives or NaN
      return Float32Array.from(vals, v => Number.isFinite(v) && v > -100 && v < 2000 ? v : NaN);
    } catch (err) {
      if (tries >= 4) throw err;
      console.log(`  retrying ${e0},${n0}: ${err.message}`); await new Promise(r => setTimeout(r, 2000 * 2 ** tries));
    }
  }
}
/** A raster in National Grid metres: rows from the north, each sample the cell's centre. */
const rasters = { coarse: [], fine: [] };
async function load(kind, e0, n0, size, res) {
  const file = join(rawDir, `${kind}-${e0}-${n0}.f32`), w = size / res;
  let data;
  if (!fresh && existsSync(file)) data = new Float32Array(readFileSync(file).buffer.slice(0));
  else { data = await fetchGrid(e0, n0, e0 + size, n0 + size, w, w); writeFileSync(file, Buffer.from(data.buffer)); process.stdout.write('.'); }
  rasters[kind].push({ e0, n0, size, res, w, data });
}
// the whole area, coarse
{
  let e0 = Infinity, e1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (const [x, z] of [[ti0 * BT, tj0 * BT], [(ti1 + 1) * BT, tj0 * BT], [ti0 * BT, (tj1 + 1) * BT], [(ti1 + 1) * BT, (tj1 + 1) * BT]]) {
    const [E, N] = gameToBNG(x, z); e0 = Math.min(e0, E); e1 = Math.max(e1, E); n0 = Math.min(n0, N); n1 = Math.max(n1, N);
  }
  const C = COARSE_CHUNK; let k = 0;
  for (let e = Math.floor((e0 - 50) / C) * C; e < e1 + 50; e += C) for (let n = Math.floor((n0 - 50) / C) * C; n < n1 + 50; n += C) { await load('coarse', e, n, C, COARSE_RES); k++; }
  console.log(`\ncoarse: ${k} chunks of ${C} m every ${COARSE_RES} m`);
}
// along the line, fine
const corridorBNG = []; for (let s = 0; s <= c.length; s += 20) { const p = c.at(s); corridorBNG.push(gameToBNG(p.x, p.z)); }
{
  const C = FINE_CHUNK, want = new Set();
  for (const [E, N] of corridorBNG) {
    const r = FINE_BAND + 40;
    for (let e = Math.floor((E - r) / C) * C; e <= E + r; e += C) for (let n = Math.floor((N - r) / C) * C; n <= N + r; n += C) want.add(`${e},${n}`);
  }
  for (const key of want) { const [e, n] = key.split(',').map(Number); await load('fine', e, n, C, 1); }
  console.log(`\nfine: ${want.size} chunks of ${C} m every 1 m`);
}
/** The DTM at a National Grid point, bilinear, from the fine rasters where there are some, else the coarse: NaN in a void. */
function dtm(E, N, fineOnly = false) {
  for (const kind of fineOnly ? ['fine'] : ['fine', 'coarse']) for (const r of rasters[kind]) {
    if (E < r.e0 || E >= r.e0 + r.size || N <= r.n0 || N > r.n0 + r.size) continue;
    const fx = (E - r.e0) / r.res - 0.5, fy = (r.n0 + r.size - N) / r.res - 0.5;
    const i = Math.max(0, Math.min(r.w - 2, Math.floor(fx))), j = Math.max(0, Math.min(r.w - 2, Math.floor(fy))), tx = Math.max(0, Math.min(1, fx - i)), ty = Math.max(0, Math.min(1, fy - j));
    const d = r.data, a = d[j * r.w + i], b = d[j * r.w + i + 1], cc = d[(j + 1) * r.w + i], dd = d[(j + 1) * r.w + i + 1];
    const v = (a * (1 - tx) + b * tx) * (1 - ty) + (cc * (1 - tx) + dd * tx) * ty;
    if (Number.isFinite(v)) return v;
    // a void at a corner: the mean of the corners there are
    const ok = [a, b, cc, dd].filter(Number.isFinite); if (ok.length) return ok.reduce((s, q) => s + q, 0) / ok.length;
  }
  return NaN;
}
/** The DTM at a game point, averaged over a cell `size` m square (so a coarse sample isn't one metre's ditch). */
function ground(x, z, size, fineOnly = false) {
  const k = size <= 2 ? 1 : Math.min(4, Math.round(size / 4)), out = [];
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
    const px = x + (k === 1 ? 0 : ((a + 0.5) / k - 0.5) * size), pz = z + (k === 1 ? 0 : ((b + 0.5) / k - 0.5) * size);
    const v = dtm(...gameToBNG(px, pz), fineOnly); if (Number.isFinite(v)) out.push(v);
  }
  return out.length ? out.reduce((s, q) => s + q, 0) / out.length : NaN;
}

// PROBE="station:u:v;..." prints the DTM at points in a station's frame (real metres across) and stops
if (process.env.PROBE) {
  for (const q of process.env.PROBE.split(';')) { const [id, u, v] = q.split(':'), st = net.station(id), p = c.at(st.at + +u, +v); console.log(q, ground(p.x, p.z, 2).toFixed(1)); }
  process.exit(0);
}
// ---------------------------------------------------------------------------------------------------------------
// The rail's real level along the corridor
const nRail = Math.floor(c.length / RAIL_STEP) + 1, under = new Float64Array(nRail);
for (let k = 0; k < nRail; k++) {
  const s = k * RAIL_STEP; let lo = Infinity;
  for (const t of net.tracks) {
    const [e0, e1] = net.extent(t.id); if (s < e0 || s > e1) continue;
    const p = c.at(s, net.offsetAt(t.id, s) / LATERAL), v = ground(p.x, p.z, 2); if (Number.isFinite(v)) lo = Math.min(lo, v);
  }
  if (!Number.isFinite(lo)) { const p = c.at(s); lo = ground(p.x, p.z, 4); }
  under[k] = lo;
}
for (let k = 0; k < nRail; k++) if (!Number.isFinite(under[k])) under[k] = k ? under[k - 1] : under.find(Number.isFinite);
const filter = (src, half, f) => Float64Array.from(src, (_, k) => f(Array.from(src.subarray(Math.max(0, k - half), Math.min(src.length, k + half + 1)))));
// spikes (a structure the DTM kept), then short dips (a bridge over a road or a stream: the DTM shows the road)
let rail = filter(under, 3, w => w.sort((a, b) => a - b)[w.length >> 1]);
rail = filter(filter(rail, 8, w => Math.max(...w)), 8, w => Math.min(...w));
// the long bridges, where the DTM gives the ground beneath: Stockport Viaduct from the landmarks (its span is where the
// DTM's dip is), and the brick arches from Slade Lane's embankment past Ardwick into Piccadilly, whose end level isn't in
// the DTM (it has the undercroft's floor): Piccadilly's platforms stand about a storey and a half over Fairfield Street,
// from memory, so 7.5 m over the 40.5 m the DTM gives there
const spans = [];
const via = viaductOf(c, def); if (via) spans.push({ s0: Math.min(via.from, via.to) - 10, s1: Math.max(via.from, via.to) + 10 });
spans.push({ s0: net.station('ardwick').at - 690, s1: c.length, end: 48.0 });
for (const { s0, s1, end } of spans) {
  const k0 = Math.max(0, Math.floor(s0 / RAIL_STEP)), k1 = Math.min(nRail - 1, Math.ceil(s1 / RAIL_STEP)), a = rail[k0], b = end ?? rail[k1];
  for (let k = k0; k <= k1; k++) rail[k] = a + (b - a) * (k - k0) / (k1 - k0);
}
rail = filter(rail, 10, w => w.reduce((s, q) => s + q, 0) / w.length);
const dmRail = Array.from(rail, v => Math.round(v * 10));
console.log('rail level (m above OD) every km: ' + Array.from({ length: Math.ceil(c.length / 1000) + 1 }, (_, i) => rail[Math.min(nRail - 1, i * 1000 / RAIL_STEP)].toFixed(1)).join(' '));
for (const st of net.stations) console.log(`  ${st.id}: rail ${rail[Math.round(st.at / RAIL_STEP)].toFixed(1)} m`);

// ---------------------------------------------------------------------------------------------------------------
// The datum: the rail level near the line, a smooth blend of it further out (a point inside a bend is near both arms)
const ds = []; for (let k = 0; k < nRail; k += 4) { const p = c.at(k * RAIL_STEP); ds.push([p.x, p.z, rail[k]]); }
const dx0 = ti0 * BT, dz0 = tj0 * BT, dw = (ti1 + 1 - ti0) * BT / DATUM_CELL + 1, dh = (tj1 + 1 - tj0) * BT / DATUM_CELL + 1;
const datum = new Int32Array(dw * dh);
for (let j = 0; j < dh; j++) for (let i = 0; i < dw; i++) {
  const x = dx0 + i * DATUM_CELL, z = dz0 + j * DATUM_CELL; let sw = 0, sv = 0;
  for (const [px, pz, v] of ds) { const d2 = (px - x) ** 2 + (pz - z) ** 2, w = 1 / (d2 + 60 * 60) ** 2; sw += w; sv += w * v; }
  datum[j * dw + i] = Math.round(sv / sw * 10);
}

// ---------------------------------------------------------------------------------------------------------------
// The tiles
const outDir = join(root, 'src/data/terrain'), fineDir = join(outDir, 'fine');
rmSync(fineDir, { recursive: true, force: true }); mkdirSync(fineDir, { recursive: true });
const N = TILE + 1;
/** n by n samples every `cell` m from (x0, z0), in decimetres, encoded. */
function grid(x0, z0, cell, n) {
  const v = new Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const h = ground(x0 + i * cell, z0 + j * cell, cell); v[j * n + i] = Number.isFinite(h) ? Math.round(h * 10) : null; }
  // a void the size of a cell (a lake, a reservoir) takes its neighbours' level
  for (let pass = 0; pass < 8; pass++) for (let k = 0; k < v.length; k++) if (v[k] === null) {
    const i = k % n, j = (k / n) | 0, nb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n).map(([a, b]) => v[b * n + a]).filter(q => q !== null && q !== undefined);
    if (nb.length) v[k] = Math.round(nb.reduce((s, q) => s + q, 0) / nb.length);
  }
  return encodeGrid(v, n, n);
}
const base = {}, nearBase = {};
for (let ti = ti0; ti <= ti1; ti++) for (let tj = tj0; tj <= tj1; tj++) {
  base[`${ti},${tj}`] = grid(ti * BT, tj * BT, FAR_CELL, BT / FAR_CELL + 1);
  const per = TILE / BLOCK;
  for (let a = 0; a < per; a++) for (let b = 0; b < per; b++) {
    const bi = ti * per + a, bj = tj * per + b;
    if (nearBlock(bi, bj)) nearBase[`${bi},${bj}`] = grid(bi * BS, bj * BS, BASE_CELL, BLOCK + 1);
  }
}
// fine tiles: only the samples within the band, so most of a tile along a diagonal stretch is '!'
const FT = FINE_CELL * TILE, near = (x, z) => { const s = c.nearest(x, z), p = c.at(s); return Math.hypot(x - p.x, z - p.z); };
let fineBytes = 0, fineTiles = 0;
const fi0 = Math.floor((minX - FINE_BAND) / FT), fi1 = Math.floor((maxX + FINE_BAND) / FT), fj0 = Math.floor((minZ - FINE_BAND) / FT), fj1 = Math.floor((maxZ + FINE_BAND) / FT);
for (let ti = fi0; ti <= fi1; ti++) for (let tj = fj0; tj <= fj1; tj++) {
  const cx = (ti + 0.5) * FT, cz = (tj + 0.5) * FT; if (near(cx, cz) > FINE_BAND + FT * 0.75) continue;
  const v = new Array(N * N); let any = false;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = ti * FT + i * FINE_CELL, z = tj * FT + j * FINE_CELL;
    if (near(x, z) > FINE_BAND) { v[j * N + i] = null; continue; }
    const h = ground(x, z, FINE_CELL, true); v[j * N + i] = Number.isFinite(h) ? Math.round(h * 10) : null; if (v[j * N + i] !== null) any = true;
  }
  if (!any) continue;
  const text = encodeGrid(v, N, N); writeFileSync(join(fineDir, `${ti}_${tj}.txt`), text); fineBytes += text.length; fineTiles++;
}
const out = {
  note: 'From the Environment Agency LIDAR Composite DTM 1 m (Open Government Licence), by tools/lidar-to-terrain.mjs: heights in decimetres above Ordnance Datum, in game metres from the network origin (x east, z south). Contains Environment Agency information © Environment Agency and/or database right.',
  cell: BASE_CELL, tile: TILE, farCell: FAR_CELL, block: BLOCK, fineCell: FINE_CELL, fineBand: FINE_BAND, lateral: LATERAL,
  tiles: base, near: nearBase,
  rail: { step: RAIL_STEP, dm: dmRail },
  datum: { x0: dx0, z0: dz0, cell: DATUM_CELL, w: dw, h: dh, dm: encodeGrid(Array.from(datum), dw, dh) },
};
writeFileSync(join(outDir, 'base.json'), JSON.stringify(out) + '\n');
const baseBytes = statSync(join(outDir, 'base.json')).size;
console.log(`wrote base.json (${(baseBytes / 1024).toFixed(0)} KB) and ${fineTiles} fine tiles (${(fineBytes / 1024).toFixed(0)} KB): ${((baseBytes + fineBytes) / 1048576).toFixed(2)} MB in all`);
