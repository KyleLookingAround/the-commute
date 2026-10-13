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
import type { KitDef, Terrain, TerrainLayer } from './terrain.ts';
import type { Network } from '../sim/network.ts';

/** The squares' size (the tool's), and the chunks each is drawn in. */
export const SQUARE = 1000;
const CHUNK = 500;
const NEAR = 900;        // a chunk this near the camera is drawn in full
const SHADOW = 650;      // and casts shadows this near
const FAR_LOW = 1600;    // on Low, nothing further than this
const RAIL_MARGIN = 4;   // metres kept clear beyond the railway's land
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
export function decodeWorld(key: string, text: string): { head: Record<string, unknown>; pieces: Piece[] } {
  const [i, j] = key.split('_').map(Number) as [number, number], X = i * SQUARE - 500, Z = j * SQUARE - 500;
  const lines = text.split('\n'), head = JSON.parse(lines[0]!) as Record<string, unknown>, pieces: Piece[] = [];
  for (let k = 1; k < lines.length; k++) {
    const l = lines[k]!; if (!l) continue;
    if (l[0] === 'R') {
      pieces.push({ x: X + num(l, 1, 2) / 4, z: Z + num(l, 3, 2) / 4, w: num(l, 5, 2) / 10, d: num(l, 7, 2) / 10, yaw: num(l, 9, 2) / 8100 * Math.PI, h: num(l, 11, 2) / 10,
        roof: l[13] as Piece['roof'], wall: l[14]!, top: l[15]!, flags: +l[16]!, ring: null });
    } else if (l[0] === 'P') {
      const n = INDEX[l.charCodeAt(7)]!, ring = new Float32Array(n * 2);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let q = 0; q < n; q++) {
        const x = X + num(l, 8 + q * 4, 2) / 4, z = Z + num(l, 10 + q * 4, 2) / 4; ring[q * 2] = x; ring[q * 2 + 1] = z;
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      }
      pieces.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, yaw: 0, h: num(l, 1, 2) / 10, roof: 'f', wall: l[4]!, top: l[5]!, flags: +l[6]!, ring });
    }
  }
  return { head, pieces };
}

/** A pitched or hipped roof's rise over its walls. */
export const riseOf = (p: Piece): number => p.roof === 'f' ? 0 : Math.min(5, p.d * 0.35);

/** The corners of a piece's footprint (or its outline), as drawn. */
function corners(p: Piece): number[] {
  if (p.ring) return Array.from(p.ring);
  const ux = Math.cos(p.yaw), uz = Math.sin(p.yaw), a = p.w / 2, b = p.d / 2;
  return [p.x - ux * a + uz * b, p.z - uz * a - ux * b, p.x + ux * a + uz * b, p.z + uz * a - ux * b, p.x + ux * a - uz * b, p.z + uz * a + ux * b, p.x - ux * a - uz * b, p.z - uz * a + ux * b];
}

/** What a piece may not stand on: the railway's land and its slopes, a station's kit, the buses' roads. */
export class Keep {
  private kits: { x: number; z: number; dx: number; dz: number; nx: number; nz: number; boxes: [number, number, number, number][] }[] = [];
  private roads: [number, number, number, number][] = [];
  constructor(private t: Terrain, net: Network, kits: Record<string, KitDef | undefined>) {
    for (const st of net.stations) {
      const kit = kits[st.kit]; if (!kit) continue;
      const F = net.stationFrame(st.id), boxes: [number, number, number, number][] = [];
      for (const part of kit.parts) for (const b of partBoxes({ ...part, street: false })) boxes.push(b);
      this.kits.push({ x: F.x, z: F.z, dx: F.dx, dz: F.dz, nx: F.nx, nz: F.nz, boxes });
    }
    for (const r of net.def.roads ?? []) for (let k = 1; k < r.points.length; k++) { const [ax, az] = r.points[k - 1]!, [bx, bz] = r.points[k]!; this.roads.push([ax, az, bx, bz]); }
  }
  /** Whether a piece (drawn) may stand: every corner and its middle off the railway's land, off every kit's parts, and
   * no road through it. */
  ok(p: Piece): boolean {
    const cs = corners(p), t = this.t;
    if (t.railLand(p.x, p.z, RAIL_MARGIN)) return false;
    for (let k = 0; k < cs.length; k += 2) if (t.railLand(cs[k]!, cs[k + 1]!, RAIL_MARGIN)) return false;
    // the long side of a big piece: its edges' middles too
    for (let k = 0; k < cs.length; k += 2) { const n = (k + 2) % cs.length; if (t.railLand((cs[k]! + cs[n]!) / 2, (cs[k + 1]! + cs[n + 1]!) / 2, RAIL_MARGIN)) return false; }
    const R = Math.hypot(p.w, p.d) / 2;
    for (const K of this.kits) {
      if (Math.hypot(p.x - K.x, p.z - K.z) > 400 + R) continue;
      const pts = [p.x, p.z, ...cs];
      for (const [u0, u1, v0, v1] of K.boxes) {
        // a corner in the box, or the box's middle in the piece
        for (let k = 0; k < pts.length; k += 2) {
          const ex = pts[k]! - K.x, ez = pts[k + 1]! - K.z, u = ex * K.dx + ez * K.dz, v = ex * K.nx + ez * K.nz;
          if (u > u0 - KIT_MARGIN && u < u1 + KIT_MARGIN && v > v0 - KIT_MARGIN && v < v1 + KIT_MARGIN) return false;
        }
        const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
        if (inPiece(p, cs, K.x + K.dx * um + K.nx * vm, K.z + K.dz * um + K.nz * vm, 0)) return false;
      }
    }
    for (const [ax, az, bx, bz] of this.roads) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, f = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / l2));
      const qx = ax + dx * f, qz = az + dz * f;
      if (Math.hypot(qx - p.x, qz - p.z) > R + ROAD_CLEAR) continue;
      // the road's nearest point to the piece, then a few along it
      for (let s = -2; s <= 2; s++) { const g = Math.max(0, Math.min(1, f + s * 4 / Math.sqrt(l2))); if (inPiece(p, cs, ax + dx * g, az + dz * g, ROAD_CLEAR)) return false; }
    }
    return true;
  }
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
interface Square { key: string; x0: number; z0: number; placed: Placed[]; far: THREE.Mesh; chunks: { x: number; z: number; list: Placed[]; mesh: THREE.Mesh | null }[] }

/** The real buildings, as the page draws them. */
export class BuildingsLayer {
  readonly group = new THREE.Group();
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  /** The squares there are tiles for, and the pieces of each loaded so far (as drawn), for what keeps off them. */
  readonly squares: Set<string>;
  private placed = new Map<string, Placed[]>();
  private grid = new Map<string, Placed[]>();   // by 50 m cell, for blocked()
  private drawn: Square[] = [];
  private keep: Keep; private col = colours();
  private started = false; private low = false; private last = -1;
  private loaded = 0; private resolve: () => void = () => {};
  /** Resolves once every square is in. */
  readonly ready: Promise<void>;
  /** What was read and what was left out, for the checks. */
  readonly stats = { buildings: 0, pieces: 0, left: 0 };

  constructor(private t: Terrain, private files: Record<string, string>, net: Network, kits: Record<string, KitDef | undefined>, private terrain: TerrainLayer | null = null) {
    this.squares = new Set(Object.keys(files)); this.keep = new Keep(t, net, kits);
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
    const now = performance.now(); if (now - this.last < 250) return; this.last = now;   // cosmetic: when to look again
    let built = 0;
    for (const sq of this.drawn) {
      // how far the camera is from the square (0 inside it), lifted by its height over the ground
      const dx = Math.max(sq.x0 - at.x, 0, at.x - sq.x0 - SQUARE), dz = Math.max(sq.z0 - at.z, 0, at.z - sq.z0 - SQUARE);
      const d = Math.hypot(dx, dz, Math.max(0, at.y - 300)), near = d < NEAR;
      // in full once every chunk's built (a few a look, so a fly-by never stalls a frame); freed well past NEAR
      if (near) for (const ch of sq.chunks) if (!ch.mesh && built < 2) { ch.mesh = this.mesh(ch.list, false); built++; }
      const full = near && sq.chunks.every(ch => ch.mesh);
      sq.far.visible = !full && !(this.low && d > FAR_LOW);
      for (const ch of sq.chunks) {
        if (!ch.mesh) continue;
        if (d > NEAR + 400) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); ch.mesh = null; continue; }
        ch.mesh.visible = full;
        ch.mesh.castShadow = full && Math.hypot(at.x - ch.x, at.z - ch.z, Math.max(0, at.y - 200)) < SHADOW;
      }
    }
    if (built) this.last = -1;
  }
  /** A mesh of pieces, in full or as blocks. */
  private mesh(list: Placed[], blocks: boolean): THREE.Mesh {
    const b = new Builder();
    for (const q of list) this.draw(q, b, blocks);
    const m = new THREE.Mesh(b.geometry(), this.material); m.receiveShadow = true; m.castShadow = false; m.visible = false;
    this.group.add(m); return m;
  }

  private async load(key: string): Promise<void> {
    if (this.placed.has(key)) return;
    this.placed.set(key, []);
    const res = await fetch(this.files[key]!); if (!res.ok) return;
    const { pieces } = decodeWorld(key, await res.text());
    const [i, j] = key.split('_').map(Number) as [number, number];
    if (this.terrain) await this.terrain.ensure((i + 0.5) * SQUARE, (j + 0.5) * SQUARE, SQUARE * 0.75);
    this.add(key, pieces);
    if (++this.loaded === this.squares.size) this.resolve();
  }

  /** A square's pieces, placed and drawn. */
  add(key: string, pieces: Piece[]): Placed[] {
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
    // the chunks: each piece in the chunk its middle's in
    const by = new Map<string, Placed[]>();
    for (const q of out) { const k = `${Math.floor(q.p.x / CHUNK)},${Math.floor(q.p.z / CHUNK)}`; let l = by.get(k); if (!l) { l = []; by.set(k, l); } l.push(q); }
    const [i, j] = key.split('_').map(Number) as [number, number];
    this.drawn.push({ key, x0: i * SQUARE, z0: j * SQUARE, placed: out, far: this.mesh(out, true),
      chunks: [...by].map(([k, list]) => { const [a, b] = k.split(',').map(Number) as [number, number]; return { x: (a + 0.5) * CHUNK, z: (b + 0.5) * CHUNK, list, mesh: null }; }) });
    this.last = -1;
    return out;
  }

  /** One piece, in full or as a block with a flat top halfway up its roof. */
  private draw(q: Placed, b: Builder, block: boolean): void {
    const p = q.p, k = hash(p.x, p.z) * 0.16 - 0.08;
    const wall = WALL.copy(this.col.wall[p.wall] ?? this.col.wall.b!).offsetHSL(0, 0, k), top = TOP.copy(this.col.top[p.top] ?? this.col.top.f!).offsetHSL(0, 0, k * 0.6);
    if (block) b.prism(q.cs, q.y0, q.y1 + riseOf(p) * 0.5, wall, top);
    else if (p.roof === 'f' || p.ring) b.prism(q.cs, q.y0, q.y1, wall, top);
    else { b.prism(q.cs, q.y0, q.y1, wall, null); b.roof(p, q.y1, wall, top); }
  }

  /** The pieces drawn in a square (the checks). */
  piecesIn(key: string): Placed[] { return this.placed.get(key) ?? []; }
}

const WALL = new THREE.Color(), TOP = new THREE.Color();
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

/** The world tiles' URLs as the build emits them, by square (i_j); none outside a build (the checks read them from disk). */
export function worldFiles(): Record<string, string> {
  try {
    const found = import.meta.glob('../data/world/*.txt', { query: '?url', import: 'default', eager: true });
    return Object.fromEntries(Object.entries(found).map(([path, url]) => [path.replace(/^.*\//, '').replace('.txt', ''), url]));
  } catch { return {}; }
}
