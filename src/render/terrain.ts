// The lie of the land under the line, from the Environment Agency's LIDAR (tools/lidar-to-terrain.mjs): the Mersey
// valley under the viaduct, the cuttings and the embankments. The railway is the datum: the tracks, stations and trains
// stay at y = 0, and the ground is drawn at its real height less the rail's real level there, so it rises into cuttings
// and falls away under embankments and the viaduct without moving a kit.
// - Base tiles (src/data/terrain/base.json, every 64 m over the map, and every 32 m in blocks within 1.5 km of the line) come with the page; fine tiles (every 2 m within
//   100 m of the line) are fetched as the camera comes near. A wider map (phase 8) adds tiles and levels the same way.
// - The railway's land is flat at 0: every track with its cess, and each station's pad, the ground its kit's parts
//   stand on. The tracks and kits are drawn 1.25 times real across the line, so beyond that land the ground is read
//   that much further out, and its real cuttings and banks start at the land's edge. Where a station's pad meets
//   higher ground a retaining wall stands; on the open line, a cutting slope; where it falls away, an embankment slope
//   (or a wall, at a station).
// - Drawn as a base mesh over the whole map (sunk under the line's strip) and a strip along the line, in chunks, each
//   built coarse at start and fine once the camera is near and its tiles are in.
import * as THREE from 'three';
import baseData from '../data/terrain/base.json';
import { PAL } from './scene.ts';
import type { Network } from '../sim/network.ts';

declare global { interface ImportMeta { glob: <T = string>(pattern: string, opts: { query?: string; import: string; eager: boolean }) => Record<string, T> } }

// ---- the tiles' text encoding (encodeGrid in tools/lidar-to-terrain.mjs) ----
const ALPHA: number[] = []; for (let k = 35; k <= 125; k++) if (k !== 92) ALPHA.push(k);
const INDEX = new Int16Array(128).fill(-1); ALPHA.forEach((c, i) => { INDEX[c] = i; });
/** A w by h grid of heights in metres (NaN where there's none) from its text. */
export function decodeGrid(text: string, w: number, h: number): Float32Array {
  const v = new Float32Array(w * h).fill(NaN); let p = 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ch = text.charCodeAt(p++);
    if (ch === 33) { const k = INDEX[text.charCodeAt(p++)]! + 1; i += k - 1; continue; }
    const at = j * w + i, L = i > 0 ? v[at - 1]! : NaN, U = j > 0 ? v[at - w]! : NaN, UL = i > 0 && j > 0 ? v[at - w - 1]! : NaN;
    const pred = L === L && U === U && UL === UL ? L + U - UL : L === L ? L : U === U ? U : 0;
    let r: number;
    if (INDEX[ch] === 89) { r = ((INDEX[text.charCodeAt(p)]! << 12) | (INDEX[text.charCodeAt(p + 1)]! << 6) | INDEX[text.charCodeAt(p + 2)]!) - 131072; p += 3; }
    else r = INDEX[ch]! - 44;
    v[at] = Math.round(pred + r);
  }
  for (let k = 0; k < v.length; k++) v[k] = v[k]! / 10;
  return v;
}

// ---- the railway's land, and the ground beside it ----
const CESS = 5;            // the railway's land beyond the outer track's centre (the masts stand at 3.2)
const BAND_STEP = 2;       // metres between samples of the land's edges along the line
const STRIP = 150;         // the strip's reach beyond the land's edge
const FAR = 600;           // beyond this from the line the ground is read where it is (the shift across fades out)
const WALL_MIN = 1;        // a step this high or more at a station's edge is a wall
const CUT = 1.2, BANK = 1 / 1.5;   // the steepest cutting and embankment slopes on the open line (rise over run)

interface Tile { x0: number; z0: number; cell: number; n: number; v: Float32Array }
/** A kit's part, loosely: whatever of these it has says where it stands. */
type KitPart = Record<string, unknown> & { type: string };
export interface KitDef { parts: KitPart[] }

export class Terrain {
  readonly net: Network;
  private base = new Map<string, Tile>(); private near = new Map<string, Tile>(); private fine = new Map<string, Tile>();
  private baseSize: number; private nearSize: number; private fineSize: number;
  readonly fineCell: number; readonly fineBand: number; readonly lateral: number;
  private railDm: number[]; private railStep: number;
  private datum: { x0: number; z0: number; cell: number; w: number; h: number; v: Float32Array };
  /** The railway's land along the line, every BAND_STEP m: its edges across (lo, hi) and whether each is a station's. */
  readonly lo: Float32Array; readonly hi: Float32Array; readonly padLo: Uint8Array; readonly padHi: Uint8Array;
  /** The tracks' own land within it (the rest is a station's pad). */
  readonly tlo: Float32Array; readonly thi: Float32Array;
  readonly bounds: { x0: number; z0: number; x1: number; z1: number };
  /** Where the far ground meets the map's edge, relative to the line. */
  readonly edge: number;
  /** The stretches of line on a viaduct (s from, to): no land beneath them, only the ground far below. */
  readonly spans: [number, number][];
  constructor(net: Network, kits: Record<string, KitDef | undefined>, spans: [number, number][] = [], data: typeof baseData = baseData) {
    this.net = net; this.spans = spans;
    this.baseSize = data.cell * data.tile; this.fineCell = data.fineCell; this.fineSize = data.fineCell * data.tile;
    this.fineBand = data.fineBand; this.lateral = data.lateral;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    // the base tiles are every farCell m; within a kilometre and a half of the line, blocks every cell m besides
    this.nearSize = data.cell * data.block;
    for (const [key, text] of Object.entries(data.near)) {
      const [i, j] = key.split(',').map(Number) as [number, number], n = data.block + 1;
      this.near.set(key, { x0: i * this.nearSize, z0: j * this.nearSize, cell: data.cell, n, v: decodeGrid(text, n, n) });
    }
    for (const [key, text] of Object.entries(data.tiles)) {
      const n = this.baseSize / data.farCell + 1;
      const [i, j] = key.split(',').map(Number) as [number, number], t: Tile = { x0: i * this.baseSize, z0: j * this.baseSize, cell: data.farCell, n, v: decodeGrid(text, n, n) };
      this.base.set(key, t); x0 = Math.min(x0, t.x0); z0 = Math.min(z0, t.z0); x1 = Math.max(x1, t.x0 + this.baseSize); z1 = Math.max(z1, t.z0 + this.baseSize);
    }
    this.bounds = { x0, z0, x1, z1 };
    {
      // for each 200 m cell, the stretches of line that can hold the nearest point to anywhere in it
      const c = net.spine, cell = 200, w = Math.ceil((x1 - x0) / cell), h = Math.ceil((z1 - z0) / cell), cells: number[][] = [], half = cell * Math.SQRT1_2;
      const P = c.pts, nSeg = P.length - 1, d = new Float64Array(nSeg);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell; let m = Infinity;
        for (let k = 0; k < nSeg; k++) {
          const a = P[k]!, b = P[k + 1]!, ex = b.x - a.x, ez = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1e-9)));
          d[k] = Math.hypot(a.x + ex * t - x, a.z + ez * t - z); if (d[k]! < m) m = d[k]!;
        }
        const list: number[] = []; for (let k = 0; k < nSeg; k++) if (d[k]! <= m + 2 * half) list.push(k);
        cells.push(list);
      }
      this.locator = { x0, z0, cell, w, h, cells };
    }
    this.railDm = data.rail.dm; this.railStep = data.rail.step;
    const d = data.datum; this.datum = { ...d, v: decodeGrid(d.dm, d.w, d.h) };
    // the land: every track and its cess, then each station's pad
    const c = net.spine, n = Math.ceil(c.length / BAND_STEP) + 1;
    this.lo = new Float32Array(n).fill(Infinity); this.hi = new Float32Array(n).fill(-Infinity); this.padLo = new Uint8Array(n); this.padHi = new Uint8Array(n);
    // a point of railway land at (x, z), r across: widen the land where the point is nearest the line
    // (the strip lays its rows square to the line, so a point is marked both where it's nearest the line and where a
    // row through it at its own distance along would put it: round a bend the two differ)
    const mark = (x: number, z: number, r: number, pad: boolean, at?: number, off?: number) => {
      const { s, o } = this.locate(x, z);
      markAt(s, o, r, pad); if (at !== undefined && off !== undefined) markAt(at, off, r, pad);
    };
    const markAt = (s: number, o: number, r: number, pad: boolean) => {
      for (let k = Math.max(0, Math.round(s / BAND_STEP) - 1); k <= Math.min(n - 1, Math.round(s / BAND_STEP) + 1); k++) {
        if (o - r < this.lo[k]!) { this.lo[k] = o - r; if (pad) this.padLo[k] = 1; }
        if (o + r > this.hi[k]!) { this.hi[k] = o + r; if (pad) this.padHi[k] = 1; }
      }
    };
    const f = { ...FRAME };
    for (const tr of net.tracks) { const [e0, e1] = net.extent(tr.id); for (let s = e0; s <= e1; s += 1) { net.trackAt(tr.id, s, f); mark(f.x, f.z, CESS, false, s, net.offsetAt(tr.id, s)); } }
    for (let k = 0; k < n; k++) if (this.lo[k] === Infinity) { this.lo[k] = -CESS; this.hi[k] = CESS; }
    this.tlo = this.lo.slice(); this.thi = this.hi.slice();
    for (const st of net.stations) {
      const kit = kits[st.kit]; if (!kit) continue;
      const F = net.stationFrame(st.id);
      // each part's box, every couple of metres round its edge and through it
      for (const p of kit.parts) for (const [u0, u1, v0, v1] of partBoxes(p)) {
        const nu = Math.ceil((u1 - u0) / 2), nv = Math.ceil((v1 - v0) / 2);
        for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) {
          const u = u0 + (u1 - u0) * a / nu, v = v0 + (v1 - v0) * b / nv;
          mark(F.x + F.dx * u + F.nx * v, F.z + F.dz * u + F.nz * v, 0, true, st.at + u, v);
        }
      }
    }
    // the edges change by no more than they run along, so a wall never cuts back across a row of the strip
    for (const [arr, sign] of [[this.lo, -1], [this.hi, 1]] as const) for (let pass = 0; pass < 2; pass++)
      for (let k = pass ? n - 2 : 1; pass ? k >= 0 : k < n; k += pass ? -1 : 1) {
        const prev = arr[k + (pass ? 1 : -1)]! - sign * BAND_STEP;
        if (sign > 0 ? prev > arr[k]! : prev < arr[k]!) arr[k] = prev;
      }
    // the far ground's level: the median of the base mesh's edge, relative to the line
    const ring: number[] = [];
    for (let t = 0; t < 1; t += 0.01) for (const [x, z] of [[x0 + (x1 - x0) * t, z0 + 1], [x0 + (x1 - x0) * t, z1 - 1], [x0 + 1, z0 + (z1 - z0) * t], [x1 - 1, z0 + (z1 - z0) * t]] as const) ring.push(this.raw(x, z) - this.datumAt(x, z));
    ring.sort((a, b) => a - b); this.edge = ring[ring.length >> 1] ?? 0;
  }
  /** How far along the line the nearest point to (x, z) is: Corridor.nearest, but asking only the stretches of line
   * that can be nearest from the point's cell. */
  nearest(x: number, z: number): number {
    const L = this.locator, i = Math.floor((x - L.x0) / L.cell), j = Math.floor((z - L.z0) / L.cell);
    const c = this.net.spine;
    if (i < 0 || j < 0 || i >= L.w || j >= L.h) return c.nearest(x, z);
    const pts = c.pts, cum = c.cum; let best = 0, bestD = Infinity;
    for (const k of L.cells[j * L.w + i]!) {
      const a = pts[k]!, b = pts[k + 1]!, L2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / L2));
      const d = (a.x + (b.x - a.x) * t - x) ** 2 + (a.z + (b.z - a.z) * t - z) ** 2;
      if (d < bestD) { bestD = d; best = cum[k]! + Math.sqrt(L2) * t; }
    }
    return best;
  }
  private locator: { x0: number; z0: number; cell: number; w: number; h: number; cells: number[][] };
  /** Where a point is against the line: how far along (s), how far across (o, its distance from the line, signed;
   * round a bend's outside the line's nearest point is a corner), and whether it's past either end. (One object,
   * filled again on each call: read it at once.) */
  locate(x: number, z: number): { s: number; o: number; past: boolean } {
    const c = this.net.spine, s = this.nearest(x, z); c.at(s, 0, LOC_F);
    const ax = x - LOC_F.x, az = z - LOC_F.z, o = ax * LOC_F.nx + az * LOC_F.nz, along = ax * LOC_F.dx + az * LOC_F.dz;
    LOC.s = s; LOC.past = (s < 0.01 || s > c.length - 0.01) && Math.abs(along) > 1;
    LOC.o = Math.abs(along) > 0.01 ? Math.sign(o) * Math.hypot(ax, az) : o;
    return LOC;
  }
  /** The rail's real level (m above Ordnance Datum) at s along the line. */
  rail(s: number): number {
    const f = Math.max(0, Math.min(this.railDm.length - 1.001, s / this.railStep)), i = Math.floor(f);
    return (this.railDm[i]! + (this.railDm[i + 1]! - this.railDm[i]!) * (f - i)) / 10;
  }
  /** The level the ground is drawn relative to: the rail's near the line, blended further out. */
  datumAt(x: number, z: number): number {
    const d = this.datum, fx = Math.max(0, Math.min(d.w - 1.001, (x - d.x0) / d.cell)), fz = Math.max(0, Math.min(d.h - 1.001, (z - d.z0) / d.cell));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, v = d.v, a = j * d.w + i;
    return (v[a]! * (1 - tx) + v[a + 1]! * tx) * (1 - tz) + (v[a + d.w]! * (1 - tx) + v[a + d.w + 1]! * tx) * tz;
  }
  /** The real ground (m above Ordnance Datum) at a point: from a fine tile where one is loaded, else the base. */
  raw(x: number, z: number): number {
    const f = sample(this.fine, this.fineSize, x, z);
    return f === f ? f : this.baseAt(x, z);
  }
  private baseAt(x: number, z: number): number {
    const cx = Math.max(this.bounds.x0, Math.min(this.bounds.x1 - 0.01, x)), cz = Math.max(this.bounds.z0, Math.min(this.bounds.z1 - 0.01, z));
    const n = sample(this.near, this.nearSize, cx, cz); if (n === n) return n;
    const v = sample(this.base, this.baseSize, cx, cz);
    return v === v ? v : this.rail(0);
  }
  /** Whether s is on a viaduct. */
  bridged(s: number): boolean { for (const [a, b] of this.spans) if (s > a && s < b) return true; return false; }
  /** The land's edges at s. */
  /** The tracks' own land's edges at s. */
  tracks(s: number): [number, number] {
    const f = Math.max(0, Math.min(this.lo.length - 1.001, s / BAND_STEP)), k = Math.floor(f), t = f - k;
    return [this.tlo[k]! + (this.tlo[k + 1]! - this.tlo[k]!) * t, this.thi[k]! + (this.thi[k + 1]! - this.thi[k]!) * t];
  }
  /** (One array, filled again on each call: read it at once.) */
  band(s: number): [number, number, boolean, boolean] {
    const f = Math.max(0, Math.min(this.lo.length - 1.001, s / BAND_STEP)), k = Math.floor(f), t = f - k, b = BAND;
    b[0] = this.lo[k]! + (this.lo[k + 1]! - this.lo[k]!) * t; b[1] = this.hi[k]! + (this.hi[k + 1]! - this.hi[k]!) * t;
    b[2] = !!(this.padLo[k]! || this.padLo[k + 1]!); b[3] = !!(this.padHi[k]! || this.padHi[k + 1]!);
    return b;
  }
  /** Where to read the real ground for a point `o` across the line at s: beyond the land, as far past the land's real
   * edge as the point is past the drawn one (fading back to where it is far out). */
  private realOffset(o: number, lo: number, hi: number): number {
    const L = this.lateral, r = o > hi ? hi / L + (o - hi) : o < lo ? lo / L + (o - lo) : o / L;
    const d = Math.abs(o) - FAR; return d <= 0 ? r : d >= FAR ? o : r + (o - r) * d / FAR;
  }
  /** The ground beside the line, drawn: `o` across at s (outside the land), and the step at the land's edge. */
  beside(s: number, o: number, fr = FRAME): number {
    const [lo, hi] = this.band(s), c = this.net.spine;
    c.at(s, this.realOffset(o, lo, hi), fr);
    const x = fr.x, z = fr.z; c.at(s, o, fr);
    return this.raw(x, z) - this.datumAt(fr.x, fr.z);
  }
  /** The ground's height as drawn at a point: 0 on the railway's land, else the real ground less the datum, with the
   * slopes and walls where they meet. */
  groundY(x: number, z: number): number {
    const { s, o, past } = this.locate(x, z);
    // past the line's ends, and far from it, the ground is read where it is
    if (past || Math.abs(o) > 2 * FAR) return this.raw(x, z) - this.datumAt(x, z);
    const [lo, hi, pLo, pHi] = this.band(s);
    if (this.bridged(s)) return this.beside(s, o);
    if (o >= lo && o <= hi) return 0;
    const out = o > hi ? o - hi : lo - o, g = this.beside(s, o);
    return shape(g, out, o > hi ? pHi : pLo, this.beside(s, o > hi ? hi + 2.5 : lo - 2.5));
  }
  // ---- the fine tiles ----
  /** The fine tiles a circle touches that exist and aren't loaded yet. */
  fineWanted(x: number, z: number, r: number, have: (key: string) => boolean): string[] {
    const T = this.fineSize, out: string[] = [];
    for (let i = Math.floor((x - r) / T); i <= Math.floor((x + r) / T); i++) for (let j = Math.floor((z - r) / T); j <= Math.floor((z + r) / T); j++) {
      const key = `${i}_${j}`; if (!this.fine.has(`${i},${j}`) && have(key)) out.push(key);
    }
    return out;
  }
  addFine(key: string, text: string): void {
    const [i, j] = key.split('_').map(Number) as [number, number], n = Math.round(this.fineSize / this.fineCell) + 1;
    this.fine.set(`${i},${j}`, { x0: i * this.fineSize, z0: j * this.fineSize, cell: this.fineCell, n, v: decodeGrid(text, n, n) });
  }
  hasFine(key: string): boolean { return this.fine.has(key.replace('_', ',')); }
}
const FRAME = { x: 0, z: 0, heading: 0, dx: 0, dz: 0, nx: 0, nz: 0 }, LOC_F = { ...FRAME }, LOC = { s: 0, o: 0, past: false }, BAND: [number, number, boolean, boolean] = [0, 0, false, false];

/** The ground `out` metres past the land's edge, given the real ground there (g) and just past the edge (g0): at a
 * station a wall up or down to the ground; on the open line no steeper than a cutting or an embankment slope. */
function shape(g: number, out: number, pad: boolean, g0: number): number {
  if (pad && Math.abs(g0) >= WALL_MIN) return g;
  return g > 0 ? Math.min(g, out * CUT) : Math.max(g, -out * BANK);
}

/** Bilinear from whichever tile holds the point: NaN where a tile or a sample is missing. */
function sample(tiles: Map<string, Tile>, size: number, x: number, z: number): number {
  const i = Math.floor(x / size), j = Math.floor(z / size), t = tiles.get(`${i},${j}`); if (!t) return NaN;
  const fx = (x - t.x0) / t.cell, fz = (z - t.z0) / t.cell, a = Math.min(t.n - 2, Math.floor(fx)), b = Math.min(t.n - 2, Math.floor(fz)), tx = fx - a, tz = fz - b, v = t.v, k = b * t.n + a;
  return (v[k]! * (1 - tx) + v[k + 1]! * tx) * (1 - tz) + (v[k + t.n]! * (1 - tx) + v[k + t.n + 1]! * tx) * tz;
}

/** The boxes (u0, u1, v0, v1) a kit part stands on, from whichever of its fields say where it is; none for a part
 * that stands above the ground (a road on a bridge) or on it (`street`). */
export function partBoxes(p: KitPart): [number, number, number, number][] {
  const num = (k: string) => typeof p[k] === 'number' ? p[k] as number : undefined;
  // a part at street level stands on the ground, off the pad
  if ((num('y0') ?? 0) >= 3 || p['street'] === true) return [];
  const pts: [number, number][] = [], us: number[] = [], vs: number[] = [];
  for (const k of ['u0', 'u1', 'u']) { const v = num(k); if (v !== undefined) us.push(v); }
  for (const k of ['v0', 'v1', 'v']) { const v = num(k); if (v !== undefined) vs.push(v); }
  for (const k of ['towers']) if (Array.isArray(p[k])) vs.push(...(p[k] as number[]));
  const out: [number, number, number, number][] = [];
  // an outline's whole box; a line of rails, each stretch's
  if (Array.isArray(p['outline'])) { const o = p['outline'] as [number, number][]; out.push([Math.min(...o.map(q => q[0])) - 1.5, Math.max(...o.map(q => q[0])) + 1.5, Math.min(...o.map(q => q[1])) - 1.5, Math.max(...o.map(q => q[1])) + 1.5]); }
  if (Array.isArray(p['points'])) { const o = p['points'] as [number, number][]; for (let i = 1; i < o.length; i++) out.push([Math.min(o[i - 1]![0], o[i]![0]) - 3, Math.max(o[i - 1]![0], o[i]![0]) + 3, Math.min(o[i - 1]![1], o[i]![1]) - 3, Math.max(o[i - 1]![1], o[i]![1]) + 3]); }
  if (Array.isArray(p['door'])) { const [u, v] = p['door'] as [number, number]; pts.push([u, v]); }
  if (us.length && vs.length) {
    let u0 = Math.min(...us), u1 = Math.max(...us), v0 = Math.min(...vs), v1 = Math.max(...vs);
    const r = num('radius'), w = num('w'), d = num('d'), n = num('n');
    if (r !== undefined) { v0 -= r; v1 += r; }
    if (w !== undefined) { v0 -= w / 2; v1 += w / 2; }
    if (d !== undefined) { u0 -= d / 2; u1 += d / 2; }
    // a taxi rank or a bus stop runs back from its front along `back`
    if (Array.isArray(p['back'])) { const [bu, bv] = p['back'] as [number, number], L = p.type === 'taxi' ? (n ?? 4) * 6.5 : 14; pts.push([u0 + bu * L, v0 + bv * L]); }
    // a little room round each part, but none round a wall (the terrain's own wall rises from its back)
    const wall = p.type === 'box' && p['scenery'] === true, mu = wall ? 0 : us.length === 1 ? 6 : 2, mv = wall ? 0 : vs.length === 1 ? 4 : 1.5;
    out.push([u0 - mu, u1 + mu, v0 - mv, v1 + mv]);
  }
  for (const [u, v] of pts) out.push([u - 3, u + 3, v - 3, v + 3]);
  return out;
}

// ---- drawing it ----
const SKIRT = 8;                       // how far the strip's outer edge hangs down, to hide where it meets the base
const ROW_FINE = 4, ROW_COARSE = 16;   // metres between the strip's rows
const CHUNK = 240;                     // metres of line a strip chunk covers
const NEAR = 1300;                     // a chunk this near the camera is drawn fine
const BASE_GRID = 48, BASE_CHUNK = 64; // the base mesh's spacing, and its chunks' size in cells
// metres out from the land's edge to each of the strip's columns (the first two the wall's foot and top)
const OUT_FINE = [0, 0.4, 2.5, 4, 6, 8, 10.5, 13.5, 17, 21, 26, 32, 39, 47, 57, 69, 83, 100, 120, STRIP];
const OUT_COARSE = [0, 0.4, 6, 13.5, 26, 47, 83, STRIP];

/** The colours the ground takes (tokens), picked per vertex. */
function palette() {
  return { yard: PAL.yard, grass: PAL.grass, field: PAL['grass-2'], bank: PAL.bank, wall: PAL.brick, city: PAL.city, };
}
const hash = (a: number, b: number) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
/** Smooth value noise, 0 to 1. */
function noise(x: number, z: number): number {
  const i = Math.floor(x), j = Math.floor(z), u = x - i, v = z - j, su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
  return (hash(i, j) * (1 - su) + hash(i + 1, j) * su) * (1 - sv) + (hash(i, j + 1) * (1 - su) + hash(i + 1, j + 1) * su) * sv;
}

/** Where the city's ground starts: within this far of a point. */
interface Bands { city: { x: number; z: number; r: number } }

/** The ground as meshes: the base over the whole map and the strip along the line, sharing the terrain's material (the
 * reach's glow is patched into it, src/render/reach.ts). */
export class TerrainLayer {
  readonly material: THREE.MeshLambertMaterial;
  readonly group = new THREE.Group();
  private chunks: { s0: number; s1: number; mid: THREE.Vector3; mesh: THREE.Mesh; coarse: THREE.BufferGeometry; fine: THREE.BufferGeometry | null; dirty: boolean }[] = [];
  private files: Record<string, string>; private loading = new Set<string>();
  private col = palette(); private last = -1;
  /** The base mesh's chunks: they take shadows but cast none (the page sets every mesh casting at start; the first frame unsets these). */
  private baseMeshes: THREE.Mesh[] = [];
  constructor(readonly t: Terrain, private bands: Bands, files: Record<string, string> = {}) {
    this.files = files;
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.buildBase();
    const c = t.net.spine;
    for (let s0 = 0; s0 < c.length - 1; s0 += CHUNK) {
      const s1 = Math.min(c.length, s0 + CHUNK), p = c.at((s0 + s1) / 2);
      const coarse = this.strip(s0, s1, ROW_COARSE, OUT_COARSE), mesh = new THREE.Mesh(coarse, this.material);
      mesh.receiveShadow = true; mesh.castShadow = true; this.group.add(mesh);
      this.chunks.push({ s0, s1, mid: new THREE.Vector3(p.x, 0, p.z), mesh, coarse, fine: null, dirty: true });
    }
    // a sentinel drawn every frame (it's empty) that keeps the strip's detail and tiles following the camera
    const tick = new THREE.Mesh(new THREE.BufferGeometry(), this.material); tick.frustumCulled = false;
    tick.onBeforeRender = (_r, _s, cam) => { if (cam instanceof THREE.PerspectiveCamera) this.follow(cam.position); };
    tick.onAfterRender = () => { for (const m of this.baseMeshes) m.castShadow = false; tick.onAfterRender = () => {}; };
    this.group.add(tick);
  }
  /** Fine chunks near the camera, coarse ones further off; fetch the fine tiles the near ones need. Throttled. */
  follow(at: THREE.Vector3): void {
    const now = performance.now(); if (now - this.last < 250) return; this.last = now;   // cosmetic: when to look again
    let built = 0;
    for (const ch of this.chunks) {
      const d = Math.hypot(at.x - ch.mid.x, at.z - ch.mid.z) - CHUNK / 2, near = d < NEAR && at.y < 2500;
      if (near) {
        this.fetch(ch.mid.x, ch.mid.z, CHUNK / 2 + this.t.fineBand);
        if ((ch.dirty || !ch.fine) && built < 3) { ch.fine?.dispose(); ch.fine = this.strip(ch.s0, ch.s1, ROW_FINE, OUT_FINE); ch.dirty = false; built++; }
      }
      const g = near && ch.fine ? ch.fine : ch.coarse; if (ch.mesh.geometry !== g) ch.mesh.geometry = g;
    }
  }
  /** Every chunk of the strip as it's drawn fine, built now (for the checks). */
  fineStrips(): THREE.BufferGeometry[] { return this.chunks.map(ch => this.strip(ch.s0, ch.s1, ROW_FINE, OUT_FINE)); }
  /** Load every fine tile now (for the checks and a screenshot that wants the detail at once). */
  async loadAll(): Promise<void> { await Promise.all(Object.keys(this.files).map(k => this.get(k))); for (const ch of this.chunks) ch.dirty = true; this.last = -1; }
  private fetch(x: number, z: number, r: number): void {
    for (const key of this.t.fineWanted(x, z, r, k => k in this.files)) if (!this.loading.has(key)) this.get(key).then(() => {
      // the chunks over this tile draw again with it
      for (const ch of this.chunks) if (Math.hypot(x - ch.mid.x, z - ch.mid.z) < CHUNK + 400) ch.dirty = true;
      this.last = -1;
    });
  }
  private async get(key: string): Promise<void> {
    if (this.loading.has(key) || this.t.hasFine(key)) return; this.loading.add(key);
    try { const res = await fetch(this.files[key]!); if (res.ok) this.t.addFine(key, await res.text()); } catch { this.loading.delete(key); }
  }
  /** The colour of a vertex of ground at a point, `out` past the land's edge (or the land itself at -1), on a slope. */
  private colour(x: number, z: number, out: number, slope: number, k: THREE.Color): THREE.Color {
    const C = this.col, b = this.bands;
    if (out < 0) return k.copy(C.yard);
    if (slope > 0.55) return k.copy(C.bank);
    // two greens drifting into each other over a few hundred metres, and the city's paving round its end
    k.copy(C.grass).lerp(C.field, noise(x / 420, z / 420));
    const d = Math.hypot(x - b.city.x, z - b.city.z) - b.city.r;
    return d < 300 ? k.lerp(C.city, 1 - Math.max(0, d) / 300 * (d > 0 ? 1 : 0)) : k;
  }
  /** The strip from s0 to s1: rows across the line every `row` m, the railway's land and each side out to STRIP m. */
  strip(s0: number, s1: number, row: number, OUT: number[]): THREE.BufferGeometry {
    const t = this.t, c = t.net.spine, rows = Math.max(1, Math.ceil((s1 - s0) / row));
    // per side: the land's edge (yard), the wall's foot, its top, the ground (each wall vertex twice, so colours change
    // crisply), then the columns out and the skirt
    const perSide = 2 + 2 + 2 + (OUT.length - 2) + 1, cols = 2 * perSide;
    const pos = new Float32Array((rows + 1) * cols * 3), col = new Float32Array((rows + 1) * cols * 3), k = new THREE.Color();
    const fr = { ...FRAME }, gy = new Float32Array(OUT.length);
    for (let r = 0; r <= rows; r++) {
      const s = Math.min(s1, s0 + r * row), [lo, hi, pLo, pHi] = t.band(s), [tLo, tHi] = t.tracks(s);
      for (let side = 0; side < 2; side++) {
        const sign = side ? 1 : -1, edge = side ? hi : lo, pad = side ? pHi : pLo;
        // the ground at each column: the real ground shaped by the slopes, and at a pad a wall when the step is big
        const bridged = t.bridged(s), g0 = t.beside(s, edge + sign * 2.5, fr), wall = !bridged && pad && Math.abs(g0) >= WALL_MIN;
        for (let q = 0; q < OUT.length; q++) {
          const out = OUT[q]!, o = edge + sign * Math.max(out, 0.01);
          gy[q] = bridged ? t.beside(s, o, fr) : q === 0 ? 0 : q === 1 ? (wall ? g0 : 0) : shape(t.beside(s, o, fr), out, pad, g0);
        }
        if (!wall && !bridged) gy[1] = gy[2]! * (OUT[1]! / OUT[2]!);
        // under a viaduct the land's own two columns lie on the ground beneath too
        const floor = bridged ? t.beside(s, edge, fr) : 0;
        // the order across runs from far west (side 0, reversed) to far east, so the rows' quads all face up
        const put = (q: number, o: number, y: number, colour: THREE.Color) => {
          const ci = side ? perSide + q : perSide - 1 - q, at = (r * cols + ci) * 3;
          c.at(s, o, fr); pos[at] = fr.x; pos[at + 1] = y; pos[at + 2] = fr.z;
          col[at] = colour.r; col[at + 1] = colour.g; col[at + 2] = colour.b;
        };
        // the tracks' land, then a station's pad out to the edge (each colour change twice, so it's crisp)
        const te = side ? Math.min(tHi, edge) : Math.max(tLo, edge);
        let q = 0;
        if (bridged) { put(q++, te, floor, this.colour(fr.x, fr.z, 1, 0, k)); put(q++, te, floor, k); put(q++, edge, floor, k); }
        else { put(q++, te, 0, k.copy(this.col.yard)); c.at(s, te, fr); put(q++, te, 0, this.colour(fr.x, fr.z, 0, 0, k)); c.at(s, edge, fr); put(q++, edge, 0, this.colour(fr.x, fr.z, 0, 0, k)); }
        put(q++, edge, bridged ? floor : 0, wall ? this.col.wall : this.colour(fr.x, fr.z, 0, 0, k));
        put(q++, edge + sign * OUT[1]!, gy[1]!, wall ? this.col.wall : this.colour(fr.x, fr.z, 0, 0, k));
        put(q++, edge + sign * OUT[1]!, gy[1]!, this.colour(fr.x, fr.z, OUT[1]!, 0, k));
        for (let i = 2; i < OUT.length; i++) {
          const o = edge + sign * OUT[i]!, slope = Math.abs(gy[i]! - gy[i - 1]!) / (OUT[i]! - OUT[i - 1]!);
          c.at(s, o, fr); put(q++, o, gy[i]!, this.colour(fr.x, fr.z, OUT[i]!, slope, k));
        }
        c.at(s, edge + sign * STRIP, fr); put(q++, edge + sign * STRIP, gy[OUT.length - 1]! - SKIRT, this.colour(fr.x, fr.z, STRIP, 0, k));
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < rows; r++) for (let i = 0; i < cols - 1; i++) {
      const a = r * cols + i, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
  /** The base mesh over the whole map, in chunks: sunk well under the strip near the line, and easing to the far
   * ground's level at the map's edge. */
  private buildBase(): void {
    const t = this.t, c = t.net.spine, b = t.bounds, G = BASE_GRID, k = new THREE.Color();
    const nx = Math.floor((b.x1 - b.x0) / G), nz = Math.floor((b.z1 - b.z0) / G), fr = { ...FRAME };
    const EASE = 1200;
    for (let ci = 0; ci < nx; ci += BASE_CHUNK) for (let cj = 0; cj < nz; cj += BASE_CHUNK) {
      const w = Math.min(BASE_CHUNK, nx - ci) + 1, h = Math.min(BASE_CHUNK, nz - cj) + 1;
      const pos = new Float32Array(w * h * 3), col = new Float32Array(w * h * 3);
      // is this chunk anywhere near the line? (most aren't, and needn't ask the corridor for each vertex)
      const cx = b.x0 + (ci + w / 2) * G, cz = b.z0 + (cj + h / 2) * G, pc = c.at(t.nearest(cx, cz)), nearLine = Math.hypot(cx - pc.x, cz - pc.z) < (w + h) * G / 2 + 800;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const x = b.x0 + (ci + i) * G, z = b.z0 + (cj + j) * G, at = (j * w + i) * 3;
        let y = t.raw(x, z) - t.datumAt(x, z), out = 1e9;
        if (nearLine) {
          const { s, o, past } = t.locate(x, z), [lo, hi] = t.band(s);
          out = o > hi ? o - hi : o < lo ? lo - o : -1;
          if (!past && out < STRIP - G * 0.75) {
            // under the strip: well below anything it draws round here
            y = Math.min(0, y) - SKIRT;
          } else if (!past) y = t.groundY(x, z);
        }
        // ease to the far ground's level over the last stretch to the map's edge
        const edge = Math.min(x - b.x0, b.x1 - x, z - b.z0, b.z1 - z);
        if (edge < EASE) { const e = Math.max(0, edge) / EASE, f = e * e * (3 - 2 * e); y = t.edge + (y - t.edge) * f; }
        pos[at] = x; pos[at + 1] = y; pos[at + 2] = z;
        this.colour(x, z, out, 0, k); col[at] = k.r; col[at + 1] = k.g; col[at + 2] = k.b;
      }
      const idx: number[] = [];
      for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) { const a = j * w + i; idx.push(a, a + w, a + 1, a + 1, a + w, a + w + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
      g.computeVertexNormals(); g.computeBoundingSphere();
      // slopes from the normals: the steep ones are banks
      const nrm = g.getAttribute('normal');
      for (let v = 0; v < w * h; v++) if (nrm.getY(v) < 0.85 && col[v * 3]! !== this.col.yard.r) { col[v * 3] = this.col.bank.r; col[v * 3 + 1] = this.col.bank.g; col[v * 3 + 2] = this.col.bank.b; }
      const m = new THREE.Mesh(g, this.material); m.receiveShadow = true; this.group.add(m); this.baseMeshes.push(m);
    }
  }
}

// ---- the page's terrain: one, for everything that stands on the ground ----
let current: Terrain | null = null;
export function setTerrain(t: Terrain | null): void { current = t; }
/** The ground's height as drawn at a point (0 before the terrain is built, as the line is). */
export function groundAt(x: number, z: number): number { return current ? current.groundY(x, z) : 0; }
/** The fine tiles' URLs as the build emits them, by key (i_j); none outside a build (the checks load them from disk). */
export function fineFiles(): Record<string, string> {
  try {
    const found = import.meta.glob('../data/terrain/fine/*.txt', { query: '?url', import: 'default', eager: true });
    return Object.fromEntries(Object.entries(found).map(([path, url]) => [path.replace(/^.*\//, '').replace('.txt', ''), url]));
  } catch { return {}; }
}
/** The station kits by name, for the pads they stand on (empty outside a build). */
export function kitFiles(): Record<string, KitDef> {
  try {
    const found = import.meta.glob<KitDef>('../data/kits/*.json', { import: 'default', eager: true });
    return Object.fromEntries(Object.entries(found).map(([path, kit]) => [path.replace(/^.*\//, '').replace('.json', ''), kit]));
  } catch { return {}; }
}
