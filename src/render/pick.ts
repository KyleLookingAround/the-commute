// What a tap on the map lands on: a train (a ray through its bounds, or near it on the screen) first, then a station
// (its halt and the parts shown, or near its label on the screen). Only on a tap, and with its scratch objects made once.
import * as THREE from 'three';
import type { BuiltStation } from './stations.ts';

export type Picked = { kind: 'train' | 'station'; i: number } | null;

export class Picker {
  private ray = new THREE.Raycaster(); private ndc = new THREE.Vector2(); private box = new THREE.Box3();
  private hit = new THREE.Vector3(); private v = new THREE.Vector3();
  constructor(private camera: THREE.Camera, private canvas: HTMLCanvasElement, private stations: BuiltStation[], private trains: THREE.Object3D[]) {}
  /** What's under the client point (x, y), if anything. */
  pick(x: number, y: number): Picked {
    const r = this.canvas.getBoundingClientRect(); if (!r.width || !r.height) return null;
    this.ndc.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const near = (obj: THREE.Object3D, pad: number): number => {
      this.box.setFromObject(obj).expandByScalar(pad);
      return !this.box.isEmpty() && this.ray.ray.intersectBox(this.box, this.hit) ? this.hit.distanceTo(this.ray.ray.origin) : Infinity;
    };
    let best = Infinity, train = -1;
    this.trains.forEach((m, i) => { if (!m.visible) return; const d = near(m, 3); if (d < best) { best = d; train = i; } });
    if (train >= 0) return { kind: 'train', i: train };
    let station = -1;
    this.stations.forEach((b, i) => {
      b.group.updateMatrixWorld(true);
      let d = near(b.fixed, 4);
      for (const g of b.gated) if (g.group.visible) d = Math.min(d, near(g.group, 4));
      if (d < best) { best = d; station = i; }
    });
    if (station >= 0) return { kind: 'station', i: station };
    // or the nearest on the screen of a train (a moving target is hard to land a finger on) or a station's label (the
    // easiest thing to aim at from far off; its middle sits about 10 px above the point it hangs from)
    const toScreen = (p: THREE.Vector3, dy: number): number => { p.project(this.camera); return p.z > 1 ? Infinity : Math.hypot((p.x + 1) / 2 * r.width + r.left - x, (1 - p.y) / 2 * r.height + r.top - dy - y); };
    let px = 28;
    this.trains.forEach((m, i) => { if (!m.visible) return; const d = toScreen(this.box.setFromObject(m).getCenter(this.v), 0); if (d < px) { px = d; train = i; } });
    let pl = 40;
    this.stations.forEach((b, i) => { const d = toScreen(b.label.getWorldPosition(this.v), 10); if (d < pl) { pl = d; station = i; } });
    if (station >= 0 && pl <= px) return { kind: 'station', i: station };
    if (train >= 0) return { kind: 'train', i: train };
    return null;
  }
}
