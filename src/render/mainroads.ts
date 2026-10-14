// The main roads on the map (`mainRoads` in the network data, src/render/mainways.ts): every carriageway along its real
// course, as wide as its lanes, on the ground as drawn, in the one road material every road shares (so the wash tints
// it without another shader); up on a deck where OpenStreetMap has it on a
// bridge (Wellington Road high over Mersey Square), straight from one end to the other with parapets and piers down to
// the ground, clear of the rail over the line; and through the railway's land where it passes under the line. Fetched in a chunk after the first frame
// and laid again as the ground's read more finely. View only: nothing here changes the game.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT } from './scene.ts';
import { pathThrough, type Path } from './buses.ts';
import { groundAt, groundVersion, onRailway } from './terrain.ts';
import { courseOf, deckAt, deckEnds, deckY, mainWays, type MainDef, type MainWay } from './mainways.ts';
import type { XZ } from '../sim/types.ts';

const LIFT = 0.12;        // m a carriageway is drawn above the ground (over the buses' roads, 0.08, and the streets' paint)
const DECK = 1.1;         // m from a deck's surface to its underside
const PARAPET = 1.0;      // m a parapet stands above the deck
const PIER = 24;          // m between a bridge's piers, where the deck stands this far above the ground or more:
const PIER_MIN = 2.5;
const HEADROOM = 4.6;     // m a road passing under the line runs below the rail, at least
const GRADE = 0.1;        // the steepest it dips to it
const RELAY_MS = 3000;    // the least time between laying the roads again as the ground comes in finer
const RELAY = 1500;       // m from where the camera looks that they're laid again (the fine ground comes in round it)
const SLICE = 4;          // ms a frame spends laying them

/** A carriageway's way: on a bridge, straight from one end's ground to the other's (never below the ground under it);
 * anywhere else the buses' rule (src/render/buses.ts): on the ground, through the railway's land where it passes under
 * the line (a tunnel or a way below the railway's layer marks it as passing under), then thinned to where the line
 * or the ground turns. */
export function wayPath(w: MainWay): Path {
  // (no main road crosses the line at grade: off a bridge, every one passes under it where it meets its land)
  const p = pathThrough(w.pts, w.pts.map(() => !w.def.bridge));
  if (!w.def.bridge) {
    // under the line: down through the railway's land with headroom under the rail, ramped back to the street either
    // side no steeper than 1 in 10 (the real road dips under the bridge)
    const want = p.pts.map(([x, z], k) => onRailway(x, z) ? Math.min(p.y[k]!, -HEADROOM) : Infinity);
    if (want.some(v => v < Infinity)) {
      const low = want.map((v, k) => Math.min(v, p.y[k]!));
      for (let k = 1; k < low.length; k++) low[k] = Math.min(low[k]!, low[k - 1]! + GRADE * (p.d[k]! - p.d[k - 1]!));
      for (let k = low.length - 2; k >= 0; k--) low[k] = Math.min(low[k]!, low[k + 1]! + GRADE * (p.d[k + 1]! - p.d[k]!));
      for (let k = 0; k < low.length; k++) p.y[k] = low[k]!;
    }
  } else {
    // (as src/render/mainways.ts's deckAt has it, which the buses driving over it read)
    const { a, b } = deckEnds(w.pts);
    for (let k = 0; k < p.y.length; k++) p.y[k] = deckY(a, b, p.d[k]! / (p.len || 1), ...p.pts[k]!);
  }
  return thin(p, w.pts);
}
/** A path thinned to the points where its line turns (the data's own points) or its height bends by more than 0.12 m. */
function thin(p: Path, corners: XZ[]): Path {
  const at = new Set(corners.map(([x, z]) => x.toFixed(2) + ',' + z.toFixed(2)));
  const corner = (k: number) => at.has(p.pts[k]![0].toFixed(2) + ',' + p.pts[k]![1].toFixed(2)), n = p.pts.length, keep = [0];
  for (let a = 0, c = 2; c < n; c++) {
    let fine = !corner(c - 1);
    for (let k = a + 1; k < c && fine; k++) { const t = (p.d[k]! - p.d[a]!) / ((p.d[c]! - p.d[a]!) || 1); if (Math.abs(p.y[a]! + (p.y[c]! - p.y[a]!) * t - p.y[k]!) > 0.12) fine = false; }
    if (!fine) { a = c - 1; keep.push(a); }
  }
  if (n > 1) keep.push(n - 1);
  return { pts: keep.map(k => p.pts[k]!), d: keep.map(k => p.d[k]!), y: keep.map(k => p.y[k]!), len: p.len, under: p.under && keep.map(k => p.under![k]!) };
}

/** What the layer needs from the page. */
export interface MainRoadParts { scene: THREE.Scene; def: MainDef; focus?: () => { tx: number; tz: number } }

export class MainRoadLayer {
  readonly group = new THREE.Group();
  /** The carriageways, each its way and its path once laid (the checks read them). */
  laid: { way: MainWay; path: Path | null }[] = [];
  /** The carriageways still to lay (or lay again), by index, a few each frame. */
  private queue: number[] = []; private queued = new Set<number>();
  private laidOn = -1; private laidAt = 0;
  constructor(private readonly p: MainRoadParts) {
    this.group.name = 'main-roads';
    p.scene.add(this.group);
    this.laid = mainWays(p.def).map(way => ({ way, path: null }));
    this.laidOn = groundVersion();
    this.laid.forEach((_, i) => this.want(i));
  }
  /** Every carriageway laid now, at once (the checks). */
  layAll(): void { while (this.queue.length) this.layOne(); this.build(); }
  /** Each frame: a few carriageways laid, SLICE ms at most, and the roads built again once they're all in; as the
   * ground's read more finely (at most every 3 s), those within RELAY m of where the camera looks laid again. */
  sync(): void {
    const now = performance.now();
    if (groundVersion() !== this.laidOn && now - this.laidAt >= RELAY_MS) {
      this.laidOn = groundVersion(); this.laidAt = now;
      const f = this.p.focus?.();
      this.laid.forEach((l, i) => { if (!f || l.way.pts.some(([x, z]) => Math.abs(x - f.tx) < RELAY && Math.abs(z - f.tz) < RELAY)) this.want(i); });
    }
    if (!this.queue.length) return;
    while (this.queue.length && performance.now() - now < SLICE) this.layOne();
    if (!this.queue.length) this.build();
  }
  private want(i: number): void { if (!this.queued.has(i)) { this.queued.add(i); this.queue.push(i); } }
  private layOne(): void { const i = this.queue.shift()!; this.queued.delete(i); this.laid[i]!.path = wayPath(this.laid[i]!.way); }
  /** Triangles drawn (the checks). */
  stats(): { ways: number; triangles: number; bridges: number } {
    let tri = 0; this.group.traverse(o => { if (o instanceof THREE.Mesh) tri += (o.geometry.index ? o.geometry.index.count : o.geometry.getAttribute('position').count) / 3; });
    return { ways: this.laid.filter(l => l.path).length, triangles: Math.round(tri), bridges: this.laid.filter(l => l.path && l.way.def.bridge).length };
  }
  private build(): void {
    for (const o of [...this.group.children]) { this.group.remove(o); if (o instanceof THREE.InstancedMesh) o.dispose(); else if (o instanceof THREE.Mesh) o.geometry.dispose(); }
    const P: number[] = [], idx: number[] = [], decks: THREE.BufferGeometry[] = [];
    for (const { way, path } of this.laid) {
      if (!path) continue;
      const n = path.pts.length, half = way.width / 2, base = P.length / 3;
      for (let k = 0; k < n; k++) {
        // the normal at a point: the two segments' either side averaged, held to the width round a bend
        const [px, pz] = path.pts[Math.max(0, k - 1)]!, [qx, qz] = path.pts[Math.min(n - 1, k + 1)]!, [cx, cz] = path.pts[k]!;
        const a = k > 0 ? norm(cx - px, cz - pz) : null, b = k < n - 1 ? norm(qx - cx, qz - cz) : null;
        let nx = -((a?.[1] ?? 0) + (b?.[1] ?? 0)), nz = (a?.[0] ?? 0) + (b?.[0] ?? 0);
        const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
        const s = a && b ? Math.min(2, 1 / Math.max(0.5, nx * -a[1] + nz * a[0])) : 1, y = path.y[k]! + LIFT;
        P.push(cx + nx * half * s, y, cz + nz * half * s, cx - nx * half * s, y, cz - nz * half * s);
        if (k) { const i = base + (k - 1) * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
      }
      if (way.def.bridge) decks.push(deck(path, way.width));
    }
    if (idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, MAT.road); m.receiveShadow = true; m.castShadow = false; m.userData['noShadow'] = true; m.name = 'main-roads-ways';
      this.group.add(m);
    }
    // down a motorway's middle, its central reserve's barrier and lamp columns
    const def = this.p.def, onDeck = deckAt(def), unit = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const bars: THREE.Matrix4[] = [], poles: THREE.Matrix4[] = [], lamps: THREE.Matrix4[] = [];
    for (const r of def.mainRoads ?? []) {
      const pts = /^M/.test(r.ref) ? courseOf(def, r.id) : null; if (!pts) continue;
      for (let k = 1; k < pts.length; k++) {
        const [ax, az] = pts[k - 1]!, [bx, bz] = pts[k]!, x = (ax + bx) / 2, z = (az + bz) / 2, l = Math.hypot(bx - ax, bz - az);
        const y = (onDeck(x, z, bx - ax, bz - az) ?? groundAt(x, z)) + LIFT;
        q.setFromAxisAngle(up, Math.atan2(-(bz - az), bx - ax));
        v.set(x, y + 0.45, z); sc.set(l + 0.2, 0.9, 0.8); bars.push(m4.compose(v, q, sc).clone());
        if (k % 3 === 0) { v.set(x, y + 6, z); sc.set(0.3, 12, 0.3); poles.push(m4.compose(v, q, sc).clone()); v.y = y + 12; sc.set(0.8, 0.35, 7); lamps.push(m4.compose(v, q, sc).clone()); }
      }
    }
    for (const [list, mat, name] of [[bars, MAT.concrete, 'main-roads-barrier'], [poles, MAT.steel, 'main-roads-poles'], [lamps, MAT.glow, 'main-roads-lamps']] as const) {
      if (!list.length) continue;
      const m = new THREE.InstancedMesh(unit, mat, list.length); list.forEach((x, i) => m.setMatrixAt(i, x)); m.name = name; m.castShadow = name === 'main-roads-poles';
      this.group.add(m);
    }
    if (decks.length) {
      const g = mergeGeometries(decks); const m = new THREE.Mesh(g, MAT.concrete); m.castShadow = true; m.receiveShadow = true; m.name = 'main-roads-bridges';
      this.group.add(m);
    }
  }
}
const norm = (x: number, z: number): [number, number] => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };

/** A bridge's deck under a carriageway: its sides from the parapets' tops to the underside, and a pier down to the
 * ground every PIER m where the deck stands PIER_MIN m or more above it. */
function deck(path: Path, width: number): THREE.BufferGeometry {
  const P: number[] = [], half = width / 2 + 0.3;
  // each face wound to face `out` (the material draws front faces only)
  const quad = (a: number[], b: number[], c: number[], d: number[], out: number[]) => {
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    if (n[0]! * out[0]! + n[1]! * out[1]! + n[2]! * out[2]! >= 0) P.push(...a, ...b, ...c, ...a, ...c, ...d); else P.push(...a, ...c, ...b, ...a, ...d, ...c);
  };
  for (let k = 1; k < path.pts.length; k++) {
    const [ax, az] = path.pts[k - 1]!, [bx, bz] = path.pts[k]!, [dx, dz] = norm(bx - ax, bz - az), nx = -dz * half, nz = dx * half;
    const ya = path.y[k - 1]! + LIFT, yb = path.y[k]! + LIFT;
    for (const s of [1, -1]) {
      const ox = nx * s, oz = nz * s;
      // the outer face, the parapet's top, the inner face
      quad([ax + ox, ya - DECK, az + oz], [bx + ox, yb - DECK, bz + oz], [bx + ox, yb + PARAPET, bz + oz], [ax + ox, ya + PARAPET, az + oz], [ox, 0, oz]);
      quad([ax + ox, ya + PARAPET, az + oz], [bx + ox, yb + PARAPET, bz + oz], [bx + ox * 0.94, yb + PARAPET, bz + oz * 0.94], [ax + ox * 0.94, ya + PARAPET, az + oz * 0.94], [0, 1, 0]);
      quad([ax + ox * 0.94, ya + PARAPET, az + oz * 0.94], [bx + ox * 0.94, yb + PARAPET, bz + oz * 0.94], [bx + ox * 0.94, yb, bz + oz * 0.94], [ax + ox * 0.94, ya, az + oz * 0.94], [-ox, 0, -oz]);
    }
    // the underside
    quad([ax - nx, ya - DECK, az - nz], [bx - nx, yb - DECK, bz - nz], [bx + nx, yb - DECK, bz + nz], [ax + nx, ya - DECK, az + nz], [0, -1, 0]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  const parts = [g];
  for (let s = PIER; s < path.len - PIER / 2; s += PIER) {
    let k = 1; while (k < path.d.length - 1 && path.d[k]! < s) k++;
    const t = (s - path.d[k - 1]!) / ((path.d[k]! - path.d[k - 1]!) || 1), [ax, az] = path.pts[k - 1]!, [bx, bz] = path.pts[k]!;
    const x = ax + (bx - ax) * t, z = az + (bz - az) * t, top = path.y[k - 1]! + (path.y[k]! - path.y[k - 1]!) * t + LIFT - DECK, g0 = groundAt(x, z);
    if (top - g0 < PIER_MIN) continue;
    const pier = new THREE.BoxGeometry(1.6, top - g0 + 0.5, width * 0.8).translate(0, (top + g0 - 0.5) / 2, 0);
    pier.rotateY(-Math.atan2(bz - az, bx - ax)); pier.translate(x, 0, z);
    parts.push(pier.toNonIndexed());
  }
  for (const q of parts) { if (q.hasAttribute('uv')) q.deleteAttribute('uv'); if (q.hasAttribute('normal')) q.deleteAttribute('normal'); }
  const m = mergeGeometries(parts); m.computeVertexNormals();
  return m;
}
