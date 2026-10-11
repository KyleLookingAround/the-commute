// The sim's types: the line as network.json describes it, the network once projected to metres, the saved game, and
// what a train and a platform queue look like. Plain shapes with no behaviour; the sim and the view both read them.

export interface LatLon { lat: number; lon: number }
/** A point in local metres: x east, z south (north is -z). */
export type XZ = [number, number];

// ---- the line as data (src/data/network.json) ----
export interface CorridorGeoDef { id: string; name?: string; waypoints: [number, number][]; subdivisions?: number }
export interface CorridorDef { id: string; name?: string; points: XZ[] }
/** offset: where the track runs across its corridor on the open line, in metres (positive is right of travel along +s). */
export interface TrackDef { id: string; corridor: string; offset: number; use?: string }
/** Where the tracks run somewhere other than their open-line offsets: around a station (u0 to u1 in the station's frame)
 * or along a stretch of corridor (s0 to s1). Tracks ease between layouts over the network's `ease` metres. */
export interface LayoutDef {
  note?: string; corridor?: string; station?: string; u0?: number; u1?: number; s0?: number; s1?: number;
  offsets: Record<string, number>;
}
export interface StationGeoDef {
  id: string; name: string; corridor: string; lat: number; lon: number;
  miles: number; catchment: number; price: number; kit: string; retail: string;
  /** Where trains stop, in metres along the line from the station's own point (its kit's origin); 0 if not given. */
  stop?: number;
}
export interface ServiceDef {
  id: string; name: string; operator: string; tracks: { north: string; south: string };
  calls: string | string[]; cars: number; scenery?: boolean;
}
export interface LandmarkDef {
  id: string; name: string; kind: string; corridor?: string;
  from?: LatLon; to?: LatLon; at?: LatLon; lat?: number; lon?: number; arches?: number; height?: number; todo?: string;
}
export interface NetworkGeoDef {
  name?: string; note?: string; origin: LatLon;
  corridors: CorridorGeoDef[]; tracks: TrackDef[]; stations: StationGeoDef[];
  trackNote?: string; layout?: LayoutDef[]; ease?: number;
  landmarks?: LandmarkDef[]; services?: ServiceDef[];
}

// ---- the network in metres ----
export interface StationDef extends StationGeoDef { x: number; z: number; s?: number }
/** A station once placed on its corridor: s is where trains stop along it, at where its kit stands (they differ by
 * `stop`), index its place in the line's order. */
export interface Station extends StationDef { index: number; s: number; at: number }
export interface NetworkDef extends Omit<NetworkGeoDef, 'corridors' | 'stations'> { corridors: CorridorDef[]; stations: StationDef[] }
/** A point on a corridor: position, heading, the unit direction (dx, dz) and the normal (nx, nz) offsets are measured along. */
export interface Frame { x: number; z: number; heading: number; dx: number; dz: number; nx: number; nz: number }

// ---- the saved game ----
export type UpgradeId = 'kiosk' | 'barriers' | 'canopy' | 'lifts' | 'extend' | 'retail';
export type LineUpgradeId = 'units' | 'cars' | 'timetable';
/** A group of passengers who joined a platform queue together: when (game seconds), where to, how many. */
export interface Queued { t: number; dest: number; n: number }
/** alighted: passengers who got off here, so the view can show them leaving. */
export interface StationState { acc: number; q: [Queued[], Queued[]]; waiting: number; boarded: number; alighted: number; revenue: number; lost: number }
/** calling: the station a dwelling train is boarding at; boardAcc: boarding it has room for this stop and hasn't
 * used yet, in passengers (its doors take a share of a passenger each second). */
export interface Train {
  id: number; dir: 1 | -1; s: number; v: number; state: 'run' | 'dwell'; dwell: number;
  next: number | null; load: number[]; onboard: number; cars: number; calling: number | null; boardAcc: number;
}
export interface GameState {
  v: number; seed: number; rngState: number; t: number; day: number; cash: number; earned: number;
  owned: boolean[]; ups: Partial<Record<UpgradeId, boolean>>[]; line: Record<LineUpgradeId, number>;
  st: StationState[]; trains: Train[]; stats: { boarded: number; lost: number };
}
