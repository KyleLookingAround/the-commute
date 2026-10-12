// Ground, towns, roads, permanent way and landmarks, all laid out along the network's corridors.
import * as THREE from 'three';
import { MAT, PAL } from './scene.ts';
import { buildLandmarks, viaductOf } from './landmarks.ts';
import { newFrame, projectLatLon } from '../sim/network.ts';
import type { Network } from '../sim/network.ts';
import type { LandmarkDef, LatLon, NetworkGeoDef } from '../sim/types.ts';

const seed = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// Rotation about Y that maps local +x to the corridor direction (dx, dz) and local +z to the offset normal.
export const yawFor = (p: { dx: number; dz: number }): number => Math.atan2(-p.dz, p.dx);

/** groundY: the ground's height; ground: the terrain's material, which the reach (src/render/reach.ts) draws on;
 * buildable: whether a building r metres round (x, z) would stand clear of the railway's land, the river, the M60, the
 * viaduct's valley, the roads and the houses already drawn (for homes that grow, src/render/homes.ts). */
export interface World { groundY: (x: number, z: number) => number; yawFor: typeof yawFor; ground: THREE.MeshLambertMaterial; buildable: (x: number, z: number, r: number) => boolean }

export function buildWorld(scene: THREE.Scene, net: Network, def: NetworkGeoDef): World {
  const c = net.corridor('main');
  const landmarks: Record<string, LandmarkDef | undefined> = Object.fromEntries((def.landmarks || []).map(l => [l.id, l]));
  // Valley for the viaduct: a dip in the ground between the landmark's from/to, centred on the corridor
  const viaduct = viaductOf(c, def);
  const valley = viaduct ? { s0: Math.min(viaduct.from, viaduct.to) - 20, s1: Math.max(viaduct.from, viaduct.to) + 60, depth: viaduct.height } : null;

  const groundY = (x: number, z: number): number => {
    if (!valley) return 0;
    const s = c.nearest(x, z); if (s < valley.s0 || s > valley.s1) return 0;
    const u = (s - valley.s0) / (valley.s1 - valley.s0);
    return -valley.depth * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.9);
  };
  const along = (l: LandmarkDef | undefined): number | null => l && l.at ? c.nearest(...xz(def, l.at)) : null;

  // ---- the far ground: one flat field out to the horizon, so the detailed terrain never shows an edge ----
  // drawn first (after the sky) and without depth: one quad this big loses depth tests to the terrain above it from some
  // angles, and then the fields cover the line; it lies under everything, so it never needs to win one
  { const far = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshLambertMaterial({ color: PAL.grass, depthWrite: false })); far.rotation.x = -Math.PI / 2; far.position.y = -0.6; far.renderOrder = -1; scene.add(far); }

  // ---- terrain: a plane over the corridor's bounding box ----
  const ground = new THREE.MeshLambertMaterial({ vertexColors: true });
  (function terrain() {
    const pts = c.pts; let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
    const pad = 1500, W = maxX - minX + 2 * pad, H = maxZ - minZ + 2 * pad, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const g = new THREE.PlaneGeometry(W, H, Math.round(W / 60), Math.round(H / 60)); g.rotateX(-Math.PI / 2);
    const p = g.getAttribute('position'), col = new Float32Array(p.count * 3);
    const river = along(landmarks['mersey']), m60 = along(landmarks['m60']);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + cx, z = p.getZ(i) + cz; p.setX(i, x); p.setZ(i, z);
      const s = c.nearest(x, z), y = groundY(x, z); p.setY(i, y);
      let k = PAL.grass;
      const a = c.at(s), d = Math.hypot(x - a.x, z - a.z);
      if (d < 36) k = PAL.yard;
      if (s > c.length - 1600) k = PAL.city;
      if (river !== null && Math.abs(s - river) < 14) k = PAL.river;
      if (m60 !== null && Math.abs(s - m60) < 18) k = PAL.motorway;
      col[i * 3] = k.r; col[i * 3 + 1] = k.g; col[i * 3 + 2] = k.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, ground));
  })();

  // ---- ribbons along the corridor: roads; ballast and rails along each track ----
  const segs: { s0: number; s1: number; len: number }[] = [];
  for (let i = 0; i < c.pts.length - 1; i++) { const s0 = c.cum[i]!, s1 = c.cum[i + 1]!; segs.push({ s0, s1, len: s1 - s0 }); }
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  function ribbon(offset: number, width: number, height: number, y: number, mat: THREE.Material): THREE.InstancedMesh {
    const inst = new THREE.InstancedMesh(unit, mat, segs.length);
    segs.forEach((sg, i) => {
      const mid = c.at((sg.s0 + sg.s1) / 2, offset);
      e.set(0, yawFor(mid), 0); q.setFromEuler(e); v3.set(mid.x, y, mid.z); sc.set(sg.len + 0.6, height, width);
      m4.compose(v3, q, sc); inst.setMatrixAt(i, m4);
    });
    scene.add(inst); return inst;
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
    scene.add(inst);
  }
  for (const t of net.tracks) { trackRibbon(t.id, 0, 3.4, 0.5, -0.25, MAT.ballast); for (const dx of [-0.72, 0.72]) trackRibbon(t.id, dx, 0.1, 0.16, 0.08, MAT.rail); }
  ribbon(-95, 12, 0.2, 0.1, MAT.road); ribbon(126, 12, 0.2, 0.1, MAT.road);

  // ---- OHLE: a mast outside each outer track with an arm reaching over it, and a wire over every track ----
  (function ohle() {
    const n = Math.floor(c.length / 55) * 2;
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.25, 7.5, 6), MAT.steel, n), arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 6), MAT.steel, n);
    let k = 0; const wire: number[] = [];
    for (let s = 30; s < c.length && k < n; s += 55) {
      let lo = Infinity, hi = -Infinity;
      for (const t of net.tracks) { const [e0, e1] = net.extent(t.id); if (s < e0 || s > e1) continue; const o = net.offsetAt(t.id, s); lo = Math.min(lo, o); hi = Math.max(hi, o); }
      if (lo > hi) continue;
      for (const [off, inward] of [[lo - 3.2, 1], [hi + 3.2, -1]] as const) {
        const p = net.place('main', s, off); e.set(0, yawFor(p), 0); q.setFromEuler(e); sc.set(1, 1, 1);
        v3.set(p.x, 3.75, p.z); m4.compose(v3, q, sc); poles.setMatrixAt(k, m4);
        const pa2 = net.place('main', s, off + inward * 3); v3.set(pa2.x, 6.8, pa2.z); m4.compose(v3, q, sc); arms.setMatrixAt(k, m4); k++;
      }
    }
    poles.count = arms.count = k; scene.add(poles); scene.add(arms);
    for (const t of net.tracks) {
      const [e0, e1] = net.extent(t.id);
      for (let s = e0; s < e1; s += STEP) { net.trackAt(t.id, s, pa); net.trackAt(t.id, Math.min(e1, s + STEP), pb); wire.push(pa.x, 5.4, pa.z, pb.x, 5.4, pb.z); }
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
    for (let k = 0; k < 14000 && n < 5000; k++) {
      const s = seed(k, 1) * c.length, side = seed(k, 2) < 0.5 ? -1 : 1, off = side * (60 + seed(k, 3) * 600);
      if (valley && s > valley.s0 - 40 && s < valley.s1 + 40 && Math.abs(off) < 700) continue;
      const city = s > c.length - 1600;
      const nearStation = Math.min(...stationS.map(x => Math.abs(x - s)));
      if (nearStation < 220 && Math.abs(off) < 180) continue;   // the station's own kit fills this
      const dens = city ? 0.95 : 0.3 + 0.45 * Math.exp(-Math.pow((s - c.length * 0.55) / 2500, 2)) + (nearStation < 400 ? 0.25 : 0);
      if (seed(k, 4) > dens) continue;
      const terrace = !city && seed(k, 5) < 0.5;
      // the city end is towers, but low-rise around its stations (Ardwick is yards and sheds, not a skyline)
      const tower = city && nearStation > 600;
      const w = terrace ? 12 + seed(k, 6) * 26 : 8 + seed(k, 6) * 10, d = 9 + seed(k, 7) * 6, h = tower ? 14 + seed(k, 8) * 60 : 6 + seed(k, 8) * 5;
      const p = c.at(s, off);
      if (onRoad(p.x, p.z, 6 + Math.max(w, d) / 2)) continue;
      e.set(0, yawFor(p) + (seed(k, 11) - 0.5) * 0.3, 0); q.setFromEuler(e);
      v3.set(p.x, h / 2 + groundY(p.x, p.z), p.z); sc.set(w, h, d); m4.compose(v3, q, sc); inst.setMatrixAt(n, m4);
      { const k2 = cellKey(p.x, p.z), list = houses.get(k2) ?? []; list.push(p.x, p.z, Math.hypot(w, d) / 2); houses.set(k2, list); }
      col.setHSL(0.04 + seed(k, 9) * 0.06, city ? PAL['tower-sat'] : PAL['house-sat'], (city ? PAL['tower-light'] : PAL['house-light']) + seed(k, 10) * 0.15); inst.setColorAt(n, col);
      n++;
    }
    inst.count = n; scene.add(inst);
  })();

  // ---- the landmarks: the viaduct, the river and the M60 under it, the Pyramid, the town, the city's skyline ----
  buildLandmarks(scene, net, def, groundY);

  const roadSegs = (net.def.roads ?? []).flatMap(r => r.points.slice(1).map((b, i) => [r.points[i]!, b] as const));
  const riverS = along(landmarks['mersey']), m60S = along(landmarks['m60']);
  const buildable = (x: number, z: number, r: number): boolean => {
    if (groundY(x, z) < -0.3) return false;
    const s = c.nearest(x, z), a = c.at(s);
    if (Math.hypot(x - a.x, z - a.z) < 36 + r) return false;
    if (riverS !== null && Math.abs(s - riverS) < 30 + r) return false;
    if (m60S !== null && Math.abs(s - m60S) < 40 + r) return false;
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

  return { groundY, yawFor, ground, buildable };
}

function xz(def: NetworkGeoDef, ll: LatLon): [number, number] { const p = projectLatLon(ll.lat, ll.lon, def.origin); return [p.x, p.z]; }
