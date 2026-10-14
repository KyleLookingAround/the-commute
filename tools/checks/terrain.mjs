// The terrain (src/render/terrain.ts) against the line, from the tiles on disk with every fine tile loaded, the
// ground built as the page builds it once the lines out's ring (out.json) is in (the base mesh, the strip coarse and fine). No browser.
// - Clearance: no ground stands in a train's space: wherever a track runs on any line (off the viaduct), nothing drawn within a
//   body's half width (and half a metre) of its centreline is higher than the underframe, and the ground there is 0.
// - Platforms: no ground stands over any platform a kit draws (bought or not).
// - The datum: the ground at every track's centreline is the rail's level, 0, off the viaduct; under the viaduct the
//   valley floor is well below it.
// - Levenshulme: its forecourt, taxi rank and bus stop at street level below the embankment, and the arched recesses
//   at the foot of the wall under the east platform's building.
// - Roads: the replacement buses' roads come down off a station's pad as a ramp no steeper than 1 in 10, and never
//   run under the ground.
// - The lines out's ring: the page fetches out.json after its first frame, never before it, and lays the ground it
//   touches again, without an error.
// - Size per line: what's committed of the terrain stays within each line's allowance (tools/lines.mjs: today's line
//   1.5 MB, each line out about 0.5 MB), and each line's figure is reported. The base (base.json) is today's line's; a
//   fine tile, and each block of the lines out's ring (out.json, its share of the file), go to the line its middle is
//   in or nearest.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
const { fromGeo } = await import('../../src/sim/network.ts');
const { Terrain, TerrainLayer, partBoxes } = await import('../../src/render/terrain.ts');
const { viaductOf, bridgesOf } = await import('../../src/render/landmarks.ts');

const HALF = 1.51 + 0.5, Y0 = 0.5;   // a body's half width as drawn (the geometry check's), and its underframe
const { lineOf, linesOf, report } = await import('../lines.mjs');

export default async function ({ ok, root, open }) {
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def), c = net.spine;
  const kits = Object.fromEntries(net.stations.map(st => [st.kit, JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8'))]));
  const via = viaductOf(c, def), spans = via ? [[Math.min(via.from, via.to), Math.max(via.from, via.to)]] : [];
  const t = new Terrain(net, kits, l => bridgesOf(l, def));
  const fineDir = join(root, 'src/data/terrain/fine'), fine = readdirSync(fineDir);
  for (const f of fine) t.addFine(f.replace('.txt', ''), readFileSync(join(fineDir, f), 'utf8'));
  const layer = new TerrainLayer(t, { city: { x: 0, z: 0, r: 0 } }, {});
  const out = JSON.parse(readFileSync(join(root, 'src/data/terrain/out.json'), 'utf8')); layer.layOut(out.near, true);

  // every track's centreline every half metre, in 10 m cells, for how far a point is from the nearest
  const cells = new Map(), key = (x, z) => `${Math.floor(x / 10)},${Math.floor(z / 10)}`;
  for (const tr of net.tracks) { const g = t.lineFor(tr.corridor), [e0, e1] = net.extent(tr.id); for (let s = e0; s <= e1; s += 0.5) { if (t.bridged(s, g)) continue; const f = net.trackAt(tr.id, s), k = key(f.x, f.z); if (!cells.has(k)) cells.set(k, []); cells.get(k).push(f.x, f.z); } }
  const near = (x, z) => {
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = cells.get(`${Math.floor(x / 10) + i},${Math.floor(z / 10) + j}`); if (!list) continue;
      for (let k = 0; k < list.length; k += 2) if (Math.hypot(x - list[k], z - list[k + 1]) < HALF) return true;
    }
    return false;
  };
  const meshes = [], bad = [];
  layer.group.traverse(o => { if (o.isMesh && o.geometry.getAttribute('position')) meshes.push(o.geometry); });
  for (const g of [...meshes, ...layer.fineStrips()]) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i); if (y <= Y0 - 0.05) continue;
      if (near(p.getX(i), p.getZ(i))) { const L = t.locate(p.getX(i), p.getZ(i)); bad.push(`${L.s.toFixed(0)}:${L.o.toFixed(1)} at ${y.toFixed(1)} m`); }
    }
  }
  ok('terrain: no ground drawn in a train\'s space', !bad.length, bad.slice(0, 4).join(', '));

  const notZero = [], notDeep = [];
  for (const tr of net.tracks) {
    const g = t.lineFor(tr.corridor), [e0, e1] = net.extent(tr.id);
    for (let s = e0; s <= e1; s += 3) {
      const f = net.trackAt(tr.id, s);
      for (const d of [-HALF, 0, HALF]) {
        const y = t.groundY(f.x + f.nx * d, f.z + f.nz * d);
        if (t.bridged(s, g)) { if (d === 0 && y > -8 && s > spans[0][0] + 60 && s < spans[0][1] - 60) notDeep.push(`${tr.id}@${s.toFixed(0)}: ${y.toFixed(1)}`); }
        else if (Math.abs(y) > 0.01) notZero.push(`${tr.id}@${s.toFixed(0)}${d ? (d > 0 ? '+' : '-') : ''}: ${y.toFixed(2)}`);
      }
    }
  }
  ok('terrain: the ground is the rail\'s level (0) along every track and either side of it', !notZero.length, notZero.slice(0, 4).join(', '));
  ok('terrain: the valley floor lies well below the viaduct', spans.length && !notDeep.length, notDeep.slice(0, 4).join(', '));

  const over = [];
  for (const st of net.stations) {
    const F = net.stationFrame(st.id);
    for (const part of kits[st.kit].parts) if (part.type === 'platform') for (const [u0, u1, v0, v1] of partBoxes(part)) {
      for (let u = u0 + 2; u <= u1 - 2; u += 4) for (let v = v0 + 1.5; v <= v1 - 1.5; v += 1) {
        const x = F.x + F.dx * u + F.nx * v, z = F.z + F.dz * u + F.nz * v, y = t.groundY(x, z);
        if (y > 0.05) over.push(`${st.id} ${u.toFixed(0)},${v.toFixed(1)}: ${y.toFixed(1)}`);
      }
    }
  }
  ok('terrain: no ground over a platform', !over.length, over.slice(0, 4).join(', '));

  // the lines out's ring, on the page: fetched after the first frame, and the ground it touches laid again
  {
    const { ctx, page, errs } = await open({ width: 390, height: 844 });
    const done = await page.waitForFunction(() => window.__view?.ground?.().outIn, null, { timeout: 120000 }).then(() => true, () => false);
    const at = await page.evaluate(() => ({ first: window.__view.perf().first, fetched: performance.getEntriesByType('resource').filter(r => /\/out-[^/]*\.json$/.test(r.name)).map(r => r.startTime) }));
    ok('terrain: the lines out\'s ring is fetched after the first frame and laid, without an error', done && at.fetched.length === 1 && at.first > 0 && at.fetched[0] >= at.first && !errs.length,
      `${done ? 'laid' : 'never laid'}; first frame at ${at.first.toFixed(0)} ms, out.json fetched at ${at.fetched.map(x => x.toFixed(0)).join(', ') || 'never'} ms${errs.length ? '; ' + errs[0] : ''}`);
    await ctx.close();
  }

  // each tile's size to its line's: the base today's, a fine tile (256 m) and a block of the ring (256 m, its share of
  // out.json's bytes) by where its middle is
  {
    const line = lineOf(net), sizes = { today: statSync(join(root, 'src/data/terrain/base.json')).size }, add = (l, n) => { sizes[l] = (sizes[l] ?? 0) + n; };
    const base = JSON.parse(readFileSync(join(root, 'src/data/terrain/base.json'), 'utf8')), T = base.fineCell * base.tile, O = base.cell * base.outBlock;
    for (const f of fine) { const [i, j] = f.replace('.txt', '').split('_').map(Number); add(line((i + 0.5) * T, (j + 0.5) * T), statSync(join(fineDir, f)).size); }
    const outFile = statSync(join(root, 'src/data/terrain/out.json')).size, blocks = Object.entries(out.near), bytes = blocks.reduce((n, [k, v]) => n + k.length + v.length, 0);
    for (const [k, v] of blocks) { const [i, j] = k.split(',').map(Number); add(line((i + 0.5) * O, (j + 0.5) * O), outFile * (k.length + v.length) / bytes); }
    const per = report(sizes, linesOf(net), 'terrain'), total = Object.values(sizes).reduce((a, b) => a + b, 0);
    ok(`terrain: each line's tiles are within its allowance (${per.text})`, !per.over.length, `${(total / 1048576).toFixed(2)} MB in all` + (per.over.length ? '; over: ' + per.over.join(', ') : ''));
  }

  // Levenshulme at street level: its forecourt (the cycle stands), taxi rank and bus stop stand on the street below the
  // embankment, and the arched recesses at the foot of the wall, just outside the pad
  {
    const st = net.station('levenshulme'), F = net.stationFrame(st.id), kit = kits[st.kit];
    const g = (u, v) => t.groundY(F.x + F.dx * u + F.nx * v, F.z + F.dz * u + F.nz * v), high = [];
    for (const p of kit.parts) if (['cycles', 'taxi', 'busstop'].includes(p.type) && (!p.street || g(p.u, p.v) > -3)) high.push(`${p.type} at ${g(p.u, p.v).toFixed(1)} m`);
    const rec = kit.parts.find(p => p.type === 'recesses'), mid = rec && (rec.u0 + rec.u1) / 2;
    const foot = rec && g(mid, rec.v - 0.15) === 0 && g(mid, rec.v) < -1;
    ok('terrain: Levenshulme\'s forecourt, taxi rank and bus stop stand at street level, and the arched recesses at the foot of its embankment wall', !high.length && foot, high.join(', ') + (foot ? '' : ' no recesses at the wall\'s foot'));
  }

  // the replacement buses' roads, stop to stop and to the depots: never below the ground, and off a station's pad
  // (the railway's land, level at 0) they come down no steeper than 1 in 10 rather than dropping off it
  const THREE = await import('three');
  const { setTerrain } = await import('../../src/render/terrain.ts');
  const { buildStations } = await import('../../src/render/stations.ts');
  const { BusLayer } = await import('../../src/render/buses.ts');
  setTerrain(t);
  const scene = new THREE.Scene(), buses = new BusLayer(scene, net, buildStations(scene, net, kits));
  const ways = [...buses.paths.values(), ...net.stations.map((_, i) => buses.depotPath(i)).filter(Boolean)], steep = [];
  for (const w of ways) for (let k = 1; k < w.pts.length; k++) {
    const [x, z] = w.pts[k], hi = Math.max(w.y[k], w.y[k - 1]), lo = Math.min(w.y[k], w.y[k - 1]), ds = w.d[k] - w.d[k - 1];
    if (w.y[k] < t.groundY(x, z) - 0.01 || (hi === 0 && hi - lo > 0.1 * ds + 0.05)) steep.push(`${x.toFixed(0)},${z.toFixed(0)} ${lo.toFixed(1)}→${hi.toFixed(1)}`);
  }
  const ramps = ways.reduce((n, w) => n + w.pts.filter(([x, z], k) => w.y[k] > t.groundY(x, z) + 0.5).length, 0);
  setTerrain(null);
  ok('terrain: the replacement buses\' roads come down off a station\'s pad as a ramp, never dropping off it or under the ground', ways.length > 8 && !steep.length, `${ways.length} ways, ${ramps} points on a ramp; ` + steep.slice(0, 4).join(', '));
}
