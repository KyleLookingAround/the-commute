// Orbit camera with tweened focus. Drag to orbit, pinch or wheel to zoom.
import * as THREE from 'three';

/** Where the camera looks (tx, ty, tz), how far away it is (r) and from which angles (th around, ph down). */
export interface Orbit { tx: number; ty: number; tz: number; r: number; th: number; ph: number }
const ORBIT_KEYS: (keyof Orbit)[] = ['tx', 'ty', 'tz', 'r', 'th', 'ph'];

export class OrbitRig {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  o: Orbit;
  tween: { from: Orbit; to: Orbit; t: number } | null;
  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, scene: THREE.Scene) {
    this.camera = camera; this.scene = scene;
    this.o = { tx: 0, ty: 2, tz: 0, r: 230, th: 0.7, ph: 1.0 };
    this.tween = null;
    const ptrs = new Map<number, { x: number; y: number }>(); let lastPinch = 0;
    canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.tween = null; });
    canvas.addEventListener('pointermove', e => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 1) { this.o.th -= dx * 0.006; this.o.ph -= dy * 0.005; }
      else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; if (!a || !b) return; const d = Math.hypot(a.x - b.x, a.y - b.y); if (lastPinch) this.o.r *= lastPinch / d; lastPinch = d; }
    });
    const up = (e: PointerEvent) => { ptrs.delete(e.pointerId); lastPinch = 0; };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.o.r *= Math.exp(e.deltaY * 0.0012); this.tween = null; }, { passive: false });
  }
  focus(x: number, z: number, r = 230, th = 0.7, ph = 1.0): void { this.tween = { from: { ...this.o }, to: { tx: x, ty: 2, tz: z, r, th, ph }, t: 0 }; }
  update(dt: number): void {
    const o = this.o;
    if (this.tween) { const tw = this.tween; tw.t = Math.min(1, tw.t + dt * 1.4); const e = tw.t * tw.t * (3 - 2 * tw.t); for (const k of ORBIT_KEYS) o[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e; if (tw.t >= 1) this.tween = null; }
    o.ph = Math.max(0.1, Math.min(1.5, o.ph)); o.r = Math.max(40, Math.min(9000, o.r));
    const x = o.tx + o.r * Math.sin(o.ph) * Math.sin(o.th), y = o.ty + o.r * Math.cos(o.ph), z = o.tz + o.r * Math.sin(o.ph) * Math.cos(o.th);
    this.camera.position.set(x, Math.max(y, 4), z); this.camera.lookAt(o.tx, o.ty, o.tz);
    this.camera.far = Math.max(3000, o.r * 3.5); this.camera.updateProjectionMatrix();
    const fog = this.scene.fog; if (fog instanceof THREE.Fog) { fog.near = Math.max(200, o.r * 0.9); fog.far = Math.max(1600, o.r * 3.4); }
  }
}
