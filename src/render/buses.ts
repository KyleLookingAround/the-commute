// Rail replacement buses: the stop outside each station (the kit part `busstop`), the roads between neighbouring
// stations (`roads` in the network data) and the buses on them. When the sim runs buses round a failed train, each is
// drawn where its leg has got to: standing at a stop with people walking out to it and off it, or driving the road
// between, a "Rail Replacement" board on its front and sides. BusLayer reads the sim every frame (the buses are few and
// their legs are worked out from times, so nothing is saved up), only ever reads it, and draws with instancing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, PAL, box } from './scene.ts';
import type { Network } from '../sim/network.ts';
import type { Sim } from '../sim/sim.ts';
import type { Bus, XZ } from '../sim/types.ts';
import { groundAt } from './terrain.ts';

/** The kit part: where a bus stands at (u, v), its length along `back` (a direction in (u, v), +u if not given), the
 * shelter and flag on the `kerb` side (+1 to the left looking along `back`), and the station's way out (`door`). */
export interface BusStopPart { u: number; v: number; back?: [number, number]; kerb?: 1 | -1; door?: [number, number]; note?: string }

const LEN = 12;            // a single-deck bus, metres
const MAX_BUSES = 8, MAX_WALKERS = 48;
const ROAD_W = 7;          // the road's width on the map

const lam = (c: THREE.Color) => new THREE.MeshLambertMaterial({ color: c });
const B = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// a bus pointing along +z, 1.25 times real across like everything else: body, a coloured band, wheels; the glass and
// the boards are their own meshes
const BODY = mergeGeometries([B(3.1, 2.4, LEN, 0, 1.75, 0), B(3.15, 0.35, LEN - 0.4, 0, 1.1, 0), B(3.2, 0.7, 1.2, 0, 0.45, LEN / 2 - 2.2), B(3.2, 0.7, 1.2, 0, 0.45, -LEN / 2 + 2.6)]);
const BAND = B(3.16, 0.3, LEN - 0.6, 0, 2.2, 0);
const GLASS = mergeGeometries([B(3.18, 0.9, LEN - 2.4, 0, 2.55, -0.4), B(2.7, 1.3, 0.1, 0, 2.35, LEN / 2 + 0.01)]);
const BOARD = mergeGeometries([B(2.2, 0.45, 0.08, 0, 3.25, LEN / 2 + 0.02), B(0.08, 0.45, 4.2, 1.6, 3.25, 1), B(0.08, 0.45, 4.2, -1.6, 3.25, 1)]);
const PERSON = mergeGeometries([new THREE.CylinderGeometry(0.26, 0.3, 1.25, 8).translate(0, 0.62, 0), new THREE.SphereGeometry(0.2, 8, 6).translate(0, 1.45, 0)]);

/** The "Rail Replacement" board, drawn once and shared. */
let boardMat: THREE.Material | null = null;
function board(): THREE.Material {
  if (boardMat) return boardMat;
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 52;
  const x = cv.getContext('2d');
  if (x) { x.fillStyle = '#' + PAL['board-ink'].getHexString(); x.fillRect(0, 0, 256, 52); x.fillStyle = '#' + PAL['board-led'].getHexString(); x.font = '700 30px Arial, Helvetica, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('Rail Replacement', 128, 28); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return (boardMat = new THREE.MeshBasicMaterial({ map: tex }));
}

/** A stop as built: its group (whose frame turns kit (u, v) into the world), the part, and its world points once known. */
interface Stop { gp: THREE.Group; p: BusStopPart; at: XZ | null; door: XZ | null }
const stops = new WeakMap<object, Stop>();

/** Build a stop into a station's group: a bay, its kerb, a shelter and the bus stop flag. `owner` is the station's
 * Live, which BusLayer finds its stop by. */
export function buildBusStop(gp: THREE.Group, p: BusStopPart, owner: object): void {
  const [bu0, bv0] = p.back ?? [1, 0], bl = Math.hypot(bu0, bv0) || 1, bu = bu0 / bl, bv = bv0 / bl;
  const k = p.kerb ?? 1, su = -bv * k, sv = bu * k, yaw = Math.atan2(bu, bv);
  const piece = (w: number, h: number, d: number, mat: THREE.Material, along: number, across: number, y0: number) => {
    const m = box(gp, w, h, d, mat, p.u + bu * along + su * across, y0, p.v + bv * along + sv * across); m.rotation.y = yaw; return m;
  };
  piece(4.2, 0.04, LEN + 6, MAT.road, 0, 0, 0.02);
  piece(0.3, 0.04, LEN + 2, lam(PAL['bus-band']), 0, 1.9, 0.05);
  piece(0.4, 0.2, LEN + 6, MAT.concrete, 0, 2.3, 0.1);
  // the shelter on the pavement and the flag at the head of the stop
  piece(2.4, 0.15, 4, MAT.canopy, -1, 4, 2.6);
  piece(2.4, 2.4, 0.08, MAT.glass, -1, 4, 1.3).rotation.y = yaw + Math.PI / 2;
  piece(0.12, 3.2, 0.12, MAT.steel, LEN / 2 - 0.5, 2.8, 1.6);
  piece(0.9, 0.9, 0.1, lam(PAL['bus-stop']), LEN / 2 - 0.5, 2.8, 3).rotation.y = yaw + Math.PI / 2;
  stops.set(owner, { gp, p, at: null, door: null });
}

/** A road on the map between two stations' stops: its points and the distance along it to each. */
interface Path { pts: XZ[]; d: number[]; len: number }

const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), v3 = new THREE.Vector3();
const where = { x: 0, z: 0, dx: 0, dz: 1 };

export class BusLayer {
  /** How many buses are drawn. */
  count = 0;
  private readonly stops: (Stop | null)[];
  private readonly paths = new Map<string, Path>();
  private readonly body: THREE.InstancedMesh; private readonly band: THREE.InstancedMesh;
  private readonly glass: THREE.InstancedMesh; private readonly boards: THREE.InstancedMesh; private readonly walkers: THREE.InstancedMesh;
  constructor(scene: THREE.Scene, private readonly net: Network, built: { live: object; group: THREE.Group }[]) {
    this.stops = built.map(b => stops.get(b.live) ?? null);
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
    this.body = mk(BODY, lam(PAL.bus), MAX_BUSES); this.band = mk(BAND, lam(PAL['bus-band']), MAX_BUSES);
    this.glass = mk(GLASS, MAT.glass, MAX_BUSES); this.boards = mk(BOARD, board(), MAX_BUSES);
    this.walkers = mk(PERSON, lam(PAL.pax), MAX_WALKERS);
    this.body.castShadow = true;
    // the roads themselves, as ribbons a little above the ground (src/render/terrain.ts), in pieces of 10 m or less
    const P: number[] = [];
    for (const r of net.def.roads ?? []) for (let i = 1; i < r.points.length; i++) {
      const [ax0, az0] = r.points[i - 1]!, [bx0, bz0] = r.points[i]!, l = Math.hypot(bx0 - ax0, bz0 - az0) || 1, k = Math.ceil(l / 10);
      const nx = -(bz0 - az0) / l * ROAD_W / 2, nz = (bx0 - ax0) / l * ROAD_W / 2;
      for (let j = 0; j < k; j++) {
        const ax = ax0 + (bx0 - ax0) * j / k, az = az0 + (bz0 - az0) * j / k, bx = ax0 + (bx0 - ax0) * (j + 1) / k, bz = az0 + (bz0 - az0) * (j + 1) / k;
        const ya = groundAt(ax, az) + 0.08, yb = groundAt(bx, bz) + 0.08;
        P.push(ax + nx, ya, az + nz, bx + nx, yb, bz + nz, bx - nx, yb, bz - nz, ax + nx, ya, az + nz, bx - nx, yb, bz - nz, ax - nx, ya, az - nz);
      }
    }
    if (P.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: PAL.road, side: THREE.DoubleSide })); m.receiveShadow = true; scene.add(m);
    }
  }
  /** A stop's place in the world, and its station's way out. */
  private stop(i: number): Stop | null {
    const s = this.stops[i]; if (!s) return null;
    if (!s.at) {
      s.gp.updateMatrixWorld(true);
      v3.set(s.p.u, 0, s.p.v); s.gp.localToWorld(v3); s.at = [v3.x, v3.z];
      const [du, dv] = s.p.door ?? [s.p.u, s.p.v]; v3.set(du, 0, dv); s.gp.localToWorld(v3); s.door = [v3.x, v3.z];
    }
    return s;
  }
  /** The way a bus drives from station a's stop to station b's: along the road between them where there is one. */
  private path(a: number, b: number): Path | null {
    const key = `${a}>${b}`, have = this.paths.get(key); if (have) return have;
    const A = this.stop(a)?.at, Bt = this.stop(b)?.at, sa = this.net.stations[a], sb = this.net.stations[b];
    if (!A || !Bt || !sa || !sb) return null;
    const r = this.net.road(sa.id, sb.id), mid = r ? (r.reversed ? [...r.road.points].reverse() : r.road.points) : [];
    const pts: XZ[] = [A, ...mid, Bt], d = [0];
    for (let k = 1; k < pts.length; k++) d.push(d[k - 1]! + Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]));
    const p = { pts, d, len: d[d.length - 1]! }; this.paths.set(key, p); return p;
  }
  /** Where along a path a share t of the way is, and which way it's heading. */
  private at(p: Path, t: number): typeof where {
    const s = Math.max(0, Math.min(1, t)) * p.len; let k = 1;
    while (k < p.d.length - 1 && p.d[k]! < s) k++;
    const [ax, az] = p.pts[k - 1]!, [bx, bz] = p.pts[k]!, seg = p.d[k]! - p.d[k - 1]! || 1, f = (s - p.d[k - 1]!) / seg;
    where.x = ax + (bx - ax) * f; where.z = az + (bz - az) * f; where.dx = (bx - ax) / seg; where.dz = (bz - az) / seg;
    return where;
  }
  sync(sim: Sim): void {
    const g = sim.g; let n = 0, w = 0;
    for (const bus of g.trouble.buses) {
      if (n >= MAX_BUSES) break;
      const out = this.path(bus.a, bus.b), back = this.path(bus.b, bus.a); if (!out || !back) continue;
      const t = (g.t - bus.t0) / Math.max(1, bus.t1 - bus.t0);
      // standing at a stop it faces the way it'll leave; on the road, the way it's going
      const p = bus.leg === 'out' ? this.at(out, t) : bus.leg === 'back' ? this.at(back, t) : bus.leg === 'load' ? this.at(out, 0) : this.at(back, 0);
      qt.setFromAxisAngle(up, Math.atan2(p.dx, p.dz)); pos.set(p.x - p.dx * LEN / 2, groundAt(p.x, p.z) + 0.1, p.z - p.dz * LEN / 2); m4.compose(pos, qt, one);
      for (const im of [this.body, this.band, this.glass, this.boards]) im.setMatrixAt(n, m4);
      n++;
      if (bus.leg === 'load' || bus.leg === 'drop') w = this.walk(bus, g.t, p.x - p.dx * LEN * 0.3, p.z - p.dz * LEN * 0.3, w);
    }
    for (const im of [this.body, this.band, this.glass, this.boards]) { im.count = n; im.instanceMatrix.needsUpdate = true; }
    this.count = n;
    this.walkers.count = w; this.walkers.instanceMatrix.needsUpdate = true;
  }
  /** People walking between a standing bus's door and the station's way out: out to it while it loads, and both ways
   * where it sets down and loads for the trip back. */
  private walk(bus: Bus, now: number, bx: number, bz: number, w: number): number {
    const st = this.stop(bus.leg === 'load' ? bus.a : bus.b), door = st?.door; if (!door) return w;
    const el = now - bus.t0, both = bus.leg === 'drop';
    for (let k = 0; k < 6 && w < MAX_WALKERS; k++) {
      const off = both && k % 2 === 1, f = ((el / 25 + k / 6) % 1), t = off ? f : 1 - f;
      const x = bx + (door[0] - bx) * t + (k - 2.5) * 0.5, z = bz + (door[1] - bz) * t + ((k * 7) % 5 - 2) * 0.4;
      pos.set(x, groundAt(x, z) + 0.1, z); m4.compose(pos, qt, one); this.walkers.setMatrixAt(w++, m4);
    }
    return w;
  }
}
