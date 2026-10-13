// The real surroundings (src/render/buildings.ts) from the world tiles on disk (tools/osm-to-world.mjs), placed as the
// page places them on the terrain with every fine tile loaded. No browser.
// - Every square loads: its header reads, it has buildings, and every piece is a sane size and height.
// - Size: what's committed of the world tiles stays within its budget (2 MB for today's line).
// - Clear of the line: no drawn building has any of its footprint (sampled every 2 m) on the railway's land or its
//   cutting and embankment slopes, or on a station kit's parts.
// - Terraces joined: houses sharing walls are drawn as rows, so a dense square draws well under one piece a building.
// - Load time: how long placing and drawing each square takes here (logged, not judged).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
const { fromGeo } = await import('../../src/sim/network.ts');
const { Terrain, partBoxes } = await import('../../src/render/terrain.ts');
const { bridgesOf } = await import('../../src/render/landmarks.ts');
const { BuildingsLayer, decodeWorld } = await import('../../src/render/buildings.ts');

const BUDGET = 2 * 1024 * 1024;

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
      const { head, pieces } = decodeWorld(key, readFileSync(join(dir, f), 'utf8'));
      if (!pieces.length || !head.n) bad.push(`${key}: no buildings`);
      for (const p of pieces) if (![p.x, p.z, p.w, p.d, p.h].every(Number.isFinite) || p.w <= 0 || p.d <= 0 || p.w > 600 || p.h < 2 || p.h > 200 || !'fph'.includes(p.roof)) { bad.push(`${key}: a piece ${JSON.stringify({ ...p, ring: !!p.ring })}`); break; }
      squares.push({ key, head, pieces });
    } catch (e) { bad.push(`${key}: ${e.message}`); }
  }
  ok(`world: every square loads (${files.length})`, files.length > 0 && !bad.length, bad.slice(0, 4).join('; '));

  const size = files.reduce((n, f) => n + statSync(join(dir, f)).size, 0);
  ok(`world: the tiles are within their budget (${(size / 1024).toFixed(0)} KB of ${BUDGET / 1048576} MB)`, size <= BUDGET);

  // placed as the page places them
  const layer = new BuildingsLayer(t, {}, net, kits), times = [];
  const placed = squares.map(({ key, pieces }) => { const t0 = performance.now(), out = layer.add(key, pieces); times.push(performance.now() - t0); return out; });
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

  // terraces joined into rows
  const dense = squares.filter(s => s.head.n.buildings > 300), loose = dense.filter(s => s.head.n.pieces > 0.9 * s.head.n.buildings);
  const joined = squares.reduce((n, s) => n + s.head.n.joined, 0), all = squares.reduce((n, s) => n + s.head.n.buildings, 0);
  ok('world: terraces are joined into rows', dense.length > 0 && !loose.length, `${joined} of ${all} buildings joined into rows; ` + loose.map(s => `${s.key}: ${s.head.n.pieces} pieces for ${s.head.n.buildings}`).join(', '));
}

function inside(cs, x, z) {
  let k = false;
  for (let a = 0, b = cs.length - 2; a < cs.length; b = a, a += 2) { const ax = cs[a], az = cs[a + 1], bx = cs[b], bz = cs[b + 1]; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) k = !k; }
  return k;
}
