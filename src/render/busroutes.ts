// The bus routes the player runs (step 8, docs/DESIGN.md, The 192) on the map: the 192's buses along the A6's real
// course (`course` of its main road), up on Wellington Road's deck over Mersey Square, both ways on the left, as many
// as it runs (more with each More buses, quicker once it has its lanes), in the network's blue until the Bee Network's
// yellow, their windows lit warmer the fuller they are (riders an hour on the route, Sim.busRate, against what its buses
// carry). Each route has a stop by each of its stations near its road, a shelter on the left either way, and its
// buses pull in there a while. Instanced: bodies and windows, coloured by instance, and the shelters. Loaded with the
// main roads, after the first frame; view only.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from './scene.ts';
import { groundAt, groundVersion } from './terrain.ts';
import { courseOf, deckAt, onMainRoad, type MainDef } from './mainways.ts';
import type { Sim } from '../sim/sim.ts';
import type { XZ } from '../sim/types.ts';

const MAX = 48;
const BUSES = [8, 12, 18];  // buses on a route at each step of More buses, unless it says (the 192's: every ten, six and four minutes)
const SPEED = 6, LANES = 8; // m a sim second along the A6, and with its bus lanes
const B = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const BODY = B(11, 4.2, 2.5, 0, 2.4, 0), WINDOWS = mergeGeometries([B(9.8, 0.8, 2.56, -0.3, 2.3, 0), B(9.8, 0.8, 2.56, -0.3, 3.8, 0)]);
const CARRY = 28;           // riders an hour a bus on the route carries when it's full
const DWELL = 25;           // sim seconds a bus stands at a stop
const NEAR = 600;           // a station further than this from its route's road has no stop on it
const MAX_STOPS = 32;
// a stop's shelter, along +x the way the buses go, its back away from the road (-z): its roof, glass back and flag
const SHELTER = mergeGeometries([B(4, 0.15, 1.6, 0, 2.6, 0), B(4, 2.4, 0.06, 0, 1.3, -0.75), B(0.12, 3, 0.12, 2.6, 1.5, 1), B(0.1, 0.8, 0.7, 2.6, 2.7, 1)]);
const LANE_AT = 2;          // m left of the road's course a bus runs
const hash = (n: number) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

/** A route along its road: the course's points, distance along it and height at each, its stops (distance along) and
 * how far out from the course the kerb is at each, on the left going out and on the left coming back. */
interface Route { id: string; pts: XZ[]; d: number[]; y: number[]; len: number; buses: number[]; stops: number[]; kerb: (readonly [number, number])[] }

export class BusRouteLayer {
  private readonly mesh: THREE.InstancedMesh; private readonly windows: THREE.InstancedMesh; private readonly shelters: THREE.InstancedMesh;
  private stopsKey = '';
  private readonly empty = PAL['win-empty'].clone(); private readonly busy = PAL['win-busy'].clone(); private readonly c = new THREE.Color();
  private routes: Route[] = [];
  private clock = 0; private laidOn = -1; private laidAt = 0;
  private readonly m4 = new THREE.Matrix4(); private readonly q = new THREE.Quaternion(); private readonly v = new THREE.Vector3(); private readonly one = new THREE.Vector3(1, 1, 1); private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly blue = PAL.bus.clone(); private readonly yellow = PAL['link-bus'].clone(); private tint = -1;
  /** Buses drawn last frame (the checks). */
  count = 0;
  /** `where`: a station's place on the map (its stops go on its route's road nearest it). */
  constructor(scene: THREE.Scene, private readonly def: MainDef & { busRoutes?: { id: string; road: string; along: string[]; buses?: number[] }[] }, private readonly where: (station: string) => XZ | null) {
    this.mesh = new THREE.InstancedMesh(BODY, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.name = 'bus-routes';
    this.windows = new THREE.InstancedMesh(WINDOWS, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX);
    this.windows.count = 0; this.windows.frustumCulled = false; this.windows.name = 'bus-routes-windows';
    for (let k = 0; k < MAX; k++) { this.mesh.setColorAt(k, this.blue); this.windows.setColorAt(k, this.empty); }
    this.shelters = new THREE.InstancedMesh(SHELTER, new THREE.MeshLambertMaterial({ color: PAL.shelter }), MAX_STOPS);
    this.shelters.count = 0; this.shelters.castShadow = true; this.shelters.name = 'bus-route-stops';
    scene.add(this.mesh, this.windows, this.shelters);
    this.lay();
  }
  /** Each route along its road as the ground is drawn now, on a deck where its road has one (again as the ground's finer). */
  lay(): void {
    const onDeck = deckAt(this.def), onRoad = onMainRoad(this.def, 0);
    this.routes = (this.def.busRoutes ?? []).flatMap(b => {
      const pts = courseOf(this.def, b.road); if (!pts || pts.length < 2) return [];
      const d = [0], y: number[] = [];
      pts.forEach(([x, z], k) => {
        if (k) d.push(d[k - 1]! + Math.hypot(x - pts[k - 1]![0], z - pts[k - 1]![1]));
        const [nx, nz] = pts[Math.min(pts.length - 1, k + 1)]!, [px, pz] = pts[Math.max(0, k - 1)]!;
        y.push((onDeck(x, z, nx - px, nz - pz) ?? groundAt(x, z)) + 0.15);
      });
      // a stop where the road passes nearest each of its stations, if near enough
      const stops = b.along.flatMap(st => {
        const at = this.where(st); if (!at) return [];
        let best = Infinity, s = 0, k0 = 0; pts.forEach(([x, z], k) => { const e = Math.hypot(x - at[0], z - at[1]); if (e < best) { best = e; s = d[k]!; k0 = k; } });
        if (best >= NEAR) return [];
        // the kerb there, each way: stepping out from the course across the road until off the carriageway as drawn
        const p = pts[k0]!, [qx, qz] = pts[Math.min(pts.length - 1, k0 + 1)]!, [ox, oz] = pts[Math.max(0, k0 - 1)]!, l = Math.hypot(qx - ox, qz - oz) || 1;
        const edge = (side: number) => { let e = 2; while (e < 30 && onRoad(p[0] + side * (qz - oz) / l * e, p[1] - side * (qx - ox) / l * e)) e += 0.5; return Math.max(3.5, e); };
        const kerb = [edge(1), edge(-1)] as const;
        return [{ s, kerb }];
      }).sort((a, b) => a.s - b.s);
      return [{ id: `bus:${b.id}`, pts, d, y, len: d[d.length - 1]!, buses: b.buses ?? BUSES, stops: stops.map(x => x.s), kerb: stops.map(x => x.kerb) }];
    });
  }
  sync(sim: Sim, dtGame: number): void {
    this.clock += dtGame;
    // laid again as the ground's read more finely, at most every 3 s
    if (groundVersion() !== this.laidOn && performance.now() - this.laidAt > 3000) { this.laidOn = groundVersion(); this.laidAt = performance.now(); this.lay(); this.stopsKey = ''; }
    this.placeStops(sim);
    let n = 0;
    for (const r of this.routes) {
      if (!sim.owns(r.id)) continue;
      const lvl = sim.stageLevel(r.id, 'every'), buses = r.buses[lvl] ?? r.buses[0]!, speed = sim.stageLevel(r.id, 'lanes') ? LANES : SPEED, L = r.len;
      const full = Math.min(1, (sim.busRate.get(r.id) ?? 0) / (buses * CARRY));
      for (let k = 0; k < buses && n < MAX; k++) {
        // round the route and back, standing a while at each stop, spread evenly round the round trip
        const s0 = this.along(r, speed, this.clock + k * this.period(r, speed) / buses), back = s0 > L, s = back ? 2 * L - s0 : s0, side = LANE_AT + this.pull;
        let i = 1; while (i < r.d.length - 1 && r.d[i]! < s) i++;
        const t = (s - r.d[i - 1]!) / ((r.d[i]! - r.d[i - 1]!) || 1), [ax, az] = r.pts[i - 1]!, [bx, bz] = r.pts[i]!;
        const dx = (bx - ax) * (back ? -1 : 1), dz = (bz - az) * (back ? -1 : 1), l = Math.hypot(dx, dz) || 1;
        this.v.set(ax + (bx - ax) * t + dz / l * side, r.y[i - 1]! + (r.y[i]! - r.y[i - 1]!) * t, az + (bz - az) * t - dx / l * side);
        this.q.setFromAxisAngle(this.up, Math.atan2(-dz, dx)); this.m4.compose(this.v, this.q, this.one);
        // how full: the route's, a little more or less on each bus
        this.c.copy(this.empty).lerp(this.busy, Math.max(0, Math.min(1, full + (hash(k) - 0.5) * 0.3)));
        this.mesh.setMatrixAt(n, this.m4); this.windows.setMatrixAt(n, this.m4); this.windows.setColorAt(n, this.c); n++;
      }
    }
    // the Bee Network's yellow once it's bought (step 22), the network's blue before
    const tint = sim.beeLevel() >= 2 ? 1 : 0;
    if (tint !== this.tint) { this.tint = tint; for (let k = 0; k < MAX; k++) this.mesh.setColorAt(k, tint ? this.yellow : this.blue); if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
    if (this.mesh.count !== n) { this.mesh.count = n; this.windows.count = n; }
    if (n) { this.mesh.instanceMatrix.needsUpdate = true; this.windows.instanceMatrix.needsUpdate = true; if (this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true; }
    this.count = n;
  }
  /** How long a round trip takes, sim seconds: there and back, and a stand at each stop both ways. */
  private period(r: Route, speed: number): number { return 2 * r.len / speed + 2 * r.stops.length * DWELL; }
  /** Where a bus is t sim seconds into its round trip, as distance round it (0 to 2L: out, then back from the far end). */
  /** How far towards the kerb the bus `along` last placed has pulled in, m beyond its lane (in at a stop, out after). */
  private pull = 0;
  private along(r: Route, speed: number, t: number): number {
    const L = r.len, P = this.period(r, speed); let left = ((t % P) + P) % P, at = 0;
    this.pull = 0;
    // the stops in the order a bus meets them: out along the road, then back
    for (let k = 0; k < 2 * r.stops.length; k++) {
      const u = k < r.stops.length ? r.stops[k]! : 2 * L - r.stops[2 * r.stops.length - 1 - k]!, run = (u - at) / speed;
      // pulling in over its last 40 m to the stop, out over the 40 m after it
      const n = r.stops.length, kb = (j: number) => (j < n ? r.kerb[j]![0] : r.kerb[2 * n - 1 - j]![1]) - 1.4 - LANE_AT;
      const kerb = kb(k), prev = k ? kb(k - 1) : 0;
      if (left < run) { const s = at + left * speed; this.pull = Math.max(0, Math.max(kerb * (1 - (u - s) / 40), k ? prev * (1 - (s - at) / 40) : 0)); return s; }
      left -= run; at = u;
      if (left < DWELL) { this.pull = Math.max(0, kerb); return at; }
      left -= DWELL;
    }
    const s = Math.min(2 * L, at + left * speed), last = r.kerb[0]?.[1];
    if (last !== undefined) this.pull = Math.max(0, (last - 1.4 - LANE_AT) * (1 - (s - at) / 40));
    return s;
  }
  /** The shelters at the stops of every route the player runs, both ways (again when that changes or the ground does). */
  private placeStops(sim: Sim): void {
    const key = this.routes.filter(r => sim.owns(r.id)).map(r => r.id).join();
    if (key === this.stopsKey) return;
    this.stopsKey = key;
    let n = 0;
    for (const r of this.routes) {
      if (!sim.owns(r.id)) continue;
      for (const s of r.stops) for (const way of [1, -1]) {
        if (n >= MAX_STOPS) break;
        let i = 1; while (i < r.d.length - 1 && r.d[i]! < s) i++;
        const t = (s - r.d[i - 1]!) / ((r.d[i]! - r.d[i - 1]!) || 1), [ax, az] = r.pts[i - 1]!, [bx, bz] = r.pts[i]!, dx = (bx - ax) * way, dz = (bz - az) * way;
        // set back from the course to the kerb's far side, on the left the way the buses go
        const l = Math.hypot(dx, dz) || 1, out = r.kerb[r.stops.indexOf(s)]![way > 0 ? 0 : 1] + 1.4;
        this.v.set(ax + (bx - ax) * t + dz / l * out, r.y[i - 1]! + (r.y[i]! - r.y[i - 1]!) * t - 0.15, az + (bz - az) * t - dx / l * out);
        this.q.setFromAxisAngle(this.up, Math.atan2(-dz, dx)); this.m4.compose(this.v, this.q, this.one);
        this.shelters.setMatrixAt(n++, this.m4);
      }
    }
    this.shelters.count = n; this.shelters.instanceMatrix.needsUpdate = true; this.shelters.computeBoundingSphere();
  }
}
