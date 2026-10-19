// The feeder buses (step 21, docs/DESIGN.md, Feeder buses): each bus stop's real route (`feeder` in the network data,
// tools/osm-to-feeders.mjs) run once the player starts it, its buses in the Bee Network's yellow going out along it and
// back, two of them for the route, four once it runs four an hour, and double-deckers once the buses are bigger. One
// instanced mesh for every route's buses, laid on the ground as drawn (the buses' roads' rule, src/render/buses.ts) and
// laid again as the ground comes in finer. View only: it reads the sim, never steps it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PAL } from './scene.ts';
import { pathThrough, type Path } from './buses.ts';
import { groundVersion } from './terrain.ts';
import { projectLatLon, type Network } from '../sim/network.ts';
import type { Sim } from '../sim/sim.ts';
import type { XZ } from '../sim/types.ts';

const MAX = 64;            // buses drawn at most, every route's
const SPEED = 7;           // m a sim second a bus runs along its route (about 15 mph with its stops)
const BUSES = [0, 2, 4, 4];// buses on a route at each of its feeder levels
const B = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// a single-decker along +x, 12 m; the double-decker the same with an upper deck (bigger buses, the third level)
const SINGLE = mergeGeometries([B(12, 2.6, 2.5, 0, 1.6, 0), B(10.6, 0.8, 2.56, -0.3, 2.3, 0)]);
const DOUBLE = mergeGeometries([B(11, 4.2, 2.5, 0, 2.4, 0), B(9.8, 0.8, 2.56, -0.3, 2.3, 0), B(9.8, 0.8, 2.56, -0.3, 3.8, 0)]);

interface Route { stop: string; station: number; raw: XZ[]; path: Path | null }

export class FeederLayer {
  private readonly singles: THREE.InstancedMesh; private readonly doubles: THREE.InstancedMesh;
  private routes: Route[];
  private laidOn = -1;
  /** Sim seconds the buses have run (their places come from it). */
  private clock = 0;
  private readonly m4 = new THREE.Matrix4(); private readonly q = new THREE.Quaternion(); private readonly v = new THREE.Vector3(); private readonly one = new THREE.Vector3(1, 1, 1); private readonly up = new THREE.Vector3(0, 1, 0);
  /** Buses drawn last frame (the checks). */
  count = 0;
  constructor(scene: THREE.Scene, net: Network) {
    const mat = new THREE.MeshLambertMaterial({ color: PAL['link-bus'] });
    const mk = (g: THREE.BufferGeometry) => { const m = new THREE.InstancedMesh(g, mat, MAX); m.count = 0; m.frustumCulled = false; m.castShadow = true; m.name = 'feeders'; scene.add(m); return m; };
    this.singles = mk(SINGLE); this.doubles = mk(DOUBLE);
    this.routes = (net.def.stops ?? []).filter(s => s.feeder).map(s => ({
      stop: `stop:${s.id}`, station: net.station(s.station).index, path: null,
      raw: s.feeder!.points.map(([lat, lon]): XZ => { const p = projectLatLon(lat, lon, net.def.origin); return [p.x, p.z]; }),
    }));
  }
  /** Each frame: the buses along every route the player runs, dtGame sim seconds on. */
  sync(sim: Sim, dtGame: number): void {
    if (groundVersion() !== this.laidOn) { this.laidOn = groundVersion(); for (const r of this.routes) r.path = null; }
    this.clock += dtGame;
    let ns = 0, nd = 0;
    for (const r of this.routes) {
      const lvl = sim.owns(r.stop) ? sim.stageLevel(r.stop, 'feeder') : 0, n = BUSES[lvl] ?? 0; if (!n) continue;
      const p = r.path ??= pathThrough(r.raw), L = p.len; if (L < 50) continue;
      for (let k = 0; k < n; k++) {
        // out along the route and back, the buses spread evenly round the round trip
        const s0 = ((this.clock * SPEED + k * 2 * L / n) % (2 * L) + 2 * L) % (2 * L), back = s0 > L, s = back ? 2 * L - s0 : s0;
        let i = 1; while (i < p.d.length - 1 && p.d[i]! < s) i++;
        const t = (s - p.d[i - 1]!) / ((p.d[i]! - p.d[i - 1]!) || 1), [ax, az] = p.pts[i - 1]!, [bx, bz] = p.pts[i]!;
        this.v.set(ax + (bx - ax) * t, p.y[i - 1]! + (p.y[i]! - p.y[i - 1]!) * t + 0.1, az + (bz - az) * t);
        // driving on the left: a little to the left of the way it's going
        const dx = (bx - ax) * (back ? -1 : 1), dz = (bz - az) * (back ? -1 : 1), l = Math.hypot(dx, dz) || 1;
        this.v.x += dz / l * 1.8; this.v.z -= dx / l * 1.8;
        this.q.setFromAxisAngle(this.up, Math.atan2(-dz, dx)); this.m4.compose(this.v, this.q, this.one);
        if (lvl >= 3) { if (nd < MAX) this.doubles.setMatrixAt(nd++, this.m4); } else if (ns < MAX) this.singles.setMatrixAt(ns++, this.m4);
      }
    }
    for (const [m, c] of [[this.singles, ns], [this.doubles, nd]] as const) { if (m.count !== c) m.count = c; if (c) m.instanceMatrix.needsUpdate = true; }
    this.count = ns + nd;
  }
}
