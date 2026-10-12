// The landmarks that make the line recognisable at a glance: Stockport Viaduct over the Mersey valley with the river and
// the M60 beneath it, the Pyramid, the Plaza, Merseyway and the town round them, and the city's towers on the horizon.
// Positions come from the network's `landmarks` (src/data/network.json), each with a `note` saying where it came from.
// Nothing here changes the game; the lit-at-dusk materials follow the clock in src/render/scene.ts.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, PAL, box } from './scene.ts';
import { newFrame, projectLatLon } from '../sim/network.ts';
import type { Corridor, Network } from '../sim/network.ts';
import type { LandmarkDef, LatLon, NetworkGeoDef } from '../sim/types.ts';
import { kitFiles } from './terrain.ts';

/** A landmark as the data gives it, with the fields only the renderer reads: a footprint (w along x, d along z, metres),
 * a turn (degrees anticlockwise from east), a shape for the towers, and where its position and look came from. */
type Mark = LandmarkDef & { note?: string; w?: number; d?: number; yaw?: number; shape?: string };

const seed = (a: number, b: number) => { const s = Math.sin(a * 157.3 + b * 271.9) * 41758.5453; return s - Math.floor(s); };
const yawFor = (p: { dx: number; dz: number }): number => Math.atan2(-p.dz, p.dx);

/** The viaduct's span along the main corridor (s from and to), its height over the valley floor and its arches: the one
 * place both the valley (src/render/world.ts) and the viaduct read, so terrain from survey can move them together. */
export interface Viaduct { from: number; to: number; height: number; arches: number }
export function viaductOf(c: Corridor, def: NetworkGeoDef): Viaduct | null {
  const via = (def.landmarks ?? []).find(l => l.id === 'viaduct');
  if (!via || !via.from || !via.to || via.height === undefined || via.arches === undefined) return null;
  return { from: c.nearest(...xz(def, via.from)), to: c.nearest(...xz(def, via.to)), height: via.height, arches: via.arches };
}

export function buildLandmarks(scene: THREE.Scene, net: Network, def: NetworkGeoDef, groundY: (x: number, z: number) => number): void {
  const c = net.corridor('main');
  const marks = (def.landmarks ?? []) as Mark[], byId = (id: string) => marks.find(m => m.id === id);
  const along = (m: Mark | undefined): number | null => m && m.at ? c.nearest(...xz(def, m.at)) : null;
  const river = along(byId('mersey')), m60 = along(byId('m60'));
  const via = viaductOf(c, def);
  if (via) viaduct(scene, net, c, via, groundY);
  if (river !== null) crossing(scene, c, river, groundY, 'river');
  if (m60 !== null) crossing(scene, c, m60, groundY, 'm60');
  const pyramid = byId('pyramid'); if (pyramid) buildPyramid(scene, def, pyramid, groundY);
  town(scene, net, c, def, marks, groundY, { river, m60 });
  skyline(scene, def, marks.filter(m => m.kind === 'tower'));
}

// ---- Stockport Viaduct: 27 brick arches on tall piers, widened on its west side in the 1880s ----
function viaduct(scene: THREE.Scene, net: Network, c: Corridor, via: Viaduct, groundY: (x: number, z: number) => number): void {
  const s0 = Math.min(via.from, via.to), len = Math.abs(via.to - via.from), n = via.arches, span = len / n;
  const mid = c.at(s0 + len / 2), gp = new THREE.Group(); gp.position.set(mid.x, 0, mid.z); gp.rotation.y = yawFor(mid); scene.add(gp);
  // as wide as the four tracks on it, with a few metres of cess each side; the corridor's normal points east, so the
  // 1887-89 widening is the half at lower offsets (west) and the 1840 original the half at higher ones
  let lo = Infinity, hi = -Infinity; for (const t of net.tracks) { const o = net.offsetAt(t.id, s0 + len / 2); lo = Math.min(lo, o); hi = Math.max(hi, o); }
  const w0 = lo - 6, w1 = hi + 6, zm = (w0 + w1) / 2, half = (w1 - w0) / 2, SEAM = 0.3;
  const pw = span * 0.2, r = span / 2 - pw / 2, top = -0.4, spring = -(r + 3.2);
  const worldY = (u: number, v: number) => groundY(mid.x + mid.dx * u + mid.nx * v, mid.z + mid.dz * u + mid.nz * v);

  // the spandrel over one span, solid right through (so the soffit shows from the valley floor), extruded one metre in v
  const shape = new THREE.Shape(); const hs = span / 2;
  shape.moveTo(-hs, spring); shape.lineTo(-hs, top); shape.lineTo(hs, top); shape.lineTo(hs, spring); shape.lineTo(r, spring);
  shape.absarc(0, spring, r, 0, Math.PI, false); shape.lineTo(-hs, spring);
  const spandrel = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 10 }); spandrel.translate(0, 0, -0.5);
  // a pier: a box from y -1 to 0 that widens towards its foot, scaled to reach from the arches' springing to the ground
  const pier = new THREE.BoxGeometry(1, 1, 1); pier.translate(0, -0.5, 0);
  { const p = pier.getAttribute('position'); for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.5) { p.setX(i, p.getX(i) * 1.35); p.setZ(i, p.getZ(i) * 1.04); } pier.computeVertexNormals(); }
  // the arch ring proud of each outer face
  const ringShape = new THREE.Shape(); ringShape.absarc(0, 0, r + 0.9, 0, Math.PI, false); ringShape.lineTo(-r, 0); ringShape.absarc(0, 0, r, Math.PI, 0, true); ringShape.lineTo(r + 0.9, 0);
  const ring = new THREE.ExtrudeGeometry(ringShape, { depth: 0.5, bevelEnabled: false, curveSegments: 10 }); ring.translate(0, spring, -0.25);

  const halves = [{ z: (w0 + zm - SEAM) / 2, d: half - SEAM, col: PAL['brick-new'] }, { z: (zm + SEAM + w1) / 2, d: half - SEAM, col: PAL.brick }];
  // the piers stand 0.3 m proud of the outer faces only, so the seam between the halves shows down them too
  const pierZ = [{ z: (w0 - 0.3 + zm - SEAM) / 2, d: half - SEAM + 0.3 }, { z: (zm + SEAM + w1 + 0.3) / 2, d: half - SEAM + 0.3 }];
  const spans = new THREE.InstancedMesh(spandrel, MAT.viaduct, n * 3), piers = new THREE.InstancedMesh(pier, MAT.viaduct, (n + 1) * 3);
  const rings = new THREE.InstancedMesh(ring, MAT.viaduct, n * 2), imposts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), MAT.concrete, n + 1);
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), MAT.glow, (n + 1) * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
  const put = (im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, k?: THREE.Color) => {
    v.set(x, y, z); sc.set(sx, sy, sz); m4.compose(v, q, sc); im.setMatrixAt(i, m4); if (k) im.setColorAt(i, k);
  };
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + span * (i + 0.5), shade = 0.94 + seed(i, 1) * 0.12;
    halves.forEach((h, k) => put(spans, i * 3 + k, x, 0, h.z, 1, 1, h.d, col.copy(h.col).multiplyScalar(shade)));
    // the join: a darker course a little up into the soffit, so the widening shows as a seam along the arch
    put(spans, i * 3 + 2, x, 0.12, zm, 1, 1, SEAM * 2 + 0.02, PAL['brick-dark']);
    put(rings, i * 2, x, 0, w0, 1, 1, 1, col.copy(PAL['brick-new']).multiplyScalar(0.82));
    put(rings, i * 2 + 1, x, 0, w1, 1, 1, 1, col.copy(PAL.brick).multiplyScalar(0.82));
  }
  for (let j = 0; j <= n; j++) {
    const x = -len / 2 + span * j, foot = Math.min(worldY(x, w0), worldY(x, w1)) - 3, h = Math.max(0.01, spring - foot);
    const thick = j === 0 || j === n ? pw * 2 : pw;     // the abutments at each end are heavier
    halves.forEach((hf, k) => put(piers, j * 3 + k, x, spring, pierZ[k]!.z, thick, h, pierZ[k]!.d, col.copy(hf.col).multiplyScalar(0.92 + seed(j, 2) * 0.1)));
    put(piers, j * 3 + 2, x, spring, zm, thick * 0.96, h, SEAM * 2 + 0.02, PAL['brick-dark']);
    put(imposts, j, x, spring + 0.3, zm, thick * 1.12, 0.6, w1 - w0 + 1.4);
    // floodlights at each pier's foot, either side: the viaduct is lit at night
    put(lamps, j * 2, x, foot + 3.3, w0 - 3, 1, 1, 1); put(lamps, j * 2 + 1, x, foot + 3.3, w1 + 3, 1, 1, 1);
  }
  for (const im of [spans, piers, rings, imposts, lamps]) gp.add(im);
  // the deck: a stone cornice along each face, the parapets and their coping
  box(gp, len, 1.2, w1 - w0, MAT.brickDark, 0, -0.6, zm);
  for (const off of [w0 - 0.3, w1 + 0.3]) box(gp, len, 0.5, 0.6, MAT.concrete, 0, -0.9, off);
  for (const off of [w0 + 0.4, w1 - 0.4]) { box(gp, len, 1.6, 0.8, MAT.brickDark, 0, 0.4, off); box(gp, len, 0.18, 1, MAT.concrete, 0, 1.29, off); }
}

// ---- the river and the M60 crossing the valley under the viaduct, across the map at their place on the line ----
function crossing(scene: THREE.Scene, c: Corridor, s: number, groundY: (x: number, z: number) => number, kind: 'river' | 'm60'): void {
  const f = c.at(s), STEP = 20, width = kind === 'river' ? 26 : 25, lift = 1;    // a metre up: the base terrain's triangles are 48 m
  // along the crossing is the corridor's normal; across it, the corridor's direction. It runs out along the valley floor
  // each way until the ground rises (a river) or climbs (a road) too far from its level under the viaduct: the real
  // ones turn there, and the map doesn't follow them yet
  const level = groundY(f.x, f.z), rise = kind === 'river' ? 4 : 9, reach = (way: number) => {
    let o = 0; while (o < 1500 && Math.abs(groundY(f.x + f.nx * (o + STEP) * way, f.z + f.nz * (o + STEP) * way) - level) < rise) o += STEP;
    return o;
  };
  const o0 = -reach(-1), SPAN = (reach(1) - o0) / 2, mid = o0 + SPAN, n = Math.max(1, Math.round(2 * SPAN / STEP));
  const pos: number[] = [], idx: number[] = [], heights: number[] = [];
  for (let i = 0; i <= n; i++) {
    const o = mid - SPAN + i * STEP, x = f.x + f.nx * o, z = f.z + f.nz * o, y = groundY(x, z) + lift; heights.push(y);
    pos.push(x - f.dx * width / 2, y, z - f.dz * width / 2, x + f.dx * width / 2, y, z + f.dz * width / 2);
    if (i < n) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  if (g.getAttribute('normal').getY(0) < 0) { idx.reverse(); g.setIndex(idx); g.computeVertexNormals(); }
  scene.add(new THREE.Mesh(g, kind === 'river' ? MAT.river : MAT.road));
  if (kind === 'river') return;
  const heightAt = (o: number) => { const t = Math.max(0, Math.min(n - 0.001, (o - mid + SPAN) / STEP)), i = Math.floor(t); return heights[i]! + (heights[i + 1]! - heights[i]!) * (t - i); };
  const yaw = yawFor({ dx: f.nx, dz: f.nz });
  // the central reserve's barrier, edge lines, and lamp columns down the middle
  const unit = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const strips = new THREE.InstancedMesh(unit, MAT.concrete, n * 3), poles = new THREE.InstancedMesh(unit, MAT.steel, Math.ceil(n / 3)), heads = new THREE.InstancedMesh(unit, MAT.glow, Math.ceil(n / 3));
  let k = 0, p = 0;
  for (let i = 0; i < n; i++) {
    const o = mid - SPAN + (i + 0.5) * STEP, y = heightAt(o);
    for (const [b, w, h] of [[0, 0.8, 0.9], [-11.6, 0.3, 0.06], [11.6, 0.3, 0.06]] as const) {
      v.set(f.x + f.nx * o + f.dx * b, y + h / 2, f.z + f.nz * o + f.dz * b); sc.set(STEP + 0.2, h, w); m4.compose(v, q, sc); strips.setMatrixAt(k++, m4);
    }
    if (i % 3 === 0) {
      v.set(f.x + f.nx * o, y + 6, f.z + f.nz * o); sc.set(0.3, 12, 0.3); m4.compose(v, q, sc); poles.setMatrixAt(p, m4);
      v.y = y + 12; sc.set(0.8, 0.35, 7); m4.compose(v, q, sc); heads.setMatrixAt(p++, m4);
    }
  }
  strips.count = k; poles.count = heads.count = p; scene.add(strips, poles, heads);
  // traffic both ways in three lanes, moving whenever the motorway is on screen (cosmetic: real time, not the game's)
  const CARS = 54, cars = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color: 0xffffff }), CARS), col = new THREE.Color();
  const carCols = [PAL['car-1'], PAL['car-2'], PAL['car-3'], PAL['car-4'], PAL['car-5'], PAL['car-6']];
  const lane = (i: number) => (i % 2 ? 1 : -1) * (2.2 + (Math.floor(i / 2) % 3) * 3.4), base = (i: number) => seed(i, 7) * 2 * SPAN, speed = (i: number) => (i % 2 ? 1 : -1) * (24 + seed(i, 8) * 8);
  for (let i = 0; i < CARS; i++) cars.setColorAt(i, col.copy(carCols[i % carCols.length]!));
  cars.boundingSphere = new THREE.Sphere(new THREE.Vector3(f.x + f.nx * mid, level, f.z + f.nz * mid), SPAN + 50);
  const cq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  cars.onBeforeRender = () => {
    const t = performance.now() / 1000;   // cosmetic
    for (let i = 0; i < CARS; i++) {
      const o = mid + ((base(i) + speed(i) * t) % (2 * SPAN) + 2 * SPAN) % (2 * SPAN) - SPAN, b = lane(i), y = heightAt(o);
      v.set(f.x + f.nx * o + f.dx * b, y + 0.85, f.z + f.nz * o + f.dz * b); sc.set(4.4, 1.5, 1.9); m4.compose(v, cq, sc); cars.setMatrixAt(i, m4);
    }
    cars.instanceMatrix.needsUpdate = true;
  };
  scene.add(cars);
}

// ---- the Pyramid: the blue glass office by the M60, five storeys of glass to a point ----
function buildPyramid(scene: THREE.Scene, def: NetworkGeoDef, m: Mark, groundY: (x: number, z: number) => number): void {
  if (m.lat === undefined || m.lon === undefined) return;
  const p = projectLatLon(m.lat, m.lon, def.origin), y0 = groundY(p.x, p.z), H = m.height ?? 36, R = (m.w ?? 48) / Math.SQRT2;
  const g = new THREE.Group(); g.position.set(p.x, y0, p.z); g.rotation.y = ((m.yaw ?? 0) * Math.PI) / 180; scene.add(g);
  box(g, R * 2 + 14, 2, R * 2 + 14, MAT.concrete, 0, 0, 0);
  box(g, 30, 0.3, R * 2, MAT.road, -R - 24, 0.1, 0);                     // its car park
  const pyr = new THREE.Mesh(new THREE.ConeGeometry(R, H, 4, 1), MAT.pyramid); pyr.position.y = 1 + H / 2; pyr.rotation.y = Math.PI / 4; g.add(pyr);
  // the frame: its four edges and a band at each floor
  const pts: number[] = [], corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const, side = R * Math.SQRT1_2 * 1.004;
  for (const [a, b] of corners) pts.push(a * side, 1, b * side, 0, 1 + H, 0);
  for (let f = 1; f <= 5; f++) {
    const y = 1 + (H * f) / 6, k = side * (1 - f / 6);
    for (let i = 0; i < 4; i++) { const [a, b] = corners[i]!, [a2, b2] = corners[(i + 1) % 4]!; pts.push(a * k, y, b * k, a2 * k, y, b2 * k); }
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: PAL['pyramid-frame'] })));
}

// ---- Stockport town centre in the valley: the Plaza, Merseyway over the river, St Mary's, the Market Hall, and streets of
// shops and offices round them between the viaduct and the A6 ----
function town(scene: THREE.Scene, net: Network, c: Corridor, def: NetworkGeoDef, marks: Mark[], groundY: (x: number, z: number) => number, bands: { river: number | null; m60: number | null }): void {
  const taken: [number, number, number][] = [];   // footprints already standing: x, z, radius
  // a station's buildings down at street level (Stockport Interchange's hall), from the kits
  const kits = kitFiles();
  for (const st of net.stations) for (const p of kits[st.kit]?.parts ?? []) {
    const hall = p['hall'] as number[] | undefined; if (p.type !== 'buslink' || !hall) continue;
    const [u0 = 0, u1 = 0, v0 = 0, v1 = 0] = hall, F = net.stationFrame(st.id), u = (u0 + u1) / 2, v = (v0 + v1) / 2;
    taken.push([F.x + F.dx * u + F.nx * v, F.z + F.dz * u + F.nz * v, Math.hypot(u1 - u0, v1 - v0) / 2 + 6]);
  }
  const root = new THREE.Group();
  const footY = (x: number, z: number, r: number) => Math.min(groundY(x - r, z - r), groundY(x + r, z - r), groundY(x - r, z + r), groundY(x + r, z + r), groundY(x, z)) - 0.5;
  const at = (m: Mark) => m.lat !== undefined && m.lon !== undefined ? projectLatLon(m.lat, m.lon, def.origin) : null;
  for (const m of marks) {
    let p = at(m); if (!p) continue;
    const g = new THREE.Group(); g.rotation.y = ((m.yaw ?? 0) * Math.PI) / 180;
    if (m.kind === 'cinema') { plaza(g); taken.push([p.x, p.z, 26]); }
    else if (m.kind === 'church') { church(g); taken.push([p.x, p.z, 28]); }
    else if (m.kind === 'market') { market(g); taken.push([p.x, p.z, 24]); }
    else if (m.kind === 'precinct' && bands.river !== null) {
      // Merseyway stands on its deck over the river: put it on the river as drawn, along it, at its distance across the line
      const len = m.w ?? 220, f = c.at(bands.river), o = (p.x - f.x) * f.nx + (p.z - f.z) * f.nz;
      p = { x: f.x + f.nx * o, z: f.z + f.nz * o }; g.rotation.y = yawFor({ dx: f.nx, dz: f.nz }); merseyway(g, len);
      for (let a = -len / 2 + 25; a <= len / 2 - 25; a += 30) taken.push([p.x + f.nx * a, p.z + f.nz * a, 32]);
    }
    else continue;
    g.position.set(p.x, footY(p.x, p.z, 12), p.z); root.add(g);
  }
  bake(scene, root);
  // the streets round them: brick and render, two to five storeys, and a few 1960s and 70s office blocks
  const area = marks.find(m => m.kind === 'town'), ctr = area && at(area); if (!area || !ctr) return;
  const R = area.w ?? 320, cs = c.nearest(ctr.x, ctr.z);
  const roadSegs = (net.def.roads ?? []).flatMap(r => r.points.slice(1).map((b, i) => [r.points[i]!, b] as const));
  const nearRoad = (x: number, z: number, r: number) => roadSegs.some(([[ax, az], [bx, bz]]) => {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    return Math.hypot(x - ax - dx * t, z - az - dz * t) < r + 8;
  });
  // a grid of plots along the river and across it, as the streets run, each kept or left by the seed
  const f = c.at(bands.river ?? cs), PLOT = 28, MAX = 260, n = Math.ceil(R / PLOT);
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), MAT.town, MAX), col = new THREE.Color();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), fr = newFrame();
  const o0 = (ctr.x - f.x) * f.nx + (ctr.z - f.z) * f.nz, b0 = (ctr.x - f.x) * f.dx + (ctr.z - f.z) * f.dz;
  e.set(0, yawFor(f), 0); q.setFromEuler(e);
  let k = 0;
  for (let i = -n; i <= n && k < MAX; i++) for (let j = -n; j <= n && k < MAX; j++) {
    if (Math.hypot(i, j) * PLOT > R) continue;
    const id = (i + 50) * 101 + j; if (seed(id, 1) < 0.18) continue;           // a yard, a car park, a square
    const office = seed(id, 3) < 0.05, w = office ? 22 : 12 + seed(id, 4) * 12, dp = office ? 18 : 10 + seed(id, 5) * 12;
    const h = office ? 20 + seed(id, 6) * 12 : 7 + seed(id, 6) * 9, rad = Math.hypot(w, dp) / 2;
    const a = o0 + i * PLOT, b = b0 + j * PLOT, x = f.x + f.nx * a + f.dx * b, z = f.z + f.nz * a + f.dz * b;
    const s = c.nearest(x, z); c.at(s, 0, fr); const off = Math.abs((x - fr.x) * fr.nx + (z - fr.z) * fr.nz);
    if (off < 34 + rad) continue;                                              // the viaduct and the railway's land
    if (bands.river !== null && Math.abs(s - bands.river) < 16 + rad) continue;
    if (bands.m60 !== null && Math.abs(s - bands.m60) < 22 + rad) continue;
    if (nearRoad(x, z, rad)) continue;
    if (taken.some(([tx, tz, tr]) => Math.hypot(x - tx, z - tz) < tr + rad + 2)) continue;
    const y = footY(x, z, rad);
    v.set(x, y + h / 2, z); sc.set(w, h, dp); m4.compose(v, q, sc); inst.setMatrixAt(k, m4);
    if (office) col.copy(PAL.concrete).multiplyScalar(0.8 + seed(id, 8) * 0.2);
    else col.setHSL(0.03 + seed(id, 8) * 0.07, PAL['house-sat'], PAL['house-light'] + seed(id, 9) * 0.2);
    inst.setColorAt(k++, col);
  }
  inst.count = k; scene.add(inst);
}

/** Add a group's meshes to the scene merged into one per material, so the town's hundred boxes are a few draw calls. */
function bake(scene: THREE.Scene, root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
    if (Array.isArray(o.material)) { const m = o.clone(); o.matrixWorld.decompose(m.position, m.quaternion, m.scale); scene.add(m); return; }
    const g = (o.geometry as THREE.BufferGeometry).index ? (o.geometry as THREE.BufferGeometry).toNonIndexed() : (o.geometry as THREE.BufferGeometry).clone();
    const list = byMat.get(o.material) ?? []; list.push(g.applyMatrix4(o.matrixWorld)); byMat.set(o.material, list);
  });
  for (const [mat, list] of byMat) { const merged = mergeGeometries(list); if (merged) scene.add(new THREE.Mesh(merged, mat)); }
}

/** The Plaza, Mersey Square: the 1932 art deco cinema, cream faience with a stepped centre and its name down a fin, set
 * against the sandstone cliff behind. Local frame: its front faces +x. */
function plaza(g: THREE.Group): void {
  box(g, 14, 16, 52, MAT.sandstone, -27, 8, 0);            // the sandstone cliff it's built into
  box(g, 26, 15, 28, MAT.brick, -8, 7.5, 0);               // the auditorium
  box(g, 3, 13, 30, MAT.faience, 6, 6.5, 0);               // the front
  box(g, 3.4, 4, 12, MAT.faience, 6.2, 15, 0);             // its stepped centre
  box(g, 3.6, 2, 7, MAT.faience, 6.3, 18, 0);
  for (const z of [-4, 0, 4]) box(g, 0.4, 7, 1.6, MAT.glass, 7.7, 8.5, z);   // the tall windows over the canopy
  box(g, 3, 0.6, 26, MAT.roof, 8.5, 4, 0); box(g, 2.6, 0.12, 25, MAT.warm, 8.5, 3.65, 0);   // the canopy, lit beneath
  const fin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 9, 0.7), [MAT.faience, MAT.faience, MAT.faience, MAT.faience, signMat(), signMat()]);
  fin.position.set(8.4, 13.5, 0); fin.rotation.y = Math.PI / 2; g.add(fin);
}
let sign: THREE.Material | null = null;
function signMat(): THREE.Material {
  if (sign) return sign;
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null, ctx = cv?.getContext('2d');
  if (!cv || !ctx) return (sign = new THREE.MeshBasicMaterial({ color: PAL['plaza-sign'] }));
  cv.width = 64; cv.height = 256;
  ctx.fillStyle = '#' + PAL['plaza-sign'].getHexString(); ctx.fillRect(0, 0, 64, 256);
  ctx.fillStyle = '#' + PAL.faience.getHexString(); ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  'PLAZA'.split('').forEach((ch, i) => ctx.fillText(ch, 32, 28 + i * 50));
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  return (sign = new THREE.MeshBasicMaterial({ map: t }));
}

/** St Mary's, on the Market Place: red sandstone, the tower at the west end with its pinnacles. Local +x is east. */
function church(g: THREE.Group): void {
  box(g, 34, 11, 14, MAT.sandstone, 4, 5.5, 0);
  prism(g, 34, 14, 6, MAT.roof, 4, 11, 0);
  box(g, 9, 30, 9, MAT.sandstone, -17, 15, 0);
  for (const [a, b] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) box(g, 1, 4, 1, MAT.sandstone, -17 + a * 4, 32, b * 4);
}

/** The Market Hall: a glass-roofed iron hall of 1861 on the Market Place. Local +x is east. */
function market(g: THREE.Group): void {
  box(g, 36, 6, 22, MAT.steel, 0, 3, 0);
  prism(g, 36, 22, 6, MAT.glass, 0, 6, 0);
}

/** A pitched roof along local x: len long, width across its eaves at y, its ridge height above them. */
function prism(g: THREE.Group, len: number, width: number, height: number, mat: THREE.Material, x: number, y: number, z: number): void {
  const s = new THREE.Shape(); s.moveTo(-width / 2, 0); s.lineTo(width / 2, 0); s.lineTo(0, height); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); geo.translate(0, 0, -len / 2); geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m);
}

/** Merseyway: the 1960s precinct on its deck over the river, two runs of shops either side of the walk, canopies and
 * shopfronts lit at night. Local +x runs along the walk; its middle is the river. */
function merseyway(g: THREE.Group, len: number): void {
  const blocks = 4, gap = 6, bl = (len - gap * (blocks - 1)) / blocks;
  const D = 2.4;                                            // the deck over the river, clear of the water
  box(g, len, D, 50, MAT.concrete, 0, D / 2, 0);
  for (let i = 0; i < blocks; i++) {
    const x = -len / 2 + bl / 2 + i * (bl + gap);
    for (const side of [-1, 1]) {
      const z = side * 16;
      box(g, bl, 9, 18, MAT.merseyway, x, D + 4.5, z);
      box(g, bl, 1.4, 18.4, MAT.fascia, x, D + 9.2, z);           // the fascia band round the roof
      box(g, bl - 1, 3, 0.3, MAT.glass, x, D + 1.8, z - side * 9.1); // the shopfronts on the walk
      box(g, bl, 0.4, 3, MAT.fascia, x, D + 4, z - side * 10.4);     // the canopy over them
      box(g, bl - 1, 0.1, 2.6, MAT.warm, x, D + 3.75, z - side * 10.4);
    }
  }
}

// ---- the city on the horizon: Beetham Tower, Deansgate Square and the other tall buildings, as silhouettes ----
// Real positions and heights; while the city is beyond the camera's far plane the whole skyline is drawn scaled towards
// the camera (every point slid along its own line of sight), so it sits exactly where the real towers would from any
// angle, and hazes into the horizon with distance. Windows light at dusk; red lamps on the tallest.
function skyline(scene: THREE.Scene, def: NetworkGeoDef, towers: Mark[]): void {
  if (!towers.length) return;
  const bodies: THREE.BufferGeometry[] = [], windows: THREE.BufferGeometry[] = [], lamps: THREE.BufferGeometry[] = [];
  const PITCH = 3.5, COLS = 8, ROWS = 16;    // a window every 3.5 m each way; the texture is 8 across, 16 up
  let cx = 0, cz = 0;
  const pts = towers.map(t => projectLatLon(t.lat ?? 0, t.lon ?? 0, def.origin));
  for (const p of pts) { cx += p.x; cz += p.z; } cx /= pts.length; cz /= pts.length;
  let radius = 0;
  const part = (m: THREE.Matrix4, w: number, d: number, y0: number, y1: number, ox = 0, oz = 0, lit = true) => {
    const h = y1 - y0, b = new THREE.BoxGeometry(w, h, d); b.translate(ox, y0 + h / 2, oz); bodies.push(b.applyMatrix4(m));
    if (!lit || h < 8) return;
    for (const [face, fw] of [[0, w], [1, d], [2, w], [3, d]] as const) {
      const pl = new THREE.PlaneGeometry(fw, h - 2), uv = pl.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * fw / (PITCH * COLS), uv.getY(i) * (h - 2) / (PITCH * ROWS) + seed(face, w) );
      const out = (face % 2 ? w : d) / 2 + 0.3;
      pl.translate(0, 0, out); pl.rotateY(face * Math.PI / 2); pl.translate(ox, y0 + h / 2, oz); windows.push(pl.applyMatrix4(m));
    }
  };
  towers.forEach((t, i) => {
    const p = pts[i]!, H = t.height ?? 60, w = t.w ?? 25, d = t.d ?? 25;
    const m = new THREE.Matrix4().makeRotationY(((t.yaw ?? 0) * Math.PI) / 180).setPosition(p.x, 0, p.z);
    radius = Math.max(radius, Math.hypot(p.x - cx, p.z - cz) + Math.max(w, d));
    if (t.shape === 'beetham') {
      // the slim hotel floors, the cantilevered flats above them, and the blade over the roof
      part(m, w, d, -60, H * 0.46); part(m, w + 4, d, H * 0.46, H * 0.93, 2, 0); part(m, 0.8, d * 0.85, H * 0.93, H, 2 + (w + 4) / 2 - 1, 0, false);
    } else if (t.shape === 'spire') {
      part(m, w, d, -60, H * 0.6, 0, 0, false);
      const cone = new THREE.ConeGeometry(w * 0.6, H * 0.4, 4); cone.rotateY(Math.PI / 4); cone.translate(0, H * 0.8, 0); bodies.push(cone.applyMatrix4(m));
    } else if (t.shape === 'slab') {
      part(m, w, d, -60, H); part(m, w * 0.3, d * 0.3, H, H + 9, w * 0.5, 0, false);   // the service tower up one side
    } else {
      part(m, w, d, -60, H * 0.95); part(m, w * 0.85, d * 0.85, H * 0.95, H, 0, 0, false);
    }
    if (H > 110) { const l = new THREE.BoxGeometry(4, 4, 4); l.translate(0, H + 2, 0); lamps.push(l.applyMatrix4(m)); }
  });
  const body = new THREE.Mesh(mergeGeometries(bodies), MAT.skyline);
  const win = new THREE.Mesh(mergeGeometries(windows), MAT.skyWindows); MAT.skyWindows.map = windowTexture();
  const lamp = new THREE.Mesh(mergeGeometries(lamps), MAT.airLight);
  const centre = new THREE.Vector3(cx, 60, cz), haze = new THREE.Color(), glow = new THREE.Color();
  for (const mesh of [body, win, lamp]) {
    mesh.matrixAutoUpdate = false; mesh.matrixWorldAutoUpdate = false; mesh.frustumCulled = false;
    mesh.onBeforeRender = (_r, sc, camera) => {
      const cam = camera.position, dist = cam.distanceTo(centre), k = Math.min(1, (camera as THREE.PerspectiveCamera).far * 0.85 / (dist + radius));
      mesh.matrixWorld.makeScale(k, k, k).setPosition(cam.x * (1 - k), cam.y * (1 - k), cam.z * (1 - k));
      if (mesh !== body) return;
      // farther is paler: the colour fades into the horizon's, which is the fog's colour at any hour
      const h = Math.max(0.1, Math.min(0.45, (dist - 1500) / 12000)), fog = sc.fog as THREE.Fog | null;
      MAT.skyline.color.copy(PAL.skyline).multiplyScalar(1 - h);
      MAT.skyline.emissive.copy(fog ? fog.color : haze).multiplyScalar(h);
      // after dark, too far off for single windows to show, the towers glow with them as a whole
      MAT.skyline.emissive.add(glow.copy(PAL['win-busy']).multiplyScalar(MAT.skyWindows.opacity * 0.22));
    };
    scene.add(mesh);
  }
}

/** Lit and dark windows, drawn once. Drawn, so it's cosmetic and never touches the game. */
function windowTexture(): THREE.Texture | null {
  const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null, ctx = cv?.getContext('2d');
  if (!cv || !ctx) return null;
  cv.width = 64; cv.height = 128; ctx.clearRect(0, 0, 64, 128); ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 8; i++) for (let j = 0; j < 16; j++) if (seed(i, j + 40) < 0.55) ctx.fillRect(i * 8 + 1, j * 8 + 2, 6, 4);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter;
  return t;
}

function xz(def: NetworkGeoDef, ll: LatLon): [number, number] { const p = projectLatLon(ll.lat, ll.lon, def.origin); return [p.x, p.z]; }
