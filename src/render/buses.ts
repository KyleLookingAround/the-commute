// Rail replacement buses: the stop outside each station (the kit part `busstop`), the roads between neighbouring
// stations (`roads` in the network data) and the buses on them. When the sim runs buses round a failed train, each is
// drawn where its leg has got to: standing at a stop with people walking out to it and off it, or driving the road
// between, a "Rail Replacement" board on its front and sides. Each bus drives in from the nearer bus depot (the
// network data's `depot` landmarks: Stagecoach's at Daw Bank in Stockport and on Hyde Road in Ardwick) along the
// roads, timed to pull in at the stop when the sim has it start, and drives back there when the sim is done with it.
// A road never drops off a station's pad: it comes down the wall as a ramp, no steeper than 1 in 10. BusLayer reads the
// sim every frame (the buses are few and their legs are worked out from times), only ever reads it, and draws with
// instancing; the only thing it keeps is which buses it has seen, so one the sim has finished with can drive away.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, PAL, box } from './scene.ts';
import type { Network } from '../sim/network.ts';
import type { Sim } from '../sim/sim.ts';
import { TUNING } from '../sim/sim.ts';
import { projectLatLon } from '../sim/network.ts';
import type { Bus, XZ } from '../sim/types.ts';
import { groundAt, groundVersion, onRailway } from './terrain.ts';

/** The kit part: where a bus stands at (u, v), its length along `back` (a direction in (u, v), +u if not given), the
 * shelter and flag on the `kerb` side (+1 to the left looking along `back`), and the station's way out (`door`). */
export interface BusStopPart { u: number; v: number; back?: [number, number]; kerb?: 1 | -1; door?: [number, number]; note?: string }

const LEN = 12;            // a single-deck bus, metres
const MAX_BUSES = 8, MAX_WALKERS = 48;
const ROAD_W = 7;          // the road's width on the map
const GRADE = 0.1;         // the steepest a road comes down off a station's pad
const STEP = 4;            // metres between a road's heights
const UNDER = 40;          // the longest way across the railway's land a road passes under an embankment (the terrain check's)
const SKEW = 120;          // ...where its data marks it as passing under the line, a skewed underbridge (the terrain check's)
const DEPOT_SPEED = 14;
const RELAY_MS = 3000;     // the least time between laying the roads again as the ground comes in finer    // m/s an empty bus runs to and from the depot, quicker than in service

const lam = (c: THREE.Color) => new THREE.MeshLambertMaterial({ color: c });
const B = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// a bus pointing along +z, its real width (2.5 m) across: body, a coloured band, wheels; the glass and the boards are
// their own meshes
const W = 2.5 / 3.1;
const BODY = mergeGeometries([B(3.1, 2.4, LEN, 0, 1.75, 0), B(3.15, 0.35, LEN - 0.4, 0, 1.1, 0), B(3.2, 0.7, 1.2, 0, 0.45, LEN / 2 - 2.2), B(3.2, 0.7, 1.2, 0, 0.45, -LEN / 2 + 2.6)]).scale(W, 1, 1);
const BAND = B(3.16, 0.3, LEN - 0.6, 0, 2.2, 0).scale(W, 1, 1);
const GLASS = mergeGeometries([B(3.18, 0.9, LEN - 2.4, 0, 2.55, -0.4), B(2.7, 1.3, 0.1, 0, 2.35, LEN / 2 + 0.01)]).scale(W, 1, 1);
const BOARD = mergeGeometries([B(2.2, 0.45, 0.08, 0, 3.25, LEN / 2 + 0.02), B(0.08, 0.45, 4.2, 1.6, 3.25, 1), B(0.08, 0.45, 4.2, -1.6, 3.25, 1)]).scale(W, 1, 1);
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

/** A way on the map a bus drives: its points every STEP metres or less, the distance along it to each, and the road's
 * height there (the ground, or a ramp down off a station's pad). */
export interface Path { pts: XZ[]; d: number[]; y: number[]; len: number; under?: boolean[] }
/** A way through points, its heights the ground's under it, except that off a station's pad standing above the ground
 * it comes down as a ramp no steeper than GRADE (into a cutting it still meets the wall: the ground there is higher). */
export function pathThrough(raw: XZ[], rawUnder: boolean[] = []): Path {
  // (a point between two raw points that both pass under the line passes under it too)
  const pts: XZ[] = [raw[0]!], under = [!!rawUnder[0]];
  for (let k = 1; k < raw.length; k++) {
    const [ax, az] = raw[k - 1]!, [bx, bz] = raw[k]!, n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / STEP));
    for (let j = 1; j <= n; j++) { pts.push([ax + (bx - ax) * j / n, az + (bz - az) * j / n]); under.push(!!rawUnder[k] && (j === n || !!rawUnder[k - 1])); }
  }
  // the railway's land (a pad) is level at 0; from it the road falls no faster than GRADE until it meets the ground
  const d = [0], ground = pts.map(([x, z]) => groundAt(x, z)), y = ground.map(g => g === 0 ? 0 : -Infinity);
  for (let k = 1; k < pts.length; k++) d.push(d[k - 1]! + Math.hypot(pts[k]![0] - pts[k - 1]![0], pts[k]![1] - pts[k - 1]![1]));
  for (let k = 1; k < y.length; k++) y[k] = Math.max(y[k]!, y[k - 1]! - GRADE * (d[k]! - d[k - 1]!));
  for (let k = y.length - 2; k >= 0; k--) y[k] = Math.max(y[k]!, y[k + 1]! - GRADE * (d[k + 1]! - d[k]!));
  for (let k = 0; k < y.length; k++) y[k] = Math.max(y[k]!, ground[k]!);
  // where it crosses the railway's land between the streets either side it's straight from the street's height on one
  // side to the other's: over a cutting on a bridge, never down into it, and under an embankment through it, never up
  // over the tracks, where the way across is UNDER m or less, or SKEW m where the road's data marks it as passing under
  // the line (a skewed underbridge) (a stretch from a stop on a station's pad keeps its ramp)
  const rail = pts.map(([x, z]) => onRailway(x, z));
  for (let k = 1; k < pts.length - 1; k++) if (rail[k] && !rail[k - 1]) {
    let e = k; while (e < pts.length - 1 && rail[e]) e++;
    const a = y[k - 1]!, b = y[e]!, at = (j: number) => a + (b - a) * (d[j]! - d[k - 1]!) / (d[e]! - d[k - 1]!);
    let over = !rail[e]; for (let j = k; j < e && over; j++) if (at(j) < ground[j]!) over = false;
    let marked = true; for (let j = k; j < e && marked; j++) if (!under[j]) marked = false;
    const across = d[e]! - d[k - 1]!;
    if (over || (!rail[e] && (across <= UNDER || (marked && across <= SKEW)))) for (let j = k; j < e; j++) y[j] = at(j);
    k = e;
  }
  return { pts, d, y, len: d[d.length - 1]!, under };
}
const reversed = (p: Path): Path => ({ pts: [...p.pts].reverse(), d: p.d.map(x => p.len - x).reverse(), y: [...p.y].reverse(), len: p.len, under: p.under && [...p.under].reverse() });
/** A bus the sim has finished with, driving back to the depot from station `at` since sim time t. */
interface Leaving { id: number; at: number; t: number }

const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), v3 = new THREE.Vector3();
const where = { x: 0, z: 0, y: 0, dx: 0, dz: 1 };

export class BusLayer {
  /** How many buses are drawn. */
  count = 0;
  private stops: (Stop | null)[];
  private readonly paths = new Map<string, Path>();
  /** The depots in the world, and each station's way to its nearer one (null where it has no stop). */
  private readonly depots: XZ[];
  private readonly toDepot = new Map<number, Path | null>();
  /** The buses seen last frame, by id, with where they'd stop if the sim finished with them now; and those leaving. */
  private readonly seen = new Map<number, number>(); private readonly leaving: Leaving[] = []; private lastT = -1;
  private readonly body: THREE.InstancedMesh; private readonly band: THREE.InstancedMesh;
  private readonly glass: THREE.InstancedMesh; private readonly boards: THREE.InstancedMesh; private readonly walkers: THREE.InstancedMesh;
  /** A bus's parts, which all move together (made once, so a frame makes no arrays). */
  private readonly parts: THREE.InstancedMesh[];
  /** The roads drawn (laid again once the lines out's ring is in: relay). */
  private roads: THREE.Mesh | null = null;
  constructor(private readonly scene: THREE.Scene, private readonly net: Network, private readonly built: { live: object; group: THREE.Group }[]) {
    this.stops = built.map(b => stops.get(b.live) ?? null);
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
    this.body = mk(BODY, lam(PAL.bus), MAX_BUSES); this.band = mk(BAND, lam(PAL['bus-band']), MAX_BUSES);
    this.glass = mk(GLASS, MAT.glass, MAX_BUSES); this.boards = mk(BOARD, board(), MAX_BUSES);
    this.walkers = mk(PERSON, lam(PAL.pax), MAX_WALKERS);
    this.parts = [this.body, this.band, this.glass, this.boards];
    this.body.castShadow = true;
    // the depots, from the network data's landmarks
    this.depots = (net.def.landmarks ?? []).filter(l => l.kind === 'depot' && l.lat !== undefined && l.lon !== undefined)
      .map(l => { const p = projectLatLon(l.lat!, l.lon!, net.def.origin); return [p.x, p.z] as XZ; });
    this.lay();
  }
  /** Lay the ways and the roads again on the ground as it is now, from the stops there are now (once the lines out's
   * kits and ground are in). */
  relay(): void {
    this.stops = this.built.map(b => stops.get(b.live) ?? null);
    this.paths.clear(); this.toDepot.clear();
    if (this.roads) { this.scene.remove(this.roads); this.roads.geometry.dispose(); this.roads = null; }
    this.lay();
  }
  private lay(): void {
    const net = this.net;
    // the roads themselves, as ribbons a little above the ground or the ramp (wound to face up, in the one road material
    // every road shares, so gridlock's wash adds no shader of its own for them): each road from stop to stop, and from each
    // depot to the stop of the station nearest it
    const ways: Path[] = [];
    for (const r of net.def.roads ?? []) {
      const a = net.station(r.from).index, b = net.station(r.to).index, p = this.path(a, b) ?? pathThrough(r.points, r.under);
      ways.push(p);
    }
    for (const dp of this.depots) { const k = this.nearestStop(dp); const at = k >= 0 ? this.stop(k)?.at : null; if (at) ways.push(pathThrough([dp, at])); }
    const P: number[] = [];
    for (const w of ways) for (let i = 1; i < w.pts.length; i++) {
      const [ax, az] = w.pts[i - 1]!, [bx, bz] = w.pts[i]!, l = Math.hypot(bx - ax, bz - az) || 1;
      const nx = -(bz - az) / l * ROAD_W / 2, nz = (bx - ax) / l * ROAD_W / 2, ya = w.y[i - 1]! + 0.08, yb = w.y[i]! + 0.08;
      P.push(ax + nx, ya, az + nz, bx + nx, yb, bz + nz, bx - nx, yb, bz - nz, ax + nx, ya, az + nz, bx - nx, yb, bz - nz, ax - nx, ya, az - nz);
    }
    if (P.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, MAT.road); m.receiveShadow = true; this.scene.add(m); this.roads = m;
    }
  }
  /** The station whose stop is nearest a point, or -1. */
  private nearestStop(p: XZ): number {
    let best = -1, bd = Infinity;
    this.stops.forEach((_, i) => { const at = this.stop(i)?.at; if (at) { const d = Math.hypot(at[0] - p[0], at[1] - p[1]); if (d < bd) { bd = d; best = i; } } });
    return best;
  }
  /** The way from the nearer depot to station i's stop, along the roads from the depot's station; null without one. */
  depotPath(i: number): Path | null {
    if (this.toDepot.has(i)) return this.toDepot.get(i)!;
    const at = this.stop(i)?.at; let way: Path | null = null;
    if (at && this.depots.length) {
      // the depot whose station is nearest along the line, then the roads station by station to this one
      const S = this.net.stations, byS = (k: number) => S[k]!.s;
      let dp = this.depots[0]!, k = this.nearestStop(dp);
      for (const d of this.depots) { const j = this.nearestStop(d); if (j >= 0 && Math.abs(byS(j) - byS(i)) < Math.abs(byS(k) - byS(i))) { dp = d; k = j; } }
      const order = S.map((_, j) => j).sort((a, b) => byS(a) - byS(b)), from = order.indexOf(k), to = order.indexOf(i), step = to >= from ? 1 : -1;
      const pts: XZ[] = [dp], under: boolean[] = [false];
      for (let o = from; ; o += step) {
        const j = order[o]!, here = this.stop(j)?.at; if (here) { pts.push(here); under.push(false); }
        if (o === to) break;
        const r = this.net.road(S[j]!.id, S[order[o + step]!]!.id);
        if (r) { pts.push(...(r.reversed ? [...r.road.points].reverse() : r.road.points)); under.push(...(r.reversed ? [...r.road.under].reverse() : r.road.under)); }
      }
      way = pathThrough(pts, under);
    }
    this.toDepot.set(i, way); return way;
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
    const midUnder = r ? (r.reversed ? [...r.road.under].reverse() : r.road.under) : [];
    const back = this.paths.get(`${b}>${a}`), p = back ? reversed(back) : pathThrough([A, ...mid, Bt], [false, ...midUnder, false]);
    this.paths.set(key, p); return p;
  }
  /** Where along a path a share t of the way is, and which way it's heading. */
  private at(p: Path, t: number): typeof where {
    const s = Math.max(0, Math.min(1, t)) * p.len; let k = 1;
    while (k < p.d.length - 1 && p.d[k]! < s) k++;
    const [ax, az] = p.pts[k - 1]!, [bx, bz] = p.pts[k]!, seg = p.d[k]! - p.d[k - 1]! || 1, f = (s - p.d[k - 1]!) / seg;
    where.x = ax + (bx - ax) * f; where.z = az + (bz - az) * f; where.dx = (bx - ax) / seg; where.dz = (bz - az) / seg;
    where.y = p.y[k - 1]! + (p.y[k]! - p.y[k - 1]!) * f;
    return where;
  }
  /** The ground's version the roads were laid on, and when they were last laid (real ms). */
  private laidOn = -1; private laidAt = 0;
  sync(sim: Sim): void {
    // the roads laid again on the ground as it's read more finely (a fine tile in), at most every RELAY_MS
    if (groundVersion() !== this.laidOn) { const now = performance.now(); if (now - this.laidAt > RELAY_MS) { this.laidOn = groundVersion(); this.laidAt = now; this.relay(); } }
    const g = sim.g, tb = g.trouble, f = tb.fail; let n = 0, w = 0;
    if (g.t < this.lastT) { this.seen.clear(); this.leaving.length = 0; }   // a loaded save, a new game
    this.lastT = g.t;
    for (const bus of tb.buses) {
      if (n >= MAX_BUSES) break;
      const out = this.path(bus.a, bus.b), back = this.path(bus.b, bus.a); if (!out || !back) continue;
      const t = (g.t - bus.t0) / Math.max(1, bus.t1 - bus.t0);
      // standing at a stop it faces the way it'll leave; on the road, the way it's going
      const p = bus.leg === 'out' ? this.at(out, t) : bus.leg === 'back' ? this.at(back, t) : bus.leg === 'load' ? this.at(out, 0) : this.at(back, 0);
      this.place(n++, p);
      if (bus.leg === 'load' || bus.leg === 'drop') w = this.walk(bus, g.t, p.x - p.dx * LEN * 0.3, p.z - p.dz * LEN * 0.3, w);
    }
    // buses on their way from the depot, to pull in when the sim starts each one (busAfter, then every busGap)
    if (f) {
      let have = 0; for (const b of tb.buses) if (b.a === f.a && b.b === f.b) have++;
      const way = this.depotPath(f.a);
      for (let k = have; way && k < TUNING.busFleet && n < MAX_BUSES; k++) {
        const due = f.from + TUNING.busAfter + k * TUNING.busGap; if (due >= f.until) break;
        const v = Math.max(DEPOT_SPEED, way.len / Math.max(1, TUNING.busAfter - 5)), share = 1 - (due - g.t) * v / way.len;
        if (share >= 0 && share < 1) this.place(n++, this.at(way, share));
      }
    }
    // buses the sim has finished with drive back to the depot from the stop they stood at last
    for (const [id, at] of this.seen) if (!tb.buses.some(b => b.id === id)) { this.leaving.push({ id, at, t: g.t }); this.seen.delete(id); }
    for (const b of tb.buses) this.seen.set(b.id, b.leg === 'load' || b.leg === 'back' ? b.a : b.b);
    for (let k = this.leaving.length - 1; k >= 0; k--) {
      const L = this.leaving[k]!, way = this.depotPath(L.at), share = way ? (g.t - L.t) * DEPOT_SPEED / way.len : 1;
      if (!way || share >= 1) { this.leaving.splice(k, 1); continue; }
      if (n < MAX_BUSES) this.place(n++, this.at(way, 1 - share), true);
    }
    for (const im of this.parts) { im.count = n; im.instanceMatrix.needsUpdate = true; }
    this.count = n;
    this.walkers.count = w; this.walkers.instanceMatrix.needsUpdate = true;
  }
  /** Bus n at a point on a way, heading along it (or back along it, `against`). */
  private place(n: number, p: typeof where, against = false): void {
    const s = against ? -1 : 1, dx = p.dx * s, dz = p.dz * s;
    qt.setFromAxisAngle(up, Math.atan2(dx, dz)); pos.set(p.x - dx * LEN / 2, p.y + 0.1, p.z - dz * LEN / 2); m4.compose(pos, qt, one);
    for (const im of this.parts) im.setMatrixAt(n, m4);
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
