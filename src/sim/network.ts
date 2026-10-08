// Track network: corridors (centreline polylines in local metres), parallel tracks offset from a corridor,
// and stations at a distance along a corridor. The sim only ever talks in "distance along a corridor";
// the renderer asks the network for world positions. Branching lines later become extra corridors joined at junctions.
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

export class Network {
  def: NetworkDef;
  corridors: Record<string, Corridor>;
  tracks: TrackDef[];
  stations: Station[];
  byId: Record<string, Station>;
  constructor(def: NetworkDef) {
    this.def = def;
    this.corridors = Object.fromEntries(def.corridors.map(c => [c.id, new Corridor(c)]));
    this.tracks = def.tracks;                // [{ id, corridor, offset }]
    this.stations = def.stations.map((s, i) => {
      const c = this.corridor(s.corridor);
      const sAlong = s.s !== undefined ? s.s : c.nearest(s.x, s.z);
      return { ...s, index: i, s: sAlong };
    });
    this.byId = Object.fromEntries(this.stations.map(s => [s.id, s]));
  }
  corridor(id: string): Corridor { const c = this.corridors[id]; if (!c) throw new Error(`no corridor "${id}"`); return c; }
  track(id: string): TrackDef { const t = this.tracks.find(t => t.id === id); if (!t) throw new Error(`no track "${id}"`); return t; }
  station(id: string): Station { const s = this.byId[id]; if (!s) throw new Error(`no station "${id}"`); return s; }
  // World position for a point on a track at distance s along its corridor
  trackAt(trackId: string, s: number, out?: Frame): Frame { const t = this.track(trackId); return this.corridor(t.corridor).at(s, t.offset, out); }
  stationFrame(stationId: string): Frame { const st = this.station(stationId); return this.corridor(st.corridor).at(st.s, 0); }
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
