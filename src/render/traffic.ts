// Gridlock on the map (docs/design/gridlock.md §3): the sim's roads (src/sim/traffic.ts) drawn where they run. Near the
// camera, cars on the A6 and the M60: each stretch's queue nose to tail back from its junction, brake lights lit, and
// the rest of its cars moving at the stretch's speed, spaced by its flow, both ways. Everywhere else a wash: a small
// texture of each stretch's load, soft-edged, tints the roads near it (the buses' roads, the M60, and the streets the
// ground's cover paints) from their grey through amber past 0.9 of capacity to coral past 1.15. Fetched in a chunk after
// the first frame, with the stretches' data. It only reads the sim, never steps it, and draws nothing that changes the
// game: the cars move on their own clock.
//
// Where each stretch runs: on its main road (`mainRoads` in the network data, along its real course from OpenStreetMap),
// centred on its DfT count point and as long as the DfT's link, its queue backing up from the junction its data names
// (`on`, `at` and `head` in src/data/traffic.json). A stretch whose road isn't in the data yet is neither carred nor washed.
import * as THREE from 'three';
import { MAT, PAL } from './scene.ts';
import { pathThrough, type Path } from './buses.ts';
import { groundVersion } from './terrain.ts';
import { projectLatLon } from '../sim/network.ts';
import type { Network } from '../sim/network.ts';
import { courseOf, deckAt, LANE, type MainDef } from './mainways.ts';
import type { Sim } from '../sim/sim.ts';
import { TUNING } from '../sim/sim.ts';
import { traffic, trafficKey, type Road, type StretchDef, type TrafficDef } from '../sim/traffic.ts';
import type { NetworkGeoDef, XZ } from '../sim/types.ts';
import trafficJson from '../data/traffic.json';

const D = trafficJson as unknown as TrafficDef;
const TAP = new THREE.Vector3();

type LL = [number, number];
/** Where a stretch runs (src/data/traffic.json): on which main road, its count point, and the junction its queue backs up
 * from (one of the road's `junctions`). */
interface Course { on: string; at: LL; head: string }

const MAX_CARS = 300, LOW_CARS = 120;
const NEAR = 600;          // m from where the camera looks that cars are drawn
const FAR = 1800;          // further out than this (the camera's distance) the cars are a few pixels: the wash alone
const GAP = 7;             // m a queued car takes in its lane
const SLOW = 18;           // km/h under which a moving car's brake lights are lit
const CHUNK = 40;          // m: a stretch is tested against the camera in pieces this long
const WASH = 64;           // the congestion texture's cells each way
const READ_EVERY = 0.5;    // real seconds between looks at whether the roads have moved
const RINGS = 3;           // the cars are placed nearest first, in this many rings out to NEAR

/** A stretch as laid: its path from `from` to `to` (4 m steps, the heights the buses' roads have), where its head
 * is along it, its lanes each way and their offsets, and its pieces' middles (for what's near the camera). */
interface Laid { id: string; path: Path; head: number; lanes: number; offset: number[]; mids: Float32Array; width: number }

/** The car: one low body with its cabin raked into the bonnet, length along +x, its back at -x; fourteen triangles,
 * no floor. Vertex colours shade the windscreen; `aRear` marks the back (the brake lights), `aFront` the front (the
 * headlamps). */
function carGeometry(): THREE.BufferGeometry {
  const L = 2.1, W = 0.9, base = 0.25, roof = 1.45, cab = 0.35, nose = 0.8;
  // the side's outline, back to front: back bottom, back top, roof's front, nose top, nose bottom
  const P: [number, number][] = [[-L, base], [-L, roof], [cab, roof], [L, nose], [L, base]];
  const pos: number[] = [], col: number[] = [], rear: number[] = [], front: number[] = [];
  const tri = (a: number[], b: number[], c: number[], shade: [number, number, number], r = 0, f = 0) => {
    pos.push(...a, ...b, ...c); col.push(shade[0], shade[0], shade[0], shade[1], shade[1], shade[1], shade[2], shade[2], shade[2]);
    rear.push(r, r, r); front.push(f, f, f);
  };
  const v = (k: number, side: number) => [P[k]![0], P[k]![1], side * W];
  const B: [number, number, number] = [1, 1, 1];
  for (const s of [1, -1]) {   // the sides, a fan from the back bottom, wound to face out
    for (const [a, b] of [[1, 2], [2, 3], [3, 4]] as const) s > 0 ? tri(v(0, s), v(b, s), v(a, s), B) : tri(v(0, s), v(a, s), v(b, s), B);
  }
  const quad = (k0: number, k1: number, shade: [number, number, number, number], r = 0, f = 0) => {
    // the strip between outline points k0 and k1, across the car
    const a = v(k0, 1), b = v(k1, 1), c = v(k1, -1), d = v(k0, -1);
    tri(a, b, c, [shade[0], shade[1], shade[2]], r, f); tri(a, c, d, [shade[0], shade[2], shade[3]], r, f);
  };
  quad(0, 1, [1, 1, 1, 1], 1);              // the back
  quad(1, 2, [1, 1, 1, 1]);                 // the roof
  quad(2, 3, [0.32, 0.85, 0.85, 0.32]);     // the windscreen down into the bonnet: glass at the top
  quad(3, 4, [1, 1, 1, 1], 0, 1);           // the front
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aRear', new THREE.Float32BufferAttribute(rear, 1)); g.setAttribute('aFront', new THREE.Float32BufferAttribute(front, 1));
  g.computeVertexNormals();
  return g;
}

/** Where along a polyline a point comes nearest: the distance along it. */
function along(pts: XZ[], x: number, z: number): number {
  let best = Infinity, at = 0, d = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1]!, [bx, bz] = pts[i]!, dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (l * l))), e = Math.hypot(ax + dx * t - x, az + dz * t - z);
    if (e < best) { best = e; at = d + t * l; }
    d += l;
  }
  return at;
}
/** The polyline between two distances along it (from a to b, either way round). */
function slice(pts: XZ[], a: number, b: number): XZ[] {
  const dir = b >= a ? 1 : -1, lo = Math.min(a, b), hi = Math.max(a, b), out: XZ[] = [];
  let d = 0;
  const at = (i: number, t: number): XZ => { const [ax, az] = pts[i - 1]!, [bx, bz] = pts[i]!; return [ax + (bx - ax) * t, az + (bz - az) * t]; };
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]) || 1;
    if (d + l >= lo && d <= hi) {
      if (!out.length) out.push(at(i, Math.max(0, (lo - d) / l)));
      out.push(at(i, Math.min(1, (hi - d) / l)));
    }
    d += l;
  }
  return dir > 0 ? out : out.reverse();
}
/** The wash's uniforms, shared by every material it tints. */
const WASH_U = {
  uJam: { value: null as THREE.DataTexture | null }, uJamBox: { value: new THREE.Vector4() }, uWash: { value: 0 },
  uJam1: { value: PAL['jam-1'].clone() }, uJam2: { value: PAL['jam-2'].clone() },
  uStreet: { value: PAL['cover-street'].clone().convertLinearToSRGB() },   // as the cover's texture holds it
};
/** Strain's traffic row (docs/design/gridlock.md, G4): while the Strain view is on, the wash is drawn stronger, eased
 * there and back. */
let strong = 0, strongTo = 0;
export function strongWash(on: boolean): void { strongTo = on ? 1 : 0; }
/** The wash, in GLSL: how far towards amber or coral the road here goes, from the texture (red: the nearest stretch's
 * load over 2; green: how near it is), times `mask` (1 on a road's own material, the cover's streets on the ground). */
const WASH_GLSL = `
{
  vec2 juv = (vJamXZ - uJamBox.xy) * uJamBox.zw;
  if (juv.x > 0.0 && juv.y > 0.0 && juv.x < 1.0 && juv.y < 1.0) {
    vec4 j = texture2D(uJam, juv);
    float load = j.r * 2.0, busy = smoothstep(0.85, 0.95, load), jam = smoothstep(1.05, 1.15, load);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(uJam1, uJam2, jam), min(1.0, busy * j.g * uWash * JAM_MASK * 0.8));
  }
}`;
/** Tint a material's roads with the wash: `mask` is the GLSL for how much of a pixel is road. Keeps what the material's
 * shader is already patched with; the code goes in after every colour patch (before the alpha map). */
function washPatch(mat: THREE.Material, mask: string, key: string): void {
  if (mat.userData['jam']) return;
  mat.userData['jam'] = true;
  const prev = mat.onBeforeCompile.bind(mat), prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    Object.assign(shader.uniforms, WASH_U);
    shader.vertexShader = 'varying vec2 vJamXZ;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvJamXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = 'varying vec2 vJamXZ;\nuniform sampler2D uJam; uniform vec4 uJamBox; uniform float uWash; uniform vec3 uJam1; uniform vec3 uJam2; uniform vec3 uStreet;\n'
      + shader.fragmentShader.replace('#include <alphamap_fragment>', WASH_GLSL.replace('JAM_MASK', `(${mask})`) + '\n#include <alphamap_fragment>');
  };
  mat.customProgramCacheKey = () => prevKey() + '|jam-' + key;
  mat.needsUpdate = true;
}
/** On the ground, the street pixels of its cover (src/render/buildings.ts paints the real streets into it): its
 * texture sampled again here, and how near its colour is the street colour. 0 where there's no cover. */
const STREET_MASK = `jamStreet() * 0.75`;
const STREET_FN = `
float jamStreet() {
  vec2 sq = floor(vCoverXZ / 1000.0) - uCoverGrid.xy;
  if (sq.x < 0.0 || sq.y < 0.0 || sq.x >= uCoverGrid.z || sq.y >= uCoverGrid.w) return 0.0;
  vec4 at = texture2D(uCoverIdx, (sq + 0.5) / uCoverGrid.zw);
  if (at.b < 0.5) return 0.0;
  vec2 uv = fract(vCoverXZ / 1000.0);   // a near square's layer (alpha set) or its far one (src/render/buildings.ts, coverPatch)
  vec4 cov = at.a > 0.5 ? texture(uCover, vec3(uv, floor(at.r * 255.0 + 0.5))) : texture(uCoverFar, vec3(uv, floor(at.g * 255.0 + 0.5)));
  return cov.a * (1.0 - smoothstep(0.03, 0.07, distance(cov.rgb, uStreet)));
}`;

/** What the layer needs from the page. */
export interface TrafficParts {
  scene: THREE.Scene; net: Network; def: NetworkGeoDef; sim: () => Sim;
  /** Where the camera looks and how far out it is. */
  focus: () => { tx: number; tz: number; r: number };
  /** The ground's material, once the cover is patched into it (the real buildings' layer is in). */
  ground: Promise<THREE.Material | null>;
  reduced: boolean;
}

export class TrafficLayer {
  readonly mesh: THREE.InstancedMesh;
  private readonly brake: THREE.InstancedBufferAttribute;
  private readonly mat: THREE.MeshLambertMaterial;
  private readonly U = { uBrake: { value: PAL.brake.clone() }, uLamp: { value: PAL.lamp.clone() }, uLit: { value: 0 } };
  private laid: Laid[] = [];
  private laidOn = -1; private laidAt = 0;
  /** The roads as last read, by stretch, and the loads the wash shows (easing towards the read ones). */
  private roads = new Map<string, Road>(); private shown = new Map<string, number>();
  private key = -1; private acc = READ_EVERY; private hour = 0;
  /** The cars off the roads at the morning peak, and the same at the start (the Network card's score), as last read. */
  private off = 0; private start = 0; private read = false;
  /** The cars' own clock (sim seconds): the moving cars' places come from it. */
  private clock = 0;
  private cap = MAX_CARS; private fade = 0;
  private readonly tex: THREE.DataTexture; private readonly cells: Uint8Array<ArrayBuffer>; private nearest: Int8Array = new Int8Array(0);
  private readonly box = { x0: 0, z0: 0, w: 1, h: 1 };
  private hidden: THREE.Object3D | null = null;
  /** What was drawn last frame (the checks). */
  readonly drawn = { cars: 0, queued: 0, braking: 0, moving: 0, sig: 0 };

  constructor(private readonly p: TrafficParts) {
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const U = this.U;
    this.mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, U);
      shader.vertexShader = 'attribute float aRear; attribute float aFront; attribute float aBrake; varying float vRear; varying float vFront; uniform float uLit;\n'
        + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRear = aRear * max(aBrake, uLit * 0.45); vFront = aFront * uLit;');
      shader.fragmentShader = 'varying float vRear; varying float vFront; uniform vec3 uBrake; uniform vec3 uLamp;\n'
        + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb, uBrake, min(1.0, vRear) * 0.8);\ntotalEmissiveRadiance += uBrake * vRear * 0.7 + uLamp * vFront * 0.9;');
    };
    this.mat.customProgramCacheKey = () => 'traffic-car';
    const geo = carGeometry();
    this.brake = new THREE.InstancedBufferAttribute(new Float32Array(MAX_CARS), 1); this.brake.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aBrake', this.brake);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, MAX_CARS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.userData['noShadow'] = true;
    // each car its colour, a touch lighter or darker
    const cols = [PAL['car-1'], PAL['car-2'], PAL['car-3'], PAL['car-4'], PAL['car-5'], PAL['car-6']], c = new THREE.Color();
    for (let i = 0; i < MAX_CARS; i++) { const k = hash(i, 3); this.mesh.setColorAt(i, c.copy(cols[Math.floor(k * cols.length) % cols.length]!).multiplyScalar(0.88 + hash(i, 5) * 0.24)); }
    p.scene.add(this.mesh);
    // the wash: the texture over the stretches' bounds, on the roads' own materials now and the ground's once its cover is in
    this.cells = new Uint8Array(WASH * WASH * 4);
    this.tex = new THREE.DataTexture(this.cells, WASH, WASH); this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter; this.tex.needsUpdate = true;
    WASH_U.uJam.value = this.tex;
    this.lay();
    washPatch(MAT.road, '1.0', 'road');
    this.washRoads();
    void p.ground.then(m => { if (m && washPatch_ground(m)) this.washRoads(); });
    // the M60's few cars that run whatever the hour (src/render/landmarks.ts) give way to the sim's
    this.hidden = p.scene.getObjectByName('m60-cars') ?? null;
    if (this.hidden) this.hidden.visible = false;
    this.fade = p.reduced ? 1 : 0;
  }

  /** Fewer figures (the Low setting): fewer cars, the wash as it is. */
  setLow(low: boolean): void { this.cap = low ? LOW_CARS : MAX_CARS; }

  /** Any other road material takes the wash too (found by its colour: the road's, but not MAT.road; the buses' and the
   * main roads draw with MAT.road itself). */
  private washRoads(): void {
    this.p.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh) return;
      const m = o.material;
      if (m instanceof THREE.MeshLambertMaterial && m !== MAT.road && !m.vertexColors && m.color.equals(PAL.road)) washPatch(m, '1.0', 'road');
    });
  }

  /** Lay every stretch on the ground as it is now; and the wash's cells, each with the stretch nearest it. */
  private lay(): void {
    const def = this.p.def as MainDef, deck = deckAt(def);
    const xz = ([lat, lon]: LL): XZ => { const q = projectLatLon(lat, lon, def.origin); return [q.x, q.z]; };
    this.laid = [];
    for (const s of D.stretches) {
      const c = (s as Partial<Course>), road = def.mainRoads?.find(r => r.id === c.on), pts = c.on ? courseOf(def, c.on) : null;
      const j = road?.junctions.find(q => q.name === c.head); if (!c.at || !pts || pts.length < 2 || !j) continue;
      // the DfT's link either side of its count point, along the road (clipped to its ends), the cars running towards
      // the head from the end further from it
      const len = along(pts, ...pts[pts.length - 1]!), mid = along(pts, ...xz(c.at)), h = along(pts, ...xz(j.at));
      let a = Math.max(0, mid - s.km * 500), b = Math.min(len, mid + s.km * 500);
      if (Math.abs(h - a) < Math.abs(h - b)) [a, b] = [b, a];
      const raw = slice(pts, a, b); if (raw.length < 2) continue;
      const path = pathThrough(raw);
      for (let k = 0; k < path.pts.length; k++) { const [px, pz] = path.pts[Math.max(0, k - 1)]!, [qx, qz] = path.pts[Math.min(path.pts.length - 1, k + 1)]!, y = deck(...path.pts[k]!, qx - px, qz - pz); if (y !== null && y > path.y[k]!) path.y[k] = y; }
      const head = Math.max(0, Math.min(path.len, Math.abs(h - a)));
      // each way's lanes out from the middle of the road, a lane's width apart (a motorway's three a side, past its central reserve)
      const motorway = /^M/.test(road!.ref), lanes = motorway ? 3 : Math.max(1, Math.min(2, s.lanes)), w = LANE;
      const offset = Array.from({ length: lanes }, (_, k) => (motorway ? 2.4 : 0.2) + w / 2 + k * w);
      const n = Math.max(1, Math.ceil(path.len / CHUNK)), mids = new Float32Array(n * 2);
      for (let k = 0; k < n; k++) { const at = place(path, Math.min(path.len, (k + 0.5) * CHUNK)); mids[k * 2] = at.x; mids[k * 2 + 1] = at.z; }
      this.laid.push({ id: s.id, path, head, lanes, offset, mids, width: lanes * w * 2 });
    }
    // the wash's bounds: every stretch, and a margin
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const L of this.laid) for (const [x, z] of L.path.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const M = 500; Object.assign(this.box, { x0: x0 - M, z0: z0 - M, w: x1 - x0 + 2 * M, h: z1 - z0 + 2 * M });
    WASH_U.uJamBox.value.set(this.box.x0, this.box.z0, 1 / this.box.w, 1 / this.box.h);
    // each cell: the stretch nearest its middle, and how near (the road itself full, the streets round it fading out)
    this.nearest = new Int8Array(WASH * WASH).fill(-1);
    for (let j = 0; j < WASH; j++) for (let i = 0; i < WASH; i++) {
      const x = this.box.x0 + (i + 0.5) / WASH * this.box.w, z = this.box.z0 + (j + 0.5) / WASH * this.box.h;
      let best = Infinity, k = -1;
      this.laid.forEach((L, n) => { for (let q = 0; q < L.path.pts.length; q += 10) { const [px, pz] = L.path.pts[q]!, e = Math.hypot(px - x, pz - z); if (e < best) { best = e; k = n; } } });
      const c = (j * WASH + i) * 4, near = best < 80 ? 1 : Math.max(0, 1 - (best - 80) / 280);
      this.nearest[j * WASH + i] = near > 0 ? k : -1; this.cells[c + 1] = Math.round(near * 255); this.cells[c + 3] = 255;
    }
    this.tex.needsUpdate = true;
  }

  /** Each frame: read the roads when they'd have moved (at most twice a second), ease the wash, and place the cars near
   * the camera. dt real seconds, dtGame the sim's; daylight 0 (night) to 1 (noon). */
  sync(dt: number, dtGame: number, daylight: number): void {
    const sim = this.p.sim();
    // the roads laid again as the ground's read more finely, at most every 3 s, while the camera's near enough for cars
    if (groundVersion() !== this.laidOn && this.p.focus().r < FAR) { const now = performance.now(); if (now - this.laidAt > 3000) { this.laidOn = groundVersion(); this.laidAt = now; this.lay(); this.washRoads(); } }
    this.acc += dt;
    if (this.acc >= READ_EVERY) {
      this.acc = 0;
      const k = trafficKey(sim, D);
      if (k !== this.key) { this.key = k; const t = traffic(sim, TUNING, D); this.hour = t.hour; this.off = t.off; this.start = t.start; this.read = true; this.roads.clear(); for (const r of t.roads) this.roads.set(r.id, r); }
      this.washEase();
    }
    if (!this.p.reduced) this.clock += dtGame;
    this.fade = Math.min(1, this.fade + dt);
    strong += Math.max(-dt * 2, Math.min(dt * 2, strongTo - strong));
    WASH_U.uWash.value = this.fade * (1 + 0.25 * strong);
    this.U.uLit.value = 1 - Math.max(0, Math.min(1, (daylight - 0.04) / 0.2));
    this.place();
  }

  /** A stretch as it stands now, by id (its card). */
  road(id: string): Road | undefined { return this.roads.get(id); }
  /** A stretch's data, by id. */
  def(id: string): StretchDef | undefined { return D.stretches.find(d => d.id === id); }
  /** The score: cars off the roads at the morning peak against the start's, once read. */
  score(): { off: number; start: number } | null { return this.read ? { off: this.off, start: this.start } : null; }
  /** Where a stretch's middle is on the canvas, or null if it isn't laid or is behind the camera (the checks). */
  screenOf(id: string, camera: THREE.Camera, w: number, h: number): [number, number] | null {
    const L = this.laid.find(l => l.id === id); if (!L) return null;
    const k = Math.floor(L.path.pts.length / 2), [px, pz] = L.path.pts[k]!; TAP.set(px, L.path.y[k]!, pz).project(camera);
    return TAP.z > 1 ? null : [(TAP.x + 1) / 2 * w, (1 - TAP.y) / 2 * h];
  }
  /** The stretch under a tap at (x, y) on the canvas (within 24 px of where its road is drawn), or null. */
  tap(x: number, y: number, camera: THREE.Camera, w: number, h: number): string | null {
    let best: string | null = null, bd = 24 * 24;
    for (const L of this.laid) for (let k = 0; k < L.path.pts.length; k += 2) {
      const [px, pz] = L.path.pts[k]!; TAP.set(px, L.path.y[k]!, pz).project(camera);
      if (TAP.z > 1) continue;
      const dx = (TAP.x + 1) / 2 * w - x, dy = (1 - TAP.y) / 2 * h - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = L.id; }
    }
    return best;
  }
  /** Ease each stretch's shown load towards the read one and write the wash's cells if any moved. */
  private washEase(): void {
    let moved = false;
    const loads = this.laid.map(L => {
      const want = this.roads.get(L.id)?.load ?? 0, was = this.shown.get(L.id);
      const now = was === undefined || this.p.reduced ? want : was + (want - was) * 0.5;
      this.shown.set(L.id, now); return now;
    });
    for (let q = 0; q < WASH * WASH; q++) {
      const k = this.nearest[q]!; if (k < 0) continue;
      const v = Math.round(Math.min(1, loads[k]! / 2) * 255);
      if (this.cells[q * 4] !== v) { this.cells[q * 4] = v; moved = true; }
    }
    if (moved) this.tex.needsUpdate = true;
  }

  /** The cars near where the camera looks: on each stretch near it, both ways, every lane, its queue and the cars
   * moving behind it. Nearest first, in rings out to NEAR, so the cap leaves out the furthest. */
  private place(): void {
    const f = this.p.focus(), cap = Math.round(this.cap * this.fade);
    this.n = 0; this.queued = 0; this.braking = 0; this.sig = 0; this.fx = f.tx; this.fz = f.tz; this.queuedOn.fill(0);
    if (f.r < FAR && cap > 0) for (let ring = 1; ring <= RINGS && this.n < cap; ring++) {
      this.r0 = NEAR * (ring - 1) / RINGS; this.r1 = NEAR * ring / RINGS;
      for (let li = 0; li < this.laid.length; li++) {
        const L = this.laid[li]!, r = this.roads.get(L.id); if (!r) continue;
        // which pieces of the stretch reach into this ring: [lo, hi] along it
        let lo = Infinity, hi = -Infinity;
        for (let k = 0; k < L.mids.length / 2; k++) {
          const e = Math.hypot(L.mids[k * 2]! - f.tx, L.mids[k * 2 + 1]! - f.tz);
          if (e < this.r1 + CHUNK && e > this.r0 - CHUNK) { lo = Math.min(lo, k * CHUNK); hi = Math.max(hi, (k + 1) * CHUNK); }
        }
        if (lo > hi) continue;
        hi = Math.min(hi, L.path.len);
        const am = this.hour < 12, flowShare = am ? 0.6 : 0.4, queueShare = am ? 0.75 : 0.25;
        const speed = Math.max(r.speed, 4) / 3.6;   // m/s
        for (let way = 0; way < 2 && this.n < cap; way++) {
          // way 0 runs from the stretch's start to its end, queueing back from its head; way 1 back, queueing from its start
          const share = way ? 1 - flowShare : flowShare, qShare = way ? 1 - queueShare : queueShare;
          const qLen = Math.min(way ? L.path.len : L.head, r.queue * qShare * GAP / L.lanes);
          const perLane = r.cars * share / L.lanes;                       // vehicles an hour in each lane
          const spacing = Math.max(GAP + 2, speed * 3600 / Math.max(1, perLane));
          const crawl = r.queue > 0 || r.speed < SLOW ? 1 : 0;
          const q0 = way ? 0 : L.head - qLen, q1 = way ? qLen : L.head;
          for (let ln = 0; ln < L.lanes && this.n < cap; ln++) {
            const off = -L.offset[ln]!;   // on the left, each way
            // the queue: nose to tail back from the head (way 0's at L.head, way 1's at the start)
            if (qLen >= GAP / 2) for (let k = Math.max(0, Math.floor((way ? lo - q0 : q1 - hi) / GAP)); this.n < cap; k++) {
              const d = way ? q0 + k * GAP : q1 - k * GAP;
              if (way ? d > Math.min(q1, hi) : d < Math.max(q0, lo)) break;
              if (d >= lo && d <= hi && this.put(L.path, d, off, way, 1)) { this.queued++; this.queuedOn[li] = (this.queuedOn[li] ?? 0) + 1; }
            }
            // the rest moving at the stretch's speed, spaced by its flow, each lane its own phase
            const phase = ((this.clock * speed + hash(ln + way * 7, L.head) * spacing) % spacing + spacing) % spacing;
            for (let k = Math.ceil((lo - phase) / spacing); this.n < cap; k++) {
              const s = k * spacing + phase; if (s > hi) break;
              const d = way ? L.path.len - s : s;
              if (d < 0 || d > L.path.len || (qLen > 0 && d >= q0 && d <= q1)) continue;
              this.put(L.path, d, off, way, crawl);
            }
          }
        }
      }
    }
    const n = this.n, mesh = this.mesh;
    mesh.count = n;
    if (n) { mesh.instanceMatrix.needsUpdate = true; this.brake.needsUpdate = true; }
    Object.assign(this.drawn, { cars: n, queued: this.queued, braking: this.braking, moving: n - this.queued, sig: Math.round(this.sig) });
  }
  /** This frame's cars so far, where the camera looks, and the ring being filled (from r0 to r1 m from it). */
  private queuedOn: number[] = [];
  private n = 0; private queued = 0; private braking = 0; private sig = 0; private fx = 0; private fz = 0; private r0 = 0; private r1 = 0;

  /** The next car at d along a path, off metres to its left, heading along it (way 0) or back (way 1), brake lights b,
   * if it's in the ring being filled. */
  private put(path: Path, d: number, off: number, way: number, b: number): boolean {
    const at = place(path, d), dx = way ? -at.dx : at.dx, dz = way ? -at.dz : at.dz, x = at.x - dz * off, z = at.z + dx * off;
    const e = Math.hypot(x - this.fx, z - this.fz);
    if (e > this.r1 || e <= this.r0) return false;
    POS.set(x, at.y + 0.02, z);
    QT.setFromAxisAngle(UP, Math.atan2(-dz, dx));
    M4.compose(POS, QT, ONE); this.mesh.setMatrixAt(this.n, M4);
    (this.brake.array as Float32Array)[this.n] = b;
    this.n++; if (b) this.braking++; this.sig += x + z;
    return true;
  }

  /** What's drawn and read (the checks): the cars, each stretch's load read and shown, the wash's cells past 0.9 and
   * past 1.15, and the cap. */
  stats(): { queuedOn: Record<string, number>; cars: number; queued: number; braking: number; moving: number; sig: number; cap: number; hour: number; loads: Record<string, number>; shown: Record<string, number>; queues: Record<string, number>; amber: number; coral: number; wash: number; laid: string[] } {
    let amber = 0, coral = 0;
    for (let q = 0; q < WASH * WASH; q++) { const l = this.cells[q * 4]! / 255 * 2, w = this.cells[q * 4 + 1]! / 255; if (w > 0.5 && l >= 1.15) coral++; else if (w > 0.5 && l >= 0.9) amber++; }
    const rec = (f: (r: Road) => number) => Object.fromEntries([...this.roads.values()].map(r => [r.id, Math.round(f(r) * 1000) / 1000]));
    const queuedOn = Object.fromEntries(this.laid.map((L, k) => [L.id, this.queuedOn[k] ?? 0]));
    return { ...this.drawn, queuedOn, cap: this.cap, hour: this.hour, loads: rec(r => r.load), queues: rec(r => r.queue), shown: Object.fromEntries([...this.shown].map(([k, v]) => [k, Math.round(v * 1000) / 1000])), amber, coral, wash: WASH_U.uWash.value, laid: this.laid.map(L => L.id) };
  }
}

/** The ground: the wash on the cover's streets, if the cover's patch is there to read. */
function washPatch_ground(m: THREE.Material): boolean {
  if (m.userData['jam']) return false;
  const prev = m.onBeforeCompile.bind(m);
  // the street mask reads the cover's own uniforms, so it goes in only where the cover's patch put them
  m.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    const fn = shader.fragmentShader.includes('uCoverGrid') ? STREET_FN : 'float jamStreet() { return 0.0; }';
    shader.fragmentShader = shader.fragmentShader.replace('void main() {', fn + '\nvoid main() {');
  };
  washPatch(m, STREET_MASK, 'ground');
  return true;
}

const M4 = new THREE.Matrix4(), QT = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), POS = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
const AT = { x: 0, y: 0, z: 0, dx: 1, dz: 0 };
/** Where d along a path is, and the way along it there (into one shared object). */
function place(p: Path, d: number): typeof AT {
  let lo = 1, hi = p.d.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (p.d[m]! < d) lo = m + 1; else hi = m; }
  const k = lo, [ax, az] = p.pts[k - 1]!, [bx, bz] = p.pts[k]!, seg = p.d[k]! - p.d[k - 1]! || 1, t = Math.max(0, Math.min(1, (d - p.d[k - 1]!) / seg));
  AT.x = ax + (bx - ax) * t; AT.z = az + (bz - az) * t; AT.y = p.y[k - 1]! + (p.y[k]! - p.y[k - 1]!) * t + 0.08;
  AT.dx = (bx - ax) / seg; AT.dz = (bz - az) / seg;
  return AT;
}
/** A number in [0, 1) from two (cosmetic: which colour a car is, where a lane's cars start). */
function hash(a: number, b: number): number { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
