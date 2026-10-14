// Strain on the map: where the network hurts, drawn as soft warm glows from amber (--map-strain-1) to coral
// (--map-strain-2) while the Strain view is on (docs/design/buying.md, section 6): a glow on each crowded platform face,
// the walk home of people giving up (a thin trail of figures into the station's streets), the stretch of line behind
// each late departure, the outline of a full car park, a section of line where trains lose time against its line speed
// (along its ballast) and a junction where trains stand held (along the line through it). They breathe slowly (still with reduced motion), keep a
// least size on screen so each stays tappable, and a strong one carries its figure on the glass pill, giving way as
// station names do. While it's on, the reach glow steps back. Only the view: it reads src/ui/strain.ts's figures and
// changes nothing in the game. Fetched the first time the view is turned on, and it runs its own frames only while
// it shows, so with the view off it costs nothing.
import * as THREE from 'three';
import type { Network } from '../sim/network.ts';
import type { Sim } from '../sim/sim.ts';
import type { BuiltStation } from './stations.ts';
import { groundAt } from './terrain.ts';
import { CROWD_FROM, HELD_CORAL, HELD_FROM, LATE_CORAL, LATE_FROM, SLOW_CORAL, SLOW_FROM, type StrainRead } from '../ui/strain.ts';

/** Glows keep at least this many CSS pixels across on screen, so a stretch or a stop stays tappable at 320 px. */
const LEAST_PX = 40;
/** A figure shows only on a glow at least this strong, and only this near the camera. */
const STRONG = 0.6, FIG_NEAR = 2600;
/** A figure's height on screen, as the station names' (main.ts). */
const FIG_H = 24;
/** One slow breath, in seconds; and how fast the view fades in and out, a second. */
const BREATH = 4.5, FADE = 3;
/** A held junction glows along the line this many metres either side of it. */
const HELD_REACH = 120;
/** The walk home: its length (m), and the most figures on it. */
const WALK = 140, WALKERS = 14;

export interface StrainView {
  scene: THREE.Scene; net: Network; built: BuiltStation[]; camera: THREE.PerspectiveCamera; canvas: HTMLCanvasElement;
  /** The ground's material, where the reach glow is drawn: it steps back while Strain shows. */
  ground: THREE.Material;
  /** Where the figures go (the station names' layer), and the sim as it is now. */
  labels: HTMLElement; sim: () => Sim; reduced: boolean;
}
type Kind = 'crowd' | 'walk' | 'late' | 'park' | 'slow' | 'held';
/** One glow as drawn: what it's of, the place its tap opens, how strong (0 to 1), its figure, and where it stands on
 * the screen this frame (points along it, for the tap). */
interface Glow {
  kind: Kind; key: string; place: string; s: number; fig: string; mesh: THREE.Mesh; mat: THREE.ShaderMaterial;
  /** Points along it in the world (a rectangle's two ends along its middle), and the same on screen this frame. */
  pts: THREE.Vector3[]; scr: number[];
  /** A rectangle's size in metres (along, across); how far either side of its line a tap still hits it, in pixels. */
  size: [number, number]; reach: number;
  on: boolean; label: HTMLElement | null; labelW: number; lx: number; ly: number; lz: number;
}

const RECT_V = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// a soft rectangle (uLine 0) or a soft outline uLine metres in from its edge, uSize metres across as drawn
const RECT_F = `uniform vec3 uC; uniform float uA; uniform vec2 uSize; uniform float uLine; varying vec2 vUv;
void main() {
  vec2 m = vUv * uSize; float d = min(min(m.x, uSize.x - m.x), min(m.y, uSize.y - m.y));
  float a = uLine > 0.0 ? exp(-pow((d - uLine) / uLine, 2.0)) : smoothstep(0.0, min(uSize.x, uSize.y) * 0.42, d);
  gl_FragColor = vec4(uC, uA * a);
}`;
// a ribbon along a polyline: each point's normal pushed out uHalf metres either side, soft across and at its ends
const RIB_V = `attribute float aSide; attribute vec2 aN; attribute float aT; uniform float uHalf; varying float vSide; varying float vT;
void main() { vSide = aSide; vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position + vec3(aN.x, 0.0, aN.y) * aSide * uHalf, 1.0); }`;
const RIB_F = `uniform vec3 uC; uniform float uA; varying float vSide; varying float vT;
void main() { float a = (1.0 - smoothstep(0.25, 1.0, abs(vSide))) * smoothstep(0.0, 0.12, vT) * smoothstep(0.0, 0.12, 1.0 - vT); gl_FragColor = vec4(uC, uA * a); }`;

function token(name: string, fallback: string): THREE.Color {
  const v = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).getPropertyValue(`--map-${name}`).trim() : '';
  return new THREE.Color(v || fallback);
}

export class StrainLayer {
  private o: StrainView; private read: StrainRead;
  private group = new THREE.Group(); private glows = new Map<string, Glow>();
  private c1 = token('strain-1', '#ffb347'); private c2 = token('strain-2', '#ff6b5b');
  private fade = 0; private target = 0; private t = 0; private breath = 1; private running = false; private acc = 1;
  private back = { value: 0 };
  private walkers: THREE.InstancedMesh;
  private plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0.5);
  private v = new THREE.Vector3(); private m4 = new THREE.Matrix4();
  /** Where each station's streets are, across the line (+1 or -1 in v), from its kit's street parts. */
  private side: number[];
  private prev = 0;
  constructor(o: StrainView, read: StrainRead) {
    this.o = o; this.read = read;
    this.group.name = 'strain'; this.group.renderOrder = 5; o.scene.add(this.group);
    const fig = new THREE.CylinderGeometry(0.5, 0.5, 2.2, 6).translate(0, 1.1, 0);
    this.walkers = new THREE.InstancedMesh(fig, new THREE.MeshBasicMaterial({ color: this.c2, transparent: true, depthTest: false, fog: false }), o.built.length * WALKERS);
    this.walkers.count = 0; this.walkers.frustumCulled = false; this.walkers.renderOrder = 6; this.group.add(this.walkers);
    this.side = o.built.map(b => { let n = 0; for (const p of b.kit.parts) if (p.street && 'v0' in p) n += (p.v0 + p.v1) > 0 ? 1 : -1; return n < 0 ? -1 : 1; });
    this.stepBack(o.ground);
  }
  /** Turn the view on or off: the glows fade in (at once with reduced motion) and the reach steps back. */
  setOn(on: boolean): void {
    this.target = on ? 1 : 0;
    if (!this.running) { this.running = true; this.prev = -1; requestAnimationFrame(n => this.frame(n)); }
  }
  /** The place a tap at client (x, y) is on a glow of, or null: the nearest glow within its least size on screen. */
  tap(x: number, y: number): string | null {
    if (this.target < 1) return null;
    const r = this.o.canvas.getBoundingClientRect(), px = x - r.left, py = y - r.top;
    let best: string | null = null, bd = Infinity;
    for (const g of this.glows.values()) {
      if (!g.on) continue;
      const s = g.scr;
      for (let k = 0; k + 1 < s.length; k += 2) {
        const ax = s[k]!, ay = s[k + 1]!, bx = s[k + 2] ?? ax, by = s[k + 3] ?? ay, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const u = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0, d = Math.hypot(px - ax - u * dx, py - ay - u * dy);
        if (d <= g.reach && d < bd) { bd = d; best = g.place; }
      }
    }
    return best;
  }
  /** For the checks: how many of each kind of glow are drawn, the strongest, the figures showing, the walkers, the
   * reach's step back, where each glow stands on screen, and whether the layer is running frames. */
  stats(): { on: number; kinds: Record<Kind, number>; strongest: number; figures: string[]; walkers: number; back: number; breath: number; running: boolean; spots: { place: string; kind: Kind; x: number; y: number; w: number }[] } {
    const kinds: Record<Kind, number> = { crowd: 0, walk: 0, late: 0, park: 0, slow: 0, held: 0 }, figures: string[] = [], spots: { place: string; kind: Kind; x: number; y: number; w: number }[] = [];
    let strongest = 0, on = 0;
    const r = this.o.canvas.getBoundingClientRect();
    for (const g of this.glows.values()) {
      if (!g.on) continue; on++; kinds[g.kind]++; strongest = Math.max(strongest, g.s);
      if (g.label && g.label.style.display !== 'none') figures.push(g.label.textContent ?? '');
      if (g.scr.length) spots.push({ place: g.place, kind: g.kind, x: r.left + g.lx, y: r.top + g.ly, w: g.reach * 2 });
    }
    return { on: this.target === 1 ? on : 0, kinds, strongest, figures, walkers: this.walkers.count, back: this.back.value, breath: this.breath, running: this.running, spots };
  }

  // ---- the reach steps back ----
  /** Add a step back to the ground's reach glow: its glow and outer ring drawn fainter by `back` (0 to 1). The reach's
   * own shader (src/render/reach.ts) is left as it is; this adds to it, and does nothing if its words change. */
  private stepBack(mat: THREE.Material): void {
    const was = mat.onBeforeCompile.bind(mat), back = this.back;
    mat.onBeforeCompile = (shader, r) => {
      was(shader, r);
      shader.uniforms['uStrainBack'] = back;
      shader.fragmentShader = 'uniform float uStrainBack;\n' + shader.fragmentShader.replace('diffuseColor.rgb = mix(diffuseColor.rgb, uOuter, outA * 0.6);', 'glowA *= 1.0 - 0.8 * uStrainBack; outA *= 1.0 - 0.8 * uStrainBack;\ndiffuseColor.rgb = mix(diffuseColor.rgb, uOuter, outA * 0.6);');
    };
    mat.needsUpdate = true;
  }

  // ---- a frame ----
  private frame(now: number): void {
    // the frame's own time (a check may step it), never back and at most a tenth of a second
    const dt = this.prev < 0 ? 0 : Math.max(0, Math.min(0.1, (now - this.prev) / 1000)); this.prev = now;
    const o = this.o, reduced = o.reduced;
    this.fade = reduced ? this.target : this.fade + (this.target - this.fade) * Math.min(1, dt * FADE);
    if (Math.abs(this.fade - this.target) < 0.01) this.fade = this.target;
    this.back.value = this.fade; this.group.visible = this.fade > 0;
    if (this.fade === 0 && this.target === 0) { this.running = false; for (const g of this.glows.values()) if (g.label) g.label.style.display = 'none'; return; }
    this.t += dt;
    // what to draw from the sim's figures, a few times a second
    this.acc += dt; if (this.acc > 0.25) { this.acc = 0; this.update(o.sim()); }
    const breath = this.breath = reduced ? 1 : 0.82 + 0.18 * Math.sin(this.t * 2 * Math.PI / BREATH);
    const cam = o.camera, H = o.canvas.clientHeight || 1, W = o.canvas.clientWidth || 1, tan = Math.tan(cam.fov * Math.PI / 360);
    for (const g of this.glows.values()) {
      g.mesh.visible = g.on; if (!g.on) continue;
      // the least size on screen: the metres LEAST_PX spans at the glow's nearest point
      let near = Infinity; for (const p of g.pts) near = Math.min(near, p.distanceTo(cam.position));
      const least = LEAST_PX * 2 * near * tan / H, pxm = LEAST_PX / least;
      const c = g.mat.uniforms['uC']!.value as THREE.Color; c.copy(this.c1).lerp(this.c2, g.s);
      g.mat.uniforms['uA']!.value = (0.32 + 0.36 * g.s) * breath * this.fade;
      if (g.kind === 'late' || g.kind === 'walk' || g.kind === 'slow' || g.kind === 'held') { const half = Math.max(g.kind === 'walk' ? 3 : g.kind === 'late' ? 4 : 6, least / 2); g.mat.uniforms['uHalf']!.value = half; g.reach = half * pxm; }
      else {
        const [w, d] = g.size, sw = Math.max(w, least), sd = Math.max(d, least);
        g.mesh.scale.set(sw, 1, sd); g.mesh.position.x = (g.mesh.userData['cu'] as number) - sw / 2; g.mesh.position.z = (g.mesh.userData['cv'] as number) - sd / 2;
        (g.mat.uniforms['uSize']!.value as THREE.Vector2).set(sw, sd);
        if (g.kind === 'park') g.mat.uniforms['uLine']!.value = Math.max(1.2, least * 0.12);
        g.reach = sd / 2 * pxm;
      }
      // where it stands on screen, for the tap and its figure
      g.scr.length = 0;
      for (const p of g.pts) { this.v.copy(p).project(cam); if (this.v.z <= 1) g.scr.push((this.v.x + 1) / 2 * W, (1 - this.v.y) / 2 * H); }
      g.lz = near; const k = Math.floor(g.scr.length / 4) * 2; g.lx = g.scr[k] ?? -1e4; g.ly = g.scr[k + 1] ?? -1e4;
      // a rectangle's figure sits at its middle
      if (g.scr.length === 4) { g.lx = (g.scr[0]! + g.scr[2]!) / 2; g.ly = (g.scr[1]! + g.scr[3]!) / 2; }
    }
    this.walk(reduced);
    if (this.acc === 0) this.figures(); else this.placeFigures();
    requestAnimationFrame(n => this.frame(n));
  }

  /** Read the sim's figures into glows: make the ones that are new, update the rest, and let go of the ones gone. */
  private update(sim: Sim): void {
    const o = this.o, read = this.read; read.tick(sim);
    for (const g of this.glows.values()) g.on = false;
    o.built.forEach((b, i) => {
      const place = sim.P.station[i]!;
      const c = read.crowd(i);
      if (c) {
        const s = Math.min(1, (c.waiting / c.cap - CROWD_FROM) / (1 - CROWD_FROM)), faces = [b.kit.faces.north, b.kit.faces.south];
        faces.forEach((F, d) => {
          if (c.faces[d]! < 0.1 * c.waiting) return;
          const g = this.rect(`crowd|${i}|${d}`, 'crowd', place, b, F.u0, F.u1, ...this.faceV(b, i, d));
          g.on = true; g.s = s; g.fig = `${c.waiting} / ${c.cap}`;
        });
      }
      const lost = read.gaveUp(i);
      if (lost) { const g = this.walkGlow(i, b, place); g.on = true; g.s = Math.min(1, lost / 40); g.fig = `${lost} gave up`; }
      const park = read.parkFull(i);
      if (park) for (const [k, p] of b.kit.parts.entries()) {
        if (p.type !== 'carpark' || !this.shows(sim, i, p)) continue;
        const g = this.rect(`park|${i}|${k}`, 'park', place, b, p.u0, p.u1, p.v0, p.v1, (p.y ?? 0) + 0.3, p.street);
        g.on = true; g.s = 0.75; g.fig = `${park.parked} / ${park.spaces}`;
      }
    });
    for (const L of read.late.values()) {
      const route = `route:${L.svc}`, g = this.ribbon(L, sim);
      if (!g) continue;
      g.on = true; g.s = Math.min(1, Math.max(0, (L.min - LATE_FROM) / (LATE_CORAL - LATE_FROM)));
      g.place = sim.P.byId.has(route) ? route : sim.P.station[L.i]!; g.fig = `${Math.round(L.min)} min late`;
    }
    // slow sections along their ballast, held junctions along the line through them
    for (const x of sim.secs) {
      const m = read.slowOn(x.id); if (!m) continue;
      const g = this.along(`slow|${x.id}`, 'slow', x.id, x.corridor, x.s0, x.s1);
      g.on = true; g.s = Math.min(1, Math.max(0, (m - SLOW_FROM) / (SLOW_CORAL - SLOW_FROM))); g.fig = `${Math.round(m)} min lost`;
    }
    for (const j of o.net.junctions) {
      const id = `junction:${j.id}`, m = read.heldAt(id); if (!m) continue;
      const g = this.along(`held|${j.id}`, 'held', id, j.corridor, j.s - HELD_REACH, j.s + HELD_REACH);
      g.on = true; g.s = Math.min(1, Math.max(0, (m - HELD_FROM) / (HELD_CORAL - HELD_FROM))); g.fig = `${m < 1 ? '<1' : Math.round(m)} min held`;
    }
  }
  /** Whether a kit's part shows with what's built at station i. */
  private shows(sim: Sim, i: number, p: { upgrade?: string | string[]; until?: string }): boolean {
    const ups = sim.ups(i) as Record<string, boolean | undefined>, needs = p.upgrade === undefined ? [] : Array.isArray(p.upgrade) ? p.upgrade : [p.upgrade];
    return needs.every(x => ups[x]) && !(p.until && ups[p.until]);
  }
  /** A face's waiting area across the line: from its edge back into the platform, away from its track. */
  private faceV(b: BuiltStation, i: number, d: number): [number, number, number] {
    const F = d === 0 ? b.kit.faces.north : b.kit.faces.south, net = this.o.net, st = net.stations[i]!;
    const svc = net.boardingService(st.id, d === 0 ? 'north' : 'south'), tv = svc ? net.offsetAt(net.route(svc).track(st.s, d === 0 ? 1 : -1), st.s) : 0;
    const back = (F.depth ?? 4) * (F.v >= tv ? 1 : -1);
    return [Math.min(F.v, F.v + back), Math.max(F.v, F.v + back), 1.15];
  }
  /** A soft rectangle (or a car park's outline) in a station's frame, from u0 to u1 along and v0 to v1 across. */
  private rect(key: string, kind: Kind, place: string, b: BuiltStation, u0: number, u1: number, v0: number, v1: number, y: number, street = false): Glow {
    let g = this.glows.get(key);
    if (g) return g;
    const mat = new THREE.ShaderMaterial({ vertexShader: RECT_V, fragmentShader: RECT_F, transparent: true, depthWrite: false, depthTest: false, fog: false,
      uniforms: { uC: { value: new THREE.Color() }, uA: { value: 0 }, uSize: { value: new THREE.Vector2(1, 1) }, uLine: { value: kind === 'park' ? 1.5 : 0 } } });
    const mesh = new THREE.Mesh(this.plane, mat); mesh.renderOrder = 5; mesh.frustumCulled = false;
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    if (street) { b.group.updateMatrixWorld(); this.v.set(cu, 0, cv); b.group.localToWorld(this.v); y += groundAt(this.v.x, this.v.z); }
    mesh.position.set(u0, y, v0); mesh.userData['cu'] = cu; mesh.userData['cv'] = cv;
    b.group.add(mesh); b.group.updateMatrixWorld();
    const pts = [new THREE.Vector3(u0, y, cv), new THREE.Vector3(u1, y, cv)].map(p => b.group.localToWorld(p));
    g = { kind, key, place, s: 0, fig: '', mesh, mat, pts, scr: [], size: [u1 - u0, v1 - v0], reach: LEAST_PX / 2, on: false, label: null, labelW: 0, lx: 0, ly: 0, lz: 0 };
    this.glows.set(key, g);
    return g;
  }
  /** A ribbon along points in the world (each with its normal across, xz), as one mesh. */
  private ribbonMesh(pts: THREE.Vector3[], ns: [number, number][]): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
    const n = pts.length, pos = new Float32Array(n * 6), side = new Float32Array(n * 2), nrm = new Float32Array(n * 4), t = new Float32Array(n * 2), idx: number[] = [];
    pts.forEach((p, k) => {
      for (let j = 0; j < 2; j++) { pos.set([p.x, p.y, p.z], (k * 2 + j) * 3); side[k * 2 + j] = j ? 1 : -1; nrm.set(ns[k]!, (k * 2 + j) * 2); t[k * 2 + j] = n > 1 ? k / (n - 1) : 0.5; }
      if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    geo.setAttribute('aN', new THREE.BufferAttribute(nrm, 2)); geo.setAttribute('aT', new THREE.BufferAttribute(t, 1)); geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({ vertexShader: RIB_V, fragmentShader: RIB_F, transparent: true, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide,
      uniforms: { uC: { value: new THREE.Color() }, uA: { value: 0 }, uHalf: { value: 4 } } });
    const mesh = new THREE.Mesh(geo, mat); mesh.renderOrder = 5; mesh.frustumCulled = false;
    this.group.add(mesh);
    return { mesh, mat };
  }
  /** The stretch of line behind a late departure: on the track the train ran, from the stop before to the one it left. */
  private ribbon(L: { svc: string; i: number; back: number }, sim: Sim): Glow | null {
    const key = `late|${L.svc}|${L.i}|${L.back}`, had = this.glows.get(key); if (had) return had;
    const net = this.o.net, v = sim.svcs.find(x => x.id === L.svc); if (!v) return null;
    const a = net.stations[L.back]!.s, b = net.stations[L.i]!.s, dir = b > a ? 1 : -1, steps = Math.max(2, Math.ceil(Math.abs(b - a) / 40));
    const pts: THREE.Vector3[] = [], ns: [number, number][] = [];
    for (let k = 0; k <= steps; k++) {
      const s = a + (b - a) * k / steps, f = net.trackAt(v.path.track(s, dir), s);
      pts.push(new THREE.Vector3(f.x, 0.4, f.z)); ns.push([f.nx, f.nz]);
    }
    const { mesh, mat } = this.ribbonMesh(pts, ns);
    const g: Glow = { kind: 'late', key, place: '', s: 0, fig: '', mesh, mat, pts, scr: [], size: [0, 0], reach: LEAST_PX / 2, on: false, label: null, labelW: 0, lx: 0, ly: 0, lz: 0 };
    this.glows.set(key, g);
    return g;
  }
  /** A ribbon along a corridor's middle from s0 to s1 (a section's ballast, or the line through a junction). */
  private along(key: string, kind: Kind, place: string, corridor: string, s0: number, s1: number): Glow {
    const had = this.glows.get(key); if (had) return had;
    const net = this.o.net, steps = Math.max(2, Math.ceil((s1 - s0) / 40)), pts: THREE.Vector3[] = [], ns: [number, number][] = [];
    for (let k = 0; k <= steps; k++) { const f = net.place(corridor, s0 + (s1 - s0) * k / steps); pts.push(new THREE.Vector3(f.x, 0.4, f.z)); ns.push([f.nx, f.nz]); }
    const { mesh, mat } = this.ribbonMesh(pts, ns);
    const g: Glow = { kind, key, place, s: 0, fig: '', mesh, mat, pts, scr: [], size: [0, 0], reach: LEAST_PX / 2, on: false, label: null, labelW: 0, lx: 0, ly: 0, lz: 0 };
    this.glows.set(key, g);
    return g;
  }
  /** The walk home from station i: a soft trail on the ground from its platforms out into its streets. */
  private walkGlow(i: number, b: BuiltStation, place: string): Glow {
    const key = `walk|${i}`, had = this.glows.get(key); if (had) return had;
    const f = this.o.net.stationFrame(b.station.id), sd = this.side[i]!, F = b.kit.faces, edge = Math.max(Math.abs(F.north.v), Math.abs(F.south.v)) + 6;
    const pts: THREE.Vector3[] = [], ns: [number, number][] = [];
    for (let k = 0; k <= 10; k++) {
      const d = edge + WALK * k / 10, u = 12 * Math.sin(k * 0.6), x = f.x + f.dx * u + f.nx * sd * d, z = f.z + f.dz * u + f.nz * sd * d;
      pts.push(new THREE.Vector3(x, groundAt(x, z) + 0.5, z)); ns.push([f.dx, f.dz]);
    }
    const { mesh, mat } = this.ribbonMesh(pts, ns);
    const g: Glow = { kind: 'walk', key, place, s: 0, fig: '', mesh, mat, pts, scr: [], size: [0, 0], reach: LEAST_PX / 2, on: false, label: null, labelW: 0, lx: 0, ly: 0, lz: 0 };
    this.glows.set(key, g);
    return g;
  }
  /** The figures walking home along each trail, more as more give up, at a walk; still with reduced motion. */
  private walk(reduced: boolean): void {
    const most = this.o.built.length * WALKERS, p = this.v, phase = reduced ? 0 : this.t * 1.4 / WALK;
    let n = 0;
    for (const g of this.glows.values()) {
      if (g.kind !== 'walk' || !g.on) continue;
      const many = Math.max(2, Math.round(g.s * WALKERS)), L = g.pts.length - 1;
      for (let k = 0; k < many && n < most; k++) {
        const at = ((k / many + phase) % 1) * L, j = Math.min(L - 1, Math.floor(at)), across = ((k * 7) % 5 - 2) * 0.9;
        p.copy(g.pts[j]!).lerp(g.pts[j + 1]!, at - j);
        this.m4.makeTranslation(p.x + across, p.y - 0.5, p.z + across * 0.5); this.walkers.setMatrixAt(n++, this.m4);
      }
    }
    this.walkers.count = n; this.walkers.instanceMatrix.needsUpdate = true;
    (this.walkers.material as THREE.MeshBasicMaterial).opacity = 0.9 * this.fade;
  }
  /** Which figures show, a few times a second: on strong glows near the camera, the nearer first, giving way to each
   * other and to the station names (whose places main.ts sets). A width is read only when its text changes. */
  private figures(): void {
    const box = this.o.labels, taken: [number, number, number, number][] = [];
    for (const el of box.children) {
      const e = el as HTMLElement; if (!e.classList.contains('lbl') || e.classList.contains('sfig') || e.style.display === 'none') continue;
      const x = parseFloat(e.style.left), y = parseFloat(e.style.top), w = e.offsetWidth;
      if (Number.isFinite(x) && Number.isFinite(y)) taken.push([x - w / 2, y - FIG_H, x + w / 2, y]);
    }
    for (const g of [...this.glows.values()].sort((a, b) => a.lz - b.lz)) {
      let show = g.on && this.fade > 0.5 && g.s >= STRONG && g.lz < FIG_NEAR && g.scr.length > 0;
      if (show) {
        if (!g.label) { g.label = document.createElement('div'); g.label.className = 'lbl sfig'; box.appendChild(g.label); }
        if (g.label.textContent !== g.fig) { g.label.textContent = g.fig; g.label.style.display = ''; g.labelW = g.label.offsetWidth; }
        const x = g.lx, y = g.ly, r: [number, number, number, number] = [x - g.labelW / 2, y - FIG_H / 2, x + g.labelW / 2, y + FIG_H / 2];
        if (taken.some(t => r[0] < t[2] && r[2] > t[0] && r[1] < t[3] && r[3] > t[1])) show = false; else taken.push(r);
      }
      if (g.label) { const d = show ? '' : 'none'; if (g.label.style.display !== d) g.label.style.display = d; }
    }
    this.placeFigures();
  }
  /** Keep the figures showing on their glows as the camera moves. */
  private placeFigures(): void {
    for (const g of this.glows.values()) {
      const L = g.label; if (!L || L.style.display === 'none') continue;
      const x = `${g.lx}px`, y = `${g.ly}px`; if (L.style.left !== x) L.style.left = x; if (L.style.top !== y) L.style.top = y;
    }
  }
}
