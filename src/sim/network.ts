// Track network: corridors (centreline polylines in local metres), tracks offset across a corridor, and stations at a
// distance along a corridor. The sim only ever talks in "distance along a corridor"; the renderer asks the network for
// world positions. A track's offset changes along the line: each track has an open-line offset, and the layout list
// moves it around a station (Stockport's tracks spread round two wide islands) or along a stretch, easing in and out.
// Branching lines later become extra corridors joined at junctions.
import type { CorridorDef, Frame, LatLon, NetworkDef, NetworkGeoDef, Station, TrackDef, XZ } from './types.ts';

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
  cum: number[];
  length: number;
  constructor(def: CorridorDef) {
    this.id = def.id;
    this.pts = def.points.map(p => ({ x: p[0], z: p[1] }));
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1]!, b = this.pts[i]!;
      this.cum.push(this.cum[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
    }
    this.length = this.cum[this.cum.length - 1]!;
  }
  // Position and heading at distance s, offset laterally (positive = right of travel when heading along +s).
  at(s: number, offset = 0, out: Frame = newFrame()): Frame {
    const i = this._seg(s);
    const a = this.pts[i]!, b = this.pts[i + 1]!;
    const segLen = Math.max(1e-6, this.cum[i + 1]! - this.cum[i]!);
    const f = Math.max(0, Math.min(1, (s - this.cum[i]!) / segLen));
    const dx = (b.x - a.x) / segLen, dz = (b.z - a.z) / segLen;   // unit direction
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
    if (s <= 0) return 0; if (s >= this.length) return hi;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (c[mid]! <= s) lo = mid; else hi = mid - 1; }
    return lo;
  }
  // Nearest s to a point (for placing stations from coordinates)
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

export class Network {
  def: NetworkDef;
  corridors: Record<string, Corridor>;
  tracks: TrackDef[];
  stations: Station[];
  byId: Record<string, Station>;
  /** Each track's offset profile along its corridor: keys between which it eases; empty runs at its open-line offset. */
  private keys: Record<string, Key[]>;
  constructor(def: NetworkDef) {
    this.def = def;
    this.corridors = Object.fromEntries(def.corridors.map(c => [c.id, new Corridor(c)]));
    this.tracks = def.tracks;                // [{ id, corridor, offset }]
    this.stations = def.stations.map((s, i) => {
      const c = this.corridor(s.corridor);
      const at = s.s !== undefined ? s.s : c.nearest(s.x, s.z);
      return { ...s, index: i, at, s: at + (s.stop ?? 0) };
    });
    this.byId = Object.fromEntries(this.stations.map(s => [s.id, s]));
    this.keys = Object.fromEntries(this.tracks.map(t => [t.id, this.profile(t)]));
  }
  corridor(id: string): Corridor { const c = this.corridors[id]; if (!c) throw new Error(`no corridor "${id}"`); return c; }
  track(id: string): TrackDef { const t = this.tracks.find(t => t.id === id); if (!t) throw new Error(`no track "${id}"`); return t; }
  station(id: string): Station { const s = this.byId[id]; if (!s) throw new Error(`no station "${id}"`); return s; }

  /** The stretches of a track's corridor the layout list moves it in, in order: [s0, s1, offset]. */
  private spans(t: TrackDef): [number, number, number][] {
    const out: [number, number, number][] = [];
    for (const L of this.def.layout ?? []) {
      const v = L.offsets[t.id]; if (v === undefined) continue;
      if (L.station) {
        const st = this.station(L.station); if (st.corridor !== t.corridor) continue;
        out.push([st.at + (L.u0 ?? 0), st.at + (L.u1 ?? 0), v]);
      } else if ((L.corridor ?? t.corridor) === t.corridor && L.s0 !== undefined && L.s1 !== undefined) out.push([L.s0, L.s1, v]);
    }
    return out.sort((a, b) => a[0] - b[0]);
  }
  /** The keys a track eases between: it holds each span's offset, and between spans returns to its open-line offset
   * when they're far enough apart, or eases straight from one to the next when they're close. */
  private profile(t: TrackDef): Key[] {
    const E = this.def.ease ?? EASE, keys: Key[] = [];
    for (const [s0, s1, v] of this.spans(t)) {
      const prev = keys[keys.length - 1];
      if (!prev) keys.push({ s: s0 - E, v: t.offset });
      else if (s0 - prev.s > 2 * E) keys.push({ s: prev.s + E, v: t.offset }, { s: s0 - E, v: t.offset });
      keys.push({ s: s0, v }, { s: s1, v });
    }
    const last = keys[keys.length - 1]; if (last) keys.push({ s: last.s + E, v: t.offset });
    return keys;
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
    const t = this.track(trackId), f = this.corridor(t.corridor).at(s, this.offsetAt(trackId, s), out);
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

// Build a Network from a geographic definition: corridors given as [lat, lon] waypoints, stations as lat/lon.
// Waypoints are smoothed into a curve; station s is the nearest point on their corridor.
export function fromGeo(def: NetworkGeoDef): Network {
  const origin = def.origin;
  const corridors = def.corridors.map(c => ({ id: c.id, points: smoothPolyline(c.waypoints.map(([lat, lon]): XZ => { const p = projectLatLon(lat, lon, origin); return [p.x, p.z]; }), c.subdivisions || 8) }));
  const stations = def.stations.map(s => { const p = projectLatLon(s.lat, s.lon, origin); return { ...s, x: p.x, z: p.z }; });
  return new Network({ ...def, corridors, stations });
}
