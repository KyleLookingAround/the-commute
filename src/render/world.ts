// Ground, towns, roads, permanent way and landmarks, all laid out along the network's corridors.
import * as THREE from 'three';
import { MAT, PAL } from './scene.ts';
import { byCell } from './cells.ts';
import { bridgesOf, buildLandmarks, onCourses, viaductOf } from './landmarks.ts';
import { Terrain, TerrainLayer, fineFiles, kitFiles, setTerrain, worldFiles } from './terrain.ts';
import type { BuildingsLayer } from './buildings.ts';
import { SPINE, newFrame } from '../sim/network.ts';
import type { Network } from '../sim/network.ts';
import type { NetworkGeoDef } from '../sim/types.ts';

const seed = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// Rotation about Y that maps local +x to the corridor direction (dx, dz) and local +z to the offset normal.
export const yawFor = (p: { dx: number; dz: number }): number => Math.atan2(-p.dz, p.dx);

/** groundY: the ground's height as drawn (src/render/terrain.ts); ground: the terrain's material, which the reach
 * (src/render/reach.ts) draws on; buildable: whether a building r metres round (x, z) would stand clear of the railway's
 * land, the river, the M60, the town in the viaduct's valley, the roads and the houses already drawn, on ground level
 * enough to build on (for homes that grow, src/render/homes.ts); terrain: the ground itself; buildings: the real ones
 * (src/render/buildings.ts). */
export interface World { groundY: (x: number, z: number) => number; yawFor: typeof yawFor; ground: THREE.MeshLambertMaterial; buildable: (x: number, z: number, r: number) => boolean; terrain: TerrainLayer; buildings: Buildings }

/** The real buildings (src/render/buildings.ts), whose script is fetched after the page's own, so the first frame never
 * waits on it: which squares have them from the start, the layer once it's in. */
export interface Buildings { real: (x: number, z: number) => boolean; blocked: (x: number, z: number, r: number) => boolean; layer: Promise<BuildingsLayer>; ready: Promise<void>; setLow: (low: boolean) => void }

export function buildWorld(scene: THREE.Scene, net: Network, def: NetworkGeoDef): World {
  const c = net.spine;
  // the viaduct's valley: the town centre fills it, so no suburb houses or new homes stand there
  const viaduct = viaductOf(c, def);
  const valley = viaduct ? { s0: Math.min(viaduct.from, viaduct.to) - 20, s1: Math.max(viaduct.from, viaduct.to) + 60 } : null;
  // the town's edge: the wires end just beyond Hazel Grove, and the Buxton line on from there runs through fields and
  // villages, unwired (OpenStreetMap: electrified=no), so the masts, the stand-in roads and the suburbs stop here
  const hg = net.stations.find(st => st.id === 'hazel-grove'), edge = hg ? Math.max(0, hg.at - 360) : 0;

  // ---- the ground, from survey: the railway's land level with the line, the real lie of the land round it ----
  const terrain = new Terrain(net, kitFiles(), bridgesOf(c, def)); setTerrain(terrain);
  const end = c.at(c.length - 700);
  const layer = new TerrainLayer(terrain, { city: { x: end.x, z: end.z, r: 1700 } }, fineFiles());
  scene.add(layer.group);
  const ground = layer.material;
  const groundY = (x: number, z: number): number => terrain.groundY(x, z);
  // the real buildings, where there are tiles for them: the made-up houses keep out of those squares
  const files = worldFiles(), squares = new Set(Object.keys(files));
  let real: BuildingsLayer | null = null, low = false;
  const loaded = import('./buildings.ts').then(m => { real = new m.BuildingsLayer(terrain, files, net, def, kitFiles(), layer); real.setLow(low); scene.add(real.group); return real; });
  const buildings: Buildings = {
    real: (x, z) => squares.has(`${Math.floor(x / 1000)}_${Math.floor(z / 1000)}`), blocked: (x, z, r) => !!real?.blocked(x, z, r),
    layer: loaded, ready: loaded.then(l => l.ready), setLow: v => { low = v; real?.setLow(v); },
  };

  // ---- the far ground: one flat field out to the horizon at the level the terrain eases to, so it never shows an edge ----
  // drawn first (after the sky) and without depth: one quad this big loses depth tests to the terrain above it from some
  // angles, and then the fields cover the line; it lies under everything, so it never needs to win one
  { const far = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshLambertMaterial({ color: PAL.grass, depthWrite: false })); far.rotation.x = -Math.PI / 2; far.position.y = terrain.edge - 0.6; far.renderOrder = -1; scene.add(far); }

  // ---- ribbons along the corridor: roads; ballast and rails along each track ----
  const segs: { s0: number; s1: number; len: number }[] = [];
  for (let i = 0; i < c.pts.length - 1; i++) { const s0 = c.cum[i]!, s1 = c.cum[i + 1]!; segs.push({ s0, s1, len: s1 - s0 }); }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  // a road along the line on the ground, each piece tilted to the slope; none down into the viaduct's valley
  function ribbon(offset: number, width: number, height: number, y: number, mat: THREE.Material): void {
    const inst = new THREE.InstancedMesh(unit, mat, segs.length); inst.count = 0;
    for (const sg of segs) {
      if (sg.s0 < edge) continue;
      if (valley && sg.s1 > valley.s0 - 100 && sg.s0 < valley.s1 + 100) continue;
      const a = c.at(sg.s0, offset), b = c.at(sg.s1, offset), mid = c.at((sg.s0 + sg.s1) / 2, offset);
      const ya = groundY(a.x, a.z), yb = groundY(b.x, b.z), len = Math.hypot(b.x - a.x, b.z - a.z);
      e.set(0, yawFor(mid), Math.atan2(yb - ya, len)); q.setFromEuler(e); v3.set(mid.x, (ya + yb) / 2 + y, mid.z); sc.set(Math.hypot(len, yb - ya) + 0.6, height, width);
      m4.compose(v3, q, sc); inst.setMatrixAt(inst.count++, m4);
    }
    scene.add(byCell(inst).group);
  }
  // a track's ballast and rails, short pieces so they follow it into a station's layout and across the crossovers
  const STEP = 20, nStep = Math.ceil(c.length / STEP);
  const pa = newFrame(), pb = newFrame();
  function trackRibbon(trackId: string, lateral: number, width: number, height: number, y: number, mat: THREE.Material): void {
    // only where the track is: the main lines begin south of Stockport, the Hazel Grove line ends in its platform 1
    const [e0, e1] = net.extent(trackId), i0 = Math.floor(e0 / STEP), i1 = Math.ceil(e1 / STEP);
    const inst = new THREE.InstancedMesh(unit, mat, Math.max(1, i1 - i0)); inst.count = 0;
    for (let i = i0; i < i1; i++) {
      const s0 = Math.max(e0, i * STEP), s1 = Math.min(e1, (i + 1) * STEP); if (s1 <= s0) continue;
      net.trackAt(trackId, s0, pa); net.trackAt(trackId, s1, pb);
      const ax = pa.x + pa.nx * lateral, az = pa.z + pa.nz * lateral, bx = pb.x + pb.nx * lateral, bz = pb.z + pb.nz * lateral;
      const len = Math.hypot(bx - ax, bz - az) || 0.01;
      e.set(0, Math.atan2(-(bz - az), bx - ax), 0); q.setFromEuler(e); v3.set((ax + bx) / 2, y, (az + bz) / 2); sc.set(len + 0.3, height, width);
      m4.compose(v3, q, sc); inst.setMatrixAt(inst.count++, m4);
    }
    scene.add(byCell(inst).group);
  }
  for (const t of net.tracks) { trackRibbon(t.id, 0, 3.4, 0.5, -0.25, MAT.ballast); for (const dx of [-0.72, 0.72]) trackRibbon(t.id, dx, 0.1, 0.16, 0.08, MAT.rail); }
  ribbon(-95, 12, 0.2, 0.1, MAT.road); ribbon(126, 12, 0.2, 0.1, MAT.road);

  // ---- OHLE: a mast outside each outer track with an arm reaching over it, and a wire over every track ----
  (function ohle() {
    const n = Math.floor((c.length - edge) / 55) * 2;
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.25, 7.5, 6), MAT.steel, n), arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 6), MAT.steel, n);
    let k = 0; const wire: number[] = [];
    for (let s = edge + 30; s < c.length && k < n; s += 55) {
      let lo = Infinity, hi = -Infinity;
      for (const t of net.tracks) { const [e0, e1] = net.extent(t.id); if (s < e0 || s > e1) continue; const o = net.offsetAt(t.id, s); lo = Math.min(lo, o); hi = Math.max(hi, o); }
      if (lo > hi) continue;
      for (const [off, inward] of [[lo - 3.2, 1], [hi + 3.2, -1]] as const) {
        const p = net.place(SPINE, s, off); e.set(0, yawFor(p), 0); q.setFromEuler(e); sc.set(1, 1, 1);
        v3.set(p.x, 3.75, p.z); m4.compose(v3, q, sc); poles.setMatrixAt(k, m4);
        const pa2 = net.place(SPINE, s, off + inward * 3); v3.set(pa2.x, 6.8, pa2.z); m4.compose(v3, q, sc); arms.setMatrixAt(k, m4); k++;
      }
    }
    poles.count = arms.count = k; scene.add(byCell(poles).group, byCell(arms).group);
    for (const t of net.tracks) {
      const [e0, e1] = net.extent(t.id);
      for (let s = t.corridor === hg?.corridor ? Math.max(e0, edge) : e0; s < e1; s += STEP) { net.trackAt(t.id, s, pa); net.trackAt(t.id, Math.min(e1, s + STEP), pb); wire.push(pa.x, 5.4, pa.z, pb.x, 5.4, pb.z); }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wire), 3));
    scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x8c93a3 })));
  })();

  // ---- houses: terraces through the suburbs, towers at the city end ----
  // each house's footprint (x, z, radius) in cells of HOUSE_CELL metres, so homes that grow keep off them
  const HOUSE_CELL = 60, houses = new Map<string, number[]>();
  const cellKey = (x: number, z: number) => `${Math.floor(x / HOUSE_CELL)},${Math.floor(z / HOUSE_CELL)}`;
  (function towns() {
    const inst = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color: PAL.house }), 5000);
    const col = new THREE.Color(); let n = 0;
    const stationS = net.stations.map(s => s.s);
    // nothing stands on the roads the replacement buses drive (the network's `roads`)
    const segs = (net.def.roads ?? []).flatMap(r => r.points.slice(1).map((b, i) => [r.points[i]!, b] as const));
    const onRoad = (x: number, z: number, r: number) => segs.some(([[ax, az], [bx, bz]]) => {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      return Math.hypot(x - ax - dx * t, z - az - dz * t) < r;
    });
    // beyond the town's edge, fewer: a scatter in the fields, and the villages round their stations, by how many live there
    const rural = (s: number, near: number, st: number) => 0.05 + 0.5 * Math.exp(-((near / 450) ** 2)) * Math.min(1, (net.stations[st]?.catchment ?? 0) / 150);
    const ruralN = Math.round(14000 * edge / Math.max(1, c.length - edge));
    for (let k = 0; k < 14000 + ruralN && n < 5000; k++) {
      const out = k >= 14000, s = out ? seed(k, 1) * edge : edge + seed(k, 1) * (c.length - edge), side = seed(k, 2) < 0.5 ? -1 : 1, off = side * (60 + seed(k, 3) * 600);
      if (valley && s > valley.s0 - 40 && s < valley.s1 + 40 && Math.abs(off) < 700) continue;
      const city = s > c.length - 1600;
      const gaps = stationS.map(x => Math.abs(x - s)), nearStation = Math.min(...gaps);
      if (nearStation < 220 && Math.abs(off) < 180) continue;   // the station's own kit fills this
      const dens = out ? rural(s, nearStation, gaps.indexOf(nearStation)) : city ? 0.95 : 0.3 + 0.45 * Math.exp(-Math.pow((s - edge - (c.length - edge) * 0.55) / 2500, 2)) + (nearStation < 400 ? 0.25 : 0);
      if (seed(k, 4) > dens) continue;
      const terrace = !city && seed(k, 5) < 0.5;
      // the city end is towers, but low-rise around its stations (Ardwick is yards and sheds, not a skyline)
      const tower = city && nearStation > 600;
      const w = terrace ? 12 + seed(k, 6) * 26 : 8 + seed(k, 6) * 10, d = 9 + seed(k, 7) * 6, h = tower ? 14 + seed(k, 8) * 60 : 6 + seed(k, 8) * 5;
      const p = c.at(s, off);
      if (buildings.real(p.x, p.z)) continue;
      if (onRoad(p.x, p.z, 6 + Math.max(w, d) / 2)) continue;
      // on the ground's lowest corner, its walls running down into it; none on a bank too steep to build on
      const rr = Math.max(w, d) / 2, ys = [groundY(p.x, p.z), groundY(p.x - rr, p.z - rr), groundY(p.x + rr, p.z - rr), groundY(p.x - rr, p.z + rr), groundY(p.x + rr, p.z + rr)];
      const y0 = Math.min(...ys); if (Math.max(...ys) - y0 > 5) continue;
      e.set(0, yawFor(p) + (seed(k, 11) - 0.5) * 0.3, 0); q.setFromEuler(e);
      v3.set(p.x, (h + 1 + Math.max(...ys) - y0) / 2 + y0 - 0.5, p.z); sc.set(w, h + Math.max(...ys) - y0 + 1, d); m4.compose(v3, q, sc); inst.setMatrixAt(n, m4);
      { const k2 = cellKey(p.x, p.z), list = houses.get(k2) ?? []; list.push(p.x, p.z, Math.hypot(w, d) / 2); houses.set(k2, list); }
      col.setHSL(0.04 + seed(k, 9) * 0.06, city ? PAL['tower-sat'] : PAL['house-sat'], (city ? PAL['tower-light'] : PAL['house-light']) + seed(k, 10) * 0.15); inst.setColorAt(n, col);
      n++;
    }
    inst.count = n; scene.add(byCell(inst).group);
  })();

  // ---- the landmarks: the viaduct, the river and the M60 under it, the Pyramid, the town, the city's skyline ----
  buildLandmarks(scene, net, def, groundY, buildings.real);

  const roadSegs = (net.def.roads ?? []).flatMap(r => r.points.slice(1).map((b, i) => [r.points[i]!, b] as const));
  const onCourse = onCourses(def);
  const buildable = (x: number, z: number, r: number): boolean => {
    const s = c.nearest(x, z), a = c.at(s), off = Math.hypot(x - a.x, z - a.z);
    if (off < 36 + r) return false;
    if (valley && s > valley.s0 - 40 && s < valley.s1 + 40 && off < 700) return false;
    // level enough to build on: no more than 4 m from one side to the other
    const ys = [groundY(x, z), groundY(x - r, z), groundY(x + r, z), groundY(x, z - r), groundY(x, z + r)];
    if (Math.max(...ys) - Math.min(...ys) > 4) return false;
    if (onCourse(x, z, r)) return false;
    if (buildings.blocked(x, z, r + 2)) return false;
    for (const [[ax, az], [bx, bz]] of roadSegs) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(x - ax - dx * t, z - az - dz * t) < r + 7) return false;
    }
    const cx = Math.floor(x / HOUSE_CELL), cz = Math.floor(z / HOUSE_CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const list = houses.get(`${cx + i},${cz + j}`); if (!list) continue;
      for (let k = 0; k < list.length; k += 3) if (Math.hypot(x - list[k]!, z - list[k + 1]!) < r + list[k + 2]! + 2) return false;
    }
    return true;
  };

  return { groundY, yawFor, ground, buildable, terrain: layer, buildings };
}

