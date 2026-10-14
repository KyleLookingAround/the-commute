// The network view: at wide zoom (Whole line), a map you can read on a phone drawn over the 3D, as Mini Metro draws
// it (docs/DESIGN.md, The network view; the mockups in public/design/network-view/). Each service's line bold in its own
// colour (the --map-svc-* tokens), side by side where services share track, easing across where one joins or leaves;
// each train a short bar along its line coloured by how full it is; each station a ring as big as the crowd waiting
// there, its edge red with a slow pulse while people give up this clock hour (Strain's own figure), and a station not
// yet bought a small pale dot. Sizes are in screen pixels at any zoom, set in the shaders from how far each point is
// from the camera, so a frame writes only the trains' places and, on the UI's timer, the rings'. Three meshes in all,
// the rings and the trains instanced; it fades in between FADE_FROM and FADE_TO metres from where the camera looks and
// is hidden and left alone nearer. Fetched after the first frame (src/main.ts). Only the view: it reads the sim and
// changes nothing in the game.
import * as THREE from 'three';
import type { Network } from '../sim/network.ts';
import { newFrame } from '../sim/network.ts';
import type { Sim } from '../sim/sim.ts';
import { TUNING } from '../sim/sim.ts';
import { clockAt } from '../sim/day.ts';
import { LOST_FROM } from '../ui/strain.ts';
import { PAL } from './scene.ts';
import { groundAt } from './terrain.ts';
import type { ColourName } from './palette.ts';

/** The view fades in as the camera goes from FADE_FROM to FADE_TO metres from where it looks. */
export const FADE_FROM = 2500, FADE_TO = 5000;
/** A line's width and the gap from one service's line to the next beside it, in CSS pixels; the white edge each side. */
const LINE_PX = 6, LANE_PX = 7, EDGE_PX = 1.4;
/** A ring's radius in pixels: from RING_MIN with nobody waiting, growing with the root of the crowd, to RING_MAX; a
 * station not bought, LOCKED_PX. A train's bar, along and across its line. */
const RING_MIN = 6, RING_MAX = 18, RING_K = 0.7, LOCKED_PX = 4, BAR_L = 15, BAR_W = 9;
/** How full a train is (on board against its seats) when it turns busy, and full. */
export const BUSY = 0.6, FULL = 0.9;
/** Metres between the points a service's line is drawn through, and how many either side ease a change of lanes. */
const STEP = 60, EASE_PTS = 8;
/** The most trains drawn (more are left out), and how many services the shaders hold. */
const MAX_TRAINS = 96, MAX_SVC = 16;
/** One pulse of a ring whose people are giving up, in seconds. */
const PULSE = 2.4;

/** One service's line as drawn: the chainage, place and normal at each point, and its lane offset there (in lanes). */
interface Way { id: string; s: Float64Array; corridor: string[]; x: Float64Array; z: Float64Array; nx: Float64Array; nz: Float64Array; lane: Float64Array }

// a point offset across its line by aOff pixels (aN its normal on the ground), wherever it is: metres a pixel there
// are its distance from the camera times uPx (2 tan(fov/2) over the canvas's height in CSS pixels)
const LINE_V = `attribute vec2 aN; attribute float aOff; attribute float aSide; attribute float aS; attribute float aSvc; attribute vec3 aC;
uniform float uPx; uniform float uLine; uniform float uEdge; uniform float uLane; uniform vec2 uRange[${MAX_SVC}];
varying vec3 vC; varying float vSide; varying float vOn;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0); float mpp = distance(w.xyz, cameraPosition) * uPx;
  float hw = uLine * 0.5 + uEdge;
  w.xz += aN * (aOff * uLane + aSide * hw) * mpp;
  vec2 r = uRange[int(aSvc + 0.5)]; vOn = step(r.x, aS) * step(aS, r.y);
  vC = aC; vSide = aSide; gl_Position = projectionMatrix * viewMatrix * w;
}`;
const LINE_F = `uniform float uA; uniform float uLine; uniform float uEdge; uniform vec3 uEdgeC; varying vec3 vC; varying float vSide; varying float vOn;
void main() {
  if (vOn < 0.5) discard;
  float hw = uLine * 0.5 + uEdge, d = abs(vSide) * hw;
  vec3 c = d > uLine * 0.5 ? uEdgeC : vC;
  gl_FragColor = vec4(c, uA * (1.0 - smoothstep(hw - 0.6, hw, d)));
}`;
// a quad standing at aP (offset across its line aOff px along aN), facing the screen: a ring (aR px, aEdge its edge's
// colour, aLost pulsing) or a bar along the line's direction on screen (aD on the ground)
const PIN_V = `attribute vec3 aP; attribute vec2 aN; attribute float aOff; attribute vec2 aD; attribute vec2 aSize; attribute vec3 aFill; attribute vec3 aEdge; attribute float aLost;
uniform float uPx; uniform float uLane; uniform vec2 uView;
varying vec2 vUv; varying vec3 vFill; varying vec3 vEdge; varying float vLost; varying vec2 vSize;
void main() {
  float mpp = distance(aP, cameraPosition) * uPx;
  vec3 p = aP + vec3(aN.x, 0.0, aN.y) * aOff * uLane * mpp;
  vec4 c = projectionMatrix * viewMatrix * vec4(p, 1.0);
  vec2 along = vec2(1.0, 0.0);
  if (dot(aD, aD) > 0.0) {
    vec4 q = projectionMatrix * viewMatrix * vec4(p + vec3(aD.x, 0.0, aD.y) * mpp * 10.0, 1.0);
    vec2 d = (q.xy / q.w - c.xy / c.w) * uView; along = length(d) > 1e-4 ? normalize(d) : along;
  }
  vec2 across = vec2(-along.y, along.x), o = (along * position.x * aSize.x + across * position.y * aSize.y);
  c.xy += o * 2.0 / uView * c.w;
  vUv = position.xy * 2.0; vFill = aFill; vEdge = aEdge; vLost = aLost; vSize = aSize; gl_Position = c;
}`;
// a ring: filled, its edge 2.5 px (4 while people give up, with a ring pulsing out round it); a bar: a rounded box
// with a 2 px edge. uKind 0 rings, 1 bars
const PIN_F = `uniform float uA; uniform float uKind; uniform float uPulse; varying vec2 vUv; varying vec3 vFill; varying vec3 vEdge; varying float vLost; varying vec2 vSize;
void main() {
  float a, e;
  if (uKind < 0.5) {
    float rpx = vSize.x * 0.5, d = length(vUv) * rpx, r = rpx / 1.5, ew = vLost > 0.5 ? 4.0 : 2.5;
    a = 1.0 - smoothstep(r - 0.7, r + 0.5, d); e = smoothstep(r - ew - 0.7, r - ew, d);
    vec4 col = vec4(mix(vFill, vEdge, e), a);
    if (vLost > 0.5) { float k = fract(uPulse), pr = r + 2.0 + 6.0 * k, ring = 1.0 - smoothstep(0.0, 1.4, abs(d - pr)); col = d > r ? vec4(vEdge, ring * (1.0 - k) * 0.8) : col; }
    if (col.a < 0.01) discard;
    gl_FragColor = vec4(col.rgb, col.a * uA);
  } else {
    vec2 h = vSize * 0.5, q = abs(vUv) * h - (h - 2.5);
    float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 2.5;
    a = 1.0 - smoothstep(-0.6, 0.4, d); e = smoothstep(-2.6, -1.8, d);
    if (a < 0.01) discard;
    gl_FragColor = vec4(mix(vFill, vEdge, e), a * uA);
  }
}`;

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** What the view reads that isn't the sim: the station points (x, z, ground height) and the camera's distance out. */
export interface NetView { scene: THREE.Scene; net: Network; camera: THREE.PerspectiveCamera; canvas: HTMLCanvasElement; stations: [number, number, number][]; reduced: boolean }

export class NetworkView {
  /** How far it's faded in (0 hidden, 1 full). */
  fade = 0;
  readonly group = new THREE.Group();
  private ways: Way[] = [];
  private lineMat: THREE.ShaderMaterial; private ringMat: THREE.ShaderMaterial; private barMat: THREE.ShaderMaterial;
  private rings: THREE.InstancedBufferGeometry; private bars: THREE.InstancedBufferGeometry;
  private ringA: Record<'aP' | 'aSize' | 'aFill' | 'aEdge' | 'aLost', THREE.InstancedBufferAttribute>;
  private barA: Record<'aP' | 'aN' | 'aOff' | 'aD' | 'aFill', THREE.InstancedBufferAttribute>;
  private ranges: THREE.Vector2[];
  /** The services' ids in the order the shaders hold them, and the drawn ranges and the trains last written. */
  private svcIds: string[] = [];
  /** Gave up this clock hour at each station, the running counts last read, and the clock hour. */
  private lost: number[] = []; private seen: number[] = []; private hourKey = -1; private sim: Sim | null = null;
  private acc = 1; private t = 0; private f = newFrame();
  /** Where each train and ring stood on the screen at the last draw, for a tap: [x, y, radius] in CSS pixels. */
  private trainAt: { i: number; x: number; y: number }[] = []; private ringR: number[] = [];
  private v = new THREE.Vector3();
  constructor(private o: NetView) {
    const { net } = o;
    this.group.visible = false; this.group.renderOrder = 20; o.scene.add(this.group);
    const svcs = net.services().filter(s => !s.def.scenery);
    this.svcIds = svcs.map(s => s.def.id).slice(0, MAX_SVC);
    this.ranges = Array.from({ length: MAX_SVC }, () => new THREE.Vector2(1, 0));
    // each service's way, from the first station on its route to the last, along its legs
    for (const s of svcs.slice(0, MAX_SVC)) {
      const r = net.route(s.def), ss = s.route.map(i => net.stations[i]!.s), a = Math.min(...ss), b = Math.max(...ss);
      const S: number[] = [], C: string[] = [], X: number[] = [], Z: number[] = [], NX: number[] = [], NZ: number[] = [];
      for (const l of r.legs) {
        const [e0, e1] = net.extent(l.north), s0 = Math.max(a, l.s0, e0), s1 = Math.min(b, l.s1, e1); if (s1 <= s0) continue;
        const n = Math.max(1, Math.ceil((s1 - s0) / STEP));
        for (let k = S.length && S[S.length - 1]! >= s0 ? 1 : 0; k <= n; k++) {
          const at = s0 + (s1 - s0) * k / n, p = net.place(l.corridor, at, 0, this.f);
          S.push(at); C.push(l.corridor); X.push(p.x); Z.push(p.z); NX.push(p.nx); NZ.push(p.nz);
        }
      }
      this.ways.push({ id: s.def.id, s: Float64Array.from(S), corridor: C, x: Float64Array.from(X), z: Float64Array.from(Z), nx: Float64Array.from(NX), nz: Float64Array.from(NZ), lane: new Float64Array(S.length) });
    }
    this.lanes();
    const px = { value: 0 }, lane = { value: LANE_PX }, view = { value: new THREE.Vector2(1, 1) }, alpha = { value: 0 };
    this.lineMat = new THREE.ShaderMaterial({
      uniforms: { uPx: px, uLine: { value: LINE_PX }, uEdge: { value: EDGE_PX }, uLane: lane, uRange: { value: this.ranges }, uA: alpha, uEdgeC: { value: PAL['svc-edge'] } },
      vertexShader: LINE_V, fragmentShader: LINE_F, transparent: true, depthTest: false, depthWrite: false, fog: false,
    });
    const pin = (kind: number) => new THREE.ShaderMaterial({
      uniforms: { uPx: px, uLane: lane, uView: view, uA: alpha, uKind: { value: kind }, uPulse: { value: 0 } },
      vertexShader: PIN_V, fragmentShader: PIN_F, transparent: true, depthTest: false, depthWrite: false, fog: false,
    });
    this.ringMat = pin(0); this.barMat = pin(1);
    this.group.add(this.lineMesh());
    // the rings and the bars: one quad each, instanced
    const quad = (): THREE.InstancedBufferGeometry => {
      const g = new THREE.InstancedBufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3)); g.setIndex([0, 1, 2, 0, 2, 3]);
      return g;
    };
    const inst = (g: THREE.InstancedBufferGeometry, name: string, n: number, size: number) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); g.setAttribute(name, a); return a; };
    const nS = o.stations.length;
    this.rings = quad();
    this.ringA = { aP: inst(this.rings, 'aP', nS, 3), aSize: inst(this.rings, 'aSize', nS, 2), aFill: inst(this.rings, 'aFill', nS, 3), aEdge: inst(this.rings, 'aEdge', nS, 3), aLost: inst(this.rings, 'aLost', nS, 1) };
    for (const k of ['aN', 'aOff', 'aD'] as const) inst(this.rings, k, nS, k === 'aOff' ? 1 : 2);
    o.stations.forEach(([x, z, y], i) => this.ringA.aP.setXYZ(i, x, y, z));
    this.rings.instanceCount = nS;
    this.bars = quad();
    this.barA = { aP: inst(this.bars, 'aP', MAX_TRAINS, 3), aN: inst(this.bars, 'aN', MAX_TRAINS, 2), aOff: inst(this.bars, 'aOff', MAX_TRAINS, 1), aD: inst(this.bars, 'aD', MAX_TRAINS, 2), aFill: inst(this.bars, 'aFill', MAX_TRAINS, 3) };
    const bs = inst(this.bars, 'aSize', MAX_TRAINS, 2), be = inst(this.bars, 'aEdge', MAX_TRAINS, 3); inst(this.bars, 'aLost', MAX_TRAINS, 1);
    for (let k = 0; k < MAX_TRAINS; k++) { bs.setXY(k, BAR_L, BAR_W); be.setXYZ(k, PAL['ring-edge'].r, PAL['ring-edge'].g, PAL['ring-edge'].b); }
    this.bars.instanceCount = 0;
    const lineM = this.group.children[0]!; lineM.renderOrder = 20;
    const rm = new THREE.Mesh(this.rings, this.ringMat), bm = new THREE.Mesh(this.bars, this.barMat);
    rm.renderOrder = 21; bm.renderOrder = 22;
    for (const m of [rm, bm]) { m.frustumCulled = false; this.group.add(m); }
  }

  /** Each service's lane at each point: services sharing a stretch of corridor stand side by side, in the network's
   * order, centred on the line; where one joins or leaves the others ease across over EASE_PTS points either side. */
  private lanes(): void {
    const W = this.ways, key = (c: string, s: number) => `${c}:${Math.round(s / STEP)}`;
    const at = new Map<string, number[]>();
    W.forEach((w, k) => w.s.forEach((s, j) => { const id = key(w.corridor[j]!, s); const l = at.get(id); if (l) { if (!l.includes(k)) l.push(k); } else at.set(id, [k]); }));
    for (const [k, w] of W.entries()) {
      const raw = Array.from(w.s, (s, j) => { const l = at.get(key(w.corridor[j]!, s))!; return l.indexOf(k) - (l.length - 1) / 2; });
      for (let j = 0; j < raw.length; j++) {
        let sum = 0, n = 0;
        for (let q = Math.max(0, j - EASE_PTS); q <= Math.min(raw.length - 1, j + EASE_PTS); q++) { sum += raw[q]!; n++; }
        w.lane[j] = sum / n;
      }
    }
  }
  private lineMesh(): THREE.Mesh {
    const P: number[] = [], N: number[] = [], O: number[] = [], SD: number[] = [], SS: number[] = [], SV: number[] = [], CC: number[] = [], I: number[] = [];
    this.ways.forEach((w, k) => {
      const c = this.colour(w.id, k), base = P.length / 3;
      for (let j = 0; j < w.s.length; j++) {
        // the normal at a point: from the line either side of it, so the ribbon turns smoothly
        const a = Math.max(0, j - 1), b = Math.min(w.s.length - 1, j + 1), dx = w.x[b]! - w.x[a]!, dz = w.z[b]! - w.z[a]!, m = Math.hypot(dx, dz) || 1;
        for (const side of [-1, 1]) { P.push(w.x[j]!, 0, w.z[j]!); N.push(-dz / m, dx / m); O.push(w.lane[j]!); SD.push(side); SS.push(w.s[j]!); SV.push(k); CC.push(c.r, c.g, c.b); }
        if (j) { const q = base + 2 * j; I.push(q - 2, q - 1, q, q - 1, q + 1, q); }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('aN', new THREE.Float32BufferAttribute(N, 2));
    g.setAttribute('aOff', new THREE.Float32BufferAttribute(O, 1)); g.setAttribute('aSide', new THREE.Float32BufferAttribute(SD, 1));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(SS, 1)); g.setAttribute('aSvc', new THREE.Float32BufferAttribute(SV, 1));
    g.setAttribute('aC', new THREE.Float32BufferAttribute(CC, 3)); g.setIndex(I);
    const m = new THREE.Mesh(g, this.lineMat); m.frustumCulled = false;
    return m;
  }
  /** A service's colour: its own token, or one of the numbered ones. */
  private colour(id: string, k: number): THREE.Color {
    const own = PAL[`svc-${id}` as ColourName] as THREE.Color | undefined;
    return own ?? (PAL[`svc-${1 + k % 3}` as ColourName] as THREE.Color);
  }

  /** Follow the camera and the sim: fade by how far out the camera is (r, metres from where it looks); while shown, the
   * trains every frame and the rings and the lines' ranges on the UI's timer. realDt: the frame's real seconds. */
  update(sim: Sim, r: number, realDt: number): void {
    this.fade = smooth(FADE_FROM, FADE_TO, r);
    const on = this.fade > 0.001;
    if (this.group.visible !== on) this.group.visible = on;
    this.tally(sim);
    if (!on) return;
    const c = this.o.canvas, h = c.clientHeight || 1;
    this.lineMat.uniforms['uPx']!.value = 2 * Math.tan(THREE.MathUtils.degToRad(this.o.camera.fov) / 2) / h / (this.o.camera.zoom || 1);
    (this.ringMat.uniforms['uView']!.value as THREE.Vector2).set(c.clientWidth || 1, h);
    this.lineMat.uniforms['uA']!.value = this.fade;
    if (!this.o.reduced) { this.t += realDt; this.ringMat.uniforms['uPulse']!.value = this.t / PULSE; }
    this.acc += realDt;
    if (this.acc >= 0.25) { this.acc = 0; this.ringsNow(sim); }
    this.trains(sim);
  }
  /** Gave up this clock hour at each station, read as Strain reads it (src/ui/strain.ts). */
  private tally(sim: Sim): void {
    const h = Math.floor(clockAt(sim.g.t) / 3600);
    if (sim !== this.sim) { this.sim = sim; this.hourKey = h; sim.g.st.forEach((S, i) => { this.lost[i] = 0; this.seen[i] = S.lost; }); }
    if (h !== this.hourKey) { this.hourKey = h; this.lost.fill(0); }
    const st = sim.g.st;
    for (let i = 0; i < st.length; i++) { const n = st[i]!.lost, d = n - (this.seen[i] ?? n); if (d > 0) this.lost[i] = (this.lost[i] ?? 0) + d; this.seen[i] = n; }
  }
  /** Gave up at station i this clock hour, once it's Strain's LOST_FROM or more (only where it's owned). */
  givingUp(sim: Sim, i: number): number { const n = sim.g.owned[i] ? this.lost[i] ?? 0 : 0; return n >= LOST_FROM ? n : 0; }
  private ringsNow(sim: Sim): void {
    const A = this.ringA, ring = PAL.ring, edge = PAL['ring-edge'], lostC = PAL['ring-lost'], locked = PAL['ring-locked'];
    for (let i = 0; i < this.o.stations.length; i++) {
      const owned = !!sim.g.owned[i], S = sim.g.st[i], lost = owned && this.givingUp(sim, i) > 0;
      const r = owned ? Math.min(RING_MAX, RING_MIN + Math.sqrt(S?.waiting ?? 0) * RING_K) : LOCKED_PX;
      // the quad holds the ring and its pulse: half again its radius
      A.aSize.setXY(i, r * 3, r * 3); this.ringR[i] = r;
      const f = owned ? ring : locked, e = lost ? lostC : owned ? edge : PAL.locked;
      A.aFill.setXYZ(i, f.r, f.g, f.b); A.aEdge.setXYZ(i, e.r, e.g, e.b); A.aLost.setX(i, lost ? 1 : 0);
    }
    for (const a of Object.values(A)) a.needsUpdate = true;
    // each service's line shows where its trains run: between the furthest stations on its route they can reach
    sim.svcs.forEach(v => {
      const k = this.svcIds.indexOf(v.id); if (k < 0) return;
      let a = Infinity, b = -Infinity;
      if (sim.g.trains.some(t => t.svc === v.id)) for (const i of v.route) if (sim.reachable(i) || v.def.through) { const s = this.o.net.stations[i]!.s; a = Math.min(a, s); b = Math.max(b, s); }
      this.ranges[k]!.set(a - 1, b + 1);
    });
  }
  private trains(sim: Sim): void {
    const A = this.barA, T = sim.g.trains, net = this.o.net; let n = 0;
    this.trainAt.length = 0;
    for (let i = 0; i < T.length && n < MAX_TRAINS; i++) {
      const t = T[i]!; if (t.state === 'away') continue;
      const v = sim.svc(t.svc), k = this.svcIds.indexOf(t.svc), w = this.ways[k];
      const leg = v.path.leg(t.s, t.leg), f = net.place(leg.corridor, t.s, 0, this.f);
      A.aP.setXYZ(n, f.x, groundAt(f.x, f.z), f.z); A.aN.setXY(n, f.nx, f.nz); A.aD.setXY(n, f.dx, f.dz);
      A.aOff.setX(n, w ? this.laneAt(w, t.s) : 0);
      const full = t.onboard / Math.max(1, t.cars * TUNING.seatsPerCar), c = full >= FULL ? PAL['full-2'] : full >= BUSY ? PAL['full-1'] : PAL['full-0'];
      A.aFill.setXYZ(n, c.r, c.g, c.b);
      this.trainAt.push({ i, x: f.x, y: f.z });
      n++;
    }
    this.bars.instanceCount = n;
    for (const a of Object.values(A)) a.needsUpdate = true;
  }
  /** A service's lane at chainage s along its way. */
  private laneAt(w: Way, s: number): number {
    const S = w.s; let lo = 0, hi = S.length - 1;
    if (s <= S[0]!) return w.lane[0]!; if (s >= S[hi]!) return w.lane[hi]!;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m]! <= s) lo = m; else hi = m; }
    const u = (s - S[lo]!) / (S[hi]! - S[lo]!); return w.lane[lo]! + (w.lane[hi]! - w.lane[lo]!) * u;
  }

  /** What a tap at the client point lands on while the view shows: a train (within 18 px of its bar), then a station
   * (within its ring and 10 px more, at least 22). Only on a tap. */
  pick(x: number, y: number): { kind: 'train' | 'station'; i: number } | null {
    if (this.fade < 0.5) return null;
    const r = this.o.canvas.getBoundingClientRect(); if (!r.width || !r.height) return null;
    const scr = (wx: number, wy: number, wz: number): [number, number] | null => {
      const p = this.v.set(wx, wy, wz).project(this.o.camera); if (p.z > 1) return null;
      return [(p.x + 1) / 2 * r.width + r.left, (1 - p.y) / 2 * r.height + r.top];
    };
    let best = 18, train = -1;
    for (const t of this.trainAt) { const s = scr(t.x, 0, t.y); if (!s) continue; const d = Math.hypot(s[0] - x, s[1] - y); if (d < best) { best = d; train = t.i; } }
    if (train >= 0) return { kind: 'train', i: train };
    let station = -1, bestS = Infinity;
    this.o.stations.forEach(([sx, sz, sy], i) => { const s = scr(sx, sy, sz); if (!s) return; const d = Math.hypot(s[0] - x, s[1] - y); if (d < Math.max(22, (this.ringR[i] ?? 0) + 10) && d < bestS) { bestS = d; station = i; } });
    return station >= 0 ? { kind: 'station', i: station } : null;
  }

  /** For the checks: where each station's ring stands on the screen, in client pixels (null off it). */
  onScreen(): ([number, number] | null)[] {
    const r = this.o.canvas.getBoundingClientRect();
    return this.o.stations.map(([x, z, y]) => { const p = this.v.set(x, y, z).project(this.o.camera); return p.z > 1 ? null : [(p.x + 1) / 2 * r.width + r.left, (1 - p.y) / 2 * r.height + r.top]; });
  }
  /** For the checks: how faded in, the services drawn, the trains and how full, and the rings. */
  stats(sim: Sim): { fade: number; shown: boolean; lines: string[]; trains: number; busy: number; full: number; rings: number[]; lost: number[] } {
    const lines = this.svcIds.filter((_, k) => this.ranges[k]!.y > this.ranges[k]!.x);
    let busy = 0, full = 0;
    for (let k = 0; k < this.bars.instanceCount; k++) { const g = this.barA.aFill.getY(k); if (Math.abs(g - PAL['full-2'].g) < 1e-3) full++; else if (Math.abs(g - PAL['full-1'].g) < 1e-3) busy++; }
    return { fade: this.fade, shown: this.group.visible, lines, trains: this.bars.instanceCount, busy, full, rings: this.ringR.slice(), lost: this.o.stations.map((_, i) => this.givingUp(sim, i)) };
  }
}
