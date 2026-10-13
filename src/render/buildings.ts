// The real surroundings: every building from OpenStreetMap where it stands, at its real height, with its real roof
// (tools/osm-to-world.mjs writes them by kilometre square into src/data/world/), drawn in the model-railway style.
// - The squares are fetched after the first frame, nearest the camera first, as the fine terrain is; a square waits for
//   the fine terrain under it, so its buildings stand on the ground as drawn.
// - Each building moves out from the line as the ground beside it is read (Terrain.drawnAt), and stands on its lowest
//   corner. Left out: anything on the railway's land or its cutting and embankment slopes, on a station's kit (its parts
//   draw their own), or on the roads the replacement buses drive.
// - Drawn merged by half-kilometre chunk, one draw call each: walls and roofs (pitched, hipped or flat) near the camera,
//   blocks with a flat top further off; only the near chunks cast shadows (all take them), and Low (Settings, Graphics)
//   leaves out the far ones.
import * as THREE from 'three';
import { PAL } from './scene.ts';
import { partBoxes } from './terrain.ts';
import { onCourses, standing } from './landmarks.ts';
import type { KitDef, Terrain, TerrainLayer } from './terrain.ts';
import type { Network } from '../sim/network.ts';
import type { NetworkGeoDef } from '../sim/types.ts';

/** The squares' size (the tool's), and the chunks each is drawn in. */
export const SQUARE = 1000;
const CHUNK = 250;
const NEAR = 900;        // a square this near the camera is drawn in full
const SHADOW = 400;      // and its chunks cast shadows this near
const TREE_NEAR = 550;   // a chunk's trees this near are drawn one by one with their trunks; further off, only the big
const TREE_BIG = 8;      // clumps (spread 8 m or more) as plainer crowns
const FAR_LOW = 1600;    // on Low, nothing further than this
const RAIL_MARGIN = 4;   // metres kept clear beyond the railway's land
const RAIL_REACH = 300;  // the land (80 m at its widest) and its slopes (the terrain's strip, 150 m) lie within this of the line
const KIT_MARGIN = 3;
const ROAD_CLEAR = 4;    // half a road's width
const EAVE = 0.3;        // a pitched roof's overhang

// ---- the tiles' text encoding (encode in tools/osm-to-world.mjs) ----
const ALPHA: number[] = []; for (let k = 35; k <= 125; k++) if (k !== 92) ALPHA.push(k);
const INDEX = new Int16Array(128).fill(-1); ALPHA.forEach((c, i) => { INDEX[c] = i; });
const num = (s: string, p: number, digits: number) => { let v = 0; for (let k = 0; k < digits; k++) v = v * 90 + INDEX[s.charCodeAt(p + k)]!; return v; };

/** A building as surveyed (game metres, real): a rectangle (w along yaw, d across) or an outline; walls h high. */
export interface Piece { x: number; z: number; w: number; d: number; yaw: number; h: number; roof: 'f' | 'p' | 'h'; wall: string; top: string; flags: number; ring: Float32Array | null }

/** A square's header and pieces from its text. */
/** Ground cover: an area's class and outline, or a street's width and line (x, z pairs, real). */
export interface Cover { cls: string; w: number; pts: Float32Array }

export function decodeWorld(key: string, text: string): { head: Record<string, unknown>; pieces: Piece[]; trees: Float32Array; cover: Cover[] } {
  const [i, j] = key.split('_').map(Number) as [number, number], X = i * SQUARE - 500, Z = j * SQUARE - 500;
  const lines = text.split('\n'), head = JSON.parse(lines[0]!) as Record<string, unknown>, pieces: Piece[] = [];
  let trees = new Float32Array(0); const cover: Cover[] = [];
  // an area's or street's points from p: the first in full, then steps of whole metres ('~' and in full for a long one)
  const points = (l: string, p: number, n: number): Float32Array => {
    const out = new Float32Array(n * 2); let qx = 0, qz = 0;
    for (let q = 0; q < n; q++) {
      if (q === 0 || l[p] === '~') { if (q) p++; const x = num(l, p, 2) / 4, z = num(l, p + 2, 2) / 4; qx = Math.round(x); qz = Math.round(z); out[q * 2] = X + x; out[q * 2 + 1] = Z + z; p += 4; }
      else { qx += INDEX[l.charCodeAt(p)]! - 44; qz += INDEX[l.charCodeAt(p + 1)]! - 44; out[q * 2] = X + qx; out[q * 2 + 1] = Z + qz; p += 2; }
    }
    return out;
  };
  for (let k = 1; k < lines.length; k++) {
    const l = lines[k]!; if (!l) continue;
    if (l[0] === 'R') for (let o = 1; o + 16 <= l.length; o += 16) {
      pieces.push({ x: X + num(l, o, 2) / 4, z: Z + num(l, o + 2, 2) / 4, w: num(l, o + 4, 2) / 10, d: num(l, o + 6, 2) / 10, yaw: num(l, o + 8, 2) / 8100 * Math.PI, h: num(l, o + 10, 2) / 10,
        roof: l[o + 12] as Piece['roof'], wall: l[o + 13]!, top: l[o + 14]!, flags: INDEX[l.charCodeAt(o + 15)]!, ring: null });
    } else if (l[0] === 'P') {
      const n = INDEX[l.charCodeAt(7)]!, ring = new Float32Array(n * 2);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let q = 0; q < n; q++) {
        const x = X + num(l, 8 + q * 4, 2) / 4, z = Z + num(l, 10 + q * 4, 2) / 4; ring[q * 2] = x; ring[q * 2 + 1] = z;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      pieces.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, yaw: 0, h: num(l, 1, 2) / 10, roof: 'f', wall: l[4]!, top: l[5]!, flags: INDEX[l.charCodeAt(6)]!, ring });
    } else if (l[0] === 'A') cover.push({ cls: l[1]!, w: 0, pts: points(l, 4, num(l, 2, 2)) });
    else if (l[0] === 'L') cover.push({ cls: 'r', w: num(l, 1, 1) / 2, pts: points(l, 4, num(l, 2, 2)) });
    else if (l[0] === 'T') {
      // each tree x, z, height, spread
      const n = (l.length - 1) / 5; trees = new Float32Array(n * 4);
      for (let q = 0; q < n; q++) { const p = 1 + q * 5, xz = num(l, p, 3); trees[q * 4] = X + 480 + Math.floor(xz / 832) * 1.25; trees[q * 4 + 1] = Z + 480 + (xz % 832) * 1.25; trees[q * 4 + 2] = num(l, p + 3, 1) / 2; trees[q * 4 + 3] = num(l, p + 4, 1) / 5; }
    }
  }
  return { head, pieces, trees, cover };
}

/** A pitched or hipped roof's rise over its walls. */
export const riseOf = (p: Piece): number => p.roof === 'f' ? 0 : Math.min(5, p.d * 0.35);

/** The corners of a piece's footprint (or its outline), as drawn. */
function corners(p: Piece): number[] {
  if (p.ring) return Array.from(p.ring);
  const ux = Math.cos(p.yaw), uz = Math.sin(p.yaw), a = p.w / 2, b = p.d / 2;
  return [p.x - ux * a + uz * b, p.z - uz * a - ux * b, p.x + ux * a + uz * b, p.z + uz * a - ux * b, p.x + ux * a - uz * b, p.z + uz * a + ux * b, p.x - ux * a - uz * b, p.z - uz * a + ux * b];
}

const NONE: [number, number, number, number][] = [];
/** The trees as drawn: eight numbers each (x, ground y, z, height, spread, which kind, lightness, spare). */
const TREE = 8;

/** What a piece may not stand on: the railway's land and its slopes, a station's kit, the buses' roads, the landmarks (their
 * buildings, the river and the M60). */
export class Keep {
  private kits: { x: number; z: number; dx: number; dz: number; nx: number; nz: number; boxes: [number, number, number, number][] }[] = [];
  private roadGrid = new Map<string, [number, number, number, number][]>();
  /** The buses' road stretches near a point (within 40 m of its 100 m cell). */
  private roads(x: number, z: number): [number, number, number, number][] { return this.roadGrid.get(`${Math.floor(x / 100)},${Math.floor(z / 100)}`) ?? NONE; }
  private course: (x: number, z: number, r: number) => boolean;
  constructor(private t: Terrain, net: Network, def: NetworkGeoDef, kits: Record<string, KitDef | undefined>) {
    // the river's and the M60's courses: asked only in the 50 m cells that are anywhere near them (a cell whose middle is
    // 50 m further off than the test reaches can't hold a point that's on them)
    const raw = onCourses(def), near = new Map<string, boolean>();
    this.course = (x, z, r) => {
      const i = Math.floor(x / 50), j = Math.floor(z / 50), key = `${i},${j}`;
      let n = near.get(key); if (n === undefined) { n = raw((i + 0.5) * 50, (j + 0.5) * 50, 50); near.set(key, n); }
      return n && raw(x, z, r);
    };
    for (const st of net.stations) {
      const kit = kits[st.kit]; if (!kit) continue;
      const F = net.stationFrame(st.id), boxes: [number, number, number, number][] = [];
      for (const part of kit.parts) for (const b of partBoxes({ ...part, street: false })) boxes.push(b);
      this.kits.push({ x: F.x, z: F.z, dx: F.dx, dz: F.dz, nx: F.nx, nz: F.nz, boxes });
    }
    for (const r of net.def.roads ?? []) for (let k = 1; k < r.points.length; k++) {
      const [ax, az] = r.points[k - 1]!, [bx, bz] = r.points[k]!, seg: [number, number, number, number] = [ax, az, bx, bz];
      // in every 100 m cell its box touches, padded
      for (let i = Math.floor((Math.min(ax, bx) - 40) / 100); i <= Math.floor((Math.max(ax, bx) + 40) / 100); i++) for (let j = Math.floor((Math.min(az, bz) - 40) / 100); j <= Math.floor((Math.max(az, bz) + 40) / 100); j++) {
        const key = `${i},${j}`; let l = this.roadGrid.get(key); if (!l) { l = []; this.roadGrid.set(key, l); } l.push(seg);
      }
    }
  }
  tree(x: number, z: number, r: number): boolean {
    const t = this.t;
    if (Math.abs(t.locate(x, z).o) < RAIL_REACH && t.railLand(x, z, 1 + r * 0.6)) return false;
    if (this.course(x, z, 0)) return false;
    for (const [sx, sz, sr] of standing) if (Math.hypot(x - sx, z - sz) < sr + r * 0.5) return false;
    for (const K of this.kits) {
      if (Math.hypot(x - K.x, z - K.z) > 400) continue;
      const ex = x - K.x, ez = z - K.z, u = ex * K.dx + ez * K.dz, v = ex * K.nx + ez * K.nz, m = 2 + r * 0.5;
      for (const [u0, u1, v0, v1] of K.boxes) if (u > u0 - m && u < u1 + m && v > v0 - m && v < v1 + m) return false;
    }
    for (const [ax, az, bx, bz] of this.roads(x, z)) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      if (Math.hypot(ax + dx * f - x, az + dz * f - z) < ROAD_CLEAR + 1) return false;
    }
    return true;
  }
  /** Whether a piece (drawn) may stand: every corner and its middle off the railway's land, off every kit's parts, and
   * no road through it. */
  ok(p: Piece): boolean {
    const cs = corners(p), t = this.t, R = Math.hypot(p.w, p.d) / 2;
    // the railway's land, its slopes and the strip they're drawn in reach no further than this from the line
    if (Math.abs(t.locate(p.x, p.z).o) < R + RAIL_REACH) {
      if (t.railLand(p.x, p.z, RAIL_MARGIN)) return false;
      for (let k = 0; k < cs.length; k += 2) if (t.railLand(cs[k]!, cs[k + 1]!, RAIL_MARGIN)) return false;
      // the long side of a big piece: its edges' middles too
      for (let k = 0; k < cs.length; k += 2) { const n = (k + 2) % cs.length; if (t.railLand((cs[k]! + cs[n]!) / 2, (cs[k + 1]! + cs[n + 1]!) / 2, RAIL_MARGIN)) return false; }
    }
    if (this.course(p.x, p.z, 0)) return false;
    for (let k = 0; k < cs.length; k += 2) if (this.course(cs[k]!, cs[k + 1]!, 0)) return false;
    for (const [x, z, r] of standing) if (Math.hypot(p.x - x, p.z - z) < r + R && (Math.hypot(p.x - x, p.z - z) < r || inPiece(p, cs, x, z, r))) return false;
    for (const K of this.kits) {
      if (Math.hypot(p.x - K.x, p.z - K.z) > 400 + R) continue;
      // only the boxes within reach of the piece (its middle in the kit's frame, give or take its size)
      const ex0 = p.x - K.x, ez0 = p.z - K.z, uc = ex0 * K.dx + ez0 * K.dz, vc = ex0 * K.nx + ez0 * K.nz;
      const boxes = K.boxes.filter(([u0, u1, v0, v1]) => Math.max(u0 - uc, 0, uc - u1) < R + KIT_MARGIN && Math.max(v0 - vc, 0, vc - v1) < R + KIT_MARGIN);
      if (!boxes.length) continue;
      const pts = [p.x, p.z, ...cs];
      for (const [u0, u1, v0, v1] of boxes) {
        // a corner in the box, or the box's middle in the piece
        for (let k = 0; k < pts.length; k += 2) {
          const ex = pts[k]! - K.x, ez = pts[k + 1]! - K.z, u = ex * K.dx + ez * K.dz, v = ex * K.nx + ez * K.nz;
          if (u > u0 - KIT_MARGIN && u < u1 + KIT_MARGIN && v > v0 - KIT_MARGIN && v < v1 + KIT_MARGIN) return false;
        }
        const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
        if (inPiece(p, cs, K.x + K.dx * um + K.nx * vm, K.z + K.dz * um + K.nz * vm, 0)) return false;
      }
      // and through the piece every 2 m, for a box across its middle
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < cs.length; k += 2) { x0 = Math.min(x0, cs[k]!); x1 = Math.max(x1, cs[k]!); z0 = Math.min(z0, cs[k + 1]!); z1 = Math.max(z1, cs[k + 1]!); }
      for (let x = x0 + 1; x < x1; x += 2) for (let z = z0 + 1; z < z1; z += 2) {
        if (!inPiece(p, cs, x, z, 0)) continue;
        const ex = x - K.x, ez = z - K.z, u = ex * K.dx + ez * K.dz, v = ex * K.nx + ez * K.nz;
        for (const [u0, u1, v0, v1] of boxes) if (u > u0 - KIT_MARGIN && u < u1 + KIT_MARGIN && v > v0 - KIT_MARGIN && v < v1 + KIT_MARGIN) return false;
      }
    }
    // (a piece wider than the grid's padding looks in the cells round it too)
    const near = R < 30 ? this.roads(p.x, p.z) : [...new Set([-1, 0, 1].flatMap(a => [-1, 0, 1].flatMap(b => this.roads(p.x + a * 100, p.z + b * 100))))];
    for (const [ax, az, bx, bz] of near) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, f = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l2));
      const qx = ax + dx * f, qz = az + dz * f;
      if (Math.hypot(qx - p.x, qz - p.z) > R + ROAD_CLEAR) continue;
      // the road's nearest point to the piece, then a few along it
      for (let s = -2; s <= 2; s++) { const g = Math.max(0, Math.min(1, f + s * 4 / Math.sqrt(l2))); if (inPiece(p, cs, ax + dx * g, az + dz * g, ROAD_CLEAR)) return false; }
    }
    return true;
  }
}

/** Whether a tree may stand at (x, z) with its crown r across: off the railway's land and its slopes, a kit's parts,
 * the landmarks, the river and the M60, and the buses' roads. */
export function treeOk(keep: Keep, x: number, z: number, r: number): boolean { return keep.tree(x, z, r); }

/** Whether (x, z) is inside a ring of x, z pairs. */
function inRing(pts: Float32Array, x: number, z: number): boolean {
  let k = false;
  for (let a = 0, b = pts.length - 2; a < pts.length; b = a, a += 2) { const ax = pts[a]!, az = pts[a + 1]!, bx = pts[b]!, bz = pts[b + 1]!; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) k = !k; }
  return k;
}

/** Whether (x, z) is within r of a piece's footprint. */
function inPiece(p: Piece, cs: number[], x: number, z: number, r: number): boolean {
  if (!p.ring) {
    const ux = Math.cos(p.yaw), uz = Math.sin(p.yaw), ex = x - p.x, ez = z - p.z;
    return Math.abs(ex * ux + ez * uz) < p.w / 2 + r && Math.abs(-ex * uz + ez * ux) < p.d / 2 + r;
  }
  let k = false;
  for (let a = 0, b = cs.length - 2; a < cs.length; b = a, a += 2) { const ax = cs[a]!, az = cs[a + 1]!, bx = cs[b]!, bz = cs[b + 1]!; if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) k = !k; }
  return k || nearRing(cs, x, z, r);
}

// ---- drawing ----
/** The colours a piece's walls and roof take (tokens), by the tool's letters. */
function colours() {
  return {
    wall: { b: PAL['bld-brick'], d: PAL['bld-brick-dark'], u: PAL['bld-buff'], r: PAL['bld-render'], s: PAL['bld-stone'], c: PAL['bld-concrete'], g: PAL['bld-glass'], m: PAL['bld-shed'] } as Record<string, THREE.Color>,
    top: { l: PAL['bld-slate'], t: PAL['bld-tile'], f: PAL['bld-felt'], m: PAL['bld-metal'] } as Record<string, THREE.Color>,
  };
}
const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

/** Vertices and triangles for one chunk's pieces, as they're added. */
class Builder {
  pos: number[] = []; col: number[] = []; idx: number[] = [];
  private v(x: number, y: number, z: number, c: THREE.Color): number { this.pos.push(x, y, z); this.col.push(c.r, c.g, c.b); return this.pos.length / 3 - 1; }
  /** A triangle facing (hx, hy, hz). */
  private tri(a: number, b: number, c: number, hx: number, hy: number, hz: number): void {
    const P = this.pos, ax = P[a * 3]!, ay = P[a * 3 + 1]!, az = P[a * 3 + 2]!;
    const ux = P[b * 3]! - ax, uy = P[b * 3 + 1]! - ay, uz = P[b * 3 + 2]! - az, vx = P[c * 3]! - ax, vy = P[c * 3 + 1]! - ay, vz = P[c * 3 + 2]! - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (nx * hx + ny * hy + nz * hz >= 0) this.idx.push(a, b, c); else this.idx.push(a, c, b);
  }
  /** Walls round a footprint (x, z pairs) from y0 to y1, and a flat top in `top`'s colour (unless it's roofed). */
  prism(cs: number[], y0: number, y1: number, wall: THREE.Color, top: THREE.Color | null): void {
    const n = cs.length / 2; let mx = 0, mz = 0; for (let k = 0; k < n; k++) { mx += cs[k * 2]! / n; mz += cs[k * 2 + 1]! / n; }
    const lo: number[] = [], hi: number[] = [];
    for (let k = 0; k < n; k++) { lo.push(this.v(cs[k * 2]!, y0, cs[k * 2 + 1]!, wall)); hi.push(this.v(cs[k * 2]!, y1, cs[k * 2 + 1]!, wall)); }
    for (let k = 0; k < n; k++) {
      const q = (k + 1) % n, ex = cs[q * 2]! - cs[k * 2]!, ez = cs[q * 2 + 1]! - cs[k * 2 + 1]!;
      // outward: square to the edge, away from the middle
      let hx = ez, hz = -ex; if (hx * ((cs[k * 2]! + cs[q * 2]!) / 2 - mx) + hz * ((cs[k * 2 + 1]! + cs[q * 2 + 1]!) / 2 - mz) < 0) { hx = -hx; hz = -hz; }
      this.tri(lo[k]!, lo[q]!, hi[q]!, hx, 0, hz); this.tri(lo[k]!, hi[q]!, hi[k]!, hx, 0, hz);
    }
    if (!top) return;
    const t: number[] = []; for (let k = 0; k < n; k++) t.push(this.v(cs[k * 2]!, y1, cs[k * 2 + 1]!, top));
    if (n === 4) { this.tri(t[0]!, t[1]!, t[2]!, 0, 1, 0); this.tri(t[0]!, t[2]!, t[3]!, 0, 1, 0); return; }
    const shape: THREE.Vector2[] = []; for (let k = 0; k < n; k++) shape.push(new THREE.Vector2(cs[k * 2]!, cs[k * 2 + 1]!));
    for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(shape, [])) this.tri(t[a!]!, t[b!]!, t[c!]!, 0, 1, 0);
  }
  /** A pitched or hipped roof on a rectangle's walls (top at y), its ridge along the long side. */
  roof(p: Piece, y: number, wall: THREE.Color, top: THREE.Color): void {
    const ux = Math.cos(p.yaw), uz = Math.sin(p.yaw), rise = riseOf(p), a = p.w / 2 + EAVE, b = p.d / 2 + EAVE, yr = y + rise;
    const ridge = p.roof === 'h' ? Math.max(0, p.w / 2 - p.d / 2) : p.w / 2;
    const at = (s: number, t: number, yy: number, c: THREE.Color) => this.v(p.x + ux * s - uz * t, yy, p.z + uz * s + ux * t, c);
    // eaves hang a little below the walls' top, outside them
    const ye = y - EAVE * rise / (p.d / 2);
    const e0 = at(-a, -b, ye, top), e1 = at(a, -b, ye, top), e2 = at(a, b, ye, top), e3 = at(-a, b, ye, top);
    const r0 = at(-(p.roof === 'h' ? ridge : a), 0, yr, top), r1 = at(p.roof === 'h' ? ridge : a, 0, yr, top);
    const nx = -uz, nz = ux;   // across, towards +t
    this.tri(e0, e1, r1, -nx, 1, -nz); this.tri(e0, r1, r0, -nx, 1, -nz);
    this.tri(e3, r1, e2, nx, 1, nz); this.tri(e3, r0, r1, nx, 1, nz);
    if (p.roof === 'h') { this.tri(e0, r0, e3, -ux, 1, -uz); this.tri(e1, e2, r1, ux, 1, uz); return; }
    // the gables: the walls carried up to the ridge
    for (const s of [-1, 1]) {
      const g0 = at(s * p.w / 2, -p.d / 2, y, wall), g1 = at(s * p.w / 2, p.d / 2, y, wall), g2 = at(s * p.w / 2, 0, yr - EAVE * 0.5, wall);
      this.tri(g0, g1, g2, s * ux, 0, s * uz);
    }
  }
  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(Uint8Array.from(this.col, v => Math.round(v * 255)), 3, true));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** A piece as drawn: moved out from the line, on its ground. */
interface Placed { p: Piece; cs: number[]; y0: number; y1: number }
/** A square as drawn: one merged block mesh for far off, and its chunks in full (built while the camera's near). */
interface Square { key: string; x0: number; z0: number; d: number; placed: Placed[]; far: THREE.Mesh; farTrees: THREE.InstancedMesh[]; chunks: Chunk[] }
/** A chunk: its pieces and trees, and its meshes in full while the camera's near (buildings, the two kinds of crown,
 * the trunks). */
interface Chunk { x: number; z: number; list: Placed[]; trees: number[]; mesh: THREE.Mesh | null; crowns: THREE.InstancedMesh[] | null }

/** The real buildings, as the page draws them. */
export class BuildingsLayer {
  readonly group = new THREE.Group();
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  /** The crowns' two kinds (a third blossom in spring and turn rust in autumn, the rest green to gold), coloured by the
   * season (season()), each tree a touch lighter or darker; and the trunks. */
  private leaves = [new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true })];
  private bark = new THREE.MeshLambertMaterial({ color: PAL.trunk });
  private crown = new THREE.IcosahedronGeometry(1, 0); private plain = new THREE.OctahedronGeometry(1, 0);
  private trunk = (() => { const g = new THREE.CylinderGeometry(0.22, 0.32, 1, 3, 1, true); g.translate(0, 0.5, 0); return g; })();
  /** The squares there are tiles for, and the pieces of each loaded so far (as drawn), for what keeps off them. */
  readonly squares: Set<string>;
  private placed = new Map<string, Placed[]>();
  private grid = new Map<string, Placed[]>();   // by 50 m cell, for blocked()
  private drawn: Square[] = [];
  private keep: Keep; private col = colours();
  private started = false; private low = false; private last = -1; private pending = false;
  private loaded = 0; private resolve: () => void = () => {};
  /** Resolves once every square is in. */
  readonly ready: Promise<void>;
  /** What was read and what was left out, for the checks. */
  readonly stats = { buildings: 0, pieces: 0, left: 0, trees: 0, treesLeft: 0 };

  /** The ground's cover: a layer of a texture array for each square (COVER_PX across), painted as it comes in, and
   * which layer each square has; the terrain's material mixes it in (coverPatch). */
  private cover: { tex: THREE.DataArrayTexture; layer: Map<string, number>; canvas: HTMLCanvasElement; colours: Record<string, string> } | null = null;

  constructor(private t: Terrain, private files: Record<string, string>, net: Network, def: NetworkGeoDef, kits: Record<string, KitDef | undefined>, private terrain: TerrainLayer | null = null) {
    this.squares = new Set(Object.keys(files)); this.keep = new Keep(t, net, def, kits);
    if (terrain && typeof document !== 'undefined' && this.squares.size) this.cover = coverPatch(terrain.material, [...this.squares].sort());
    this.ready = new Promise(r => { this.resolve = r; }); if (!this.squares.size) this.resolve();
    // a sentinel drawn every frame (it's empty): after the first frame, start fetching; then follow the camera
    const tick = new THREE.Mesh(new THREE.BufferGeometry(), this.material); tick.frustumCulled = false;
    tick.onBeforeRender = (_r, _s, cam) => { if (cam instanceof THREE.PerspectiveCamera) this.follow(cam.position); };
    this.group.add(tick);
  }

  /** Whether the square holding (x, z) has real buildings (so nothing made up stands there). */
  real(x: number, z: number): boolean { return this.squares.has(`${Math.floor(x / SQUARE)}_${Math.floor(z / SQUARE)}`); }

  /** Whether a circle r round (x, z) touches a real building drawn so far. */
  blocked(x: number, z: number, r: number): boolean {
    const C = 50;
    for (let i = Math.floor((x - r) / C) - 1; i <= Math.floor((x + r) / C) + 1; i++) for (let j = Math.floor((z - r) / C) - 1; j <= Math.floor((z + r) / C) + 1; j++) {
      for (const q of this.grid.get(`${i},${j}`) ?? []) if (inPiece(q.p, q.cs, x, z, r)) return true;
    }
    return false;
  }

  /** What kind of real gap a circle r round (x, z) is, for homes that grow (src/render/homes.ts): 'brown' on OSM's
   * brownfield, building land or greenfield; 'open' on open ground with no tree and no park, pitch, wood, water, yard,
   * car park or cemetery (buildings are World.buildable's); '' none. Outside the squares with tiles, 'open' (nothing's
   * known there, as before). */
  gap(x: number, z: number, r: number): '' | 'brown' | 'open' {
    if (!this.real(x, z)) return 'open';
    const C = 20;
    for (let i = Math.floor((x - r - 16) / C); i <= Math.floor((x + r + 16) / C); i++) for (let j = Math.floor((z - r - 16) / C); j <= Math.floor((z + r + 16) / C); j++) {
      const l = this.treeGrid.get(`${i},${j}`); if (!l) continue;
      for (let k = 0; k < l.length; k += 3) if (Math.hypot(x - l[k]!, z - l[k + 1]!) < r + l[k + 2]! * 0.7) return '';
    }
    let kind: '' | 'brown' | 'open' = 'open';
    for (const a of this.areas.get(`${Math.floor(x / SQUARE)}_${Math.floor(z / SQUARE)}`) ?? []) {
      if (x < a.x0 || x > a.x1 || z < a.z0 || z > a.z1 || !inRing(a.pts, x, z)) continue;
      if (a.cls === 'b' || a.cls === 'e') kind = 'brown'; else if ('phwagcy'.includes(a.cls)) return '';
    }
    return kind;
  }
  private treeGrid = new Map<string, number[]>();
  private areas = new Map<string, { cls: string; pts: Float32Array; x0: number; x1: number; z0: number; z1: number }[]>();

  /** Every square, now (the checks, and a screenshot that wants them at once). */
  async loadAll(): Promise<void> { this.started = true; await Promise.all([...this.squares].map(k => this.load(k))); this.last = -1; }

  setLow(low: boolean): void { this.low = low; this.last = -1; }

  /** Fetch the squares nearest the camera first; draw the near chunks in full, with shadows. Throttled. */
  follow(at: THREE.Vector3): void {
    if (!this.started) {
      this.started = true;
      const order = [...this.squares].sort((a, b) => dist(a, at) - dist(b, at));
      // a few at a time, nearest first
      const next = (): void => { const k = order.shift(); if (k) void this.load(k).then(next); };
      for (let n = 0; n < 2; n++) next();
    }
    const now = performance.now(); if (now - this.last < (this.pending ? 60 : 250)) return; this.last = now;   // cosmetic: when to look again
    // how far the camera is from each square (0 inside it), lifted by its height over the ground; the nearest first
    for (const sq of this.drawn) {
      const dx = Math.max(sq.x0 - at.x, 0, at.x - sq.x0 - SQUARE), dz = Math.max(sq.z0 - at.z, 0, at.z - sq.z0 - SQUARE);
      sq.d = Math.hypot(dx, dz, Math.max(0, at.y - 300));
    }
    this.drawn.sort((a, b) => a.d - b.d);
    // the near squares' chunks in full, nearest first, for a few milliseconds a look (a fly-by never stalls a frame)
    this.pending = false;
    for (const sq of this.drawn) {
      if (sq.d >= NEAR) break;
      for (const ch of sq.chunks) {
        if (ch.mesh) continue;
        if (performance.now() - now > 8) { this.pending = true; break; }   // cosmetic: how long a look may build
        ch.mesh = this.mesh(ch.list, false); ch.crowns = this.trees(ch.trees, false);
      }
      if (this.pending) break;
    }
    for (const sq of this.drawn) {
      const d = sq.d, near = d < NEAR;
      const full = near && sq.chunks.every(ch => ch.mesh);
      const show = !(this.low && d > FAR_LOW);
      sq.far.visible = !full && show;
      for (const ch of sq.chunks) {
        if (!ch.mesh) continue;
        if (d > NEAR + 400) {
          for (const m of [ch.mesh, ...(ch.crowns ?? [])]) { this.group.remove(m); if (m instanceof THREE.InstancedMesh) m.dispose(); else m.geometry.dispose(); }
          ch.mesh = null; ch.crowns = null; continue;
        }
        const cd = Math.hypot(at.x - ch.x, at.z - ch.z, Math.max(0, at.y - 200)), shadow = full && cd < SHADOW, treesNear = full && cd < TREE_NEAR;
        ch.mesh.visible = full; ch.mesh.castShadow = shadow;
        for (const m of ch.crowns ?? []) { m.visible = treesNear; m.castShadow = shadow; }
      }
      // the far crowns: the big clumps, wherever the chunk's own trees aren't drawn
      const allNear = full && sq.chunks.every(ch => Math.hypot(at.x - ch.x, at.z - ch.z, Math.max(0, at.y - 200)) < TREE_NEAR);
      for (const m of sq.farTrees) m.visible = show && !allNear;
    }
  }
  /** Instanced crowns (both kinds) and, near, trunks for a list of trees: in full, or only the big ones plainer. */
  private trees(list: number[], far: boolean): THREE.InstancedMesh[] {
    const n = list.length / TREE, out: THREE.InstancedMesh[] = [], m4 = M4, q = Q, v = V, sc = S, col = WALL;
    for (const kind of [0, 1]) {
      const pick: number[] = []; for (let k = 0; k < n; k++) if (list[k * TREE + 5] === kind && (!far || list[k * TREE + 4]! >= TREE_BIG)) pick.push(k);
      if (!pick.length) continue;
      const im = new THREE.InstancedMesh(far ? this.plain : this.crown, this.leaves[kind]!, pick.length); im.name = far ? 'trees-far' : 'trees';
      pick.forEach((k, j) => {
        const b = k * TREE, h = list[b + 3]!, r = list[b + 4]!, ch = Math.min(h * 0.75, r * 2.1);
        v.set(list[b]!, list[b + 1]! + h - ch / 2, list[b + 2]!); sc.set(r, ch / 2, r); m4.compose(v, q, sc); im.setMatrixAt(j, m4);
        im.setColorAt(j, col.setScalar(list[b + 6]!));
      });
      im.receiveShadow = true; im.castShadow = false; im.visible = false; im.computeBoundingSphere(); this.group.add(im); out.push(im);
    }
    if (!far && n) {
      const im = new THREE.InstancedMesh(this.trunk, this.bark, n); im.name = 'trunks';
      for (let k = 0; k < n; k++) {
        const b = k * TREE, h = list[b + 3]!, r = list[b + 4]!, ch = Math.min(h * 0.75, r * 2.1);
        v.set(list[b]!, list[b + 1]! - 0.3, list[b + 2]!); sc.set(1, h - ch + 0.8, 1); m4.compose(v, q, sc); im.setMatrixAt(k, m4);
      }
      im.receiveShadow = true; im.castShadow = false; im.visible = false; im.computeBoundingSphere(); this.group.add(im); out.push(im);
    }
    return out;
  }
  /** The crowns' colours for the time of year (0 to 1 from the new year) and the snow lying (0 to 1), as the lineside
   * trees take theirs (src/render/weather.ts). */
  season(year: number, settle: number): void {
    const y = year * 4, i = Math.floor(y) % 4, f = y - Math.floor(y), t = f < 0.75 ? 0 : (f - 0.75) / 0.25;
    this.leaves.forEach((m, kind) => { leaf(i, kind, m.color); leaf((i + 1) % 4, kind, WALL); m.color.lerp(WALL, t).lerp(PAL.snow, 0.6 * settle); });
  }
  /** A mesh of pieces, in full or as blocks. */
  private mesh(list: Placed[], blocks: boolean): THREE.Mesh {
    const b = new Builder();
    for (const q of list) this.draw(q, b, blocks);
    const m = new THREE.Mesh(b.geometry(), this.material); m.receiveShadow = true; m.castShadow = false; m.visible = false; m.name = blocks ? 'buildings-far' : 'buildings';
    this.group.add(m); return m;
  }

  private async load(key: string): Promise<void> {
    if (this.placed.has(key)) return;
    this.placed.set(key, []);
    // offline with the square never seen (it's kept once fetched): nothing there yet, and another go in a while
    let text: string | null = null;
    try { const res = await fetch(this.files[key]!); if (res.ok) text = await res.text(); } catch { /* no connection */ }
    if (text === null) { this.placed.delete(key); setTimeout(() => void this.load(key), 30000); return; }
    const { pieces, trees, cover } = decodeWorld(key, text);
    const [i, j] = key.split('_').map(Number) as [number, number];
    if (this.terrain) await this.terrain.ensure((i + 0.5) * SQUARE, (j + 0.5) * SQUARE, SQUARE * 0.75);
    // in stages, a frame apart, so a phone never stalls long on one square
    const next = () => new Promise<void>(r => setTimeout(r, 0));
    const out = this.placeBuildings(key, pieces); await next();
    const rows = this.placeTrees(trees); await next();
    this.finish(key, out, rows); await next();
    this.paint(key, cover);
    this.areas.set(key, cover.filter(c => c.cls !== 'r').map(c => {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < c.pts.length; k += 2) { x0 = Math.min(x0, c.pts[k]!); x1 = Math.max(x1, c.pts[k]!); z0 = Math.min(z0, c.pts[k + 1]!); z1 = Math.max(z1, c.pts[k + 1]!); }
      return { cls: c.cls, pts: c.pts, x0, x1, z0, z1 };
    }));
    if (++this.loaded === this.squares.size) this.resolve();
  }

  /** A square's pieces, placed and drawn. */
  add(key: string, pieces: Piece[], trees: Float32Array = new Float32Array(0)): Placed[] {
    const out = this.placeBuildings(key, pieces); this.finish(key, out, this.placeTrees(trees)); return out;
  }
  /** A square's pieces, moved out from the line, kept off what they may not stand on, and on their ground. */
  private placeBuildings(key: string, pieces: Piece[]): Placed[] {
    const t = this.t, out: Placed[] = [];
    this.stats.buildings += pieces.length;
    for (const p of pieces) {
      // moved out from the line as its ground is
      const [dx, dz] = t.drawnAt(p.x, p.z), sx = dx - p.x, sz = dz - p.z;
      const q: Piece = { ...p, x: dx, z: dz, ring: p.ring ? p.ring.map((v, k) => v + (k & 1 ? sz : sx)) : null };
      if (!this.keep.ok(q)) { this.stats.left++; continue; }
      const cs = corners(q); let lo = Infinity, sum = 0;
      for (let k = 0; k < cs.length; k += 2) { const y = t.groundY(cs[k]!, cs[k + 1]!); lo = Math.min(lo, y); sum += y; }
      const mid = t.groundY(q.x, q.z), base = (sum / (cs.length / 2) + mid) / 2;
      out.push({ p: q, cs, y0: lo - 0.6, y1: base + q.h });
    }
    this.placed.set(key, out); this.stats.pieces += out.length;
    for (const q of out) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < q.cs.length; k += 2) { x0 = Math.min(x0, q.cs[k]!); x1 = Math.max(x1, q.cs[k]!); z0 = Math.min(z0, q.cs[k + 1]!); z1 = Math.max(z1, q.cs[k + 1]!); }
      for (let a = Math.floor(x0 / 50); a <= Math.floor(x1 / 50); a++) for (let b = Math.floor(z0 / 50); b <= Math.floor(z1 / 50); b++) {
        const g = `${a},${b}`; let list = this.grid.get(g); if (!list) { list = []; this.grid.set(g, list); } list.push(q);
      }
    }
    return out;
  }
  /** A square's trees, moved out from the line and kept off what they may not stand on (TREE numbers each). */
  private placeTrees(trees: Float32Array): number[] {
    const t = this.t, all: number[] = [];
    for (let k = 0; k < trees.length; k += 4) {
      const [x, z] = t.drawnAt(trees[k]!, trees[k + 1]!), h = trees[k + 2]!, r = trees[k + 3]!;
      if (!this.keep.tree(x, z, r) || this.blocked(x, z, 1)) { this.stats.treesLeft++; continue; }
      const w = hash(x, z); all.push(x, t.groundY(x, z), z, h, r, w < 0.35 ? 1 : 0, 0.86 + hash(z, x) * 0.24, 0);
    }
    this.stats.trees += all.length / TREE;
    return all;
  }
  /** A square's pieces and trees into chunks, and its far meshes. */
  private finish(key: string, out: Placed[], all: number[]): void {
    // the chunks: each piece and tree in the chunk its middle's in
    const by = new Map<string, Chunk>(), chunk = (x: number, z: number) => {
      const a = Math.floor(x / CHUNK), b = Math.floor(z / CHUNK), k = `${a},${b}`;
      let c = by.get(k); if (!c) { c = { x: (a + 0.5) * CHUNK, z: (b + 0.5) * CHUNK, list: [], trees: [], mesh: null, crowns: null }; by.set(k, c); } return c;
    };
    for (const q of out) chunk(q.p.x, q.p.z).list.push(q);
    for (let k = 0; k < all.length; k += TREE) {
      chunk(all[k]!, all[k + 2]!).trees.push(...all.slice(k, k + TREE));
      const g = `${Math.floor(all[k]! / 20)},${Math.floor(all[k + 2]! / 20)}`; let l = this.treeGrid.get(g); if (!l) { l = []; this.treeGrid.set(g, l); } l.push(all[k]!, all[k + 2]!, all[k + 4]!);
    }
    const [i, j] = key.split('_').map(Number) as [number, number];
    this.drawn.push({ key, x0: i * SQUARE, z0: j * SQUARE, d: Infinity, placed: out, far: this.mesh(out, true), farTrees: this.trees(all, true), chunks: [...by.values()] });
    this.last = -1;
  }

  /** One piece, in full or as a block with a flat top halfway up its roof. */
  private draw(q: Placed, b: Builder, block: boolean): void {
    const p = q.p, k = hash(p.x, p.z) * 0.16 - 0.08;
    const wall = WALL.copy(this.col.wall[p.wall] ?? this.col.wall.b!).offsetHSL(0, 0, k), top = TOP.copy(this.col.top[p.top] ?? this.col.top.f!).offsetHSL(0, 0, k * 0.6);
    if (block) b.prism(q.cs, q.y0, q.y1 + riseOf(p) * 0.5, wall, top);
    else if (p.roof === 'f' || p.ring) b.prism(q.cs, q.y0, q.y1, wall, top);
    else { b.prism(q.cs, q.y0, q.y1, wall, null); b.roof(p, q.y1, wall, top); }
  }

  /** Paint a square's ground cover into its layer: each area and street moved out from the line as the ground is, then
   * the railway's land cleared (the terrain draws its own). */
  paint(key: string, list: Cover[]): void {
    const C = this.cover, at = C?.layer.get(key); if (!C || at === undefined) return;
    const g = C.canvas.getContext('2d', { willReadFrequently: true }); if (!g) return;
    const [i, j] = key.split('_').map(Number) as [number, number], X = i * SQUARE, Z = j * SQUARE, k = COVER_PX / SQUARE, t = this.t;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, COVER_PX, COVER_PX); g.setTransform(k, 0, 0, k, -X * k, -Z * k);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const trace = (pts: Float32Array) => { g.beginPath(); for (let q = 0; q < pts.length; q += 2) { const [x, z] = t.drawnAt(pts[q]!, pts[q + 1]!); if (q) g.lineTo(x, z); else g.moveTo(x, z); } };
    for (const c of list) {
      const colour = C.colours[c.cls]; if (!colour) continue;
      trace(c.pts);
      if (c.cls === 'r') { g.strokeStyle = colour; g.lineWidth = c.w; g.stroke(); } else { g.closePath(); g.fillStyle = colour; g.fill(); }
    }
    // the railway's land along every line through the square, cleared
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
    for (const L of t.lines) {
      // a quad from each sample of the land's edges (every 4 m) to the next
      g.beginPath(); let open = false;
      for (let q = 0; q < L.n; q += 2) {
        const s = L.s0 + q * 2, p = L.c.at(s, 0);
        if (p.x < X - 150 || p.x > X + SQUARE + 150 || p.z < Z - 150 || p.z > Z + SQUARE + 150) { open = false; continue; }
        const [lo, hi] = t.band(L, s), a = L.c.at(s, lo - 1), b = L.c.at(s, hi + 1);
        if (open) { g.moveTo(PREV[0], PREV[1]); g.lineTo(PREV[2], PREV[3]); g.lineTo(b.x, b.z); g.lineTo(a.x, a.z); g.closePath(); }
        PREV[0] = a.x; PREV[1] = a.z; PREV[2] = b.x; PREV[3] = b.z; open = true;
      }
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    const img = g.getImageData(0, 0, COVER_PX, COVER_PX), data = C.tex.image.data as Uint8Array;
    data.set(img.data, at * COVER_PX * COVER_PX * 4);
    C.tex.addLayerUpdate(at); C.tex.needsUpdate = true;
  }

  /** Every tree placed so far, eight numbers each (the checks). */
  treesPlaced(): number[] { return this.drawn.flatMap(sq => sq.chunks.flatMap(ch => ch.trees)); }
  /** The pieces drawn in a square (the checks). */
  piecesIn(key: string): Placed[] { return this.placed.get(key) ?? []; }
}

const PREV: [number, number, number, number] = [0, 0, 0, 0];

// ---- the ground's cover ----
/** A square's cover is painted this many pixels across (4 m each). */
const COVER_PX = 256;
/** Give the terrain's material the ground's cover: a texture array with a layer a square, and a small index texture
 * saying which layer each square of the map has; the colour mixed into the ground's where the cover's painted. Keeps
 * whatever the material's shader is already patched with (the reach, src/render/reach.ts). */
function coverPatch(mat: THREE.MeshLambertMaterial, keys: string[]): NonNullable<BuildingsLayer['cover']> {
  const n = keys.length, tex = new THREE.DataArrayTexture(new Uint8Array(COVER_PX * COVER_PX * 4 * n), COVER_PX, COVER_PX, n);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  const ij = keys.map(k => k.split('_').map(Number) as [number, number]);
  const i0 = Math.min(...ij.map(p => p[0])), j0 = Math.min(...ij.map(p => p[1])), w = Math.max(...ij.map(p => p[0])) - i0 + 1, h = Math.max(...ij.map(p => p[1])) - j0 + 1;
  const idx = new Uint8Array(w * h * 4), layer = new Map<string, number>();
  ij.forEach(([i, j], k) => { const a = ((j - j0) * w + (i - i0)) * 4; idx[a] = k; idx[a + 2] = 255; layer.set(keys[k]!, k); });
  const index = new THREE.DataTexture(idx, w, h); index.needsUpdate = true;
  const uniforms = { uCover: { value: tex }, uCoverIdx: { value: index }, uCoverGrid: { value: new THREE.Vector4(i0, j0, w, h) } };
  const prev = mat.onBeforeCompile.bind(mat), prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vCoverXZ;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvCoverXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = 'varying vec2 vCoverXZ;\nuniform highp sampler2DArray uCover; uniform sampler2D uCoverIdx; uniform vec4 uCoverGrid;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 sq = floor(vCoverXZ / 1000.0) - uCoverGrid.xy;
  if (sq.x >= 0.0 && sq.y >= 0.0 && sq.x < uCoverGrid.z && sq.y < uCoverGrid.w) {
    vec4 at = texture2D(uCoverIdx, (sq + 0.5) / uCoverGrid.zw);
    if (at.b > 0.5) {
      vec4 cov = texture(uCover, vec3(fract(vCoverXZ / 1000.0), floor(at.r * 255.0 + 0.5)));
      diffuseColor.rgb = mix(diffuseColor.rgb, cov.rgb, cov.a * 0.9);
    }
  }
}`);
  };
  mat.customProgramCacheKey = () => prevKey() + '|cover';
  mat.needsUpdate = true;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = COVER_PX;
  const hex = (c: THREE.Color) => '#' + c.getHexString();
  const colours: Record<string, string> = {
    p: hex(PAL['cover-park']), h: hex(PAL['cover-pitch']), f: hex(PAL['cover-field']), w: hex(PAL['cover-wood']), s: hex(PAL['cover-scrub']),
    a: hex(PAL['cover-water']), y: hex(PAL['cover-yard']), c: hex(PAL['cover-car']), b: hex(PAL['cover-bare']), e: hex(PAL['cover-field']),
    g: hex(PAL['cover-allot']), r: hex(PAL['cover-street']),
  };
  return { tex, layer, canvas, colours };
}

const WALL = new THREE.Color(), TOP = new THREE.Color(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
/** A crown's colour in a season (0 spring to 3 winter) for each kind (1: the third that blossom and turn rust). */
function leaf(season: number, kind: number, out: THREE.Color): THREE.Color {
  if (season === 0) return out.copy(kind ? PAL.blossom : PAL['leaf-spring']);
  if (season === 1) return out.copy(PAL['leaf-summer']).lerp(PAL['leaf-spring'], kind ? 0.3 : 0.1);
  if (season === 2) return out.copy(kind ? PAL['leaf-autumn-2'] : PAL['leaf-autumn']);
  return out.copy(PAL.trunk).lerp(PAL['sky-grey'], 0.2);
}
const dist = (key: string, at: THREE.Vector3) => { const [i, j] = key.split('_').map(Number) as [number, number]; return Math.hypot((i + 0.5) * SQUARE - at.x, (j + 0.5) * SQUARE - at.z); };
/** Whether (x, z) is within r of an outline's edges. */
function nearRing(cs: number[], x: number, z: number, r: number): boolean {
  if (r <= 0) return false;
  for (let a = 0, b = cs.length - 2; a < cs.length; b = a, a += 2) {
    const ax = cs[b]!, az = cs[b + 1]!, dx = cs[a]! - ax, dz = cs[a + 1]! - az, l2 = dx * dx + dz * dz || 1, f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    if (Math.hypot(ax + dx * f - x, az + dz * f - z) < r) return true;
  }
  return false;
}
