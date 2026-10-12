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
import { TUNING } from '../sim/sim.ts';
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

/** A unit's geometry; userData.win lists the first vertex of each window box (36 vertices each), so the windows can be
 * recoloured as the train fills. */
export function unitGeometry(cars: number, liv: Livery, carLen = 23): THREE.BufferGeometry {
  const P: number[] = [], N: number[] = [], C: number[] = [], win: number[] = [];
  const S = 1.3;   // the cross-section scale
  const addBox = (x0: number, x1: number, y0r: number, y1r: number, z0r: number, z1r: number, col: RGB) => {
    const y0 = y0r * S, y1 = y1r * S, z0 = z0r * S, z1 = z1r * S;
    const f: [RGB, RGB, RGB, RGB, RGB][] = [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]]];
    for (const [a, b, c, d, n] of f) for (const v of [a, b, c, a, c, d]) { P.push(...v); N.push(...n); C.push(...col); }
  };
  let x = 0;
  for (let ci = 0; ci < cars; ci++) {
    const x0 = x, x1 = x + carLen, hw = 1.4;
    addBox(x0, x1, 1.1, 3.6, -hw, hw, liv.body); addBox(x0 + 0.3, x1 - 0.3, 3.6, 4.0, -hw + 0.3, hw - 0.3, liv.roof); addBox(x0, x1, 0.5, 1.1, -hw + 0.2, hw - 0.2, [0.12, 0.12, 0.14]);
    for (const s of [-1, 1]) { win.push(P.length / 3); addBox(x0 + 1.5, x1 - 1.5, 2.0, 3.0, s * hw, s * (hw + 0.04), liv.win); addBox(x0, x1, 1.3, 1.9, s * hw, s * (hw + 0.03), liv.band); for (const dx of [2.2, carLen - 3.6]) addBox(x0 + dx, x0 + dx + 1.4, 1.1, 3.4, s * hw, s * (hw + 0.05), liv.door); }
    if (ci === 0) addBox(x0, x0 + 2.5, 1.1, 3.6, -hw, hw, liv.nose); if (ci === cars - 1) addBox(x1 - 2.5, x1, 1.1, 3.6, -hw, hw, liv.nose);
    x = x1 + 0.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.translate(-x / 2, 0, 0); geo.userData['win'] = win; return geo;
}

interface Express { svc: ServiceDef; mesh: THREE.Mesh; t: number; dir: 1 | -1; s0: number }
/** How far a train coming in to the end of its run has left to go, or null when it isn't. */
export type EndAhead = (tr: Train) => number | null;
const CROSS = 150;   // metres over which a train crosses to its departure track running in to the end of its run
const smooth = (t: number) => t * t * (3 - 2 * t);
// riders: a figure in a window seat, ten seats a side to each car between its doors, filled in this order so a
// half-full car looks scattered; and one standing in each doorway once the train is nearly full
const SEATS = [3, 7, 1, 9, 5, 0, 8, 2, 6, 4], SEAT_U = (k: number) => 4.5 + k * 1.6, STANDING = 0.85, DOORS = [2.9, 23 - 2.9];
const riderGeo = new THREE.BoxGeometry(0.7, 1.0, 0.05), standGeo = new THREE.BoxGeometry(0.8, 1.7, 0.05);
const riderMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const MAX_RIDERS = 1200, MAX_STANDING = 240;
const m4 = new THREE.Matrix4(), winCol = new THREE.Color();
// the late lamp: from LATE seconds late, scaled from 0.6 to 1.6 by LATE_FULL
const LATE = 60, LATE_FULL = 300, MAX_LAMPS = 16, lampGeo = new THREE.BoxGeometry(1.1, 0.7, 1.1);

export class TrainLayer {
  scene: THREE.Scene;
  net: Network;
  mat: THREE.MeshLambertMaterial;
  meshes: THREE.Mesh[];
  services: Record<string, ServiceDef>;
  express: Express[];
  tmp: Frame;
  tmp2: Frame;
  riders: THREE.InstancedMesh;
  standing: THREE.InstancedMesh;
  coats: THREE.Color[];
  lamps: THREE.InstancedMesh;
  private counts = { r: 0, s: 0 };
  constructor(scene: THREE.Scene, net: Network, services: ServiceDef[]) {
    this.scene = scene; this.net = net; this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = [];
    this.services = Object.fromEntries(services.map(s => [s.id, s]));
    // scenery expresses on the fast lines, from where those lines begin
    this.express = services.filter(s => s.scenery).map(s => {
      const m = new THREE.Mesh(unitGeometry(s.cars, liveryFor(s.operator)), this.mat); m.castShadow = true; scene.add(m);
      return { svc: s, mesh: m, t: 0, dir: 1, s0: Math.max(net.extent(s.tracks.north)[0], net.extent(s.tracks.south)[0]) };
    });
    this.tmp = newFrame(); this.tmp2 = newFrame();
    this.riders = new THREE.InstancedMesh(riderGeo, riderMat, MAX_RIDERS); this.standing = new THREE.InstancedMesh(standGeo, riderMat, MAX_STANDING);
    for (const im of [this.riders, this.standing]) { im.count = 0; im.frustumCulled = false; scene.add(im); }
    this.coats = [PAL.pax, PAL['pax-2'], PAL['pax-3'], PAL['pax-4']];
    this.lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: PAL.late }), MAX_LAMPS);
    this.lamps.count = 0; this.lamps.frustumCulled = false; scene.add(this.lamps);
  }
  /** An amber lamp on the roof over a late train's leading cab, bigger the later it is (m's matrix is current). */
  private lateLamp(m: THREE.Mesh, tr: Train): void {
    if (tr.late < LATE || this.lamps.count >= MAX_LAMPS) return;
    const k = 0.6 + Math.min(1, (tr.late - LATE) / (LATE_FULL - LATE)), front = tr.dir * (tr.cars * 23.6 / 2 - 2.2);
    m4.makeScale(k, k, k).setPosition(front, 4.0 * 1.3 + 0.35 * k, 0).premultiply(m.matrix);
    this.lamps.setMatrixAt(this.lamps.count++, m4);
  }
  /** Recolour a unit's windows for how full it is (0 to 1): only when that changes by a tenth, so not every frame. */
  private windows(m: THREE.Mesh, full: number): void {
    const step = Math.round(full * 10);
    if (m.userData['full'] === step) return;
    m.userData['full'] = step;
    const col = m.geometry.getAttribute('color'), win = m.geometry.userData['win'] as number[] | undefined;
    if (!win || !(col instanceof THREE.BufferAttribute)) return;
    winCol.copy(PAL['win-empty']).lerp(PAL['win-busy'], Math.min(1, step / 7));
    for (const v0 of win) for (let v = v0; v < v0 + 36; v++) col.setXYZ(v, winCol.r, winCol.g, winCol.b);
    col.needsUpdate = true;
  }
  /** The riders in a unit's windows and doorways, placed in the unit's own frame and carried into the world by its matrix. */
  private ridersIn(m: THREE.Mesh, tr: Train, full: number, at: { r: number; s: number }): void {
    m.updateMatrix();
    const half = tr.cars * (23 + 0.6) / 2, seated = Math.round(full * SEATS.length);
    for (let c = 0; c < tr.cars; c++) for (const side of [-1, 1]) {
      const x0 = c * 23.6 - half;
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
  }
  place(mesh: THREE.Mesh, trackId: string, s: number): void {
    const p = this.net.trackAt(trackId, s, this.tmp);
    mesh.position.set(p.x, 0, p.z); mesh.rotation.y = yawFor(p);
  }
  /** Place a train part way across from one track to another: at s, a share t of the way, heading along the blend. */
  placeAcross(mesh: THREE.Mesh, from: string, to: string, s: number, t: number, dir: number): void {
    const c = this.net.corridor(this.net.track(from).corridor);
    const off = (x: number) => { const k = smooth(Math.max(0, Math.min(1, t + (x - s) * dir / CROSS))); return this.net.offsetAt(from, x) * (1 - k) + this.net.offsetAt(to, x) * k; };
    const a = c.at(s, off(s), this.tmp), b = c.at(s + 2, off(s + 2), this.tmp2);
    mesh.position.set(a.x, 0, a.z); mesh.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
  }
  sync(g: GameState, dtGame: number, endAhead: EndAhead): void {
    while (this.meshes.length < g.trains.length) { const m = new THREE.Mesh(unitGeometry(2, NORTHERN), this.mat); m.userData['cars'] = 2; m.castShadow = true; this.scene.add(m); this.meshes.push(m); }
    const at = this.counts; at.r = 0; at.s = 0; this.lamps.count = 0;
    g.trains.forEach((tr, i) => {
      const m = this.meshes[i], svc = this.services[tr.svc]; if (!m || !svc) return;
      if (m.userData['cars'] !== tr.cars) { m.geometry.dispose(); m.geometry = unitGeometry(tr.cars, liveryFor(svc.operator)); m.userData['cars'] = tr.cars; m.userData['full'] = -1; }
      const on = tr.dir > 0 ? svc.tracks.north : svc.tracks.south, leaving = tr.dir > 0 ? svc.tracks.south : svc.tracks.north;
      const rem = endAhead(tr);
      if (rem !== null && rem < CROSS && on !== leaving) this.placeAcross(m, on, leaving, tr.s, 1 - rem / CROSS, tr.dir);
      else this.place(m, on, tr.s);
      const full = Math.min(1, tr.onboard / (tr.cars * TUNING.seatsPerCar));
      this.windows(m, full); this.ridersIn(m, tr, full, at); this.lateLamp(m, tr);
    });
    this.lamps.instanceMatrix.needsUpdate = true;
    this.riders.count = at.r; this.standing.count = at.s;
    for (const im of [this.riders, this.standing]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    const L = this.net.corridor('main').length;
    for (const ex of this.express) {
      ex.t += dtGame; const period = 900, run = (ex.t % period) * 45, len = L - ex.s0;
      if (Math.floor(ex.t / period) % 2 === 0) ex.dir = 1; else ex.dir = -1;
      if (run < len) this.place(ex.mesh, ex.dir > 0 ? ex.svc.tracks.north : ex.svc.tracks.south, ex.dir > 0 ? ex.s0 + run : L - run); else ex.mesh.position.y = -500;
    }
  }
}
