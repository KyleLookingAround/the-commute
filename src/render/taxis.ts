// Taxi ranks: a shelter, the yellow-marked bay and a sign, and the cabs. Cabs wait nose to tail; when the sim's rank
// has one fewer in, someone walks from the station's entrance to the front cab and it pulls away, and the rest move up;
// when one's back from its fare it drives in at the back. All out, the rank stands empty. The kit part (`taxi`) is
// built here and noted per station; TaxiLayer reads the sim on a timer, moves the cabs every frame, and only ever reads
// the sim. Cabs and people are instanced; nothing here changes the game.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, PAL, box } from './scene.ts';
import type { Sim } from '../sim/sim.ts';

/** The kit part: the front of the queue at (u, v) on the ground (or y), n cab spaces back along `back` (a direction
 * in (u, v), +u if not given), the kerb and shelter on the `kerb` side of it (+1 to the left looking from the front
 * back along the queue), and where people come from (`door`, the station's way out, in (u, v)). */
export interface RankPart { u: number; v: number; y?: number; n?: number; back?: [number, number]; kerb?: 1 | -1; door?: [number, number]; note?: string }

const SP = 6.5;          // metres between cabs in the queue
const OUT = 70;          // how far past the front a cab drives before it's out of the picture
const IN = 70;           // ...and how far back beyond the last space one drives in from
const VMAX = 9;          // m/s at most, about 20 mph
const WALK = 2.5;        // real seconds for someone to walk from the door to the front cab
const TICK = 0.5;        // real seconds between looks at the sim

const lam = (c: THREE.Color) => new THREE.MeshLambertMaterial({ color: c });
const BODY = lam(PAL.cab), BAY = lam(PAL['cab-bay']);
/** The For Hire light on a cab's roof, lit whenever it's waiting or coming back. */
const LIGHT = new THREE.MeshBasicMaterial({ color: PAL['cab-sign'] });
const COAT = lam(PAL.pax);
const B = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// a black cab pointing along +z: body, the tall cabin, wheels under; 1.25 times real across the line like everything else
const CAB = mergeGeometries([B(2.2, 0.85, 4.6, 0, 0.75, 0), B(2.0, 0.8, 2.9, 0, 1.55, -0.3), B(2.3, 0.5, 0.9, 0, 0.35, 1.5), B(2.3, 0.5, 0.9, 0, 0.35, -1.5)]);
const ROOF = B(0.7, 0.2, 0.3, 0, 2.05, 0.6);
const PERSON = mergeGeometries([new THREE.CylinderGeometry(0.26, 0.3, 1.25, 8).translate(0, 0.62, 0), new THREE.SphereGeometry(0.2, 8, 6).translate(0, 1.45, 0)]);

/** The TAXI sign's face, drawn once and shared. */
let signMat: THREE.Material | null = null;
function sign(): THREE.Material {
  if (signMat) return signMat;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 48;
  const x = cv.getContext('2d');
  if (x) { x.fillStyle = '#' + PAL['cab-sign'].getHexString(); x.fillRect(0, 0, 128, 48); x.fillStyle = '#' + PAL['board-ink'].getHexString(); x.font = '700 34px Arial, Helvetica, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('TAXI', 64, 26); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return (signMat = new THREE.MeshBasicMaterial({ map: tex }));
}

/** A rank as drawn: its frame, its cabs (a fixed pool: where each is along the queue, and the queue's order front
 * first), and whoever's walking to the front cab. */
interface Rank {
  u: number; v: number; y: number; n: number; bu: number; bv: number; su: number; sv: number; du: number; dv: number;
  cabs: THREE.InstancedMesh; lights: THREE.InstancedMesh; people: THREE.InstancedMesh;
  /** Each cab's distance back from the front space (below zero once it's pulling away), and whether it's in use. */
  d: Float32Array; used: Uint8Array;
  /** The queue, front first, as indices into d; `len` of them. */
  q: Int8Array; len: number;
  /** The cab pulling away, if any (-1 when none). */
  out: number;
  /** How many should stand here, from the sim; how far the walk to the front cab has got (-1 when nobody's walking). */
  want: number; walk: number; party: number; moving: boolean; first: boolean;
}
const ranks = new WeakMap<object, Rank[]>();

/** Build a rank into a station's group; `owner` is the station's Live, which TaxiLayer finds its ranks by. */
export function buildRank(gp: THREE.Group, p: RankPart, owner: object): void {
  const n = p.n ?? 5, y = p.y ?? 0, [bu0, bv0] = p.back ?? [1, 0], bl = Math.hypot(bu0, bv0) || 1, bu = bu0 / bl, bv = bv0 / bl;
  const k = p.kerb ?? 1, su = -bv * k, sv = bu * k;           // across the queue, to the kerb
  const L = n * SP, yaw = Math.atan2(bu, bv);                 // a box's depth (z) along the queue
  const at = (along: number, across: number): [number, number] => [p.u + bu * along + su * across, p.v + bv * along + sv * across];
  const piece = (w: number, h: number, d: number, mat: THREE.Material, along: number, across: number, y0: number) => {
    const [u, v] = at(along, across); const m = box(gp, w, h, d, mat, u, y0, v); m.rotation.y = yaw; return m;
  };
  // the bay: tarmac, a yellow edge line along the kerb, a broken line on the road side, ends across, and the kerb itself
  piece(4, 0.04, L + 6, MAT.road, L / 2 - SP / 2, 0, y + 0.01);
  piece(0.25, 0.04, L, BAY, L / 2 - SP / 2, 1.6, y + 0.03);
  for (let a = -SP / 2; a < L - SP / 2; a += 2) piece(0.25, 0.04, 1, BAY, a + 0.5, -1.6, y + 0.03);
  for (const a of [-SP / 2, L - SP / 2]) piece(3.2, 0.04, 0.25, BAY, a, 0, y + 0.03);
  piece(0.4, 0.2, L + 4, MAT.concrete, L / 2 - SP / 2, 2.2, y + 0.1);
  // the shelter by the front space on the pavement, and the sign at the head of the rank
  piece(3.2, 0.2, 5, MAT.canopy, 1, 4, y + 2.8);
  for (const da of [-1.2, 3.2]) piece(0.15, 2.7, 0.15, MAT.steel, da, 5.2, y + 1.35);
  piece(0.12, 3, 0.12, MAT.steel, -SP / 2 - 1, 2.6, y + 1.5);
  const s = piece(2.2, 0.8, 0.08, sign(), -SP / 2 - 1, 2.6, y + 3.1); s.rotation.y = yaw + Math.PI / 2;
  // the cabs, their roof lights and the people walking to them, all instanced; the pool has room for one pulling away
  // and one coming in besides the spaces
  const pool = n + 2, mk = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number) => {
    const m = new THREE.InstancedMesh(geo, mat, count); m.frustumCulled = false; m.count = 0; gp.add(m); return m;
  };
  const [du, dv] = p.door ?? at(-SP, 6);
  const r: Rank = {
    u: p.u, v: p.v, y, n, bu, bv, su, sv, du, dv,
    cabs: mk(CAB, BODY, pool), lights: mk(ROOF, LIGHT, pool), people: mk(PERSON, COAT, 3),
    d: new Float32Array(pool), used: new Uint8Array(pool), q: new Int8Array(pool), len: 0, out: -1,
    want: n, walk: -1, party: 1, moving: true, first: true,
  };
  fill(r, n); place(r);
  // the bounds the preview frames: every space full
  r.cabs.computeBoundingBox(); r.cabs.computeBoundingSphere();
  const list = ranks.get(owner) ?? []; list.push(r); ranks.set(owner, list);
}

/** Straight to `k` cabs in their spaces, nobody walking: the first look, or after time ran faster than they can drive. */
function fill(r: Rank, k: number): void {
  r.used.fill(0); r.len = 0; r.out = -1; r.walk = -1;
  for (let j = 0; j < k; j++) { r.used[j] = 1; r.d[j] = j * SP; r.q[r.len++] = j; }
  r.moving = true;
}

const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
/** One cab's matrix from where it is along the queue, as instance `c` (and its lit roof light as `lit`, unless -1). */
function putCab(r: Rank, j: number, c: number, lit: number): void {
  const d = r.d[j]!; pos.set(r.u + r.bu * d, r.y, r.v + r.bv * d); m4.compose(pos, qt, one);
  r.cabs.setMatrixAt(c, m4); if (lit >= 0) r.lights.setMatrixAt(lit, m4);
}
/** Write every cab's and walker's matrix from where they are now. */
function place(r: Rank): void {
  qt.setFromAxisAngle(up, Math.atan2(-r.bu, -r.bv));          // cabs face the front: against `back`
  let c = 0;
  for (; c < r.len; c++) putCab(r, r.q[c]!, c, c);
  const lit = c;
  if (r.out >= 0) putCab(r, r.out, c++, -1);                  // hired: its light goes out
  r.cabs.count = c; r.lights.count = lit;
  r.cabs.instanceMatrix.needsUpdate = true; r.lights.instanceMatrix.needsUpdate = true;
  // the party walks from the door to the kerb beside the front cab
  if (r.walk >= 0) {
    const t = Math.min(1, r.walk / WALK), ku = r.u + r.su * 2.4, kv = r.v + r.sv * 2.4;
    for (let k = 0; k < r.party; k++) {
      const off = (k - (r.party - 1) / 2) * 0.9;
      pos.set(r.du + (ku - r.du) * t + r.bu * off, r.y, r.dv + (kv - r.dv) * t + r.bv * off);
      m4.compose(pos, qt, one); r.people.setMatrixAt(k, m4);
    }
    r.people.count = r.party; r.people.instanceMatrix.needsUpdate = true;
  } else r.people.count = 0;
}

/** Brings every station's ranks round: how many cabs stand at each from the sim, on a timer; the cabs moving every frame. */
export class TaxiLayer {
  private readonly ranks: Rank[][];
  private acc = TICK;
  constructor(built: { live: object }[]) { this.ranks = built.map(b => ranks.get(b.live) ?? []); }

  /** dt: real seconds since the last frame; dtGame: sim seconds, which is how fast time is running. */
  sync(sim: Sim, dt: number, dtGame: number): void {
    this.acc += dt;
    if (this.acc >= TICK) {
      this.acc = 0;
      this.ranks.forEach((list, i) => {
        if (!list.length) return;
        const st = sim.g.st[i], bought = !!sim.g.owned[i] && !!sim.g.ups[i]?.taxi;
        for (const r of list) {
          // not bought: every space full, for the preview; bought: the cabs the sim has in, as many as there's room for
          const want = bought && st ? Math.min(r.n, sim.cabsIn(i)) : r.n;
          // a jump (back from away, a new game) or time too fast to watch: straight there
          if (r.first || Math.abs(want - r.len) > 2 || dtGame > dt * 12) { if (want !== r.len || r.first) { fill(r, want); place(r); } r.first = false; }
          r.want = want;
        }
      });
    }
    for (const list of this.ranks) for (const r of list) step(r, dt);
  }
}

/** Move a rank on by dt real seconds: a cab back from a fare drives in at the back; when one fewer should be here,
 * someone walks out to the front cab, it pulls away once they reach it, and the rest move up. */
function step(r: Rank, dt: number): void {
  while (r.len < Math.min(r.want, r.n)) {
    let j = 0; while (j < r.used.length && r.used[j]) j++;
    if (j >= r.used.length) break;
    const last = r.len ? r.d[r.q[r.len - 1]!]! : 0;
    r.used[j] = 1; r.d[j] = Math.max(r.n * SP + IN, last + SP); r.q[r.len++] = j; r.moving = true;
  }
  // the front cab has to be standing in its space before anyone gets in
  if (r.len > r.want && r.walk < 0 && r.out < 0 && r.d[r.q[0]!]! < 0.5) { r.walk = 0; r.party = 1 + (r.q[0]! % 3 === 0 ? 1 : 0); }
  if (!r.moving && r.walk < 0 && r.out < 0) return;
  let moved = false;
  if (r.walk >= 0) {
    r.walk += dt; moved = true;
    if (r.walk >= WALK) {
      // they're in: the front cab pulls away and the rest move up
      r.walk = -1; r.out = r.q[0]!;
      for (let k = 1; k < r.len; k++) r.q[k - 1] = r.q[k]!;
      r.len--;
    }
  }
  if (r.out >= 0) {
    const j = r.out; r.d[j] = r.d[j]! - Math.min(VMAX, 2 - r.d[j]! * 0.6) * dt; moved = true;
    if (r.d[j]! < -OUT) { r.used[j] = 0; r.out = -1; }
  }
  for (let k = 0; k < r.len; k++) {
    const j = r.q[k]!, target = k * SP, gap = r.d[j]! - target;
    if (gap > 0.01) { r.d[j] = Math.max(target, r.d[j]! - Math.min(VMAX, 0.5 + gap * 0.8) * dt); moved = true; }
  }
  r.moving = moved;
  place(r);
}
