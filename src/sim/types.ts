// The sim's types: the line as network.json describes it, the network once projected to metres, the saved game, and
// what a train and a platform queue look like. Plain shapes with no behaviour; the sim and the view both read them.

export interface LatLon { lat: number; lon: number }
/** A point in local metres: x east, z south (north is -z). */
export type XZ = [number, number];

// ---- the line as data (src/data/network.json) ----
/** A corridor: a real line's centreline, drawn towards Manchester. from, to: the junctions it starts and ends at, if
 * any (its waypoints may run a little past one, and it's cut at the junction's point). */
/** wires: how far back from its Manchester end its tracks are electrified, in metres (all of it when not given). */
export interface CorridorGeoDef { id: string; name?: string; waypoints: [number, number][]; subdivisions?: number; from?: string; to?: string; wires?: number }
/** base: the chainage at its first point (src/sim/network.ts works it out from the junctions). */
export interface CorridorDef { id: string; name?: string; points: XZ[]; from?: string; to?: string; base?: number; wires?: number }
/** A junction: a named point on a corridor, where other corridors start or end (or will, once their lines are drawn). */
export interface JunctionGeoDef { id: string; name: string; corridor: string; lat: number; lon: number; note?: string }
export interface JunctionDef { id: string; name: string; corridor: string; x: number; z: number; note?: string }
/** A point on the line given by a station: u metres along from the station's own point. */
export interface StationPoint { station: string; u: number }
/** A junction's own point on its corridor (where a line's own pair begins beside the lines it meets). */
export interface JunctionPoint { junction: string }
/** offset: where the track runs across its corridor on the open line, in metres (positive is right of travel along +s).
 * start, end: where the track begins and ends, if not at the corridor's ends. */
export interface TrackDef { id: string; corridor: string; offset: number; use?: string; start?: StationPoint | JunctionPoint; end?: StationPoint | JunctionPoint }
/** Where the tracks run somewhere other than their open-line offsets: around a station (u0 to u1 in the station's frame)
 * or along a stretch of corridor (s0 to s1). Tracks ease between layouts over the network's `ease` metres. */
export interface LayoutDef {
  note?: string; corridor?: string; station?: string; u0?: number; u1?: number; s0?: number; s1?: number;
  offsets: { [track: string]: number | undefined };
  /** How far the tracks ease into and out of this layout, if not the network's `ease`. */
  ease?: number;
}
export interface StationGeoDef {
  id: string; name: string; corridor: string; lat: number; lon: number;
  miles: number; catchment: number; price: number; kit: string; retail: string;
  /** What draws people to the station's area (jobs, shops, schools), on the same scale as `catchment` (homes): where
   * the morning goes, and where the evening comes home from. */
  draw: number;
  /** The most homes the station's land could hold as the line brings it within reach (homes that grow, from the census:
   * its homes and half as many again as live within a walk); its homes grow from `catchment` towards it. */
  ceiling?: number;
  /** Who'd come from beyond a walk (src/sim/access.ts, from the census): drive, the homes that would drive here and
   * park, their drive in seconds and the distance nine in ten live within (metres); bus, the same by bus; busShare, the
   * share of the station's own homes that already come by bus (Stockport's), whose bus leg a bus link makes quicker. */
  access?: Access;
  /** Where a number came from when it's from memory rather than survey. */
  note?: string;
  /** Where trains stop, in metres along the line from the station's own point (its kit's origin); 0 if not given. */
  stop?: number;
  /** Where the line is drawn straight along the kit's frame, from u0 to u1 (its platforms and the bridges by them), so
   * the kit's straight platforms stand true to the tracks; it eases back to the corridor either side. Only the drawing:
   * distances along the line are the corridor's. */
  straight?: number[];
  /** The stages this station grows through after it's a halt, by upgrade: what each is called here, and a description
   * or price where they differ from the usual. A stage not listed isn't offered here. */
  /** signature (step 18): the station's own stage from its real history or plans, what it brings (homes: its ceiling
   * that much higher; draw: it draws that much more; platforms: that many more open), how it's drawn (sign: a brown
   * tourist sign, crane: a tower crane over new building, platform: a new platform) and a note of where it's from. */
  grow?: Partial<Record<StageId, { name: string; desc?: string; price?: number; spaces?: number; homes?: number; draw?: number; platforms?: number; look?: string; note?: string }>>;
  /** Something that must be built elsewhere before this station can be bought. */
  needs?: { station: string; upgrade: string };
  /** The platform faces trains stand at, where they're more than the halt's one and the second platform's (the sim
   * makes those two up for a station that doesn't list its own). */
  platforms?: PlatformDef[];
}
/** A platform face: the number on the boards; where its track runs (`track`, a network track along the face, or `path`,
 * the drawn rails from the platform out to where they join the line, as kit (u, v) points; neither: the train's own
 * track); the stage it comes with (none: the halt's); `stop`, the kit u a unit stands centred on if not the station's
 * stop; `ways`, which way trains calling there go where no service lists it; `cross`, the kit u nearest the platform
 * that a train crossing over to it from another track starts its crossover (none: just clear of the longest unit
 * standing there), for a platform reached across the throat's other roads. */
export interface PlatformDef {
  id: string; v?: number; track?: string; path?: number[][]; upgrade?: string | string[]; stop?: number;
  ways?: ('north' | 'south')[]; note?: string; cross?: number;
}
/** A service's platforms at a station, by the platform ids: calling going north or south, or turning round. */
export interface ServicePlatforms { north?: string[]; south?: string[]; turn?: string[] }
export interface Access { drive: number; driveTime: number; driveR: number; bus: number; busTime: number; busR: number; busShare?: number }
/** tracks: the tracks it runs on towards Manchester (north) and back (south), leg by leg along its route through the
 * graph, each leg's pair on one corridor and the next leg's on a corridor joined to it at a junction.
 * route: the stations a service calls at, in order towards Manchester. home: a service with one
 * runs from there only as far along its route as stations are owned, and not at all until one is; without one it runs
 * the whole route, its ends always served. Scenery services carry nobody. */
/** A step of a service's frequency: its name and what it adds, its price, and the units it runs all day from then
 * (`units`) or the more it runs in the peaks only (`peak`). */
export interface FrequencyStep { name: string; desc: string; price: number; units?: number; peak?: number }
export interface ServiceDef {
  id: string; name: string; operator: string; tracks: { north: string[]; south: string[] };
  calls: string | string[]; cars: number; scenery?: boolean; route?: string[]; home?: string;
  /** A station that must be owned before the service runs at all (the Rose Hill trains, from when Rose Hill is bought). */
  opens?: string;
  /** Where its calling pattern or route comes from, and what's a game choice. */
  note?: string;
  /** The platforms it uses at each station, preferred first; a station not listed: whichever face is its way. A `turn`
   * list is shared out by unit (the first unit the first platform, the second the next), so each one built is used. */
  platforms?: Record<string, ServicePlatforms | undefined>;
  /** How often it runs, as stages to buy on its card (docs/DESIGN.md, Frequency): each step a timetable with its
   * units all day (`units`) or more in the peaks only (`peak`); `stable`, the station at the end of its run where a
   * peak unit rests between the peaks, on `roads` (kit u, v) there (Stockport's carriage sidings have their own). */
  frequency?: { note?: string; stable: string; roads?: number[][]; steps: FrequencyStep[] };
  /** Through running as an upgrade (docs/DESIGN.md, Through to Manchester): once its stage `through` is bought on the
   * route (offered with `needs`, a station, owned), the service runs `route` on `tracks` with `platforms` instead,
   * changing between two tracks of one corridor at each of `switches` (stations, in route order). */
  manchester?: { name: string; desc: string; price: number; needs?: { station: string; upgrade: string }; note?: string; home?: string; stable?: string; roads?: number[][]; route: string[]; tracks: { north: string[]; south: string[] }; switches?: string[]; platforms?: Record<string, ServicePlatforms | undefined> };
  /** Where a leg changes to the next on the same corridor (a through service's, at a station): see `manchester`. */
  switches?: string[];
  /** A through service's own key for the network's caches: its id, or the id and the variant. */
  key?: string;
  /** The first and last trains by the clock (hours): no unit leaves the end of its run after the last until the first
   * next morning, and it stands there overnight (a service with a home runs out from there to stand at its far end). */
  hours?: { first: number; last: number };
  /** A long-distance train running through from beyond the map: it comes in where its tracks begin, calls at its
   * route's stations where it has a platform, turns at the last, and goes back off the map to `south`: by the clock,
   * the first at clock hour `first`, then one every `every` clock hours to `last`. */
  through?: { south: string; first: number; every: number; last: number; from?: StationPoint };
}
/** A bus stop or bus station by a station (src/sim/places.ts): a place of its own, offered once its station is owned.
 * Its first state brings the census's bus pool beyond a walk in by bus (src/sim/access.ts); `part` is the kit part
 * (`buslink`) that draws it at its station. lat, lon: where it really stands. */
/** feeder (step 21): a real bus route through the stop (OpenStreetMap, tools/osm-to-feeders.mjs): its number, name, and
 * the stretch of it each way from the stop, [lat, lon] about every 40 m. */
export interface FeederDef { ref: string; name: string; points: [number, number][]; note?: string }
export interface StopDef { id: string; name: string; /** 'bus-stop' or 'bus-station' */ kind: string; station: string; lat: number; lon: number; price: number; desc: string; note?: string; feeder?: FeederDef }
/** A bus route the player runs (step 8, docs/DESIGN.md, The 192): the stations along it (it stops near every door, so it
 * serves the trips between any two of them the trains don't, owned or not), the main road it runs (`mainRoads`), what
 * it costs to start and its fare. */
export interface BusRouteDef { id: string; name: string; along: string[]; road: string; price: number; fare: number; desc: string; note?: string;
  /** The station whose opening offers it (Stockport if not given). */
  needs?: string;
  /** How often it comes at each step of More buses, minutes (10, 6 and 4 if not given), and the buses drawn on it (8, 12 and 18). */
  every?: number[]; buses?: number[] }
/** A depot: a yard where units stand, coming with the station it opens off (Stockport's carriage sidings). */
export interface DepotDef { id: string; name: string; station: string; note?: string }
export interface LandmarkDef {
  id: string; name: string; kind: string; corridor?: string;
  from?: LatLon; to?: LatLon; at?: LatLon; lat?: number; lon?: number; arches?: number; height?: number; todo?: string;
}
/** A road between two neighbouring stations, from near one's way out to near the other's, as [lat, lon] points in
 * order: what the rail replacement buses drive (and later trams and buses). note: where it came from. */
/** A road between two stations' stops; `under`: the stretches of its points, [first, last] index, that pass under the
 * line (from OpenStreetMap's railway bridges, tools/osm-to-roads.mjs --under). */
export interface RoadGeoDef { from: string; to: string; via?: string; note?: string; under?: number[][]; points: [number, number][] }
export interface NetworkGeoDef {
  name?: string; note?: string; origin: LatLon;
  corridors: CorridorGeoDef[]; tracks: TrackDef[]; stations: StationGeoDef[];
  /** The corridors the ground is laid along, end to end; chainage runs from 0 at the first one's start. */
  spine?: string[]; junctions?: JunctionGeoDef[]; corridorNote?: string; junctionNote?: string;
  trackNote?: string; layout?: LayoutDef[]; ease?: number;
  landmarks?: LandmarkDef[]; services?: ServiceDef[]; roads?: RoadGeoDef[]; roadNote?: string;
  /** Bus stops and bus stations by the stations, and the depots: places of their own (src/sim/places.ts). */
  stops?: StopDef[]; depots?: DepotDef[]; stopNote?: string;
  /** The bus routes the player runs (step 8): the 192 along the A6. */
  busRoutes?: BusRouteDef[];
  /** The perks reputation buys between contracts (src/sim/contract.ts). */
  contract?: ContractDef;
  /** Where a contract can start (docs/design/gridlock.md §7): the first is the first game's, and the default. */
  starts?: StartDef[];
  /** Each corridor's sections of line in chainage order (as src/sim/places.ts makes them): each one's real speed (mph,
   * null where OSM had none) and the share of it under wires (tools/osm-to-sections.mjs). */
  sections?: Record<string, { mph: (number | null)[]; wired: number[] }>; sectionNote?: string;
}
/** A perk bought with reputation between contracts, in a branch whose perks are bought in order. What it does is said
 * through the sim's own numbers: cash at the start (pounds), build (a share off every price), walk (seconds off the walk
 * at every station), unit (the first extra unit stands in Stockport's sidings, free to put in service), spare (the spare
 * unit stands by from the start). */
export interface PerkDef { id: string; branch: string; name: string; desc: string; price: number; cash?: number; build?: number; walk?: number; unit?: boolean; spare?: boolean }
/** A start (docs/design/gridlock.md §7): the places owned (`open`, none for a shut network), what's offered while
 * nothing is (`offer`), prices that differ from the data's for those, cash, the clock, the services standing until a
 * station on them opens (`held`: route place id to station id), and what the camera and the first card frame. */
export interface StartDef {
  id: string; name: string; open: string[]; offer: string[]; prices?: Record<string, number>; cash: number;
  clock: { day: number; hour: number }; held?: Record<string, string>;
  camera?: { at: string; look?: string; height?: number }; roads?: string[]; unlock?: string | null; note?: string;
}
export interface ContractDef { note?: string; branches: { id: string; name: string }[]; perks: PerkDef[] }

// ---- the network in metres ----
export interface StationDef extends StationGeoDef { x: number; z: number; s?: number }
/** A station once placed on its corridor: s is where trains stop along it, at where its kit stands (they differ by
 * `stop`), index its place in the line's order. */
export interface Station extends StationDef { index: number; s: number; at: number }
/** A road in local metres: its points from the `from` station's end to the `to` station's, and its length. */
/** A road in the world: its points, whether each passes under the line (`under`, from the data's stretches), and its length. */
export interface RoadDef { from: string; to: string; points: XZ[]; under: boolean[]; length: number }
export interface NetworkDef extends Omit<NetworkGeoDef, 'corridors' | 'stations' | 'roads' | 'junctions'> { corridors: CorridorDef[]; stations: StationDef[]; roads?: RoadDef[]; junctions?: JunctionDef[] }
/** A point on a corridor: position, heading, the unit direction (dx, dz) and the normal (nx, nz) offsets are measured along. */
export interface Frame { x: number; z: number; heading: number; dx: number; dz: number; nx: number; nz: number }

// ---- the saved game ----
/** The stages a station grows through from a halt: a way across the line, a second platform, a booking office, and at
 * the big stations the rest of the station. Offered only where the station's `grow` lists them. `bus` is the bus stop
 * or bus station by it, a place of its own (`stops` in the network data), which the view still shows on the station's
 * card. */
export type StageId = 'crossing' | 'platform2' | 'building' | 'platforms' | 'taxi' | 'carpark' | 'carpark2' | 'bus' | 'signature' | 'hub';
export type UpgradeId = StageId | 'kiosk' | 'barriers' | 'canopy' | 'lifts' | 'extend' | 'retail' | 'long' | 'canopyFull' | 'travel' | 'shops' | 'cyclehub' | 'bee1' | 'bee2' | 'posters' | 'maint' | 'shelter' | 'liveinfo';
export type LineUpgradeId = 'units' | 'cars' | 'timetable' | 'spare';
/** A group of passengers who joined a platform queue together: when (game seconds), where to, how many, whether
 * they've paid (they're changing trains, so their fare was taken where they first got on), and when they give up and
 * go home (none for someone changing trains). */
export interface Queued { t: number; dest: number; n: number; paid?: boolean; give?: number }
/** alighted: passengers who got off here at the end of their journey, so the view can show them leaving; changed:
 * passengers who got off here to catch another train. cab: people who gave up on the train and took a cab from the
 * taxi rank instead; cabs: when each of the rank's cabs is back from its last fare (sim seconds; free once that's
 * passed), none until a rank is built. car, bus: people who came from beyond a walk by car and parked, or by bus;
 * carAcc, busAcc: their part-people saved up; parked: the cars in the car park by the game hour they leave (24, none
 * until a car park is built). */
export interface StationState {
  acc: number; q: [Queued[], Queued[]]; waiting: number; boarded: number; alighted: number; changed: number; revenue: number; lost: number;
  cab: number; cabs: number[];
  /** Long-distance passengers getting on and off the expresses here. */
  through: number;
  car: number; bus: number; carAcc: number; busAcc: number; parked: number[];
  /** Word of mouth (docs/DESIGN.md, Word of mouth): how many of the station's would-be riders try the train, 0.4 to 1,
   * falling while people give up there and rising again once trains have room; and the people who gave up and who
   * boarded there lately (each fading over a couple of clock hours), which it reads. */
  word: number; wordLost: number; wordBoard: number;
}
/** svc: the service it runs; calling: the station a dwelling train is boarding at; boardAcc: boarding it has room for
 * this stop and hasn't used yet, in passengers (its doors take a share of a passenger each second; below zero while
 * people are still getting off). load: how many on board are going to each station, including those who'll change at
 * the end of this train's run. dwell: the least it still has to stand here (below zero once that's done). due: when
 * the timetable has it leave the stop it's at or running to (sim seconds; -1 until a new unit's first stop). late:
 * seconds past due, live while it stands and as it left its last stop while it runs. stood: seconds at this stop;
 * quiet: seconds since its platform first cleared there (the doors closing). */
/** Where it is: on the corridor of its service's route's leg `leg`, at chainage s there (its middle); it passes onto the
 * next leg at the junction where their corridors meet (src/sim/network.ts, Route). */
export interface Train {
  id: number; svc: string; dir: 1 | -1; s: number; leg: number; v: number; state: 'run' | 'dwell' | 'away'; dwell: number;
  next: number | null; load: number[]; onboard: number; cars: number; calling: number | null; boardAcc: number;
  due: number; late: number; stood: number; quiet: number;
  /** The platform (index in the sim's list for the station) it stands at or last left, and that station (-1 none);
   * bound: the platform it has claimed at its next stop (-1 not yet). An express is `away` while it's off the map. */
  pf: number; pfAt: number; bound: number;
}
/** Things going wrong (docs/DESIGN.md, Things going wrong). A failed train: the unit (by id) stands where it failed
 * from `from` until `until`, blocking its line one way (d, 0 towards Manchester) between the stations either side
 * (a behind it, b ahead). A signal failure: trains run at caution between s0 and s1 (chainage) on the corridors `on`
 * (every corridor, if not given). */
export interface Failure { train: number; from: number; until: number; a: number; b: number; d: 0 | 1 }
export interface Caution { s0: number; s1: number; on?: string[]; from: number; until: number }
/** A rail replacement bus between stations a and b, one way: loading at a, running to b, setting down there, running
 * back. t0 to t1 is the leg it's on (sim seconds); load is who's aboard. */
export interface Bus { id: number; a: number; b: number; d: 0 | 1; leg: 'load' | 'out' | 'drop' | 'back'; t0: number; t1: number; load: Queued[] }
/** next: when the next thing may go wrong. fails, signals: how many have, so far; bused: people carried by bus. */
export interface Trouble { next: number; fails: number; signals: number; bused: number; fail: Failure | null; caution: Caution | null; buses: Bus[] }
/** The weather's kinds of spell, and the seasons (0 spring, 1 summer, 2 autumn, 3 winter). */
export type Sky = 'sun' | 'cloud' | 'rain' | 'fog' | 'snow';
export type Season = 0 | 1 | 2 | 3;
/** The weather (src/sim/weather.ts): its own random numbers, the spell now and the one before, when this one began and
 * ends (sim seconds), and how long it's rained or snowed in all (sim seconds). */
export interface Weather { rngState: number; now: Sky; was: Sky; since: number; until: number; wet: number }
export interface GameState {
  v: number; seed: number; rngState: number; t: number; day: number; cash: number; earned: number;
  /** What the player has bought or grown, by place id (kind:name, src/sim/places.ts), each with its stages built (a
   * count, for stages bought more than once): 'station:stockport': { crossing: 1 }, 'route:stopper': { units: 2 },
   * 'depot:stockport-sidings': { spare: 1 }, 'stop:levenshulme-station-view': {}. A station or stop is owned once it's
   * here; what comes with something owned (a route, a section, a junction, the sidings) only once a stage is built. */
  places: Record<string, Record<string, number>>;
  /** Read through these, worked out from `places` by the sim (src/sim/places.ts, derive) and never saved: each
   * station owned, its stages built (and `bus` for the stop by it), and the stopper's and the sidings' stages. */
  readonly owned: readonly boolean[]; readonly ups: readonly Readonly<Partial<Record<UpgradeId, boolean>>>[]; readonly line: Readonly<Record<LineUpgradeId, number>>;
  st: StationState[]; trains: Train[];
  /** late: main-line and branch departures more than five minutes behind the timetable (src/sim/contract.ts weighs
   * them in the reputation). through: long-distance passengers on and off the expresses at owned stations; express: what the expresses paid. */
  /** The cars off the roads at 08:00 (src/sim/traffic.ts, `off`) as the network stood at the end of each game day, by
   * day: the Network card's sparkline. */
  offDays?: number[];
  stats: { boarded: number; lost: number; cab: number; through: number; express: number; car: number; bus: number; late: number; deps: number; riders?: number; ridersBy?: Record<string, number> };
  /** By service, the timetabled departure of the unit that last turned round at each end of its run (0 the south end,
   * 1 the north), which the next unit keeps a headway behind. */
  ends: Record<string, [number, number]>;
  trouble: Trouble;
  /** Seconds trains have stood at each junction's signal held for another train's way through it (by junction id), the
   * whole run: a flying junction is offered where it's been long enough (src/sim/places.ts, JUNCTION_FLYOVER). */
  held: Record<string, number>;
  /** Each station's homes now: its census `catchment` at the start, growing towards its `ceiling` while it's owned, the
   * quicker the better its trip door to door (docs/DESIGN.md, Homes that grow). */
  homes: number[];
  weather: Weather;
  /** The perks this run was started with (their ids, src/sim/contract.ts): what the career had bought when the contract
   * began. They stay as they are for the whole run. */
  perks: string[];
  /** The start this run began from (its id in the network data's `starts`). */
  start: string;
}
