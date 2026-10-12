// Homes that grow on the map: new terraces and small blocks of flats round each station whose homes have grown
// (Sim.homes over the station's census catchment), one building for every HOMES_PER_PLOT homes, nearest the station
// first, so they fill the reach's glow. Where they can go is worked out once at start, clear of the tracks, the
// stations, the roads and the houses already drawn; the sim only says how many show. A new one rises into place as a
// bought part does (at once with reduced motion). Instanced: walls, pitched roofs, flat roofs and window bands.
import * as THREE from 'three';
import type { Sim } from '../sim/sim.ts';
import type { Network } from '../sim/network.ts';
import type { World } from './world.ts';
import { PAL } from './scene.ts';
import { riseBy, settle } from './stations.ts';

/** Homes (on the sim's scale) a building stands for. */
export const HOMES_PER_PLOT = 3;
const NEAR = 150, FAR = 720;          // metres from the station: inside its own land, out to the edge of a good reach
const TRACK_CLEAR = 30, STATION_CLEAR = 210;
const STOREY = 3;

const hash = (a: number, b: number) => { const s = Math.sin(a * 91.7 + b * 247.3) * 43758.5453; return s - Math.floor(s); };

/** A building's place and shape: centre, yaw, footprint w (along) by d, wall height h, and whether it's flats. */
interface Plot { x: number; y: number; z: number; yaw: number; w: number; d: number; h: number; flats: boolean; floors: number; rise: number }

export class HomesLayer {
  /** Each station's plots, nearest first, and how many show. */
  readonly plots: Plot[][] = [];
  private shown: number[];
  private walls: THREE.InstancedMesh; private roofs: THREE.InstancedMesh; private tops: THREE.InstancedMesh; private bands: THREE.InstancedMesh;
  /** Where each plot's instances start: [station][k] -> index into walls (and roofs/tops), and into bands. */
  private at: number[][] = []; private bandAt: number[][] = [];
  private meshes: THREE.InstancedMesh[];
  private rising: number[] = []; private first = true;
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private sc = new THREE.Vector3();
  private zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(scene: THREE.Scene, net: Network, world: World) {
    const c = net.corridor('main'), st = net.stations.map(s => net.stationFrame(s.id));
    const taken: number[] = [];   // x, z, r of every plot so far
    const clear = (x: number, z: number, r: number): boolean => {
      for (const f of st) if (Math.hypot(x - f.x, z - f.z) < STATION_CLEAR + r) return false;
      for (let k = 0; k < taken.length; k += 3) if (Math.hypot(x - taken[k]!, z - taken[k + 1]!) < r + taken[k + 2]! + 4) return false;
      // off every track: the point's offset across the corridor against each track's there
      const s = c.nearest(x, z), a = c.at(s), off = (x - a.x) * a.nx + (z - a.z) * a.nz;
      for (const t of net.tracks) { const [e0, e1] = net.extent(t.id); if (s >= e0 - 50 && s <= e1 + 50 && Math.abs(off - net.offsetAt(t.id, Math.max(e0, Math.min(e1, s)))) < TRACK_CLEAR + r) return false; }
      return world.buildable(x, z, r);
    };
    let walls = 0, bands = 0;
    net.stations.forEach((s, i) => {
      const want = Math.max(0, Math.ceil(((s.ceiling ?? s.catchment) - s.catchment) / HOMES_PER_PLOT)), list: Plot[] = [];
      // candidates nearest first, with a little shuffle so the rings aren't perfect
      const cands: [number, number][] = [];
      for (let k = 0; k < want * 40; k++) cands.push([k, NEAR + (FAR - NEAR) * Math.sqrt(hash(i * 7919 + k, 1)) + 60 * hash(i * 7919 + k, 2)]);
      cands.sort((a, b) => a[1] - b[1]);
      const f = st[i]!;
      for (const [k, r] of cands) {
        if (list.length >= want) break;
        const seed = i * 7919 + k, ang = hash(seed, 3) * Math.PI * 2, x = f.x + Math.cos(ang) * r, z = f.z + Math.sin(ang) * r;
        // flats nearer the station (and at the city end), terraces and pairs further out
        const flats = hash(seed, 4) < (r < 320 ? 0.55 : 0.15) + (s.id === 'piccadilly' || s.id === 'ardwick' ? 0.35 : 0);
        const floors = flats ? 3 + Math.floor(hash(seed, 5) * 3) : 2;
        const w = flats ? 14 + hash(seed, 6) * 10 : 10 + Math.floor(hash(seed, 6) * 5) * 5, d = flats ? 11 + hash(seed, 7) * 5 : 8;
        const rad = Math.hypot(w, d) / 2;
        if (!clear(x, z, rad)) continue;
        // along the street: facing the station or across, give or take
        const yaw = Math.atan2(f.z - z, f.x - x) + (hash(seed, 8) < 0.5 ? 0 : Math.PI / 2) + (hash(seed, 9) - 0.5) * 0.2;
        list.push({ x, y: world.groundY(x, z), z, yaw, w, d, h: floors * STOREY, flats, floors, rise: 1 });
        taken.push(x, z, rad);
      }
      this.plots.push(list);
      this.at.push(list.map(() => walls++));
      this.bandAt.push(list.map(p => { const b = bands; bands += p.flats ? p.floors : 0; return b; }));
    });
    const unit = new THREE.BoxGeometry(1, 1, 1);
    // a pitched roof: a prism along x, its ridge at the top, 1 high and 1 across
    const prism = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]), { depth: 1, bevelEnabled: false });
    prism.translate(0, 0, -0.5); prism.rotateY(Math.PI / 2);
    const n = Math.max(1, walls);
    this.walls = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial(), n);
    this.roofs = new THREE.InstancedMesh(prism, new THREE.MeshLambertMaterial(), n);
    this.tops = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial(), n);
    this.bands = new THREE.InstancedMesh(unit, new THREE.MeshLambertMaterial({ color: PAL['home-glass'], emissive: PAL['glass-glow'] }), Math.max(1, bands));
    const walls6 = [PAL['home-1'], PAL['home-2'], PAL['home-3'], PAL['home-4'], PAL['home-5'], PAL['home-6']];
    this.plots.forEach((list, i) => list.forEach((p, k) => {
      const j = this.at[i]![k]!, h = hash(i * 7919 + k, 10);
      // terraces mostly brick, some rendered in pastels; flats rendered or buff brick
      const wall = p.flats ? walls6[[1, 2, 3, 5, 2][Math.floor(h * 5)]!]! : walls6[[0, 0, 1, 2, 3, 4, 5][Math.floor(h * 7)]!]!;
      this.walls.setColorAt(j, wall);
      this.roofs.setColorAt(j, hash(i * 7919 + k, 11) < 0.4 ? PAL['home-roof'] : PAL['home-tile']);
      this.tops.setColorAt(j, wall);   // a flat roof's parapet in its walls' colour, so flats show from above
    }));
    this.meshes = [this.walls, this.roofs, this.tops, this.bands];
    for (const m of this.meshes) {
      for (let j = 0; j < m.count; j++) m.setMatrixAt(j, this.zero);
      m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m);
    }
    this.shown = net.stations.map(() => 0);
  }

  /** How many buildings show at each station. */
  counts(): number[] { return [...this.shown]; }
  /** How many are still rising. */
  get risingCount(): number { return this.rising.length / 2; }

  /** One frame: show as many buildings at each station as its grown homes make, raising the new ones (dt real seconds). */
  sync(sim: Sim, dt: number): void {
    for (let i = 0; i < this.plots.length; i++) {
      const list = this.plots[i]!, s = sim.S[i]!;
      const want = Math.min(list.length, Math.max(0, Math.floor((sim.homes(i) - s.catchment) / HOMES_PER_PLOT)));
      let n = this.shown[i]!;
      while (n < want) { const p = list[n]!; p.rise = this.first ? 1 : 0; if (p.rise < 1) this.rising.push(i, n); this.place(i, n, 1); n++; }
      while (n > want) { n--; list[n]!.rise = 1; this.hide(i, n); }   // a new game: they go at once
      this.shown[i] = n;
    }
    this.first = false;
    let k = 0;
    for (let r = 0; r < this.rising.length; r += 2) {
      const i = this.rising[r]!, j = this.rising[r + 1]!, p = this.plots[i]![j]!;
      if (j >= this.shown[i]!) continue;
      p.rise = riseBy(p.rise, dt); this.place(i, j, Math.max(0.01, settle(p.rise)));
      if (p.rise < 1) { this.rising[k++] = i; this.rising[k++] = j; }
    }
    this.rising.length = k;
  }

  private hide(i: number, j: number): void {
    const w = this.at[i]![j]!, p = this.plots[i]![j]!;
    this.walls.setMatrixAt(w, this.zero); this.roofs.setMatrixAt(w, this.zero); this.tops.setMatrixAt(w, this.zero);
    if (p.flats) for (let f = 0; f < p.floors; f++) this.bands.setMatrixAt(this.bandAt[i]![j]! + f, this.zero);
    this.dirty();
  }

  /** Put plot j at station i in place, k of the way up. */
  private place(i: number, j: number, k: number): void {
    const p = this.plots[i]![j]!, w = this.at[i]![j]!, { m4, q, e, v, sc } = this;
    e.set(0, p.yaw, 0); q.setFromEuler(e);
    const h = p.h * k;
    v.set(p.x, p.y + h / 2, p.z); sc.set(p.w, h, p.d); m4.compose(v, q, sc); this.walls.setMatrixAt(w, m4);
    if (p.flats) {
      v.set(p.x, p.y + h + 0.3 * k, p.z); sc.set(p.w + 0.6, 0.6 * k, p.d + 0.6); m4.compose(v, q, sc); this.tops.setMatrixAt(w, m4);
      this.roofs.setMatrixAt(w, this.zero);
      for (let f = 0; f < p.floors; f++) {
        v.set(p.x, p.y + (f * STOREY + 1.7) * k, p.z); sc.set(p.w + 0.12, 1.1 * k, p.d + 0.12); m4.compose(v, q, sc);
        this.bands.setMatrixAt(this.bandAt[i]![j]! + f, m4);
      }
    } else {
      v.set(p.x, p.y + h, p.z); sc.set(p.w + 0.4, 3 * k, p.d + 0.8); m4.compose(v, q, sc); this.roofs.setMatrixAt(w, m4);
      this.tops.setMatrixAt(w, this.zero);
    }
    this.dirty();
  }
  private dirty(): void { for (const m of this.meshes) m.instanceMatrix.needsUpdate = true; }
}
