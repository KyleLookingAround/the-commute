// Track network as a graph: corridors (each a real line's centreline, a polyline in local metres) joined at junctions,
// tracks offset across a corridor, stations at a distance along a corridor, and services routed across it all as legs
// of corridor and track. Distances along the line are chainage: every corridor is drawn towards Manchester, and its
// chainage runs on from the corridor it meets at a junction, so a route's distances grow towards Manchester all the way
// along it and a distance with its corridor names one place (docs/decisions/ADR-2026-10-13-network-as-a-graph.md).
// The sim only ever talks in distances along a corridor; the renderer asks the network for world positions. A track's
// offset changes along the line: each track has an open-line offset, and the layout list moves it around a station
// (Stockport's tracks spread round two wide islands) or along a stretch, easing in and out.
import type { CorridorDef, Frame, JunctionDef, LatLon, NetworkDef, NetworkGeoDef, RoadDef, ServiceDef, Station, StationPoint, TrackDef, XZ } from './types.ts';

export const NORTH = -1; // trains heading north (towards Manchester) move towards lower z, so "north" is -1 along z,
                         // but along a corridor we measure s increasing in the direction the corridor is drawn (south to north).

export function projectLatLon(lat: number, lon: number, origin: LatLon): { x: number; z: number } {
  // Equirectangular local projection: good to centimetres over 20 km. x east, z south (so north is -z).
  const kLat = 111320, kLon = 111320 * Math.cos(origin.lat * Math.PI / 180);
  return { x: (lon - origin.lon) * kLon, z: -(lat - origin.lat) * kLat };
}

/** A fresh frame to fill; the hot loops pass their own so nothing is allocated per frame. */
export const newFrame = (): Frame => ({ x: 0, z: 0, heading: 0, dx: 0, dz: 0, nx: 0, nz: 0 });

export class Corridor {
  id: string;
  pts: { x: number; z: number }[];
  /** Each point's chainage: the corridor's start's, then on along it. */
  cum: number[];
  length: number;
  /** The chainage at its start and its end. */
  start: number; end: number;
  constructor(def: CorridorDef) {
    this.id = def.id;
    this.pts = def.points.map(p => ({ x: p[0], z: p[1] }));
    this.cum = [def.base ?? 0];
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1]!, b = this.pts[i]!;
      this.cum.push(this.cum[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.start = this.cum[0]!; this.end = this.cum[this.cum.length - 1]!; this.length = this.end - this.start;
    // each point's direction: its two segments' averaged (the ends take their one segment's)
    const seg = (i: number): [number, number] => { const a = this.pts[Math.max(0, Math.min(i, this.pts.length - 2))]!, b = this.pts[Math.max(1, Math.min(i + 1, this.pts.length - 1))]!, l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return [(b.x - a.x) / l, (b.z - a.z) / l]; };
    this.dirs = this.pts.map((_, i) => { const p = seg(i - 1), q = seg(i), x = p[0] + q[0], z = p[1] + q[1], l = Math.hypot(x, z) || 1; return [x / l, z / l]; });
  }
  /** The direction at each point, between its segments', so offsets turn smoothly round the corners. */
  private dirs: [number, number][];
  // Position and heading at chainage s, offset laterally (positive = right of travel when heading along +s).
  at(s: number, offset = 0, out: Frame = newFrame()): Frame {
    const i = this._seg(s);
    const a = this.pts[i]!, b = this.pts[i + 1]!;
    const segLen = Math.max(1e-6, this.cum[i + 1]! - this.cum[i]!);
    const f = Math.max(0, Math.min(1, (s - this.cum[i]!) / segLen));
    // the direction turns smoothly from one segment's to the next's across each point (the vertex directions, half way
    // between), so a line offset well off the corridor runs on without a step at each corner
    const va = this.dirs[i]!, vb = this.dirs[i + 1]!;
    let dx = va[0] + (vb[0] - va[0]) * f, dz = va[1] + (vb[1] - va[1]) * f; const n = Math.hypot(dx, dz) || 1; dx /= n; dz /= n;
    // right-hand normal (x, z) -> (-dz, dx) is "left" in a y-up right-handed frame viewed from above; pick one and stay consistent
    const nx = -dz, nz = dx;
    out.x = a.x + (b.x - a.x) * f + nx * offset;
    out.z = a.z + (b.z - a.z) * f + nz * offset;
    out.heading = Math.atan2(dz, dx);
    out.dx = dx; out.dz = dz; out.nx = nx; out.nz = nz;
    return out;
  }
  _seg(s: number): number {
    const c = this.cum; let lo = 0, hi = c.length - 2;
    if (s <= this.start) return 0; if (s >= this.end) return hi;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (c[mid]! <= s) lo = mid; else hi = mid - 1; }
    return lo;
  }
  // Nearest chainage to a point (for placing stations from coordinates)
  nearest(x: number, z: number): number {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.pts.length - 1; i++) {
      const a = this.pts[i]!, b = this.pts[i + 1]!, L2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2 || 1e-9;
      const t = Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (z - a.z) * (b.z - a.z)) / L2));
      const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t, d = (px - x) ** 2 + (pz - z) ** 2;
      if (d < bestD) { bestD = d; best = this.cum[i]! + Math.sqrt(L2) * t; }
    }
    return best;
  }
}

/** A point on a track's offset profile: from here the track runs at offset v. */
interface Key { s: number; v: number }
const smooth = (t: number) => t * t * (3 - 2 * t);
/** The default distance over which a track eases from one layout to the next. */
export const EASE = 200;
/** How far the drawn line eases from a station's straight stretch back to the corridor. */
export const STRAIGHT_EASE = 150;
/** A station's straight stretch: from s0 to s1 along its corridor the line is drawn along the frame F (at s = at). */
interface Straight { corridor: string; s0: number; s1: number; at: number; F: Frame }

/** A junction: a named point on a corridor (its chainage s there), and the corridors that start or end at it. */
export interface Junction { id: string; name: string; corridor: string; s: number; x: number; z: number; joins: string[] }
/** One leg of a service's route: along a corridor on a pair of tracks (the one its trains take towards Manchester and
 * the one back), from chainage s0 to s1, where it meets the legs either side at junctions (the route's ends: none). */
export interface RouteLeg { corridor: string; north: string; south: string; s0: number; s1: number }
/** A service's way through the graph: its legs in order towards Manchester. Chainage runs on through the junctions, so
 * a distance along the route is the chainage, and the leg it falls in says which corridor and track that is. */
export class Route {
  legs: RouteLeg[];
  /** Where its trains come on: where the first leg's track towards Manchester begins. */
  start: number;
  constructor(legs: RouteLeg[], start: number) { this.legs = legs; this.start = start; }
  /** The leg that holds chainage s: the one given if it still does (a train passes from leg to leg at the junctions). */
  legAt(s: number, hint = 0): number {
    const L = this.legs, h = L[hint];
    if (h && s >= h.s0 && s <= h.s1) return hint;
    for (let k = 0; k < L.length; k++) if (s <= L[k]!.s1) return k;
    return L.length - 1;
  }
  leg(s: number, hint = 0): RouteLeg { return this.legs[this.legAt(s, hint)]!; }
  /** The track a train on the route runs at s, heading dir (+1 towards Manchester). */
  track(s: number, dir: number, hint = 0): string { const l = this.leg(s, hint); return dir > 0 ? l.north : l.south; }
  /** Whether the route runs along a corridor. */
  uses(corridor: string): boolean { return this.legs.some(l => l.corridor === corridor); }
}

/** What a sensible layout keeps (docs/DESIGN.md, Where the tracks run; src/sim/layout.ts checks it all, the test runs it):
 * step: metres between the points it samples. slope: the steepest a track or a station's rails shift sideways, across
 * per along: a real 1 in 9 turnout's angle is about 1 in 7 across at the map's 1.25 times, and a throat on a curve fans
 * a little faster (Stockport's north end, from OpenStreetMap, at up to about 1 in 5). still: slower than this a track
 * isn't moving. apart: two tracks side by side are at least this far apart (trains are drawn 3.64 m wide), or within
 * `together` of each other (one road worked both ways); in between they're in a turnout, merging, parting or crossing
 * over, for no longer than `turnout`. gap: the clear line between one section (a station's throat, a junction, a
 * crossover) and the next. cess: how far a structure's deck reaches beyond its outer track. block: the shortest block
 * section, the longest train (an express's nine cars) and an overlap. */
export const LAYOUT = { step: 5, slope: 0.2, still: 0.004, apart: 4.2, together: 0.3, turnout: 120, gap: 100, cess: 6, block: 9 * 23.6 + 50 };

/** Signals: a site every SIGNAL_SITE metres of chainage from SIGNAL_FIRST (halfway between two masts), none within
 * SIGNAL_CLEAR of a station on its corridor (its kit fills that stretch) nor in a section where the tracks move (a
 * throat, a crossover). Each site is a block boundary on every track there, and so are a track's ends (a junction, a
 * buffer stop, the edge of the map), except a site closer than LAYOUT.block to the boundary before it or the track's
 * end, so no block is shorter than a train and its overlap. */
export const SIGNAL_SITE = 440, SIGNAL_FIRST = 57.5, SIGNAL_CLEAR = 280;
/** A track's block sections: its boundaries in chainage order, and whether each block between two is open line (no
 * station in it: a station's own stretch is worked by its platforms). */
export interface Blocks { at: number[]; open: boolean[] }
/** A train's way through a junction (or past one on the corridor it runs along): the track it's on on the low-chainage
 * side (a) and the high (b), and the points 100 m out either side they run between (for telling which ways cross). */
export interface Movement { junction: string; s: number; a: string; b: string; ax: number; az: number; bx: number; bz: number }

/** The corridor the drawing calls the spine: the corridors the ground is laid along, end to end, as one. */
export const SPINE = 'spine';

export class Network {
  def: NetworkDef;
  corridors: Record<string, Corridor>;
  /** The spine's corridors joined into one, chainage from 0: the ground, the trees, the masts and the signals are laid
   * along it, and a place on it is the same place on the corridor it's on. */
  spine: Corridor;
  spineOf: Set<string>;
  /** The lines the ground and what stands along the line are laid along: the spine first, then every corridor off it
   * (a line out, with its own ground, trees, masts and signals), each by its own chainage. */
  lines: Corridor[];
  junctions: Junction[];
  tracks: TrackDef[];
  stations: Station[];
  byId: Record<string, Station>;
  /** Each track's offset profile along its corridor: keys between which it eases; empty runs at its open-line offset. */
  private keys: Record<string, Key[]>;
  private straights: Straight[];
  private routes = new Map<string, Route>();
  /** The signal sites along each corridor (chainage). */
  signals: Record<string, number[]>;
  private blockCache = new Map<string, Blocks>();
  /** Which way each track's trains run: +1 towards Manchester (a route's north track), -1 the other way. */
  private ways = new Map<string, 1 | -1>();
  constructor(def: NetworkDef) {
    this.def = def;
    const built = graph(def.corridors, def.junctions ?? [], def.spine ?? def.corridors.map(c => c.id).slice(0, 1));
    this.corridors = Object.fromEntries(built.map(c => [c.id, new Corridor(c)]));
    const spine = def.spine ?? built.slice(0, 1).map(c => c.id);
    this.spineOf = new Set(spine);
    this.spine = new Corridor({ id: SPINE, base: 0, points: spine.flatMap((id, k) => (built.find(c => c.id === id)?.points ?? []).slice(k ? 1 : 0)) });
    this.lines = [this.spine, ...Object.values(this.corridors).filter(c => !this.spineOf.has(c.id))];
    this.junctions = (def.junctions ?? []).map(j => ({
      id: j.id, name: j.name, corridor: j.corridor, x: j.x, z: j.z, s: this.corridor(j.corridor).nearest(j.x, j.z),
      joins: [j.corridor, ...def.corridors.filter(c => c.from === j.id || c.to === j.id).map(c => c.id)].filter((c, k, a) => a.indexOf(c) === k),
    }));
    this.tracks = def.tracks;                // [{ id, corridor, offset }]
    this.stations = def.stations.map((s, i) => {
      const c = this.corridor(s.corridor);
      const at = s.s !== undefined ? s.s : c.nearest(s.x, s.z);
      return { ...s, index: i, at, s: at + (s.stop ?? 0) };
    });
    this.byId = Object.fromEntries(this.stations.map(s => [s.id, s]));
    this.keys = Object.fromEntries(this.tracks.map(t => [t.id, this.profile(t)]));
    this.signals = Object.fromEntries(Object.values(this.corridors).map(c => {
      const near = this.stations.filter(st => st.corridor === c.id), moving = this.sections(c.id), out: number[] = [];
      for (let k = Math.ceil((c.start - SIGNAL_FIRST) / SIGNAL_SITE), s = SIGNAL_FIRST + k * SIGNAL_SITE; s < c.end; k++, s = SIGNAL_FIRST + k * SIGNAL_SITE)
        if (near.every(st => Math.abs(st.s - s) > SIGNAL_CLEAR) && moving.every(([a, b]) => s < a || s > b)) out.push(s);
      return [c.id, out];
    }));
    for (const v of def.services ?? []) for (const l of this.route(v).legs) { this.ways.set(l.north, 1); this.ways.set(l.south, -1); }
    this.straights = this.stations.filter(st => st.straight).map(st => ({
      corridor: st.corridor, s0: st.at + (st.straight?.[0] ?? 0), s1: st.at + (st.straight?.[1] ?? 0), at: st.at, F: this.stationFrame(st.id),
    }));
  }
  corridor(id: string): Corridor { const c = this.corridors[id]; if (!c) throw new Error(`no corridor "${id}"`); return c; }
  /** The line a corridor's ground is laid along: the spine for the spine's corridors, else the corridor itself. */
  lineOf(corridorId: string): Corridor { return this.spineOf.has(corridorId) ? this.spine : this.corridor(corridorId); }
  /** Whether a corridor's tracks are electrified at s (its `wires`, back from its Manchester end). */
  wired(corridorId: string, s: number): boolean { const w = this.def.corridors.find(c => c.id === corridorId)?.wires, c = this.corridor(corridorId); return w === undefined || s >= c.end - w; }
  /** Whether a corridor lies along a line (the spine, or the corridor itself). */
  onLine(corridorId: string, line: Corridor): boolean { return line === this.spine ? this.spineOf.has(corridorId) : line.id === corridorId; }
  track(id: string): TrackDef { const t = this.tracks.find(t => t.id === id); if (!t) throw new Error(`no track "${id}"`); return t; }
  station(id: string): Station { const s = this.byId[id]; if (!s) throw new Error(`no station "${id}"`); return s; }
  /** The road between two stations either way round, or null if the data has none; `reversed` when it runs b to a. */
  road(a: string, b: string): { road: RoadDef; reversed: boolean } | null {
    for (const road of this.def.roads ?? []) {
      if (road.from === a && road.to === b) return { road, reversed: false };
      if (road.from === b && road.to === a) return { road, reversed: true };
    }
    return null;
  }

  /** A station point's distance along its corridor. */
  pointS(p: StationPoint): number { return this.station(p.station).at + p.u; }
  /** Where a track begins and ends along its corridor. */
  extent(trackId: string): [number, number] {
    const t = this.track(trackId), c = this.corridor(t.corridor);
    return [t.start ? this.pointS(t.start) : c.start, t.end ? this.pointS(t.end) : c.end];
  }
  junction(id: string): Junction { const j = this.junctions.find(j => j.id === id); if (!j) throw new Error(`no junction "${id}"`); return j; }
  /** A track's block sections (Blocks). */
  blocks(trackId: string): Blocks {
    let b = this.blockCache.get(trackId); if (b) return b;
    const t = this.track(trackId), [e0, e1] = this.extent(trackId), at = [e0];
    for (const s of this.signals[t.corridor] ?? []) if (s - at[at.length - 1]! >= LAYOUT.block && e1 - s >= LAYOUT.block) at.push(s);
    at.push(e1);
    const near = this.stations.filter(st => st.corridor === t.corridor);
    const open = at.slice(1).map((s1, k) => { const s0 = at[k]!; return near.every(st => (st.s < s0 || st.s > s1) && (st.at < s0 || st.at > s1)); });
    b = { at, open }; this.blockCache.set(trackId, b);
    return b;
  }
  /** The stretches of a corridor where its tracks, or a station's rails into a bay, move across it (its throats and
   * crossovers): [s0, s1] in order. */
  sections(corridorId: string): [number, number][] {
    let out = this.sectionCache.get(corridorId); if (out) return out;
    const c = this.corridor(corridorId), L = LAYOUT, moving = new Set<number>();
    for (const t of this.tracks) {
      if (t.corridor !== corridorId) continue;
      const [e0, e1] = this.extent(t.id);
      for (let s = e0 + L.step; s <= e1 - L.step; s += L.step) if (Math.abs(this.offsetAt(t.id, s + L.step) - this.offsetAt(t.id, s - L.step)) / (2 * L.step) > L.still) moving.add(Math.round(s / L.step));
    }
    for (const st of this.stations) if (st.corridor === corridorId) for (const p of st.platforms ?? []) {
      const P = p.path ?? [];
      for (let k = 1; k < P.length; k++) {
        const [u0 = 0, v0 = 0] = P[k - 1]!, [u1 = 0, v1 = 0] = P[k]!;
        if (Math.abs(v1 - v0) <= L.still * Math.abs(u1 - u0)) continue;
        for (let s = st.at + Math.min(u0, u1); s <= st.at + Math.max(u0, u1); s += L.step) moving.add(Math.round(s / L.step));
      }
    }
    out = [];
    for (const k of [...moving].sort((a, b) => a - b)) {
      const s = k * L.step, last = out[out.length - 1];
      if (last && s - last[1] <= L.step + 1e-6) last[1] = s; else out.push([s, s]);
    }
    out = out.map(([a, b]) => [Math.max(c.start, a - L.step), Math.min(c.end, b + L.step)]);
    this.sectionCache.set(corridorId, out);
    return out;
  }
  private sectionCache = new Map<string, [number, number][]>();
  /** How wide a structure's deck is drawn from s0 to s1 along a corridor: every track on it there, and the rails into a
   * station's bay, with LAYOUT.cess beyond the outer ones either side ([low, high] across). */
  deck(corridorId: string, s0: number, s1: number): [number, number] {
    let lo = Infinity, hi = -Infinity;
    const mark = (v: number) => { lo = Math.min(lo, v); hi = Math.max(hi, v); };
    for (let s = s0; s <= s1 + 1e-6; s += Math.max(1, Math.min(LAYOUT.step, s1 - s0))) {
      for (const t of this.tracks) { if (t.corridor !== corridorId) continue; const [e0, e1] = this.extent(t.id); if (s >= e0 && s <= e1) mark(this.offsetAt(t.id, s)); }
      for (const st of this.stations) if (st.corridor === corridorId) for (const p of st.platforms ?? []) {
        const P = p.path ?? [], u = s - st.at;
        for (let k = 1; k < P.length; k++) { const [a = 0, va = 0] = P[k - 1]!, [b = 0, vb = 0] = P[k]!; if ((u - a) * (u - b) <= 0 && a !== b) mark(va + (vb - va) * (u - a) / (b - a)); }
      }
    }
    return lo > hi ? [-LAYOUT.cess, LAYOUT.cess] : [lo - LAYOUT.cess, hi + LAYOUT.cess];
  }
  /** Which way a track's trains run: +1 towards Manchester, -1 the other way. */
  way(trackId: string): 1 | -1 { return this.ways.get(trackId) ?? 1; }
  /** The ways a service's trains take through junctions heading dir, in the order they reach them: from one leg's track
   * onto the next's where the route changes corridor, and straight on along its track past a junction on its corridor. */
  movements(def: ServiceDef, dir: 1 | -1): Movement[] {
    const key = `${def.id}:${dir}`; let m = this.moveCache.get(key); if (m) return m;
    const r = this.route(def), out: Movement[] = [], f = newFrame();
    const end = (track: string, s: number) => { const [e0, e1] = this.extent(track); this.trackAt(track, Math.max(e0, Math.min(e1, s)), f); return [f.x, f.z] as const; };
    const add = (j: Junction, a: string, b: string) => { const [ax, az] = end(a, j.s - 100), [bx, bz] = end(b, j.s + 100); out.push({ junction: j.id, s: j.s, a, b, ax, az, bx, bz }); };
    r.legs.forEach((l, k) => {
      const t = dir > 0 ? l.north : l.south;
      for (const j of this.junctions) if (j.corridor === l.corridor && j.s > l.s0 && j.s < l.s1) add(j, t, t);
      const n = r.legs[k + 1]; if (n) add(this.junctions.find(j => j.s === l.s1 && j.joins.includes(l.corridor) && j.joins.includes(n.corridor))!, t, dir > 0 ? n.north : n.south);
    });
    out.sort((p, q) => (p.s - q.s) * dir); this.moveCache.set(key, out);
    return out;
  }
  private moveCache = new Map<string, Movement[]>();
  /** Whether two ways through the same junction can't be set at once: different ways that share a track or cross. */
  conflicts(p: Movement, q: Movement): boolean {
    if (p.junction !== q.junction || (p.a === q.a && p.b === q.b)) return false;
    if (p.a === q.a || p.b === q.b || p.a === q.b || p.b === q.a) return true;
    const cross = (x1: number, z1: number, x2: number, z2: number, x3: number, z3: number) => (x2 - x1) * (z3 - z1) - (z2 - z1) * (x3 - x1);
    const d1 = cross(q.ax, q.az, q.bx, q.bz, p.ax, p.az), d2 = cross(q.ax, q.az, q.bx, q.bz, p.bx, p.bz);
    const d3 = cross(p.ax, p.az, p.bx, p.bz, q.ax, q.az), d4 = cross(p.ax, p.az, p.bx, p.bz, q.bx, q.bz);
    return d1 * d2 < 0 && d3 * d4 < 0;
  }
  /** A service's route through the graph: its tracks each way, leg by leg, joined where their corridors meet. */
  route(def: ServiceDef): Route {
    let r = this.routes.get(def.id); if (r) return r;
    const { north, south } = def.tracks;
    if (!north.length || north.length !== south.length) throw new Error(`${def.id}: a track each way for every leg`);
    const legs: RouteLeg[] = north.map((n, k) => {
      const c = this.track(n).corridor; if (this.track(south[k]!).corridor !== c) throw new Error(`${def.id}: leg ${k}'s tracks are on two corridors`);
      return { corridor: c, north: n, south: south[k]!, s0: -Infinity, s1: Infinity };
    });
    for (let k = 1; k < legs.length; k++) {
      const a = legs[k - 1]!.corridor, b = legs[k]!.corridor, j = this.junctions.find(j => j.joins.includes(a) && j.joins.includes(b));
      if (!j) throw new Error(`${def.id}: no junction joins ${a} and ${b}`);
      legs[k - 1]!.s1 = legs[k]!.s0 = j.s;
    }
    r = new Route(legs, this.extent(north[0]!)[0]); this.routes.set(def.id, r);
    return r;
  }
  /** The stretches of a track's corridor the layout list moves it in, in order: [s0, s1, offset, ease]. */
  private spans(t: TrackDef): [number, number, number, number][] {
    const out: [number, number, number, number][] = [], E = this.def.ease ?? EASE;
    for (const L of this.def.layout ?? []) {
      const v = L.offsets[t.id]; if (v === undefined) continue;
      if (L.station) {
        const st = this.station(L.station); if (st.corridor !== t.corridor) continue;
        out.push([st.at + (L.u0 ?? 0), st.at + (L.u1 ?? 0), v, L.ease ?? E]);
      } else if ((L.corridor ?? t.corridor) === t.corridor && L.s0 !== undefined && L.s1 !== undefined) out.push([L.s0, L.s1, v, L.ease ?? E]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  }
  /** The keys a track eases between: it holds each span's offset, and between spans returns to its open-line offset
   * when they're far enough apart, or eases straight from one to the next when they're close. */
  private profile(t: TrackDef): Key[] {
    const keys: Key[] = []; let prevEase = 0;
    for (const [s0, s1, v, E] of this.spans(t)) {
      const prev = keys[keys.length - 1];
      if (!prev) keys.push({ s: s0 - E, v: t.offset });
      else if (s0 - prev.s > prevEase + E) keys.push({ s: prev.s + prevEase, v: t.offset }, { s: s0 - E, v: t.offset });
      keys.push({ s: s0, v }, { s: s1, v }); prevEase = E;
    }
    const last = keys[keys.length - 1]; if (last) keys.push({ s: last.s + prevEase, v: t.offset });
    return keys;
  }
  /** The passenger services (not scenery) with their routes as station indices, south to north. */
  services(): { def: ServiceDef; route: number[]; home: number | null }[] {
    return (this.def.services ?? []).filter(s => !s.scenery && s.route).map(def => ({
      def, route: (def.route ?? []).map(id => this.station(id).index), home: def.home ? this.station(def.home).index : null,
    }));
  }
  /** The service that takes passengers from a station in a direction: the one whose route goes on that way from it.
   * At the end of every route (Piccadilly northbound), the one that calls there. */
  boardingService(stationId: string, dir: 'north' | 'south'): ServiceDef | null {
    const i = this.station(stationId).index, all = this.services();
    const goes = all.find(s => { const k = s.route.indexOf(i); return k >= 0 && (dir === 'north' ? k < s.route.length - 1 : k > 0); });
    return (goes ?? all.find(s => s.route.includes(i)))?.def ?? null;
  }
  /** Where the map draws a point at s along a corridor, offset across it: on the corridor, except through a station's
   * straight stretch, where it follows the station's frame (u = s - at, v = offset) and eases back either side. Only the
   * drawing: the sim measures along the corridor. */
  place(corridorId: string, s: number, offset = 0, out: Frame = newFrame()): Frame {
    const spine = corridorId === SPINE, f = (spine ? this.spine : this.corridor(corridorId)).at(s, offset, out), E = STRAIGHT_EASE;
    for (const z of this.straights) {
      if ((spine ? !this.spineOf.has(z.corridor) : z.corridor !== corridorId) || s <= z.s0 - E || s >= z.s1 + E) continue;
      const w = s < z.s0 ? smooth((s - z.s0 + E) / E) : s > z.s1 ? smooth((z.s1 + E - s) / E) : 1, u = s - z.at, F = z.F;
      f.x += (F.x + F.dx * u + F.nx * offset - f.x) * w; f.z += (F.z + F.dz * u + F.nz * offset - f.z) * w;
      const dx = f.dx + (F.dx - f.dx) * w, dz = f.dz + (F.dz - f.dz) * w, n = Math.hypot(dx, dz);
      f.dx = dx / n; f.dz = dz / n; f.nx = -f.dz; f.nz = f.dx; f.heading = Math.atan2(f.dz, f.dx);
    }
    return f;
  }
  /** Where a track runs across its corridor at s. */
  offsetAt(trackId: string, s: number): number {
    const k = this.keys[trackId]; if (!k) return this.track(trackId).offset;
    const first = k[0], last = k[k.length - 1];
    if (!first || !last) return this.track(trackId).offset;
    if (s <= first.s) return first.v; if (s >= last.s) return last.v;
    let i = 0; while (i < k.length - 2 && k[i + 1]!.s <= s) i++;
    const a = k[i]!, b = k[i + 1]!;
    return b.s > a.s ? a.v + (b.v - a.v) * smooth((s - a.s) / (b.s - a.s)) : b.v;
  }
  /** World position and heading for a point on a track at distance s along its corridor: where the track is moving
   * across the corridor (into a station, or crossing over) the heading turns with it. */
  trackAt(trackId: string, s: number, out?: Frame): Frame {
    const t = this.track(trackId), f = this.place(t.corridor, s, this.offsetAt(trackId, s), out);
    const k = (this.offsetAt(trackId, s + 2) - this.offsetAt(trackId, s - 2)) / 4;
    if (k !== 0) {
      const dx = f.dx + f.nx * k, dz = f.dz + f.nz * k, n = Math.hypot(dx, dz);
      f.dx = dx / n; f.dz = dz / n; f.nx = -f.dz; f.nz = f.dx; f.heading = Math.atan2(f.dz, f.dx);
    }
    return f;
  }
  /** The frame a station's kit stands in: its own point on the corridor, u along the line, v across it. */
  stationFrame(stationId: string): Frame { const st = this.station(stationId); return this.corridor(st.corridor).at(st.at, 0); }
}

export function smoothPolyline(points: XZ[], subdivisions = 6): XZ[] {
  // Catmull-Rom through the given points so hand-entered coordinates give a gently curved corridor
  const P = points.map(p => ({ x: p[0], z: p[1] })), out: XZ[] = [];
  if (!P.length) return out;
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)]!, p1 = P[i]!, p2 = P[i + 1]!, p3 = P[Math.min(P.length - 1, i + 2)]!;
    for (let k = 0; k < subdivisions; k++) {
      const t = k / subdivisions, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const z = 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
      out.push([x, z]);
    }
  }
  const last = P[P.length - 1]!;
  out.push([last.x, last.z]);
  return out;
}

/** The corridors as the graph has them: each cut at the junction it starts or ends at (its waypoints run a little past,
 * so its curve there is the uncut line's), with its chainage at its start (`base`): the spine's from 0, end to end, and
 * every other corridor's running on to or from the junction where it meets another. */
function graph(defs: CorridorDef[], junctions: JunctionDef[], spine: string[]): CorridorDef[] {
  const at = (id: string) => { const j = junctions.find(j => j.id === id); if (!j) throw new Error(`no junction "${id}"`); return j; };
  // a line that ends at a junction on a line running through it (the Marple line at Ardwick) ends at the junction's
  // point itself, which lies on that line, so their tracks meet; where both are cut there (Edgeley), they share the cut
  const through = (id: string) => { const j = at(id); return !defs.some(k => k.id === j.corridor && (k.from === id || k.to === id)); };
  const cut = defs.map(c => {
    let points = c.points;
    // (its last 20 m along that line's direction there, so the two run on together)
    const snap = (pts: XZ[], j: JunctionDef, sign: number): XZ[] => {
      const host = defs.find(k => k.id === j.corridor)!, H = new Corridor({ id: host.id, points: host.points }), f = H.at(H.nearest(j.x, j.z));
      const keep = pts.filter((q, k) => k === 0 || Math.hypot(q[0] - j.x, q[1] - j.z) >= 40);
      return [...keep, [j.x - sign * f.dx * 20, j.z - sign * f.dz * 20], [j.x, j.z]];
    };
    if (c.from) { points = trim(points, at(c.from), true); if (through(c.from)) points = snap([...points].reverse(), at(c.from), -1).reverse(); }
    if (c.to) { points = trim(points, at(c.to), false); if (through(c.to)) points = snap(points, at(c.to), 1); }
    return { ...c, points };
  });
  const len = (c: CorridorDef) => { let l = 0; for (let i = 1; i < c.points.length; i++) l += Math.hypot(c.points[i]![0] - c.points[i - 1]![0], c.points[i]![1] - c.points[i - 1]![1]); return l; };
  const base = new Map<string, number>();
  let s = 0; for (const id of spine) { const c = cut.find(c => c.id === id); if (!c) throw new Error(`no corridor "${id}" for the spine`); base.set(id, s); s += len(c); }
  // the rest from where they meet a corridor already placed: a junction's chainage is its point's on its own corridor
  const chain = (j: JunctionDef): number | undefined => {
    const c = cut.find(c => c.id === j.corridor), b = c && base.get(c.id); if (!c || b === undefined) return undefined;
    return new Corridor({ ...c, base: b }).nearest(j.x, j.z);
  };
  for (let more = true; more;) {
    more = false;
    for (const c of cut) {
      if (base.has(c.id)) continue;
      const to = c.to ? chain(at(c.to)) : undefined, from = c.from ? chain(at(c.from)) : undefined;
      const b = to !== undefined ? to - len(c) : from;
      if (b !== undefined) { base.set(c.id, b); more = true; }
    }
  }
  return cut.map(c => ({ ...c, base: base.get(c.id) ?? 0 }));
}
/** A polyline cut at the point on it nearest p: what's after it (from the point on), or what's before it. */
function trim(points: XZ[], p: { x: number; z: number }, after: boolean): XZ[] {
  let best = 0, t = 0, bestD = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!, L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1e-9;
    const u = Math.max(0, Math.min(1, ((p.x - a[0]) * (b[0] - a[0]) + (p.z - a[1]) * (b[1] - a[1])) / L2));
    const d = (a[0] + (b[0] - a[0]) * u - p.x) ** 2 + (a[1] + (b[1] - a[1]) * u - p.z) ** 2;
    if (d < bestD) { bestD = d; best = i; t = u; }
  }
  const a = points[best]!, b = points[best + 1]!, q: XZ = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return after ? [q, ...points.slice(t >= 1 ? best + 2 : best + 1)] : [...points.slice(0, t <= 0 ? best : best + 1), q];
}

// Build a Network from a geographic definition: corridors given as [lat, lon] waypoints, stations as lat/lon.
// Waypoints are smoothed into a curve; station s is the nearest point on their corridor.
export function fromGeo(def: NetworkGeoDef): Network {
  const origin = def.origin;
  const corridors = def.corridors.map(c => ({ id: c.id, from: c.from, to: c.to, wires: c.wires, points: smoothPolyline(c.waypoints.map(([lat, lon]): XZ => { const p = projectLatLon(lat, lon, origin); return [p.x, p.z]; }), c.subdivisions || 8) }));
  const stations = def.stations.map(s => { const p = projectLatLon(s.lat, s.lon, origin); return { ...s, x: p.x, z: p.z }; });
  const junctions = (def.junctions ?? []).map(j => { const p = projectLatLon(j.lat, j.lon, origin); return { id: j.id, name: j.name, corridor: j.corridor, note: j.note, x: p.x, z: p.z }; });
  const roads = (def.roads ?? []).map(r => {
    const points = r.points.map(([lat, lon]): XZ => { const p = projectLatLon(lat, lon, origin); return [p.x, p.z]; });
    let length = 0; for (let i = 1; i < points.length; i++) length += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
    return { from: r.from, to: r.to, points, length };
  });
  return new Network({ ...def, corridors, stations, roads, junctions });
}
