// The main roads' data (`mainRoads` in the network data, from OpenStreetMap by tools/osm-to-roads.mjs --main): each
// road's carriageways, its course and its junctions, in the world. Small and in the script before the first frame, so
// the buses' roads can give way to the main roads they run along from the start; the drawing (src/render/mainroads.ts)
// and the cars (src/render/traffic.ts) come after it.
import { projectLatLon } from '../sim/network.ts';
import type { NetworkGeoDef, XZ } from '../sim/types.ts';
import { groundAt, onRailway } from './terrain.ts';

/** A carriageway as OpenStreetMap draws it: its street name, lanes (both ways unless `oneway`), whether it's on a
 * bridge or in a tunnel, its `ref` where it isn't the road's own (a slip road, a junction's roundabout). */
export interface MainWayDef { name: string; ref?: string; lanes: number; oneway?: boolean; bridge?: boolean; tunnel?: boolean; layer?: number; points: [number, number][] }
/** A main road: its ref, its carriageways, the middle of the road end to end (`course`, every 20 m) and its junctions
 * by name, each at the real node where the roads meet (`with` the other main road's id where it's one). */
export interface MainRoadDef { id: string; ref: string; name: string; via?: string; note?: string; junctions: { name: string; with?: string; at: [number, number] }[]; course: [number, number][]; ways: MainWayDef[] }
export type MainDef = NetworkGeoDef & { mainRoads?: MainRoadDef[] };

/** A carriageway in the world: its points, its width as drawn, and the rest as the data has it. */
export interface MainWay { road: string; def: MainWayDef; pts: XZ[]; width: number }

export const LANE = 3.3;   // m a lane, as drawn
/** A carriageway's width: its lanes, and a strip each side (a motorway's hard shoulder). */
export function wayWidth(w: MainWayDef, motorway: boolean): number { return w.lanes * LANE + (motorway ? 4.6 : 1); }

const cache = new WeakMap<object, MainWay[]>();
/** Every main road's carriageways in the world. */
export function mainWays(def: MainDef): MainWay[] {
  const had = cache.get(def); if (had) return had;
  const out: MainWay[] = [];
  for (const r of def.mainRoads ?? []) for (const w of r.ways) {
    const pts = w.points.map(([lat, lon]): XZ => { const p = projectLatLon(lat, lon, def.origin); return [p.x, p.z]; });
    out.push({ road: r.id, def: w, pts, width: wayWidth(w, /^M/.test(w.ref ?? r.ref)) });
  }
  cache.set(def, out);
  return out;
}

/** A test of whether a point is on a main road's carriageway (within its half width and `pad` m), on a 50 m grid. */
export function onMainRoad(def: MainDef, pad = 0): (x: number, z: number) => boolean {
  const C = 50, grid = new Map<string, [number, number, number, number, number][]>();
  for (const w of mainWays(def)) for (let i = 1; i < w.pts.length; i++) {
    const [ax, az] = w.pts[i - 1]!, [bx, bz] = w.pts[i]!, r = w.width / 2 + pad;
    for (let gx = Math.floor((Math.min(ax, bx) - r) / C); gx <= Math.floor((Math.max(ax, bx) + r) / C); gx++)
      for (let gz = Math.floor((Math.min(az, bz) - r) / C); gz <= Math.floor((Math.max(az, bz) + r) / C); gz++) {
        const k = gx + ',' + gz; let l = grid.get(k); if (!l) grid.set(k, l = []); l.push([ax, az, bx, bz, r]);
      }
  }
  return (x, z) => {
    for (const [ax, az, bx, bz, r] of grid.get(Math.floor(x / C) + ',' + Math.floor(z / C)) ?? []) {
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      if (Math.hypot(ax + dx * t - x, az + dz * t - z) <= r) return true;
    }
    return false;
  };
}

/** A main road's course in the world, end to end. */
export function courseOf(def: MainDef, id: string): XZ[] | null {
  const r = def.mainRoads?.find(m => m.id === id); if (!r) return null;
  return r.course.map(([lat, lon]): XZ => { const p = projectLatLon(lat, lon, def.origin); return [p.x, p.z]; });
}

/** The height of a main road's deck where a way running along it (heading dx, dz) is on one of its bridges, or null:
 * straight from the bridge's one end on the ground to the other, as src/render/mainroads.ts lays it. Read from the
 * ground as it is now. A way crossing under the bridge (more than about 35° off it) isn't on it. */
export function deckAt(def: MainDef): (x: number, z: number, dx: number, dz: number) => number | null {
  const bridges = mainWays(def).filter(w => w.def.bridge).map(w => {
    const d = [0]; for (let i = 1; i < w.pts.length; i++) d.push(d[i - 1]! + Math.hypot(w.pts[i]![0] - w.pts[i - 1]![0], w.pts[i]![1] - w.pts[i - 1]![1]));
    return { w, d, ...deckEnds(w.pts) };
  });
  return (x, z, dx, dz) => {
    const l = Math.hypot(dx, dz) || 1;
    for (const { w, d, a, b } of bridges) for (let i = 1; i < w.pts.length; i++) {
      const [ax, az] = w.pts[i - 1]!, [bx, bz] = w.pts[i]!, sx = bx - ax, sz = bz - az, l2 = sx * sx + sz * sz;
      const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / l2)) : 0;
      if (Math.hypot(ax + sx * t - x, az + sz * t - z) > w.width / 2 + 1) continue;
      if (Math.abs(sx * dx + sz * dz) / (Math.sqrt(l2) * l) < 0.82) continue;
      const f = (d[i - 1]! + t * (d[i]! - d[i - 1]!)) / (d[d.length - 1]! || 1);
      return deckY(a, b, f, x, z);
    }
    return null;
  };
}

export const CLEAR = 5.2;   // m a deck over the railway's land stands above the rail at least (a real overbridge's clearance)
/** A bridge's two ends' heights: the ground at each, read out beyond the railway's land where an end stands on it (the
 * land is drawn level at the rail; the real abutments are up on the banks beside it). */
export function deckEnds(pts: XZ[]): { a: number; b: number } {
  const end = (p: XZ, q: XZ) => {
    const l = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, ux = (p[0] - q[0]) / l, uz = (p[1] - q[1]) / l;
    for (let o = 0; o <= 60; o += 5) { const x = p[0] + ux * o, z = p[1] + uz * o; if (!onRailway(x, z)) return groundAt(x, z); }
    return groundAt(...p);
  };
  return { a: end(pts[0]!, pts[1]!), b: end(pts[pts.length - 1]!, pts[pts.length - 2]!) };
}
/** A deck's height a share f of the way from its end at height a to its end at b: straight between them, never below
 * the ground under it, and clear of the rail over the railway's land. */
export function deckY(a: number, b: number, f: number, x: number, z: number): number {
  return Math.max(a + (b - a) * f, groundAt(x, z) + 0.3, onRailway(x, z) ? CLEAR : -Infinity);
}
