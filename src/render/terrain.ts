// The lie of the land under the line, from the Environment Agency's LIDAR (tools/lidar-to-terrain.mjs): the Mersey
// valley under the viaduct, the cuttings and the embankments. The railway is the datum: the tracks, stations and trains
// stay at y = 0, and the ground is drawn at its real height less the rail's real level there, so it rises into cuttings
// and falls away under embankments and the viaduct without moving a kit.
// - Base tiles (src/data/terrain/base.json, every 128 m over the map, and every 32 m in blocks within 1.5 km of the opening's line,
//   Edgeley Junction to Piccadilly) come with the page, and every line out's, the Buxton line's among them (out.json), just after
//   the first frame; fine tiles (every 2 m within
//   100 m of the line) are fetched as the camera comes near. A wider map (phase 8) adds tiles and levels the same way.
// - The railway's land is flat at 0: every track with its cess, and each station's pad, the ground its kit's parts
//   stand on. The tracks and kits are drawn at real scale, so the ground beside the land is read where it is, and its
//   real cuttings and banks start at the land's edge. Where a station's pad meets higher ground a retaining wall
//   stands; on the open line, a cutting slope; where it falls away, an embankment slope (or a wall, at a station).
// - Drawn as a base mesh over the whole map (sunk under the line's strip) and a strip along the line, in chunks, each
//   built coarse at start and fine once the camera is near and its tiles are in.
import * as THREE from 'three';
import baseData from '../data/terrain/base.json';
import { PAL } from './scene.ts';
import type { Corridor, Network } from '../sim/network.ts';

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
const TOUCH = 60;          // a point of railway land this near another line is marked on it too
const CESS = 5;            // the railway's land beyond the outer track's centre (the masts stand at 3.2)
const BAND_STEP = 2;       // metres between samples of the land's edges along the line
const STRIP = 150;         // the strip's reach beyond the land's edge
const FAR = 600;           // beyond twice this from the line the ground isn't shaped to it
const WALL_MIN = 1;        // a step this high or more at a station's edge is a wall
const CUT = 1.2, BANK = 1 / 1.5;   // the steepest cutting and embankment slopes on the open line (rise over run)

interface Tile { x0: number; z0: number; cell: number; n: number; v: Float32Array }
/** The railway's land along one line the ground is laid along (the spine, or a line out off it), every BAND_STEP m from
 * its start: its edges across (lo, hi), whether each is a station's (padLo, padHi), the tracks' own land within it
 * (tlo, thi; the rest is a station's pad), and the stretches of it on a viaduct (no land beneath, only the ground far
 * below). */
export interface GroundLine { k: number; c: Corridor; s0: number; n: number; lo: Float32Array; hi: Float32Array; padLo: Uint8Array; padHi: Uint8Array; tlo: Float32Array; thi: Float32Array; spans: [number, number][] }
/** A kit's part, loosely: whatever of these it has says where it stands. */
type KitPart = Record<string, unknown> & { type: string };
export interface KitDef { parts: KitPart[] }

export class Terrain {
  readonly net: Network;
  private base = new Map<string, Tile>(); private near = new Map<string, Tile>(); private out = new Map<string, Tile>(); private fine = new Map<string, Tile>();
  private baseSize: number; private nearSize: number; private outSize: number; private fineSize: number;
  private cell: number; private outBlock: number;
  readonly fineCell: number; readonly fineBand: number;
  private railDm: number[]; private railStep: number;
  private datum: { x0: number; z0: number; cell: number; w: number; h: number; v: Float32Array };
  /** The railway's land along each line the ground is laid along: the spine first, then the lines out (net.lines). */
  readonly lines: GroundLine[];
  readonly bounds: { x0: number; z0: number; x1: number; z1: number };
  /** Where the far ground meets the map's edge, relative to the line. */
  readonly edge: number;
  /** The stretches of the spine on a viaduct (s from, to): no land beneath them, only the ground far below. */
  readonly spans: [number, number][];
  /** spans: the spine's stretches on arches, or each line's (a function of the line, the spine among them). */
  constructor(net: Network, kits: Record<string, KitDef | undefined>, spans: [number, number][] | ((line: Corridor) => [number, number][]) = [], data: typeof baseData = baseData) {
    this.net = net; this.spans = typeof spans === 'function' ? spans(net.spine) : spans;
    this.baseSize = data.cell * data.tile; this.fineCell = data.fineCell; this.fineSize = data.fineCell * data.tile;
    this.fineBand = data.fineBand;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    // the base tiles are every farCell m; within a kilometre and a half of the line, blocks every cell m besides
    this.nearSize = data.cell * data.block;
    for (const [key, text] of Object.entries(data.near)) {
      const [i, j] = key.split(',').map(Number) as [number, number], n = data.block + 1;
      this.near.set(key, { x0: i * this.nearSize, z0: j * this.nearSize, cell: data.cell, n, v: decodeGrid(text, n, n) });
    }
    // a line out's ground, in smaller blocks every cell m, once addOut has them (out.json, after the first frame)
    this.cell = data.cell; this.outBlock = data.outBlock; this.outSize = data.cell * data.outBlock;
    for (const [key, text] of Object.entries(data.tiles)) {
      const n = this.baseSize / data.farCell + 1;
      const [i, j] = key.split(',').map(Number) as [number, number], t: Tile = { x0: i * this.baseSize, z0: j * this.baseSize, cell: data.farCell, n, v: decodeGrid(text, n, n) };
      this.base.set(key, t); x0 = Math.min(x0, t.x0); z0 = Math.min(z0, t.z0); x1 = Math.max(x1, t.x0 + this.baseSize); z1 = Math.max(z1, t.z0 + this.baseSize);
    }
    this.bounds = { x0, z0, x1, z1 };
    {
      // for each 200 m cell, the stretches of line (on every line: its index, then the segment's) that can hold the
      // nearest point to anywhere in it
      const cell = 200, w = Math.ceil((x1 - x0) / cell), h = Math.ceil((z1 - z0) / cell), cells: number[][] = [], half = cell * Math.SQRT1_2;
      const segs: [number, number][] = net.lines.flatMap((c, l) => c.pts.slice(1).map((_, k) => [l, k] as [number, number])), d = new Float64Array(segs.length);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell; let m = Infinity;
        segs.forEach(([l, k], q) => {
          const P = net.lines[l]!.pts, a = P[k]!, b = P[k + 1]!, ex = b.x - a.x, ez = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / (ex * ex + ez * ez || 1e-9)));
          d[q] = Math.hypot(a.x + ex * t - x, a.z + ez * t - z); if (d[q]! < m) m = d[q]!;
        });
        const list: number[] = []; segs.forEach(([l, k], q) => { if (d[q]! <= m + 2 * half) list.push(l, k); });
        cells.push(list);
      }
      this.locator = { x0, z0, cell, w, h, cells };
    }
    this.railDm = data.rail.dm; this.railStep = data.rail.step;
    const d = data.datum; this.datum = { ...d, v: decodeGrid(d.dm, d.w, d.h) };
    // the land along each line: every track and its cess, then each station's pad
    this.lines = net.lines.map((c, k) => {
      const n = Math.ceil(c.length / BAND_STEP) + 1;
      return { k, c, s0: c.start, n, lo: new Float32Array(n).fill(Infinity), hi: new Float32Array(n).fill(-Infinity), padLo: new Uint8Array(n), padHi: new Uint8Array(n), tlo: new Float32Array(0), thi: new Float32Array(0), spans: !k ? this.spans : typeof spans === 'function' ? spans(c) : [] };
    });
    const lineOf = (corridor: string) => this.lines[net.lines.indexOf(net.lineOf(corridor))]!;
    // a point of railway land at (x, z), r across: widen the land where the point is nearest a line
    // (the strip lays its rows square to the line, so a point is marked both where it's nearest the line and where a
    // row through it at its own distance along its own line would put it: round a bend the two differ)
    // and where lines run close (at a junction, or a line out passing a station on another), on each line within
    // TOUCH of it too, so one line's strip never draws ground over another's tracks or platforms
    const mark = (x: number, z: number, r: number, pad: boolean, own?: GroundLine, at?: number, off?: number) => {
      const { k, s, o } = this.locate(x, z);
      markAt(this.lines[k]!, s, o, r, pad); if (own && at !== undefined && off !== undefined) markAt(own, at, off, r, pad);
      if (this.lines.length > 1) this.each(x, z, (l, ls, lo, past) => { if (l !== k && !past && Math.abs(lo) < TOUCH && this.lines[l] !== own) markAt(this.lines[l]!, ls, lo, r, pad); });
    };
    const markAt = (g: GroundLine, s: number, o: number, r: number, pad: boolean) => {
      const i = Math.round((s - g.s0) / BAND_STEP);
      for (let k = Math.max(0, i - 1); k <= Math.min(g.n - 1, i + 1); k++) {
        if (o - r < g.lo[k]!) { g.lo[k] = o - r; if (pad) g.padLo[k] = 1; }
        if (o + r > g.hi[k]!) { g.hi[k] = o + r; if (pad) g.padHi[k] = 1; }
      }
    };
    const f = { ...FRAME };
    for (const tr of net.tracks) { const g = lineOf(tr.corridor), [e0, e1] = net.extent(tr.id); for (let s = e0; s <= e1; s += 1) { net.trackAt(tr.id, s, f); mark(f.x, f.z, CESS, false, g, s, net.offsetAt(tr.id, s)); } }
    for (const g of this.lines) {
      for (let k = 0; k < g.n; k++) if (g.lo[k] === Infinity) { g.lo[k] = -CESS; g.hi[k] = CESS; }
      g.tlo = g.lo.slice(); g.thi = g.hi.slice();
    }
    this.mark = mark; this.lineOf = lineOf;
    this.pads(kits);
    // the far ground's level: the median of the base mesh's edge, relative to the line
    const ring: number[] = [];
    for (let t = 0; t < 1; t += 0.01) for (const [x, z] of [[x0 + (x1 - x0) * t, z0 + 1], [x0 + (x1 - x0) * t, z1 - 1], [x0 + 1, z0 + (z1 - z0) * t], [x1 - 1, z0 + (z1 - z0) * t]] as const) ring.push(this.raw(x, z) - this.datumAt(x, z));
    ring.sort((a, b) => a - b); this.edge = ring[ring.length >> 1] ?? 0;
  }
  /** Which line is nearest (x, z), and how far along it the nearest point is: Corridor.nearest over every line, but
   * asking only the stretches of line that can be nearest from the point's cell. (One object, filled again on each call.) */
  nearest(x: number, z: number): { k: number; s: number } {
    const L = this.locator, i = Math.floor((x - L.x0) / L.cell), j = Math.floor((z - L.z0) / L.cell), lines = this.net.lines, out = NEAR_AT;
    let bestD = Infinity; out.k = 0; out.s = 0;
    const seg = (l: number, k: number) => {
      const c = lines[l]!, a = c.pts[k]!, b = c.pts[k + 1]!, L2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / L2));
      const d = (a.x + (b.x - a.x) * t - x) ** 2 + (a.z + (b.z - a.z) * t - z) ** 2;
      if (d < bestD) { bestD = d; out.k = l; out.s = c.cum[k]! + Math.sqrt(L2) * t; }
    };
    if (i < 0 || j < 0 || i >= L.w || j >= L.h) { lines.forEach((c, l) => { for (let k = 0; k < c.pts.length - 1; k++) seg(l, k); }); return out; }
    const list = L.cells[j * L.w + i]!; for (let q = 0; q < list.length; q += 2) seg(list[q]!, list[q + 1]!);
    return out;
  }
  private locator: { x0: number; z0: number; cell: number; w: number; h: number; cells: number[][] };
  /** Whether (x, z) is on the land, off its arches, of a line within TOUCH other than line `but`. */
  private onLand(x: number, z: number, but: number): boolean {
    let on = false;
    this.each(x, z, (l, s, o, past) => {
      if (on || l === but || past || Math.abs(o) > TOUCH) return;
      const g = this.lines[l]!, [lo, hi] = this.band(g, s); if (o >= lo && o <= hi && !this.bridged(s, g)) on = true;
    });
    return on;
  }
  /** For each line with a stretch near (x, z) (the point's cell's), the nearest point on it: how far along, across, and
   * whether past its ends. */
  private each(x: number, z: number, fn: (k: number, s: number, o: number, past: boolean) => void): void {
    const L = this.locator, i = Math.floor((x - L.x0) / L.cell), j = Math.floor((z - L.z0) / L.cell), lines = this.net.lines;
    if (i < 0 || j < 0 || i >= L.w || j >= L.h) return;
    const list = L.cells[j * L.w + i]!, best = new Map<number, [number, number]>();
    for (let q = 0; q < list.length; q += 2) {
      const l = list[q]!, k = list[q + 1]!, c = lines[l]!, a = c.pts[k]!, b = c.pts[k + 1]!, L2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / L2)), d = (a.x + (b.x - a.x) * t - x) ** 2 + (a.z + (b.z - a.z) * t - z) ** 2;
      const was = best.get(l); if (!was || d < was[0]) best.set(l, [d, c.cum[k]! + Math.sqrt(L2) * t]);
    }
    for (const [l, [, s]] of best) {
      const c = lines[l]!, F = c.at(s, 0, EACH_F), ax = x - F.x, az = z - F.z, along = ax * F.dx + az * F.dz, o = ax * F.nx + az * F.nz;
      fn(l, s, Math.abs(along) > 0.01 ? Math.sign(o) * Math.hypot(ax, az) : o, (s < c.start + 0.01 || s > c.end - 0.01) && Math.abs(along) > 1);
    }
  }
  /** Where a point is against the nearest line: which (k, in `lines`), how far along (s), how far across (o, its
   * distance from the line, signed; round a bend's outside the line's nearest point is a corner), and whether it's past
   * either end. (One object, filled again on each call: read it at once.) */
  locate(x: number, z: number): { k: number; s: number; o: number; past: boolean } {
    const { k, s } = this.nearest(x, z), c = this.lines[k]!.c; c.at(s, 0, LOC_F);
    const ax = x - LOC_F.x, az = z - LOC_F.z, o = ax * LOC_F.nx + az * LOC_F.nz, along = ax * LOC_F.dx + az * LOC_F.dz;
    LOC.k = k; LOC.s = s; LOC.past = (s < c.start + 0.01 || s > c.end - 0.01) && Math.abs(along) > 1;
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
    const o = sample(this.out, this.outSize, cx, cz); if (o === o) return o;
    const v = sample(this.base, this.baseSize, cx, cz);
    return v === v ? v : this.rail(0);
  }
  /** The ground line a corridor's land is on (the spine for the spine's corridors). */
  lineFor(corridor: string): GroundLine { return this.lines[this.net.lines.indexOf(this.net.lineOf(corridor))]!; }
  /** Whether s along a line (the spine if not given) is on a viaduct. */
  bridged(s: number, g: GroundLine = this.lines[0]!): boolean { for (const [a, b] of g.spans) if (s > a && s < b) return true; return false; }
  /** The tracks' own land's edges at s along a line. */
  tracks(g: GroundLine, s: number): [number, number] {
    const f = Math.max(0, Math.min(g.n - 1.001, (s - g.s0) / BAND_STEP)), k = Math.floor(f), t = f - k;
    return [g.tlo[k]! + (g.tlo[k + 1]! - g.tlo[k]!) * t, g.thi[k]! + (g.thi[k + 1]! - g.thi[k]!) * t];
  }
  /** The land's edges at s along a line, and whether each is a station's pad. (One array, filled again on each call:
   * read it at once.) */
  band(g: GroundLine, s: number): [number, number, boolean, boolean] {
    const f = Math.max(0, Math.min(g.n - 1.001, (s - g.s0) / BAND_STEP)), k = Math.floor(f), t = f - k, b = BAND;
    b[0] = g.lo[k]! + (g.lo[k + 1]! - g.lo[k]!) * t; b[1] = g.hi[k]! + (g.hi[k + 1]! - g.hi[k]!) * t;
    b[2] = !!(g.padLo[k]! || g.padLo[k + 1]!); b[3] = !!(g.padHi[k]! || g.padHi[k + 1]!);
    return b;
  }
  /** The ground beside a line: `o` across at s (outside the land), less the datum. */
  beside(g: GroundLine, s: number, o: number, fr = FRAME): number {
    g.c.at(s, o, fr);
    return this.raw(fr.x, fr.z) - this.datumAt(fr.x, fr.z);
  }
  /** Whether a drawn point is on the railway's land, within `margin` m of it, or on its cutting or embankment slope
   * (where the ground is drawn shaped to the line rather than as surveyed). */
  railLand(x: number, z: number, margin: number): boolean {
    const { k, s, o, past } = this.locate(x, z), L = this.lines[k]!;
    if (past || Math.abs(o) > 2 * FAR) return false;
    const [lo, hi, pLo, pHi] = this.band(L, s);
    if (o >= lo - margin && o <= hi + margin) return !this.bridged(s, L) || (o >= lo && o <= hi);
    if (this.lines.length > 1 && this.onLand(x, z, k)) return true;
    if (this.bridged(s, L)) return false;
    const out = o > hi ? o - hi : lo - o, g = this.beside(L, s, o);
    return Math.abs(shape(g, out, o > hi ? pHi : pLo, this.beside(L, s, o > hi ? hi + 2.5 : lo - 2.5)) - g) > 0.3;
  }
  /** The ground's height as drawn at a point: 0 on the railway's land, else the real ground less the datum, with the
   * slopes and walls where they meet. */
  groundY(x: number, z: number): number {
    const { k, s, o, past } = this.locate(x, z), L = this.lines[k]!;
    // past the line's ends, and far from it, the ground is read where it is, unless it's another line's land (past a
    // line's end at the junction it joins, the line it runs into)
    if (past || Math.abs(o) > 2 * FAR) return this.lines.length > 1 && this.onLand(x, z, k) ? 0 : this.raw(x, z) - this.datumAt(x, z);
    const [lo, hi, pLo, pHi] = this.band(L, s);
    if (o >= lo && o <= hi && !this.bridged(s, L)) return 0;
    // another line's land close by, off its arches, is the railway's too (a station on one line beside another's)
    if (this.lines.length > 1 && this.onLand(x, z, k)) return 0;
    if (this.bridged(s, L)) return this.beside(L, s, o);
    const out = o > hi ? o - hi : lo - o, g = this.beside(L, s, o);
    return shape(g, out, o > hi ? pHi : pLo, this.beside(L, s, o > hi ? hi + 2.5 : lo - 2.5));
  }
  /** Add a line out's blocks (src/data/terrain/out.json's `near`, fetched after the first frame): their keys. */
  addOut(blocks: Record<string, string>): Set<string> {
    const n = this.outBlock + 1, S = this.outSize;
    for (const [key, text] of Object.entries(blocks)) {
      const [i, j] = key.split(',').map(Number) as [number, number];
      this.out.set(key, { x0: i * S, z0: j * S, cell: this.cell, n, v: decodeGrid(text, n, n) });
    }
    return new Set(Object.keys(blocks));
  }
  /** Whether a box has any of the blocks `keys` names in it. */
  outIn(x0: number, z0: number, x1: number, z1: number, keys: Set<string>): boolean {
    const S = this.outSize;
    for (let i = Math.floor(x0 / S); i <= Math.floor(x1 / S); i++) for (let j = Math.floor(z0 / S); j <= Math.floor(z1 / S); j++) if (keys.has(`${i},${j}`)) return true;
    return false;
  }
  private mark: (x: number, z: number, r: number, pad: boolean, own?: GroundLine, at?: number, off?: number) => void;
  private lineOf: (corridor: string) => GroundLine;
  /** Lay the stations' pads on the railway's land, from the kits there are (the opening's at start; every line out's
   * once they're in, after the first frame: addKits): each line's land is its tracks' and the pads of its stations. */
  private pads(kits: Record<string, KitDef | undefined>): void {
    for (const g of this.lines) { g.lo = g.tlo.slice(); g.hi = g.thi.slice(); g.padLo.fill(0); g.padHi.fill(0); }
    for (const st of this.net.stations) {
      const kit = kits[st.kit]; if (!kit) continue;
      const F = this.net.stationFrame(st.id), g = this.lineOf(st.corridor);
      // each part's box, every couple of metres round its edge and through it
      for (const p of kit.parts) for (const [u0, u1, v0, v1] of partBoxes(p)) {
        const nu = Math.ceil((u1 - u0) / 2), nv = Math.ceil((v1 - v0) / 2);
        for (let a = 0; a <= nu; a++) for (let b = 0; b <= nv; b++) {
          const u = u0 + (u1 - u0) * a / nu, v = v0 + (v1 - v0) * b / nv;
          this.mark(F.x + F.dx * u + F.nx * v, F.z + F.dz * u + F.nz * v, 0, true, g, st.at + u, v);
        }
      }
    }
    // the edges change by no more than they run along, so a wall never cuts back across a row of the strip
    for (const g of this.lines) for (const [arr, sign] of [[g.lo, -1], [g.hi, 1]] as const) for (let pass = 0; pass < 2; pass++)
      for (let k = pass ? g.n - 2 : 1; pass ? k >= 0 : k < g.n; k += pass ? -1 : 1) {
        const prev = arr[k + (pass ? 1 : -1)]! - sign * BAND_STEP;
        if (sign > 0 ? prev > arr[k]! : prev < arr[k]!) arr[k] = prev;
      }
  }
  /** The stations' kits as there are now (every line out's in after the first frame): their pads laid again. */
  addKits(kits: Record<string, KitDef | undefined>): void { this.pads(kits); }
  // ---- the fine tiles ----
  /** The fine tiles a circle touches that exist and aren't loaded yet. */
  fineWanted(x: number, z: number, r: number, have: (key: string) => boolean): string[] {
    const T = this.fineSize, out: string[] = [];
    for (let i = Math.floor((x - r) / T); i <= Math.floor((x + r) / T); i++) for (let j = Math.floor((z - r) / T); j <= Math.floor((z + r) / T); j++) {
      const key = `${i}_${j}`; if (!this.fine.has(`${i},${j}`) && have(key)) out.push(key);
    }
    return out;
  }
  /** How many fine tiles are in: what stands on the ground at street level is seated again when it changes. */
  fineCount = 0;
  addFine(key: string, text: string): void {
    const [i, j] = key.split('_').map(Number) as [number, number], n = Math.round(this.fineSize / this.fineCell) + 1;
    this.fine.set(`${i},${j}`, { x0: i * this.fineSize, z0: j * this.fineSize, cell: this.fineCell, n, v: decodeGrid(text, n, n) });
    this.fineCount++;
  }
  hasFine(key: string): boolean { return this.fine.has(key.replace('_', ',')); }
}
const FRAME = { x: 0, z: 0, heading: 0, dx: 0, dz: 0, nx: 0, nz: 0 }, LOC_F = { ...FRAME }, EACH_F = { ...FRAME }, LOC = { k: 0, s: 0, o: 0, past: false }, NEAR_AT = { k: 0, s: 0 }, BAND: [number, number, boolean, boolean] = [0, 0, false, false];

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
  // a part at street level stands on the ground, off the pad; so does a street (`road`)
  if ((num('y0') ?? 0) >= 3 || p['street'] === true || p.type === 'road') return [];
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
const BASE_FAR = 6000, BASE_STEP = 4;   // a base chunk this far from the camera is drawn with every fourth row and column
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
  readonly group = Object.assign(new THREE.Group(), { name: 'terrain' });
  private chunks: { g: GroundLine; s0: number; s1: number; mid: THREE.Vector3; mesh: THREE.Mesh; coarse: THREE.BufferGeometry; fine: THREE.BufferGeometry | null; dirty: boolean }[] = [];
  private files: Record<string, string>; private loading = new Map<string, Promise<void>>();
  private col = palette(); private last = -1;
  /** The base mesh's chunks: they take shadows but cast none (the page sets every mesh casting at start; the first frame unsets these). */
  private baseMeshes: THREE.Mesh[] = [];
  /** Each base chunk's full and far geometry, and its middle. */
  private baseLods: BaseLod[] = [];
  /** The ground laid again once the lines out's ring is in (out.json), a little each look: the base mesh's chunks and
   * the strip's it touches. */
  private relay: (() => void)[] = []; private relaid: () => void = () => {};
  /** Resolves once the lines out's ring is in and the ground it touches laid again (at once without one to fetch). */
  readonly outReady: Promise<void>;
  constructor(readonly t: Terrain, private bands: Bands, files: Record<string, string> = {}, private outUrl = '') {
    this.files = files;
    this.outReady = outUrl ? new Promise(r => { this.relaid = r; }) : Promise.resolve();
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.buildBase();
    for (const g of t.lines) for (let s0 = g.c.start; s0 < g.c.end - 1; s0 += CHUNK) {
      const s1 = Math.min(g.c.end, s0 + CHUNK), p = g.c.at((s0 + s1) / 2);
      const coarse = this.strip(g, s0, s1, ROW_COARSE, OUT_COARSE), mesh = new THREE.Mesh(coarse, this.material);
      mesh.receiveShadow = true; mesh.castShadow = true; this.group.add(mesh);
      this.chunks.push({ g, s0, s1, mid: new THREE.Vector3(p.x, 0, p.z), mesh, coarse, fine: null, dirty: true });
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
    if (this.relay.length) { while (this.relay.length && performance.now() - now < 12) this.relay.shift()!(); if (!this.relay.length) this.relaid(); }
    let built = 0;
    for (const ch of this.chunks) {
      const d = Math.hypot(at.x - ch.mid.x, at.z - ch.mid.z) - CHUNK / 2, near = d < NEAR && at.y < 2500;
      if (near) {
        this.fetch(ch.mid.x, ch.mid.z, CHUNK / 2 + this.t.fineBand);
        if ((ch.dirty || !ch.fine) && built < 3) { ch.fine?.dispose(); ch.fine = this.strip(ch.g, ch.s0, ch.s1, ROW_FINE, OUT_FINE); ch.dirty = false; built++; }
      }
      const g = near && ch.fine ? ch.fine : ch.coarse; if (ch.mesh.geometry !== g) ch.mesh.geometry = g;
    }
    // the base mesh: far chunks plainer (the whole network in view)
    for (const b of this.baseLods) {
      const g = Math.hypot(at.x - b.x, at.y, at.z - b.z) - BASE_CHUNK * BASE_GRID * 0.7 < BASE_FAR ? b.full : b.far;
      if (b.mesh.geometry !== g) b.mesh.geometry = g;
    }
  }
  /** The lines out's ring (out.json's blocks) is in: lay again the base mesh's chunks and the strip's chunks it
   * touches, a few each look (all at once with `now`, for the checks). */
  layOut(blocks: Record<string, string>, now = false, at: { x: number; z: number }[] = []): void {
    const keys = this.t.addOut(blocks), t = this.t, R = 400;
    // what a box touches: the new blocks, or within R of a station whose kit (and so its pad) just came in
    const touched = (x0: number, z0: number, x1: number, z1: number) => t.outIn(x0, z0, x1, z1, keys) || at.some(p => p.x > x0 - R && p.x < x1 + R && p.z > z0 - R && p.z < z1 + R);
    for (const b of this.baseLods) if (touched(...b.box)) this.relay.push(() => {
      const lod = this.baseChunk(b.ci, b.cj, b.nx, b.nz), on = b.mesh.geometry === b.full;
      b.full.dispose(); b.far.dispose(); Object.assign(b, lod); b.mesh.geometry = on ? b.full : b.far;
    });
    const reach = CHUNK / 2 + STRIP + 120;
    for (const ch of this.chunks) if (touched(ch.mid.x - reach, ch.mid.z - reach, ch.mid.x + reach, ch.mid.z + reach)) this.relay.push(() => {
      const old = ch.coarse; ch.coarse = this.strip(ch.g, ch.s0, ch.s1, ROW_COARSE, OUT_COARSE);
      if (ch.mesh.geometry === old) ch.mesh.geometry = ch.coarse;
      old.dispose(); ch.dirty = true;
    });
    this.last = -1;
    if (now || !this.relay.length) { for (const f of this.relay.splice(0)) f(); this.relaid(); }
  }
  /** After the first frame: fetch the lines out's ground (out.json) and, with their kits (from `kitsIn`), lay their
   * stations' pads and the ground there again (outReady once it's all laid). */
  loadOut(kitsIn: Promise<Record<string, KitDef>>, at: { x: number; z: number }[]): Promise<void> {
    const blocks = this.outUrl ? fetch(this.outUrl).then(r => r.ok ? r.json() as Promise<{ near: Record<string, string> }> : { near: {} }).catch(() => ({ near: {} })) : Promise.resolve({ near: {} });
    // resolves once the ground's data is in (what stands on it can be placed), before the meshes are laid again
    return Promise.all([blocks, kitsIn.catch(() => ({}))]).then(([d, k]) => { this.t.addKits({ ...kitFiles(), ...k }); this.layOut(d.near, false, at); });
  }
  /** Every chunk of the strip as it's drawn fine, built now (for the checks). */
  fineStrips(): THREE.BufferGeometry[] { return this.chunks.map(ch => this.strip(ch.g, ch.s0, ch.s1, ROW_FINE, OUT_FINE)); }
  /** Load every fine tile now (for the checks and a screenshot that wants the detail at once). */
  async loadAll(): Promise<void> { await Promise.all(Object.keys(this.files).map(k => this.get(k))); for (const ch of this.chunks) ch.dirty = true; this.last = -1; }
  /** Load the fine tiles a circle touches (for what stands on the ground there: the buildings wait for them). */
  async ensure(x: number, z: number, r: number): Promise<void> {
    await this.outReady;
    const keys = this.t.fineWanted(x, z, r, k => k in this.files); if (!keys.length) return;
    await Promise.all(keys.map(k => this.get(k)));
    for (const ch of this.chunks) if (Math.hypot(x - ch.mid.x, z - ch.mid.z) < r + CHUNK) ch.dirty = true;
    this.last = -1;
  }
  private fetch(x: number, z: number, r: number): void {
    for (const key of this.t.fineWanted(x, z, r, k => k in this.files)) if (!this.loading.has(key)) this.get(key).then(() => {
      // the chunks over this tile draw again with it
      for (const ch of this.chunks) if (Math.hypot(x - ch.mid.x, z - ch.mid.z) < CHUNK + 400) ch.dirty = true;
      this.last = -1;
    });
  }
  private get(key: string): Promise<void> {
    if (this.t.hasFine(key)) return Promise.resolve();
    let p = this.loading.get(key);
    if (!p) {
      p = (async () => { try { const res = await fetch(this.files[key]!); if (res.ok) this.t.addFine(key, await res.text()); } catch { this.loading.delete(key); } })();
      this.loading.set(key, p);
    }
    return p;
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
  /** Whether another line comes within reach of a line's strip from s0 to s1. */
  private near(L: GroundLine, s0: number, s1: number): boolean {
    const reach = STRIP + 250;
    for (let s = s0; s <= s1 + 1e-6; s += Math.max(1, Math.min(60, s1 - s0))) {
      const p = L.c.at(s); let hit = false;
      for (const g of this.t.lines) if (g !== L) { const q = g.c.at(g.c.nearest(p.x, p.z)); if (Math.hypot(q.x - p.x, q.z - p.z) < reach) hit = true; }
      if (hit) return true;
    }
    return false;
  }
  /** The strip from s0 to s1 along a line: rows across it every `row` m, the railway's land and each side out to STRIP m. */
  strip(L: GroundLine, s0: number, s1: number, row: number, OUT: number[]): THREE.BufferGeometry {
    const t = this.t, c = L.c, rows = Math.max(1, Math.ceil((s1 - s0) / row)), shared = this.near(L, s0, s1);
    // per side: the land's edge (yard), the wall's foot, its top, the ground (each wall vertex twice, so colours change
    // crisply), then the columns out and the skirt
    const perSide = 2 + 2 + 2 + (OUT.length - 2) + 1, cols = 2 * perSide;
    const pos = new Float32Array((rows + 1) * cols * 3), col = new Float32Array((rows + 1) * cols * 3), k = new THREE.Color();
    const fr = { ...FRAME }, gy = new Float32Array(OUT.length);
    for (let r = 0; r <= rows; r++) {
      const s = Math.min(s1, s0 + r * row), [lo, hi, pLo, pHi] = t.band(L, s), [tLo, tHi] = t.tracks(L, s);
      for (let side = 0; side < 2; side++) {
        const sign = side ? 1 : -1, edge = side ? hi : lo, pad = side ? pHi : pLo;
        // the ground at each column: the real ground shaped by the slopes, and at a pad a wall when the step is big
        const bridged = t.bridged(s, L), g0 = t.beside(L, s, edge + sign * 2.5, fr), wall = !bridged && pad && Math.abs(g0) >= WALL_MIN;
        for (let q = 0; q < OUT.length; q++) {
          const out = OUT[q]!, o = edge + sign * Math.max(out, 0.01);
          gy[q] = bridged ? t.beside(L, s, o, fr) : q === 0 ? 0 : q === 1 ? (wall ? g0 : 0) : shape(t.beside(L, s, o, fr), out, pad, g0);
        }
        if (!wall && !bridged) gy[1] = gy[2]! * (OUT[1]! / OUT[2]!);
        // under a viaduct the land's own two columns lie on the ground beneath too
        const floor = bridged ? t.beside(L, s, edge, fr) : 0;
        // the order across runs from far west (side 0, reversed) to far east, so the rows' quads all face up
        const put = (q: number, o: number, y: number, colour: THREE.Color) => {
          const ci = side ? perSide + q : perSide - 1 - q, at = (r * cols + ci) * 3;
          c.at(s, o, fr);
          // where the strip reaches over another line's ground (near a junction, or a line out passing near), it lies
          // as that line's ground does, so the two strips agree and neither covers the other's tracks
          if (shared && t.locate(fr.x, fr.z).k !== L.k) y = t.groundY(fr.x, fr.z);
          pos[at] = fr.x; pos[at + 1] = y; pos[at + 2] = fr.z;
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
    const b = this.t.bounds, nx = Math.floor((b.x1 - b.x0) / BASE_GRID), nz = Math.floor((b.z1 - b.z0) / BASE_GRID);
    for (let ci = 0; ci < nx; ci += BASE_CHUNK) for (let cj = 0; cj < nz; cj += BASE_CHUNK) {
      const lod = this.baseChunk(ci, cj, nx, nz), m = new THREE.Mesh(lod.full, this.material); m.receiveShadow = true; this.group.add(m); this.baseMeshes.push(m);
      this.baseLods.push({ mesh: m, ...lod });
    }
  }
  /** One chunk of the base mesh, from (ci, cj) in cells of BASE_GRID: its full and far geometry, its middle and its box. */
  private baseChunk(ci: number, cj: number, nx: number, nz: number): Omit<BaseLod, 'mesh'> {
    const t = this.t, b = t.bounds, G = BASE_GRID, k = new THREE.Color();
    const EASE = 1200;
    {
      const w = Math.min(BASE_CHUNK, nx - ci) + 1, h = Math.min(BASE_CHUNK, nz - cj) + 1;
      const pos = new Float32Array(w * h * 3), col = new Float32Array(w * h * 3);
      // is this chunk anywhere near the line? (most aren't, and needn't ask the corridor for each vertex)
      const cx = b.x0 + (ci + w / 2) * G, cz = b.z0 + (cj + h / 2) * G, at = t.nearest(cx, cz), pc = t.lines[at.k]!.c.at(at.s), nearLine = Math.hypot(cx - pc.x, cz - pc.z) < (w + h) * G / 2 + 800;
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const x = b.x0 + (ci + i) * G, z = b.z0 + (cj + j) * G, at = (j * w + i) * 3;
        let y = t.raw(x, z) - t.datumAt(x, z), out = 1e9;
        if (nearLine) {
          const { k: l, s, o, past } = t.locate(x, z), [lo, hi] = t.band(t.lines[l]!, s);
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
      // the far one: the same vertices, every BASE_STEP-th row and column (and the last), so it costs no more memory
      const rows = (n: number) => { const o: number[] = []; for (let q = 0; q < n - 1; q += BASE_STEP) o.push(q); o.push(n - 1); return o; };
      const ri = rows(w), rj = rows(h), fidx: number[] = [];
      for (let j = 0; j < rj.length - 1; j++) for (let i = 0; i < ri.length - 1; i++) {
        const a = rj[j]! * w + ri[i]!, b2 = rj[j]! * w + ri[i + 1]!, c = rj[j + 1]! * w + ri[i]!, d = rj[j + 1]! * w + ri[i + 1]!;
        fidx.push(a, c, b2, b2, c, d);
      }
      const far = new THREE.BufferGeometry();
      for (const name of ['position', 'color', 'normal']) far.setAttribute(name, g.getAttribute(name));
      far.setIndex(fidx); far.boundingSphere = g.boundingSphere;
      return { full: g, far, x: cx, z: cz, ci, cj, nx, nz, box: [b.x0 + ci * G, b.z0 + cj * G, b.x0 + (ci + w - 1) * G, b.z0 + (cj + h - 1) * G] };
    }
  }
}
/** A chunk of the base mesh: its mesh, full and far geometry, middle, where it starts in cells (of how many), and its box. */
interface BaseLod { mesh: THREE.Mesh; full: THREE.BufferGeometry; far: THREE.BufferGeometry; x: number; z: number; ci: number; cj: number; nx: number; nz: number; box: [number, number, number, number] }

// ---- the page's terrain: one, for everything that stands on the ground ----
let current: Terrain | null = null;
export function setTerrain(t: Terrain | null): void { current = t; }
/** The ground's height as drawn at a point (0 before the terrain is built, as the line is). */
export function groundAt(x: number, z: number): number { return current ? current.groundY(x, z) : 0; }
/** Whether a point is on the railway's land or its cutting and embankment sides (false before the terrain is built). */
export function onRailway(x: number, z: number): boolean { return current ? current.railLand(x, z, 0) : false; }
/** Changes whenever the ground as drawn is read more finely (a fine tile in), so what stands on it can be seated again. */
export function groundVersion(): number { return current ? current.fineCount : 0; }
/** The fine tiles' URLs as the build emits them, by key (i_j); none outside a build (the checks load them from disk). */
export function fineFiles(): Record<string, string> {
  try {
    const found = import.meta.glob('../data/terrain/fine/*.txt', { query: '?url', import: 'default', eager: true });
    return Object.fromEntries(Object.entries(found).map(([path, url]) => [path.replace(/^.*\//, '').replace('.txt', ''), url]));
  } catch { return {}; }
}
/** The lines out's ring's URL as the build emits it (src/data/terrain/out.json); none outside a build. */
export function outFile(): string {
  try {
    const found = import.meta.glob('../data/terrain/out.json', { query: '?url', import: 'default', eager: true });
    return Object.values(found)[0] ?? '';
  } catch { return ''; }
}
/** The world tiles' URLs as the build emits them, by square (i_j); none outside a build (the checks read them from disk). */
export function worldFiles(): Record<string, string> {
  try {
    const found = import.meta.glob('../data/world/*.txt', { query: '?url', import: 'default', eager: true });
    return Object.fromEntries(Object.entries(found).map(([path, url]) => [path.replace(/^.*\//, '').replace('.txt', ''), url]));
  } catch { return {}; }
}
/** The station kits there are so far, by name, for the pads they stand on (src/render/kits.ts: the opening's, then
 * every line out's after the first frame; empty outside a build). */
let kitsNow: Record<string, KitDef> = {};
export function useKits(k: Record<string, KitDef>): void { kitsNow = k; }
export function kitFiles(): Record<string, KitDef> { return kitsNow; }
