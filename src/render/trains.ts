// Train units as vertex-coloured box geometry, positioned on their service's track by distance along the corridor. The
// cars are real length but 1.3 times real height and width, model-railway style, so a train reads from the stock zoom.
// A train coming in to the end of its run crosses over to the track it will leave on as it runs in, so it stands at the
// platform its passengers board from and never jumps across when it turns round.
// A train looks as full as it is: its windows go from cool glass when empty to warm and lit as it fills, riders show in
// them, and when it's nearly full people stand in the doorways. A train running late carries an amber lamp over its
// leading cab, from a minute late, growing until it's five minutes late; on time it looks as it always has.
import * as THREE from 'three';
import { yawFor } from './world.ts';
import { PAL } from './scene.ts';
import { LINE_UPGRADES, TUNING } from '../sim/sim.ts';
import { newFrame } from '../sim/network.ts';
import type { Train } from '../sim/types.ts';
import type { Network } from '../sim/network.ts';
import type { Frame, GameState, ServiceDef } from '../sim/types.ts';

type RGB = [number, number, number];
export interface Livery { body: RGB; roof: RGB; band: RGB; door: RGB; win: RGB; nose: RGB }
export const LIVERIES: Record<string, Livery> = {
  northern: { body: [0.93, 0.93, 0.95], roof: [0.35, 0.36, 0.4], band: [0.52, 0.3, 0.72], door: [0.2, 0.25, 0.55], win: [0.95, 0.85, 0.55], nose: [0.17, 0.17, 0.25] },
  avanti: { body: [0.9, 0.91, 0.92], roof: [0.3, 0.32, 0.34], band: [0.12, 0.5, 0.36], door: [0.14, 0.55, 0.4], win: [0.95, 0.85, 0.55], nose: [0.1, 0.1, 0.12] },
};
const NORTHERN = LIVERIES['northern']!;
/** The livery an operator paints, Northern's for one the map doesn't know. */
export const liveryFor = (operator: string): Livery => LIVERIES[operator] ?? NORTHERN;

/** One car's geometry, centred on its middle, with a cab nose at its low end (towards Stockport), its high end, or
 * neither; userData.win lists the first vertex of each window box (36 vertices each), so the windows can be recoloured
 * as the train fills. */
export function carGeometry(liv: Livery, noseLow: boolean, noseHigh: boolean): THREE.BufferGeometry {
  const P: number[] = [], N: number[] = [], C: number[] = [], win: number[] = [];
  const S = 1.3;   // the cross-section scale
  const addBox = (x0: number, x1: number, y0r: number, y1r: number, z0r: number, z1r: number, col: RGB) => {
    const y0 = y0r * S, y1 = y1r * S, z0 = z0r * S, z1 = z1r * S;
    const f: [RGB, RGB, RGB, RGB, RGB][] = [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]]];
    for (const [a, b, c, d, n] of f) for (const v of [a, b, c, a, c, d]) { P.push(...v); N.push(...n); C.push(...col); }
  };
  const x0 = -CAR / 2, x1 = CAR / 2, hw = 1.4;
  addBox(x0, x1, 1.1, 3.6, -hw, hw, liv.body); addBox(x0 + 0.3, x1 - 0.3, 3.6, 4.0, -hw + 0.3, hw - 0.3, liv.roof); addBox(x0, x1, 0.5, 1.1, -hw + 0.2, hw - 0.2, [0.12, 0.12, 0.14]);
  for (const s of [-1, 1]) { win.push(P.length / 3); addBox(x0 + 1.5, x1 - 1.5, 2.0, 3.0, s * hw, s * (hw + 0.04), liv.win); addBox(x0, x1, 1.3, 1.9, s * hw, s * (hw + 0.03), liv.band); for (const dx of [2.2, CAR - 3.6]) addBox(x0 + dx, x0 + dx + 1.4, 1.1, 3.4, s * hw, s * (hw + 0.05), liv.door); }
  if (noseLow) addBox(x0, x0 + 2.5, 1.1, 3.6, -hw, hw, liv.nose); if (noseHigh) addBox(x1 - 2.5, x1, 1.1, 3.6, -hw, hw, liv.nose);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.userData['win'] = win; return geo;
}

/** A unit on the map: a group of cars, each its own mesh so it follows the track round curves and across crossovers. */
interface Unit { group: THREE.Group; cars: THREE.Mesh[]; full: number }
interface Express { svc: ServiceDef; unit: Unit; t: number; dir: 1 | -1; range: [number, number] }
/** How far a train coming in to the end of its run has left to go, or null when it isn't. */
export type EndAhead = (tr: Train) => number | null;
const CAR = 23, PITCH = CAR + 0.6;   // a car's length, and from one car's middle to the next
const BOGIE = 8;                     // a car's bogies stand this far either side of its middle, and steer it
// a train running in to the end of its run crosses to the track it will leave on over CROSS metres, finishing HOLD
// metres before it stops: its whole length is then past the crossover, so it runs into the platform it leaves from
const CROSS = 150, HOLD = 75;
const smooth = (t: number) => t * t * (3 - 2 * t);
/** The longest unit the line runs: two cars, and two more for each step of longer trains. */
const LONGEST = 2 + 2 * (LINE_UPGRADES.find(u => u.id === 'cars')?.max ?? 0);
// riders: a figure in a window seat, ten seats a side to each car between its doors, filled in this order so a
// half-full car looks scattered; and one standing in each doorway once the train is nearly full
const SEATS = [3, 7, 1, 9, 5, 0, 8, 2, 6, 4], SEAT_U = (k: number) => 4.5 + k * 1.6, STANDING = 0.85, DOORS = [2.9, 23 - 2.9];
const riderGeo = new THREE.BoxGeometry(0.7, 1.0, 0.05), standGeo = new THREE.BoxGeometry(0.8, 1.7, 0.05);
const riderMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const MAX_RIDERS = 1200, MAX_STANDING = 240;
const m4 = new THREE.Matrix4(), winCol = new THREE.Color();
// the late lamp: from LATE seconds late, scaled from 0.6 to 1.6 by LATE_FULL
const LATE = 60, LATE_FULL = 300, MAX_LAMPS = 16, lampGeo = new THREE.BoxGeometry(1.1, 0.7, 1.1);

/** Where a car stands: its middle on the ground, the way it points (a unit vector), how long it is, and how far its
 * bogies are either side of its middle. */
export interface CarPose { x: number; z: number; dx: number; dz: number; len: number; bogie: number }
const POSES: CarPose[] = [];
const fa = newFrame(), fb = newFrame();
/** Where each car of a unit of a service is drawn, centred at s, on the track for its direction; running in to the end
 * of its run (rem metres to go) the cars follow the crossover to the track it will leave on, each where it is along it.
 * A car rides on its bogies: they're on the track, and its body runs straight between them. Fills out (car 0 at the Stockport
 * end) and returns how many cars; the geometry check sweeps the same poses past the stations. */
export function unitPoses(net: Network, svc: ServiceDef, s: number, dir: number, cars: number, rem: number | null, out: CarPose[]): number {
  const on = dir > 0 ? svc.tracks.north : svc.tracks.south, leaving = dir > 0 ? svc.tracks.south : svc.tracks.north;
  const end = rem === null || on === leaving ? null : s + dir * rem;
  for (let c = 0; c < cars; c++) {
    const x = s + (c - (cars - 1) / 2) * PITCH, o = out[c] ?? (out[c] = { x: 0, z: 0, dx: 1, dz: 0, len: CAR, bogie: BOGIE });
    const a = onPath(net, on, leaving, end, dir, x - BOGIE, fa), b = onPath(net, on, leaving, end, dir, x + BOGIE, fb), n = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    o.dx = (b.x - a.x) / n; o.dz = (b.z - a.z) / n; o.x = (a.x + b.x) / 2; o.z = (a.z + b.z) / 2; o.len = CAR; o.bogie = n / 2;
  }
  return cars;
}
/** A point x along the path a unit runs: its track, or running in to the end of its run (end not null), the
 * crossover from its track to the one it will leave on, which ends HOLD metres short of the stop. */
function onPath(net: Network, on: string, leaving: string, end: number | null, dir: number, x: number, f: Frame): Frame {
  if (end === null) return net.trackAt(on, x, f);
  const k = smooth(Math.max(0, Math.min(1, (HOLD + CROSS - (end - x) * dir) / CROSS)));
  return net.place(net.track(on).corridor, x, net.offsetAt(on, x) * (1 - k) + net.offsetAt(leaving, x) * k, f);
}
/** Where a service's units run, by their middles: a passenger service between the stops at the ends of its route; an
 * express from where its tracks begin (its tail on them) to the end of its run, standing where the longest stopping
 * unit would at its last call. */
export function serviceRange(net: Network, svc: ServiceDef): [number, number] {
  if (!svc.scenery) { const ss = (svc.route ?? []).map(id => net.station(id).s); return [Math.min(...ss), Math.max(...ss)]; }
  const half = (svc.cars * PITCH - 0.6) / 2, last = net.station((Array.isArray(svc.calls) ? svc.calls : []).at(-1) ?? net.stations.at(-1)!.id);
  return [Math.max(net.extent(svc.tracks.north)[0], net.extent(svc.tracks.south)[0]) + half, last.s + (LONGEST * PITCH - 0.6) / 2 - half];
}

export class TrainLayer {
  scene: THREE.Scene;
  net: Network;
  mat: THREE.MeshLambertMaterial;
  /** Each unit's group of cars, by its place in the sim's list. */
  meshes: THREE.Group[];
  private units: Unit[];
  services: Record<string, ServiceDef>;
  express: Express[];
  riders: THREE.InstancedMesh;
  standing: THREE.InstancedMesh;
  coats: THREE.Color[];
  lamps: THREE.InstancedMesh;
  private counts = { r: 0, s: 0 };
  constructor(scene: THREE.Scene, net: Network, services: ServiceDef[]) {
    this.scene = scene; this.net = net; this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = []; this.units = [];
    this.services = Object.fromEntries(services.map(s => [s.id, s]));
    // scenery expresses on the fast lines, from where those lines begin to the platform at the end of their run
    this.express = services.filter(s => s.scenery).map(s => ({ svc: s, unit: this.unit(s.cars, liveryFor(s.operator)), t: 0, dir: 1, range: serviceRange(net, s) }));
    this.riders = new THREE.InstancedMesh(riderGeo, riderMat, MAX_RIDERS); this.standing = new THREE.InstancedMesh(standGeo, riderMat, MAX_STANDING);
    for (const im of [this.riders, this.standing]) { im.count = 0; im.frustumCulled = false; scene.add(im); }
    this.coats = [PAL.pax, PAL['pax-2'], PAL['pax-3'], PAL['pax-4']];
    this.lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: PAL.late }), MAX_LAMPS);
    this.lamps.count = 0; this.lamps.frustumCulled = false; scene.add(this.lamps);
  }
  /** A unit of n cars in a livery, cabs at both ends, in the scene. */
  private unit(n: number, liv: Livery, into?: Unit): Unit {
    const u = into ?? { group: new THREE.Group(), cars: [], full: -1 };
    if (!into) this.scene.add(u.group);
    for (const m of u.cars) { m.geometry.dispose(); u.group.remove(m); }
    u.cars = []; u.full = -1;
    for (let c = 0; c < n; c++) { const m = new THREE.Mesh(carGeometry(liv, c === 0, c === n - 1), this.mat); m.castShadow = true; m.matrixAutoUpdate = false; u.group.add(m); u.cars.push(m); }
    return u;
  }
  /** Put a unit's cars where unitPoses says. */
  private pose(u: Unit, svc: ServiceDef, s: number, dir: number, rem: number | null): void {
    const n = unitPoses(this.net, svc, s, dir, u.cars.length, rem, POSES);
    for (let c = 0; c < n; c++) {
      const p = POSES[c]!, m = u.cars[c]!;
      m.position.set(p.x, 0, p.z); m.rotation.y = Math.atan2(-p.dz, p.dx); m.updateMatrix();
    }
    u.group.visible = true;
  }
  /** An amber lamp on the roof over a late train's leading cab, bigger the later it is. */
  private lateLamp(u: Unit, tr: Train): void {
    if (tr.late < LATE || this.lamps.count >= MAX_LAMPS) return;
    const lead = tr.dir > 0 ? u.cars[u.cars.length - 1] : u.cars[0]; if (!lead) return;
    const k = 0.6 + Math.min(1, (tr.late - LATE) / (LATE_FULL - LATE)), front = tr.dir * (CAR / 2 - 2.2);
    m4.makeScale(k, k, k).setPosition(front, 4.0 * 1.3 + 0.35 * k, 0).premultiply(lead.matrix);
    this.lamps.setMatrixAt(this.lamps.count++, m4);
  }
  /** Recolour a unit's windows for how full it is (0 to 1): only when that changes by a tenth, so not every frame. */
  private windows(u: Unit, full: number): void {
    const step = Math.round(full * 10);
    if (u.full === step) return;
    u.full = step;
    winCol.copy(PAL['win-empty']).lerp(PAL['win-busy'], Math.min(1, step / 7));
    for (const m of u.cars) {
      const col = m.geometry.getAttribute('color'), win = m.geometry.userData['win'] as number[] | undefined;
      if (!win || !(col instanceof THREE.BufferAttribute)) continue;
      for (const v0 of win) for (let v = v0; v < v0 + 36; v++) col.setXYZ(v, winCol.r, winCol.g, winCol.b);
      col.needsUpdate = true;
    }
  }
  /** The riders in a unit's windows and doorways, placed in each car's own frame and carried into the world by its matrix. */
  private ridersIn(u: Unit, tr: Train, full: number, at: { r: number; s: number }): void {
    const seated = Math.round(full * SEATS.length), x0 = -CAR / 2;
    u.cars.forEach((m, c) => {
      for (const side of [-1, 1]) {
        for (let k = 0; k < seated && at.r < MAX_RIDERS; k++) {
          const seat = SEATS[(k + c * 3 + (side > 0 ? 5 : 0)) % SEATS.length]!;
          m4.makeTranslation(x0 + SEAT_U(seat), 3.4, side * 1.9).premultiply(m.matrix);
          this.riders.setMatrixAt(at.r, m4); this.riders.setColorAt(at.r, this.coats[(tr.id + c + seat) % this.coats.length]!); at.r++;
        }
        if (full >= STANDING) for (const d of DOORS) if (at.s < MAX_STANDING) {
          m4.makeTranslation(x0 + d, 3.0, side * 1.93).premultiply(m.matrix);
          this.standing.setMatrixAt(at.s, m4); this.standing.setColorAt(at.s, this.coats[(tr.id + c + at.s) % this.coats.length]!); at.s++;
        }
      }
    });
  }
  sync(g: GameState, dtGame: number, endAhead: EndAhead): void {
    while (this.units.length < g.trains.length) { const u = this.unit(2, NORTHERN); this.units.push(u); this.meshes.push(u.group); }
    const at = this.counts; at.r = 0; at.s = 0; this.lamps.count = 0;
    g.trains.forEach((tr, i) => {
      const u = this.units[i], svc = this.services[tr.svc]; if (!u || !svc) return;
      if (u.cars.length !== tr.cars) this.unit(tr.cars, liveryFor(svc.operator), u);
      this.pose(u, svc, tr.s, tr.dir, endAhead(tr));
      const full = Math.min(1, tr.onboard / (tr.cars * TUNING.seatsPerCar));
      this.windows(u, full); this.ridersIn(u, tr, full, at); this.lateLamp(u, tr);
    });
    this.lamps.instanceMatrix.needsUpdate = true;
    this.riders.count = at.r; this.standing.count = at.s;
    for (const im of [this.riders, this.standing]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    // an express runs up to the end of its run and stands there out the half period, then runs back and is gone
    for (const ex of this.express) {
      ex.t += dtGame; const period = 900, run = (ex.t % period) * 45, [s0, s1] = ex.range, len = s1 - s0;
      ex.dir = Math.floor(ex.t / period) % 2 === 0 ? 1 : -1;
      if (ex.dir > 0) this.pose(ex.unit, ex.svc, s0 + Math.min(run, len), 1, null);
      else if (run < len) this.pose(ex.unit, ex.svc, s1 - run, -1, null);
      else ex.unit.group.visible = false;
    }
  }
}
