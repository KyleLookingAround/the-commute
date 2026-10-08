// Train units as vertex-coloured box geometry, positioned on their track by distance along the corridor.
import * as THREE from 'three';
import { yawFor } from './world.ts';
import { newFrame } from '../sim/network.ts';
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

export function unitGeometry(cars: number, liv: Livery, carLen = 23): THREE.BufferGeometry {
  const P: number[] = [], N: number[] = [], C: number[] = [];
  const addBox = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, col: RGB) => {
    const f: [RGB, RGB, RGB, RGB, RGB][] = [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]]];
    for (const [a, b, c, d, n] of f) for (const v of [a, b, c, a, c, d]) { P.push(...v); N.push(...n); C.push(...col); }
  };
  let x = 0;
  for (let ci = 0; ci < cars; ci++) {
    const x0 = x, x1 = x + carLen, hw = 1.4;
    addBox(x0, x1, 1.1, 3.6, -hw, hw, liv.body); addBox(x0 + 0.3, x1 - 0.3, 3.6, 4.0, -hw + 0.3, hw - 0.3, liv.roof); addBox(x0, x1, 0.5, 1.1, -hw + 0.2, hw - 0.2, [0.12, 0.12, 0.14]);
    for (const s of [-1, 1]) { addBox(x0 + 1.5, x1 - 1.5, 2.0, 3.0, s * hw, s * (hw + 0.04), liv.win); addBox(x0, x1, 1.3, 1.9, s * hw, s * (hw + 0.03), liv.band); for (const dx of [2.2, carLen - 3.6]) addBox(x0 + dx, x0 + dx + 1.4, 1.1, 3.4, s * hw, s * (hw + 0.05), liv.door); }
    if (ci === 0) addBox(x0, x0 + 2.5, 1.1, 3.6, -hw, hw, liv.nose); if (ci === cars - 1) addBox(x1 - 2.5, x1, 1.1, 3.6, -hw, hw, liv.nose);
    x = x1 + 0.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.translate(-x / 2, 0, 0); return geo;
}

interface Express { svc: ServiceDef; mesh: THREE.Mesh; t: number; dir: 1 | -1 }

export class TrainLayer {
  scene: THREE.Scene;
  net: Network;
  mat: THREE.MeshLambertMaterial;
  meshes: THREE.Mesh[];
  stopper: ServiceDef;
  express: Express[];
  tmp: Frame;
  constructor(scene: THREE.Scene, net: Network, services: ServiceDef[]) {
    this.scene = scene; this.net = net; this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = [];
    const stopper = services.find(s => s.id === 'stopper'); if (!stopper) throw new Error('network.json names no "stopper" service');
    this.stopper = stopper;
    // scenery expresses on the fast lines
    this.express = services.filter(s => s.scenery).map(s => { const m = new THREE.Mesh(unitGeometry(s.cars, liveryFor(s.operator)), this.mat); scene.add(m); return { svc: s, mesh: m, t: 0, dir: 1 }; });
    this.tmp = newFrame();
  }
  place(mesh: THREE.Mesh, trackId: string, s: number): void {
    const p = this.net.trackAt(trackId, s, this.tmp);
    mesh.position.set(p.x, 0, p.z); mesh.rotation.y = yawFor(p);
  }
  sync(g: GameState, dtGame: number): void {
    while (this.meshes.length < g.trains.length) { const m = new THREE.Mesh(unitGeometry(2, NORTHERN), this.mat); m.userData['cars'] = 2; this.scene.add(m); this.meshes.push(m); }
    g.trains.forEach((tr, i) => {
      const m = this.meshes[i]; if (!m) return;
      if (m.userData['cars'] !== tr.cars) { m.geometry.dispose(); m.geometry = unitGeometry(tr.cars, NORTHERN); m.userData['cars'] = tr.cars; }
      this.place(m, tr.dir > 0 ? this.stopper.tracks.north : this.stopper.tracks.south, tr.s);
    });
    const L = this.net.corridor('main').length;
    for (const ex of this.express) {
      ex.t += dtGame; const period = 900, run = (ex.t % period) * 45;
      if (Math.floor(ex.t / period) % 2 === 0) ex.dir = 1; else ex.dir = -1;
      if (run < L) this.place(ex.mesh, ex.dir > 0 ? ex.svc.tracks.north : ex.svc.tracks.south, ex.dir > 0 ? run : L - run); else ex.mesh.position.y = -500;
    }
  }
}
