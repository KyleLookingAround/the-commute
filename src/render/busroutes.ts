// The bus routes the player runs (step 8, docs/DESIGN.md, The 192) on the map: the 192's buses along the A6's real
// course (`course` of its main road), up on Wellington Road's deck over Mersey Square, both ways on the left, as many
// as it runs (more with each More buses, quicker once it has its lanes), in the network's blue until the Bee Network's
// yellow. One instanced mesh, coloured by instance. Loaded with the main roads, after the first frame; view only.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from './scene.ts';
import { groundAt, groundVersion } from './terrain.ts';
import { courseOf, deckAt, type MainDef } from './mainways.ts';
import type { Sim } from '../sim/sim.ts';
import type { XZ } from '../sim/types.ts';

const MAX = 48;
const BUSES = [8, 12, 18];  // buses on the route at each step of More buses (every ten, six and four minutes)
const SPEED = 6, LANES = 8; // m a sim second along the A6, and with its bus lanes
const B = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const BODY = mergeGeometries([B(11, 4.2, 2.5, 0, 2.4, 0), B(9.8, 0.8, 2.56, -0.3, 2.3, 0), B(9.8, 0.8, 2.56, -0.3, 3.8, 0)]);

interface Route { id: string; pts: XZ[]; d: number[]; y: number[]; len: number }

export class BusRouteLayer {
  private readonly mesh: THREE.InstancedMesh;
  private routes: Route[] = [];
  private clock = 0; private laidOn = -1; private laidAt = 0;
  private readonly m4 = new THREE.Matrix4(); private readonly q = new THREE.Quaternion(); private readonly v = new THREE.Vector3(); private readonly one = new THREE.Vector3(1, 1, 1); private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly blue = PAL.bus.clone(); private readonly yellow = PAL['link-bus'].clone(); private tint = -1;
  /** Buses drawn last frame (the checks). */
  count = 0;
  constructor(scene: THREE.Scene, private readonly def: MainDef & { busRoutes?: { id: string; road: string }[] }) {
    this.mesh = new THREE.InstancedMesh(BODY, new THREE.MeshLambertMaterial({ color: 0xffffff }), MAX);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.name = 'bus-routes';
    for (let k = 0; k < MAX; k++) this.mesh.setColorAt(k, this.blue);
    scene.add(this.mesh);
    this.lay();
  }
  /** Each route along its road as the ground is drawn now, on a deck where its road has one (again as the ground's finer). */
  lay(): void {
    const onDeck = deckAt(this.def);
    this.routes = (this.def.busRoutes ?? []).flatMap(b => {
      const pts = courseOf(this.def, b.road); if (!pts || pts.length < 2) return [];
      const d = [0], y: number[] = [];
      pts.forEach(([x, z], k) => {
        if (k) d.push(d[k - 1]! + Math.hypot(x - pts[k - 1]![0], z - pts[k - 1]![1]));
        const [nx, nz] = pts[Math.min(pts.length - 1, k + 1)]!, [px, pz] = pts[Math.max(0, k - 1)]!;
        y.push((onDeck(x, z, nx - px, nz - pz) ?? groundAt(x, z)) + 0.15);
      });
      return [{ id: `bus:${b.id}`, pts, d, y, len: d[d.length - 1]! }];
    });
  }
  sync(sim: Sim, dtGame: number): void {
    this.clock += dtGame;
    // laid again as the ground's read more finely, at most every 3 s
    if (groundVersion() !== this.laidOn && performance.now() - this.laidAt > 3000) { this.laidOn = groundVersion(); this.laidAt = performance.now(); this.lay(); }
    let n = 0;
    for (const r of this.routes) {
      if (!sim.owns(r.id)) continue;
      const lvl = sim.stageLevel(r.id, 'every'), buses = BUSES[lvl] ?? 8, speed = sim.stageLevel(r.id, 'lanes') ? LANES : SPEED, L = r.len;
      for (let k = 0; k < buses && n < MAX; k++) {
        // round the route and back, spread evenly round the round trip
        const s0 = ((this.clock * speed + k * 2 * L / buses) % (2 * L) + 2 * L) % (2 * L), back = s0 > L, s = back ? 2 * L - s0 : s0;
        let i = 1; while (i < r.d.length - 1 && r.d[i]! < s) i++;
        const t = (s - r.d[i - 1]!) / ((r.d[i]! - r.d[i - 1]!) || 1), [ax, az] = r.pts[i - 1]!, [bx, bz] = r.pts[i]!;
        const dx = (bx - ax) * (back ? -1 : 1), dz = (bz - az) * (back ? -1 : 1), l = Math.hypot(dx, dz) || 1;
        this.v.set(ax + (bx - ax) * t + dz / l * 2, r.y[i - 1]! + (r.y[i]! - r.y[i - 1]!) * t, az + (bz - az) * t - dx / l * 2);
        this.q.setFromAxisAngle(this.up, Math.atan2(-dz, dx)); this.m4.compose(this.v, this.q, this.one);
        this.mesh.setMatrixAt(n++, this.m4);
      }
    }
    // the Bee Network's yellow once it's bought (step 22), the network's blue before
    const tint = sim.beeLevel() >= 2 ? 1 : 0;
    if (tint !== this.tint) { this.tint = tint; for (let k = 0; k < MAX; k++) this.mesh.setColorAt(k, tint ? this.yellow : this.blue); if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
    if (this.mesh.count !== n) this.mesh.count = n;
    if (n) this.mesh.instanceMatrix.needsUpdate = true;
    this.count = n;
  }
}
