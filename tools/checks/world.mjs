// The real surroundings (src/render/buildings.ts) from the world tiles on disk (tools/osm-to-world.mjs), placed as the
// page places them on the terrain with every fine tile loaded. No browser.
// - Every square loads: its header reads, it has buildings, and every piece is a sane size and height.
// - Size: what's committed of the world tiles stays within its budgets: 2 MB for today's line (its 52 squares, TODAY),
//   1.5 MB for the lines out (every other square: the Buxton line beyond Hazel Grove, the Marple line, the Rose Hill branch).
// - Clear of the line: no drawn building has any of its footprint (sampled every 2 m) on the railway's land or its
//   cutting and embankment slopes, or on a station kit's parts; no tree or hedge stands on them either.
// - Hedges: the lines out's open stretches have them along their field edges.
// - The ground's cover: every square has its areas and streets.
// - Clear of the landmarks: no corner of a building on a landmark's footprint (the town's named buildings, the Pyramid,
//   the skyline's towers), the Mersey or the M60.
// - Terraces joined: houses sharing walls are drawn as rows: at least 40% of the buildings are in rows and there are at
//   most three pieces for every four buildings.
// - Load time: how long placing and drawing each square takes here (logged, not judged).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
const { fromGeo } = await import('../../src/sim/network.ts');
const { Terrain, partBoxes } = await import('../../src/render/terrain.ts');
const { bridgesOf, buildLandmarks, standing, onCourses } = await import('../../src/render/landmarks.ts');
const THREE = await import('three');
const { BuildingsLayer, decodeWorld } = await import('../../src/render/buildings.ts');

const BUDGET = 2 * 1024 * 1024, BUDGET_OUT = 1.5 * 1024 * 1024;
/** Today's line's squares (Hazel Grove to Piccadilly, and Stockport's valley); every other square is the lines out's. */
const TODAY = new Set(('0_0 0_1 0_2 0_-1 0_-2 0_-3 1_0 1_1 1_2 1_3 1_-1 2_1 2_2 2_3 2_4 3_2 3_3 -1_0 -1_1 -1_2 -1_-1 -1_-2 -1_-3 -1_-4 -1_-5 -2_0 '
  + '-2_1 -2_-1 -2_-2 -2_-3 -2_-4 -2_-5 -2_-6 -2_-7 -2_-8 -3_-3 -3_-4 -3_-5 -3_-6 -3_-7 -3_-8 -3_-9 -4_-5 -4_-6 -4_-7 -4_-8 -4_-9 -5_-7 -5_-8 -5_-9 -6_-8 -6_-9').split(' '));

export default async function ({ ok, root }) {
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def), c = net.spine;
  const kits = Object.fromEntries(net.stations.map(st => [st.kit, JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8'))]));
  const t = new Terrain(net, kits, bridgesOf(c, def));
  const fineDir = join(root, 'src/data/terrain/fine');
  for (const f of readdirSync(fineDir)) t.addFine(f.replace('.txt', ''), readFileSync(join(fineDir, f), 'utf8'));
  const dir = join(root, 'src/data/world'), files = readdirSync(dir).filter(f => f.endsWith('.txt'));

  // every square reads, with sane pieces
  const bad = [], squares = [];
  for (const f of files) {
    const key = f.replace('.txt', '');
    try {
      const { head, pieces, trees, cover, hedges } = decodeWorld(key, readFileSync(join(dir, f), 'utf8'));
      if (!pieces.length || !head.n) bad.push(`${key}: no buildings`);
      for (const p of pieces) if (![p.x, p.z, p.w, p.d, p.h].every(Number.isFinite) || p.w <= 0 || p.d <= 0 || p.w > 600 || p.h < 2 || p.h > 320 || !'fph'.includes(p.roof)) { bad.push(`${key}: a piece ${JSON.stringify({ ...p, ring: !!p.ring })}`); break; }
      if (!trees.length) bad.push(`${key}: no trees`);
      squares.push({ key, head, pieces, trees, cover, hedges });
    } catch (e) { bad.push(`${key}: ${e.message}`); }
  }
  ok(`world: every square loads (${files.length})`, files.length > 0 && !bad.length, bad.slice(0, 4).join('; '));

  const sizeOf = list => list.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  const today = files.filter(f => TODAY.has(f.replace('.txt', ''))), out = files.filter(f => !TODAY.has(f.replace('.txt', '')));
  const size = sizeOf(today), sizeOut = sizeOf(out);
  ok(`world: today's line's tiles are within their budget (${(size / 1024).toFixed(0)} KB of ${BUDGET / 1048576} MB, ${today.length} squares)`, size <= BUDGET);
  ok(`world: the lines out's tiles are within their budget (${(sizeOut / 1024).toFixed(0)} KB of ${BUDGET_OUT / 1048576} MB, ${out.length} squares)`, sizeOut <= BUDGET_OUT);

  // placed as the page places them
  // the landmarks first, so their footprints are known (as the page builds them before the buildings come in)
  const real = new Set(files.map(f => f.replace('.txt', '')));
  buildLandmarks(new THREE.Scene(), net, def, (x, z) => t.groundY(x, z), (x, z) => real.has(`${Math.floor(x / 1000)}_${Math.floor(z / 1000)}`));
  const layer = new BuildingsLayer(t, {}, net, def, kits), times = [];
  const placed = squares.map(({ key, pieces, trees, hedges }) => { const t0 = performance.now(), out = layer.add(key, pieces, trees, hedges); times.push(performance.now() - t0); return out; });
  console.log(`      ${layer.stats.buildings} pieces read, ${layer.stats.pieces} drawn, ${layer.stats.left} left out; placing a square takes ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(0)} ms on average here, ${Math.max(...times).toFixed(0)} at most`);

  // clear of the railway's land and the kits: each footprint sampled every 2 m
  const frames = net.stations.map(st => ({ F: net.stationFrame(st.id), boxes: kits[st.kit].parts.flatMap(p => partBoxes({ ...p, street: false })) }));
  const onLine = [], onKit = [];
  for (const list of placed) for (const q of list) {
    const cs = q.cs, n = cs.length / 2;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < n; k++) { x0 = Math.min(x0, cs[k * 2]); x1 = Math.max(x1, cs[k * 2]); z0 = Math.min(z0, cs[k * 2 + 1]); z1 = Math.max(z1, cs[k * 2 + 1]); }
    const near = Math.abs(t.locate(q.p.x, q.p.z).o) < 400 + Math.hypot(x1 - x0, z1 - z0);
    const nearKit = frames.filter(({ F }) => Math.hypot(F.x - q.p.x, F.z - q.p.z) < 500 + Math.hypot(x1 - x0, z1 - z0));
    if (!near && !nearKit.length) continue;
    for (let x = x0 + 1; x < x1; x += 2) for (let z = z0 + 1; z < z1; z += 2) {
      if (!inside(cs, x, z)) continue;
      if (near && t.railLand(x, z, 0)) { const L = t.locate(x, z); onLine.push(`${L.s.toFixed(0)}:${L.o.toFixed(1)}`); x = x1; break; }
      for (const { F, boxes } of nearKit) {
        const ex = x - F.x, ez = z - F.z, u = ex * F.dx + ez * F.dz, v = ex * F.nx + ez * F.nz;
        if (boxes.some(([u0, u1, v0, v1]) => u > u0 && u < u1 && v > v0 && v < v1)) { onKit.push(`${u.toFixed(0)},${v.toFixed(0)}`); x = x1; z = z1; break; }
      }
    }
  }
  ok('world: no building on the railway\'s land or its slopes', !onLine.length, `${onLine.length}: ` + onLine.slice(0, 4).join(', '));
  ok('world: no building on a station kit\'s parts', !onKit.length, `${onKit.length}: ` + onKit.slice(0, 4).join(', '));

  // the trees: off the railway's land and its slopes, and the kits' parts
  const tr = layer.treesPlaced(), badTree = [];
  for (let k = 0; k < tr.length; k += 8) {
    const x = tr[k], z = tr[k + 2];
    if (t.railLand(x, z, 0)) { const L = t.locate(x, z); badTree.push(`${L.s.toFixed(0)}:${L.o.toFixed(1)}`); continue; }
    for (const { F, boxes } of frames) {
      if (Math.hypot(F.x - x, F.z - z) > 500) continue;
      const ex = x - F.x, ez = z - F.z, u = ex * F.dx + ez * F.dz, v = ex * F.nx + ez * F.nz;
      if (boxes.some(([u0, u1, v0, v1]) => u > u0 && u < u1 && v > v0 && v < v1)) { badTree.push(`kit ${u.toFixed(0)},${v.toFixed(0)}`); break; }
    }
  }
  ok(`world: no tree on the railway's land, its slopes or a kit's parts (${tr.length / 8} trees, ${layer.stats.treesLeft} left out)`, tr.length > 0 && !badTree.length, `${badTree.length}: ` + badTree.slice(0, 4).join(', '));
  // the hedges: off the same, and along the lines out's field edges
  const hg = layer.hedgesPlaced(), badHedge = [];
  for (let k = 0; k < hg.length; k += 7) {
    const x = (hg[k] + hg[k + 2]) / 2, z = (hg[k + 1] + hg[k + 3]) / 2;
    if (t.railLand(x, z, 0)) { const L = t.locate(x, z); badHedge.push(`${L.s.toFixed(0)}:${L.o.toFixed(1)}`); }
  }
  const hedgeKm = hg.reduce((n, _, k) => k % 7 ? n : n + Math.hypot(hg[k + 2] - hg[k], hg[k + 3] - hg[k + 1]), 0) / 1000;
  ok(`world: the lines out have hedges, none on the railway's land (${hedgeKm.toFixed(0)} km in ${hg.length / 7} boxes, ${layer.stats.hedgesLeft} left out)`,
    (!out.length || squares.some(s => s.hedges.length)) && !badHedge.length, `${badHedge.length}: ` + badHedge.slice(0, 4).join(', '));
  const cov = squares.reduce((n, s) => n + s.cover.length, 0);
  ok(`world: the ground's cover is in the tiles (${cov} areas and streets)`, squares.every(s => s.cover.length > 0));

  // clear of the landmarks: their buildings, the river and the M60
  const course = onCourses(def), onMark = [];
  for (const list of placed) for (const q of list) {
    const p = q.p, pts = [p.x, p.z, ...q.cs];
    for (let k = 0; k < pts.length; k += 2) {
      const x = pts[k], z = pts[k + 1], hit = standing.find(([sx, sz, r]) => Math.hypot(x - sx, z - sz) < r - 1);
      if (hit || course(x, z, -4)) { onMark.push(`${x.toFixed(0)},${z.toFixed(0)}${hit ? '' : ' (river or M60)'}`); break; }
    }
  }
  ok(`world: no building on a landmark, the river or the M60 (${standing.length} landmark footprints)`, standing.length > 0 && !onMark.length, `${onMark.length}: ` + onMark.slice(0, 4).join(', '));

  // terraces joined into rows
  // (OSM's buildings: those outlined from the LIDAR come as rows already, a terrace's roof one patch)
  const lid = squares.reduce((n, s) => n + (s.head.n.fromLidar ?? 0), 0);
  const joined = squares.reduce((n, s) => n + s.head.n.joined, 0), all = squares.reduce((n, s) => n + s.head.n.buildings, 0) - lid, pieces = squares.reduce((n, s) => n + s.head.n.pieces, 0) - lid;
  const rows = squares.filter(s => s.head.n.joined > (s.head.n.buildings - (s.head.n.fromLidar ?? 0)) / 2).length;
  ok('world: terraces are joined into rows', joined >= 0.4 * all && pieces <= 0.75 * all && rows > 0, `${joined} of OSM's ${all} buildings joined into rows, ${pieces} pieces for them (and ${lid} outlined from the LIDAR); ${rows} squares mostly in rows`);
}

function inside(cs, x, z) {
  let k = false;
  for (let a = 0, b = cs.length - 2; a < cs.length; b = a, a += 2) { const ax = cs[a], az = cs[a + 1], bx = cs[b], bz = cs[b + 1]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) k = !k; }
  return k;
}
