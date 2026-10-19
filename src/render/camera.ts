// The map's camera, moved like a map app's. Touch: one finger slides, two pinch towards themselves, twist to turn and
// drag up or down together to tilt, and a double tap zooms in where it lands. Mouse: drag slides, right-drag or
// Ctrl-drag orbits, the wheel zooms towards the cursor. Keys: arrows or WASD move, Q and E turn, + and - zoom.
// Fly-tos (focus, frame, north) lift on a long move to show where they're going, and are instant with reduced motion.
// It never goes below the ground, and where it looks stays near the line, sliding along it.
import * as THREE from 'three';
import { groundAt } from './terrain.ts';

/** Where the camera looks (tx, ty, tz), how far away it is (r) and from which angles (th around, ph down). th 0 has
 * north (towards Manchester, -z) up the screen. */
export interface Orbit { tx: number; ty: number; tz: number; r: number; th: number; ph: number }
const ORBIT_KEYS: (keyof Orbit)[] = ['tx', 'ty', 'tz', 'r', 'th', 'ph'];
const AIM_KEYS: (keyof Orbit)[] = ['r', 'th', 'ph'];
/** The nearest point on the line to (x, z), written into a reused object. */
export type NearLine = (x: number, z: number) => { x: number; z: number };
interface Fly { from: Orbit; to: Orbit; t: number; dur: number; lift: number; keys: (keyof Orbit)[] }
interface Ptr { x: number; y: number; x0: number; y0: number; t0: number }
/** The angle a into -pi..pi. */
export const wrapPi = (a: number): number => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;
// R_MAX holds the whole network on a phone held upright (Whole line, fitAll); far off, the map leaves out the kits and
// the real buildings and trees (KIT_FAR in src/main.ts, FAR_ALL in src/render/buildings.ts)
const R_MIN = 12, R_MAX = 24000, PH_MIN = 0.1, PH_MAX = 1.5;
const FIT_X = 90, FIT_Y = 40;   // pixels kept clear round each point fitAll holds: half a name's width, and its height
/** How far from the line the camera may look: a few hundred metres close in, more when zoomed out to see the line. */
const nearLimit = (r: number) => Math.max(300, r * 0.35);
const NEAR_PER = 0.015, NEAR_MAX = 200;  // the near plane: this much of the camera's distance, 1 m to NEAR_MAX m
const KEY_PAN: Record<string, [number, number]> = { ArrowUp: [0, 1], KeyW: [0, 1], ArrowDown: [0, -1], KeyS: [0, -1], ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0] };
const KEYS = new Set([...Object.keys(KEY_PAN), 'KeyQ', 'KeyE', 'Equal', 'NumpadAdd', 'Minus', 'NumpadSubtract']);
/** A control that keeps the keys for itself while it has focus. */
const ownsKeys = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(t.tagName));

export class OrbitRig {
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  o: Orbit;
  tween: Fly | null = null;
  /** Instant moves for players who ask for reduced motion. */
  reduced = false;
  /** What the camera rides alongside (a train) until the player moves. */
  riding: THREE.Object3D | null = null;
  /** Keeps where the camera looks near the line; null leaves it free. */
  line: NearLine | null = null;
  /** A tap on the map (not a drag), in client pixels. */
  onTap: ((x: number, y: number) => void) | null = null;
  /** Counts the player's own moves, for the checks. */
  moves = 0;
  /** How much of the canvas the page's sheet covers, in pixels at its left and bottom: where the camera looks is
   * drawn in the middle of the rest, so focus and fly-tos frame into the open map. */
  cover = { left: 0, bottom: 0 };
  private canvas: HTMLCanvasElement;
  private keys = new Set<string>();
  private ptrs = new Map<number, Ptr>();
  private mode: 'pan' | 'orbit' | 'two' | null = null;
  private grab = new THREE.Vector3(); private grabbed = false;
  private two = { d: 0, a: 0, mx: 0, my: 0, sx: 0, sy: 0, sd: 0, sa: 0, lock: '' as '' | 'tilt' | 'pinch' };
  private multi = false;
  private lastTap = { t: 0, x: 0, y: 0 };
  private fitCam = new THREE.PerspectiveCamera(); private v = new THREE.Vector3(); private box = new THREE.Box3(); private hitA = new THREE.Vector3(); private hitB = new THREE.Vector3();
  constructor(camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement, scene: THREE.Scene) {
    this.camera = camera; this.scene = scene; this.canvas = canvas;
    this.o = { tx: 0, ty: 2, tz: 0, r: 230, th: 5.5, ph: 1.2 };
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e, true)); canvas.addEventListener('pointercancel', e => this.up(e, false));
    canvas.addEventListener('wheel', e => {
      e.preventDefault(); this.handover();
      const k = Math.exp(Math.max(-60, Math.min(60, e.deltaY * (e.deltaMode === 1 ? 16 : 1))) * 0.0024);
      this.keepUnder(e.clientX, e.clientY, e.clientX, e.clientY, k, 0);
    }, { passive: false });
    addEventListener('keydown', e => {
      if (!KEYS.has(e.code) || e.ctrlKey || e.metaKey || e.altKey || ownsKeys(e.target)) return;
      e.preventDefault(); this.keys.add(e.code); this.handover();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  // ---- pointers ----
  private down(e: PointerEvent): void {
    this.canvas.setPointerCapture(e.pointerId);
    if (ownsKeys(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: e.timeStamp });
    if (this.ptrs.size > 1) this.multi = true;
    this.handover(); this.regrip(e);
  }
  /** Start the gesture the pointers down now make. */
  private regrip(e: PointerEvent): void {
    const n = this.ptrs.size;
    if (n === 1) {
      const p = [...this.ptrs.values()][0]!;
      this.mode = e.pointerType === 'mouse' && (e.button === 2 || e.ctrlKey || (e.buttons & 2) !== 0) ? 'orbit' : 'pan';
      this.grabbed = this.mode === 'pan' && this.ground(p.x, p.y, this.grab);
    } else if (n === 2) {
      const [a, b] = [...this.ptrs.values()] as [Ptr, Ptr];
      const t = this.two; t.d = Math.hypot(b.x - a.x, b.y - a.y); t.a = Math.atan2(b.y - a.y, b.x - a.x); t.mx = (a.x + b.x) / 2; t.my = (a.y + b.y) / 2;
      t.sx = t.mx; t.sy = t.my; t.sd = t.d; t.sa = t.a; t.lock = ''; this.mode = 'two';
    } else this.mode = null;
  }
  private move(e: PointerEvent): void {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (!dx && !dy) return;
    if (this.mode === 'orbit') { this.o.th -= dx * 0.006; this.o.ph -= dy * 0.005; this.moves++; }
    else if (this.mode === 'pan') this.slide(p.x, p.y, dx, dy);
    else if (this.mode === 'two') {
      const [a, b] = [...this.ptrs.values()] as [Ptr, Ptr], t = this.two;
      const d = Math.hypot(b.x - a.x, b.y - a.y), ang = Math.atan2(b.y - a.y, b.x - a.x), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      // two fingers dragged up or down together tilt; anything else pinches, twists and slides round the fingers
      if (!t.lock && Math.hypot(mx - t.sx, my - t.sy) + Math.abs(d - t.sd) + Math.abs(wrapPi(ang - t.sa)) * d / 2 > 14)
        t.lock = Math.abs(my - t.sy) > 2 * (Math.abs(d - t.sd) + Math.abs(wrapPi(ang - t.sa)) * d / 2) && Math.abs(my - t.sy) > 1.5 * Math.abs(mx - t.sx) ? 'tilt' : 'pinch';
      if (t.lock === 'tilt') { this.o.ph -= (my - t.my) * 0.006; this.moves++; }
      else if (t.lock === 'pinch' && d > 4 && t.d > 4) this.keepUnder(t.mx, t.my, mx, my, t.d / d, wrapPi(ang - t.a));
      // until the gesture locks the fingers' start stands, so what they did before it counts once it does
      if (t.lock) { t.d = d; t.a = ang; t.mx = mx; t.my = my; }
    }
    this.clampAim();
  }
  private up(e: PointerEvent, ended: boolean): void {
    const p = this.ptrs.get(e.pointerId); if (!p) return;
    this.ptrs.delete(e.pointerId);
    const now = e.timeStamp, still = Math.hypot(p.x - p.x0, p.y - p.y0) < 9 && now - p.t0 < 400;
    if (ended && still && !this.multi && this.ptrs.size === 0 && e.button !== 2) {
      const l = this.lastTap;
      if (now - l.t < 320 && Math.hypot(p.x - l.x, p.y - l.y) < 36) { l.t = 0; this.zoomAt(p.x, p.y, 0.45); }
      else { l.t = now; l.x = p.x; l.y = p.y; this.onTap?.(p.x, p.y); }
    }
    if (this.ptrs.size === 0) { this.multi = false; this.mode = null; } else this.regrip(e);
  }
  /** Slide the map so the ground grabbed stays under the pointer. */
  private slide(x: number, y: number, dx: number, dy: number): void {
    const o = this.o; this.moves++;
    if (this.grabbed && this.ground(x, y, this.hitA, this.grab.y)) {
      let mx = this.grab.x - this.hitA.x, mz = this.grab.z - this.hitA.z; const m = Math.hypot(mx, mz), cap = o.r * 0.5;
      if (m > cap) { mx *= cap / m; mz *= cap / m; }    // near the horizon a pixel is a long way: never leap
      o.tx += mx; o.tz += mz;
    } else {
      // the pointer's above the horizon: slide by the screen instead
      const k = o.r * 0.0025, s = Math.sin(o.th), c = Math.cos(o.th);
      o.tx -= (dx * c + dy * s) * k; o.tz -= (-dx * s + dy * c) * k;
    }
    this.clampLine(); this.place();
  }
  /** Zoom by k and turn by dth, keeping the ground under (ax, ay) under (bx, by): zoom towards the fingers or cursor. */
  private keepUnder(ax: number, ay: number, bx: number, by: number, k: number, dth: number): void {
    const o = this.o, had = this.ground(ax, ay, this.hitA);
    o.r = Math.max(R_MIN, Math.min(R_MAX, o.r * k)); o.th += dth; this.moves++;
    this.place();
    if (had && this.ground(bx, by, this.hitB, this.hitA.y)) {
      let mx = this.hitA.x - this.hitB.x, mz = this.hitA.z - this.hitB.z; const m = Math.hypot(mx, mz), cap = o.r;
      if (m > cap) { mx *= cap / m; mz *= cap / m; }
      o.tx += mx; o.tz += mz;
    }
    this.clampLine(); this.place();
  }
  /** Fly in towards a point on the screen (a double tap). */
  zoomAt(x: number, y: number, k: number): void {
    const was = { ...this.o };
    this.keepUnder(x, y, x, y, k, 0);
    const to = { ...this.o }; Object.assign(this.o, was); this.place();
    this.fly(to);
  }
  /** Where a screen point's ray meets the level ground at height h (where the camera looks, unless given). */
  ground(x: number, y: number, out: THREE.Vector3, h = this.o.ty): boolean {
    const r = this.canvas.getBoundingClientRect(); if (!r.width || !r.height) return false;
    const cam = this.camera.position, v = this.v.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1, 0.5).unproject(this.camera).sub(cam);
    if (v.y > -1e-4) return false;
    const t = (h - cam.y) / v.y; if (t <= 0) return false;
    out.set(cam.x + v.x * t, h, cam.z + v.z * t);
    return Math.hypot(out.x - cam.x, out.z - cam.z) < this.o.r * 8;
  }
  /** The player took over: stop flying and riding. */
  private handover(): void { this.tween = null; this.riding = null; }

  // ---- moves from the game ----
  focus(x: number, z: number, r = 230, th = 5.5, ph = 1.2): void { this.fly({ tx: x, ty: 2, tz: z, r, th, ph }); }
  /** Frame a box in the world (a station's new parts): look at its middle from the angle the player has now, a little
   * higher, near enough that it fills the view but never nearer than a platform's length (or `near`, for small things). */
  frame(b: THREE.Box3, near = 70): void {
    const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2, size = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
    this.fly({ tx: cx, ty: Math.min(6, (b.min.y + b.max.y) / 2), tz: cz, r: Math.max(near, Math.min(600, size * 1.5)), th: this.o.th, ph: Math.min(this.o.ph, 1.05) });
  }
  /** Fly to the nearest view that holds every point (x, z on the ground, and the half-width in pixels of the name
   * drawn centred on it, FIT_X if not given) on the open map, beside or above the sheet, with room for its name
   * (FIT_Y up) and clear of the top bar: the middle of their extent, from whichever of eight turns and three tilts
   * needs the least distance (see below for the ties and a screen too narrow for the names). now: there at once, with no
   * flight (coming back after time away starts there). */
  fitAll(pts: [number, number, number?][], now = false): void {
    if (!pts.length) return;
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const tx = (x0 + x1) / 2, tz = (z0 + z1) / 2, cam = this.fitCam.copy(this.camera), v = this.v;
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    // the open map in the picture's -1..1, less room for each name either side (centred on its point) and above
    const left = Math.min(this.cover.left, w * 0.8), yb = -1 + 2 * (Math.min(this.cover.bottom, h * 0.8) + FIT_Y) / h, yt = 1 - 2 * (FIT_Y + 60) / h;
    /** How many of the points a view holds, each with half its name's width beside it (or `only` pixels). */
    const held = (r: number, th: number, ph: number, only?: number): number => {
      cam.position.set(tx + r * Math.sin(ph) * Math.sin(th), 2 + r * Math.cos(ph), tz + r * Math.sin(ph) * Math.cos(th));
      cam.lookAt(tx, 2, tz); cam.far = r * 4; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      let n = 0;
      for (const [x, z, name = FIT_X] of pts) {
        const half = only ?? name; v.set(x, 0, z).project(cam);
        if (v.z < 1 && v.x >= -1 + 2 * (left + half) / w && v.x <= 1 - 2 * half / w && v.y >= yb && v.y <= yt) n++;
      }
      return n;
    };
    // the nearest view holding them all with their names, the turn nearest the camera's own unless another is nearer
    // by a seventh; failing that (a narrow screen), holding all the points, whose names give way where they overlap
    // (src/main.ts); failing that, the view at R_MAX holding most
    let best: Orbit | null = null, all = false, most = -1;
    for (const only of [undefined, 24]) {
      for (let k = 0; k < 8; k++) for (const ph of [0.5, 0.7, 0.9]) {
        const th = this.o.th + wrapPi(k * Math.PI / 4 - this.o.th), n = held(R_MAX, th, ph, only);
        if (n < pts.length) { if (!all && n > most) { most = n; best = { tx, ty: 2, tz, r: R_MAX, th, ph }; } continue; }
        let lo = 500, hi = R_MAX;
        for (let q = 0; q < 16; q++) { const mid = (lo + hi) / 2; if (held(mid, th, ph, only) === pts.length) hi = mid; else lo = mid; }
        const turn = Math.abs(wrapPi(th - this.o.th)), was = best ? Math.abs(wrapPi(best.th - this.o.th)) : Infinity;
        if (!all || !best || hi < best.r * (turn < was - 0.01 ? 1.15 : turn > was + 0.01 ? 0.85 : 1)) { best = { tx, ty: 2, tz, r: hi, th, ph }; all = true; }
      }
      if (all) break;
    }
    const to = best ?? { tx, ty: 2, tz, r: R_MAX, th: this.o.th, ph: 0.7 };
    if (now) { this.handover(); to.th = this.o.th + wrapPi(to.th - this.o.th); Object.assign(this.o, to); this.place(); } else this.fly(to);
  }
  /** Put north back up the screen. */
  north(): void { this.fly({ ...this.o, th: 0 }); }
  /** Ride alongside something that moves (a train) until the player moves. */
  ride(obj: THREE.Object3D): void {
    this.riding = null; this.fly({ ...this.o, r: Math.min(this.o.r, 160), ph: Math.min(this.o.ph, 1.1) }, AIM_KEYS); this.riding = obj;
  }
  /** Glide to a point on the ground at once, keeping the angle (the strip's slider). */
  glide(x: number, z: number): void { this.handover(); this.o.tx = x; this.o.tz = z; this.moves++; }
  /** Ease out, across and in: a long move lifts so the player sees where it's going. Instant with reduced motion. */
  fly(to: Orbit, keys = ORBIT_KEYS): void {
    this.riding = null;
    const o = this.o; to.th = o.th + wrapPi(to.th - o.th);
    if (this.reduced) { for (const k of keys) o[k] = to[k]; this.tween = null; return; }
    const dist = keys === ORBIT_KEYS ? Math.hypot(to.tx - o.tx, to.tz - o.tz) : 0;
    this.tween = { from: { ...o }, to, t: 0, dur: 0.7 + Math.min(1.1, dist / 5000), lift: Math.max(0, Math.min(6000, dist * 0.6 - Math.max(o.r, to.r))), keys };
  }

  /** realDt: the frame's real time, so a flight takes about its time however slow the frames (under software
   * rendering a frame can take seconds), but at most half a second a frame, so it's still seen on its way; riding a train
   * keeps up with it the same way; everything else moves by dt. */
  update(dt: number, realDt = dt): void {
    const o = this.o;
    if (this.tween) {
      const tw = this.tween; tw.t = Math.min(1, tw.t + Math.min(0.5, realDt) / tw.dur); const e = tw.t * tw.t * (3 - 2 * tw.t);
      for (const k of tw.keys) o[k] = tw.from[k] + (tw.to[k] - tw.from[k]) * e;
      o.r += tw.lift * Math.sin(Math.PI * tw.t);
      if (tw.t >= 1) this.tween = null;
    }
    // a unit's group stands at the origin and its cars move within it, so it rides with the middle of what it holds
    if (this.riding) {
      if (!this.riding.visible) this.riding = null;
      else { this.box.setFromObject(this.riding).getCenter(this.v); const k = 1 - Math.exp(-Math.min(0.5, realDt) * 5); o.tx += (this.v.x - o.tx) * k; o.tz += (this.v.z - o.tz) * k; o.ty += (Math.max(2, this.v.y + 2) - o.ty) * k; }
    }
    if (this.keys.size) {
      const kk = this.keys; let f = 0, s = 0;
      for (const c of kk) { const m = KEY_PAN[c]; if (m) { s += m[0]; f += m[1]; } }
      const step = o.r * 0.9 * dt, sn = Math.sin(o.th), cs = Math.cos(o.th);
      // forward is where the camera faces along the ground (-sin th, -cos th); right is (cos th, -sin th)
      o.tx += (-sn * f + cs * s) * step; o.tz += (-cs * f - sn * s) * step;
      if (kk.has('KeyQ')) o.th -= 1.4 * dt; if (kk.has('KeyE')) o.th += 1.4 * dt;
      if (kk.has('Equal') || kk.has('NumpadAdd')) o.r *= Math.exp(-1.3 * dt);
      if (kk.has('Minus') || kk.has('NumpadSubtract')) o.r *= Math.exp(1.3 * dt);
      this.moves++;
    }
    this.clampAim();
    if (!this.tween) this.clampLine();
    this.place();
    // the near plane moves out with the camera: the depth buffer's precision goes as near over distance squared, and at 1 m
    // a road 0.12 m over the ground flickered through it from a kilometre or two away
    this.camera.near = Math.min(NEAR_MAX, Math.max(1, o.r * NEAR_PER));
    this.camera.far = Math.max(3000, o.r * 3.5); this.offset(); this.camera.updateProjectionMatrix();
    const fog = this.scene.fog; if (fog instanceof THREE.Fog) { fog.near = Math.max(200, o.r * 0.9); fog.far = Math.max(1600, o.r * 3.4); }
  }
  /** Shift the picture so the middle of the open map (beside or above the sheet) is where the camera looks. */
  private offset(): void {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight, cam = this.camera, v = cam.view;
    const x = -Math.min(this.cover.left, w * 0.8) / 2, y = Math.min(this.cover.bottom, h * 0.8) / 2;
    if ((!x && !y) || !w || !h) { if (v?.enabled) cam.clearViewOffset(); return; }
    if (v?.enabled && v.fullWidth === w && v.fullHeight === h && v.offsetX === x && v.offsetY === y && v.width === w && v.height === h) return;
    cam.setViewOffset(w, h, x, y, w, h);
  }
  private clampAim(): void { const o = this.o; o.ph = Math.max(PH_MIN, Math.min(PH_MAX, o.ph)); o.r = Math.max(R_MIN, Math.min(R_MAX, o.r)); }
  /** Keep where the camera looks within reach of the line, sliding along it rather than stopping dead. */
  private clampLine(): void {
    if (!this.line) return;
    const o = this.o, p = this.line(o.tx, o.tz), dx = o.tx - p.x, dz = o.tz - p.z, d = Math.hypot(dx, dz), lim = nearLimit(o.r);
    if (d > lim) { o.tx = p.x + dx * lim / d; o.tz = p.z + dz * lim / d; }
  }
  /** Put the camera where the orbit says, never lower than 4 m over the ground beneath it, so a view from the valley
   * floor works and none from inside a hill. */
  private place(): void {
    const o = this.o;
    const x = o.tx + o.r * Math.sin(o.ph) * Math.sin(o.th), y = o.ty + o.r * Math.cos(o.ph), z = o.tz + o.r * Math.sin(o.ph) * Math.cos(o.th);
    this.camera.position.set(x, y > 400 ? y : Math.max(y, groundAt(x, z) + 4), z); this.camera.lookAt(o.tx, o.ty, o.tz);
    this.camera.updateMatrixWorld();
  }
}
