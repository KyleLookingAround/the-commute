// The terrain (src/render/terrain.ts) against the line, from the tiles on disk with every fine tile loaded, the
// ground built as the page builds it (the base mesh, the strip coarse and fine). No browser.
// - Clearance: no ground stands in a train's space: wherever a track runs on any line (off the viaduct), nothing drawn within a
//   body's half width (and half a metre) of its centreline is higher than the underframe, and the ground there is 0.
// - Platforms: no ground stands over any platform a kit draws (bought or not).
// - The datum: the ground at every track's centreline is the rail's level, 0, off the viaduct; under the viaduct the
//   valley floor is well below it.
// - Levenshulme: its forecourt, taxi rank and bus stop at street level below the embankment, and the arched recesses
//   at the foot of the wall under the east platform's building.
// - Roads: the replacement buses' roads come down off a station's pad as a ramp no steeper than 1 in 10, and never
//   run under the ground.
// - Size: what's committed of the terrain stays within its budget (3.4 MB, with the Crewe line and its Macclesfield leg).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
const { fromGeo } = await import('../../src/sim/network.ts');
const { Terrain, TerrainLayer, partBoxes } = await import('../../src/render/terrain.ts');
const { viaductOf, bridgesOf } = await import('../../src/render/landmarks.ts');

const HALF = 1.51 + 0.5, Y0 = 0.5;   // a body's half width as drawn (the geometry check's), and its underframe
const BUDGET = 3.4 * 1024 * 1024;

export default async function ({ ok, root }) {
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def), c = net.spine;
  const kits = Object.fromEntries(net.stations.map(st => [st.kit, JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8'))]));
  const via = viaductOf(c, def), spans = via ? [[Math.min(via.from, via.to), Math.max(via.from, via.to)]] : [];
  const t = new Terrain(net, kits, l => bridgesOf(l, def));
  const fineDir = join(root, 'src/data/terrain/fine'), fine = readdirSync(fineDir);
  for (const f of fine) t.addFine(f.replace('.txt', ''), readFileSync(join(fineDir, f), 'utf8'));
  const layer = new TerrainLayer(t, { city: { x: 0, z: 0, r: 0 } }, {});

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

  const size = statSync(join(root, 'src/data/terrain/base.json')).size + fine.reduce((n, f) => n + statSync(join(fineDir, f)).size, 0);
  ok(`terrain: the tiles are within their budget (${(size / 1048576).toFixed(2)} of ${BUDGET / 1048576} MB)`, size <= BUDGET);

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
