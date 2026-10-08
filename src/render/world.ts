// Ground, towns, roads, permanent way and landmarks, all laid out along the network's corridors.
import * as THREE from 'three';
import { MAT, PAL, box } from './scene.ts';
import { projectLatLon } from '../sim/network.ts';
import type { Network } from '../sim/network.ts';
import type { LandmarkDef, LatLon, NetworkGeoDef } from '../sim/types.ts';

const seed = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// Rotation about Y that maps local +x to the corridor direction (dx, dz) and local +z to the offset normal.
export const yawFor = (p: { dx: number; dz: number }): number => Math.atan2(-p.dz, p.dx);

export interface World { groundY: (x: number, z: number) => number; yawFor: typeof yawFor }

export function buildWorld(scene: THREE.Scene, net: Network, def: NetworkGeoDef): World {
  const c = net.corridor('main');
  const landmarks: Record<string, LandmarkDef | undefined> = Object.fromEntries((def.landmarks || []).map(l => [l.id, l]));
  // Valley for the viaduct: a dip in the ground between the landmark's from/to, centred on the corridor
  const via = landmarks['viaduct'];
  const viaduct = via && via.from && via.to && via.height !== undefined && via.arches !== undefined
    ? { from: c.nearest(...xz(def, via.from)), to: c.nearest(...xz(def, via.to)), height: via.height, arches: via.arches } : null;
  const valley = viaduct ? { s0: Math.min(viaduct.from, viaduct.to) - 20, s1: Math.max(viaduct.from, viaduct.to) + 60, depth: viaduct.height } : null;

  const groundY = (x: number, z: number): number => {
    if (!valley) return 0;
    const s = c.nearest(x, z); if (s < valley.s0 || s > valley.s1) return 0;
    const u = (s - valley.s0) / (valley.s1 - valley.s0);
    return -valley.depth * Math.pow(Math.max(0, Math.sin(Math.PI * u)), 0.9);
  };
  const along = (l: LandmarkDef | undefined): number | null => l && l.at ? c.nearest(...xz(def, l.at)) : null;

  // ---- the far ground: one flat field out to the horizon, so the detailed terrain never shows an edge ----
  { const far = new THREE.Mesh(new THREE.PlaneGeometry(60000, 60000), new THREE.MeshLambertMaterial({ color: PAL.grass })); far.rotation.x = -Math.PI / 2; far.position.y = -0.6; scene.add(far); }

  // ---- terrain: a plane over the corridor's bounding box ----
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
      if (d < 46) k = PAL.yard;
      if (s > c.length - 1600) k = PAL.city;
      if (river !== null && Math.abs(s - river) < 14) k = PAL.river;
      if (m60 !== null && Math.abs(s - m60) < 18) k = PAL.motorway;
      col[i * 3] = k.r; col[i * 3 + 1] = k.g; col[i * 3 + 2] = k.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
  })();

  // ---- ribbons along the corridor: roads, ballast, rails ----
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
  for (const t of net.tracks) { ribbon(t.offset, 3.4, 0.5, -0.25, MAT.ballast); for (const dx of [-0.72, 0.72]) ribbon(t.offset + dx, 0.1, 0.16, 0.08, MAT.rail); }
  ribbon(-95, 12, 0.2, 0.1, MAT.road); ribbon(110, 12, 0.2, 0.1, MAT.road);

  // ---- OHLE masts and wires ----
  (function ohle() {
    const n = Math.floor(c.length / 55) * 2;
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.25, 7.5, 6), MAT.steel, n), arms = new THREE.InstancedMesh(new THREE.BoxGeometry(14, 0.3, 0.3), MAT.steel, n);
    let k = 0; const wire: number[] = [];
    for (let s = 30; s < c.length && k < n; s += 55) for (const off of [-19, 25]) {
      const p = c.at(s, off); e.set(0, yawFor(p), 0); q.setFromEuler(e); sc.set(1, 1, 1);
      v3.set(p.x, 3.75, p.z); m4.compose(v3, q, sc); poles.setMatrixAt(k, m4);
      const pa = c.at(s, off + (off < 0 ? 7 : -7)); v3.set(pa.x, 6.8, pa.z); m4.compose(v3, q, sc); arms.setMatrixAt(k, m4); k++;
    }
    poles.count = arms.count = k; scene.add(poles); scene.add(arms);
    for (const t of net.tracks) for (let i = 0; i < c.pts.length - 1; i++) { const a = c.at(c.cum[i]!, t.offset), b = c.at(c.cum[i + 1]!, t.offset); wire.push(a.x, 5.4, a.z, b.x, 5.4, b.z); }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wire), 3));
    scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x8c93a3 })));
  })();

  // ---- houses: terraces through the suburbs, towers at the city end ----
  (function towns() {
    const inst = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color: PAL.house }), 5000);
    const col = new THREE.Color(); let n = 0;
    const stationS = net.stations.map(s => s.s);
    for (let k = 0; k < 14000 && n < 5000; k++) {
      const s = seed(k, 1) * c.length, side = seed(k, 2) < 0.5 ? -1 : 1, off = side * (60 + seed(k, 3) * 600);
      if (valley && s > valley.s0 - 40 && s < valley.s1 + 40 && Math.abs(off) < 700) continue;
      const city = s > c.length - 1600;
      const nearStation = Math.min(...stationS.map(x => Math.abs(x - s)));
      if (nearStation < 200 && Math.abs(off) < 130) continue;   // the station's own kit fills this
      const dens = city ? 0.95 : 0.3 + 0.45 * Math.exp(-Math.pow((s - c.length * 0.55) / 2500, 2)) + (nearStation < 400 ? 0.25 : 0);
      if (seed(k, 4) > dens) continue;
      const terrace = !city && seed(k, 5) < 0.5;
      // the city end is towers, but low-rise around its stations (Ardwick is yards and sheds, not a skyline)
      const tower = city && nearStation > 600;
      const w = terrace ? 12 + seed(k, 6) * 26 : 8 + seed(k, 6) * 10, d = 9 + seed(k, 7) * 6, h = tower ? 14 + seed(k, 8) * 60 : 6 + seed(k, 8) * 5;
      const p = c.at(s, off); e.set(0, yawFor(p) + (seed(k, 11) - 0.5) * 0.3, 0); q.setFromEuler(e);
      v3.set(p.x, h / 2 + groundY(p.x, p.z), p.z); sc.set(w, h, d); m4.compose(v3, q, sc); inst.setMatrixAt(n, m4);
      col.setHSL(0.04 + seed(k, 9) * 0.06, city ? PAL['tower-sat'] : PAL['house-sat'], (city ? PAL['tower-light'] : PAL['house-light']) + seed(k, 10) * 0.15); inst.setColorAt(n, col);
      n++;
    }
    inst.count = n; scene.add(inst);
  })();

  // ---- the viaduct ----
  if (viaduct && valley) {
    const s0 = Math.min(viaduct.from, viaduct.to), len = Math.abs(viaduct.to - viaduct.from), n = viaduct.arches, span = len / n, top = -0.4, base = -(viaduct.height + 8);
    const shape = new THREE.Shape();
    shape.moveTo(0, base); shape.lineTo(len, base); shape.lineTo(len, top); shape.lineTo(0, top); shape.closePath();
    for (let i = 0; i < n; i++) {
      const cx = span * (i + 0.5), r = span * 0.4, spring = -(viaduct.height - 10);
      const h = new THREE.Path(); h.moveTo(cx - r, base); h.lineTo(cx - r, spring); h.absarc(cx, spring, r, Math.PI, 0, true); h.lineTo(cx + r, base); h.closePath();
      shape.holes.push(h);
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: false });
    const frame = c.at(s0 + len / 2); const gp = new THREE.Group(); gp.position.set(frame.x, 0, frame.z); gp.rotation.y = yawFor(frame); scene.add(gp);
    for (const off of [-23, 23]) { const m = new THREE.Mesh(geo, MAT.brick); m.position.set(-len / 2, 0, off); gp.add(m); }
    box(gp, len, 1.2, 48, MAT.brickDark, 0, -0.6, 2.5);
    for (const off of [-22.5, 27.5]) box(gp, len, 1.6, 0.8, MAT.brickDark, 0, 0.4, off);
    // M60 lane lights in the valley
    const sm = along(landmarks['m60']);
    if (sm !== null) { for (let off = -680; off < 700; off += 70) { const p = c.at(sm, off); box(scene, 0.6, 0.3, 14, MAT.warm, p.x, groundY(p.x, p.z) + 0.6, p.z).rotation.y = yawFor(p); } }
  }

  // ---- the Pyramid: a glass pyramid by the M60, placeholder until it gets a proper model ----
  const pyramid = landmarks['pyramid'];
  if (pyramid && pyramid.lat !== undefined && pyramid.lon !== undefined) {
    const p = projectLatLon(pyramid.lat, pyramid.lon, def.origin);
    const y0 = groundY(p.x, p.z);
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(34, 36, 4), MAT.pyramid); pyr.position.set(p.x, y0 + 18, p.z); pyr.rotation.y = Math.PI / 4; scene.add(pyr);
    box(scene, 60, 2, 60, MAT.concrete, p.x, y0 + 1, p.z);
  }

  return { groundY, yawFor };
}

function xz(def: NetworkGeoDef, ll: LatLon): [number, number] { const p = projectLatLon(ll.lat, ll.lon, def.origin); return [p.x, p.z]; }
