// Train units as vertex-coloured box geometry, positioned on their service's track by distance along the corridor. The
// cars are real length, width and height (2.8 m wide, 4 m to the roof), so a train runs clear of the platforms, the
// trains beside it on tracks at their real spacing, and the bridges and wires over it.
// A train stands at the platform the sim gave it (`Train.bound` running in, `Train.pf` standing and leaving): running in,
// it crosses from its own track to that platform's (its track, or the rails drawn into a bay) where the two come
// closest, nearest the station, and leaving it crosses back the same way, each crossover drawn with its rails
// (`crossovers`); turning round, it leaves on the track it came in on, so it never jumps across. The expresses are the
// sim's trains like any other, hidden while they're away off the map.
// A train looks as full as it is: its windows go from cool glass when empty to warm and lit as it fills, riders show in
// them, and when it's nearly full people stand in the doorways. A train running late carries an amber lamp over its
// leading cab, from a minute late, growing until it's five minutes late; on time it looks as it always has.
// Things going wrong show too: a failed unit flashes its hazard lights at both ends until it's rescued, a stretch of
// line at caution after a signal failure has flashing amber lamps on posts at each end, both sides, and the spare
// unit, once bought, stands in Stockport's carriage sidings and drives out to a failed train while it's rescued: out of
// the sidings, along the line beside the blocked one (the fast line where the stoppers fail, the branch's own track on
// the Hazel Grove line, where nothing else runs), across onto the blocked line to buffer up to the failed unit's
// Stockport end, and back to the sidings once it's moving again. The view's own, timed from the sim's failure.
// A contract's perk can stand a second unit on the next siding from the start, until it's put in service.
// On some nights, in the small hours, the fast lines close for engineering: the expresses stop and a yellow on-track
// machine with flashing orange beacons crawls a few hundred metres along them at the night's site, one way one night
// and the other the next. Cosmetic: it's the view's own, from the seed and the night, and no passenger train meets it.
import * as THREE from 'three';
import { yawFor } from './world.ts';
import { MAT, PAL } from './scene.ts';
import { byCell } from './cells.ts';
import { LINE_UPGRADES, TUNING, type Sim } from '../sim/sim.ts';
import { SPINE, newFrame, variants, type Network } from '../sim/network.ts';
import { clockAt } from '../sim/day.ts';
import type { Train } from '../sim/types.ts';
import type { Frame, GameState, PlatformDef, ServiceDef, Station } from '../sim/types.ts';

type RGB = [number, number, number];
export interface Livery { body: RGB; roof: RGB; band: RGB; door: RGB; win: RGB; nose: RGB }
export const LIVERIES: Record<string, Livery> = {
  northern: { body: [0.93, 0.93, 0.95], roof: [0.35, 0.36, 0.4], band: [0.52, 0.3, 0.72], door: [0.2, 0.25, 0.55], win: [0.95, 0.85, 0.55], nose: [0.17, 0.17, 0.25] },
  avanti: { body: [0.9, 0.91, 0.92], roof: [0.3, 0.32, 0.34], band: [0.12, 0.5, 0.36], door: [0.14, 0.55, 0.4], win: [0.95, 0.85, 0.55], nose: [0.1, 0.1, 0.12] },
  crosscountry: { body: [0.62, 0.63, 0.67], roof: [0.3, 0.3, 0.33], band: [0.56, 0.12, 0.32], door: [0.45, 0.1, 0.27], win: [0.95, 0.85, 0.55], nose: [0.12, 0.12, 0.14] },
  // the Bee Network's (step 22): the player's own trains once the network is in its yellow
  bee: { body: [0.99, 0.8, 0.08], roof: [0.3, 0.31, 0.34], band: [0.1, 0.1, 0.12], door: [0.12, 0.12, 0.14], win: [0.95, 0.85, 0.55], nose: [0.1, 0.1, 0.12] },
  transpennine: { body: [0.16, 0.2, 0.38], roof: [0.3, 0.31, 0.36], band: [0.5, 0.36, 0.78], door: [0.36, 0.62, 0.9], win: [0.95, 0.85, 0.55], nose: [0.1, 0.1, 0.14] },
};
const NORTHERN = LIVERIES['northern']!;
const GHOST_SPARE = new THREE.MeshBasicMaterial({ color: PAL.ghost, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
/** The livery an operator paints, Northern's for one the map doesn't know. */
export const liveryFor = (operator: string): Livery => LIVERIES[operator] ?? NORTHERN;

/** One car's geometry, centred on its middle, with a cab nose at its low end (towards Stockport), its high end, or
 * neither; userData.win lists the first vertex of each window box (36 vertices each), so the windows can be recoloured
 * as the train fills. */
export function carGeometry(liv: Livery, noseLow: boolean, noseHigh: boolean): THREE.BufferGeometry {
  const P: number[] = [], N: number[] = [], C: number[] = [], win: number[] = [];
  const addBox = (x0: number, x1: number, y0r: number, y1r: number, z0r: number, z1r: number, col: RGB) => {
    const y0 = y0r, y1 = y1r, z0 = z0r, z1 = z1r;
    const f: [RGB, RGB, RGB, RGB, RGB][] = [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]]];
    for (const [a, b, c, d, n] of f) for (const v of [a, b, c, a, c, d]) { P.push(...v); N.push(...n); C.push(...col); }
  };
  const x0 = -CAR / 2, x1 = CAR / 2, hw = 1.4;
  addBox(x0, x1, 1.1, 3.6, -hw, hw, liv.body); addBox(x0 + 0.3, x1 - 0.3, 3.6, 4.0, -hw + 0.3, hw - 0.3, liv.roof); addBox(x0, x1, 0.5, 1.1, -hw + 0.2, hw - 0.2, [0.12, 0.12, 0.14]);
  for (const s of [-1, 1]) { win.push(P.length / 3); addBox(x0 + 1.5, x1 - 1.5, 2.0, 3.0, s * hw, s * (hw + 0.04), liv.win); addBox(x0, x1, 1.3, 1.9, s * hw, s * (hw + 0.03), liv.band); for (const dx of [2.2, CAR - 3.6]) addBox(x0 + dx, x0 + dx + 1.4, 1.1, 3.4, s * hw, s * (hw + 0.05), liv.door); }
  if (noseLow) addBox(x0, x0 + 2.5, 1.1, 3.6, -hw, hw, liv.nose); if (noseHigh) addBox(x1 - 2.5, x1, 1.1, 3.6, -hw, hw, liv.nose);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.userData['win'] = win; return geo;
}

/** A unit on the map: a group of cars, each its own mesh so it follows the track round curves and across crossovers. */
interface Unit { group: THREE.Group; cars: THREE.Mesh[]; full: number; livery?: string }
/** A platform a unit is drawn at: the station, the platform (null: the one face its way, on its own track), and
 * whether it turns round there. */
export interface Berth { st: Station; at: number; def: PlatformDef | null; turn: boolean; cross?: Map<number, { x0: number; len: number }>; joins?: string | null }
/** The platform a unit is running in to, and the one it stands at or is leaving. */
export interface Berths { ahead: Berth | null; behind: Berth | null }
export const NO_BERTHS: Berths = { ahead: null, behind: null };
const CAR = 23, PITCH = CAR + 0.6;   // a car's length, and from one car's middle to the next
const BOGIE = 8;                     // a car's bogies stand this far either side of its middle, and steer it
// a train running in to the end of its run crosses to the track it will leave on over CROSS metres, finishing HOLD
// metres before it stops: its whole length is then past the crossover, so it runs into the platform it leaves from
const CROSS = 150, HOLD = 75;
const smooth = (t: number) => t * t * (3 - 2 * t);
// a crossover's rails are drawn in pieces this long, so they follow its curve
const XSTEP = 12, xGeo = openRail();
/** A rail piece as the tracks' are drawn but open beneath and at its ends (no one sees those): a unit box's top and
 * two long sides, six triangles. */
function openRail(): THREE.BufferGeometry {
  const P: number[] = [], N: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], n: number[]) => { for (const v of [a, b, c, a, c, d]) { P.push(...v); N.push(...n); } };
  quad([-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5], [0, 1, 0]);
  quad([-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [0, 0, 1]);
  quad([0.5, -0.5, -0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0, 0, -1]);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  return g;
}
/** The longest unit the line runs: two cars, and two more for each step of longer trains. */
const LONGEST = 2 + 2 * (LINE_UPGRADES.find(u => u.id === 'cars')?.max ?? 0);
// riders: a figure in a window seat, ten seats a side to each car between its doors, filled in this order so a
// half-full car looks scattered; and one standing in each doorway once the train is nearly full
const SEATS = [3, 7, 1, 9, 5, 0, 8, 2, 6, 4], SEAT_U = (k: number) => 4.5 + k * 1.6, STANDING = 0.85, DOORS = [2.9, 23 - 2.9];
const riderGeo = new THREE.BoxGeometry(0.55, 0.75, 0.05), standGeo = new THREE.BoxGeometry(0.6, 1.7, 0.05);
const riderMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
const MAX_RIDERS = 1200, MAX_STANDING = 240;
const m4 = new THREE.Matrix4(), winCol = new THREE.Color();
// the late lamp: from LATE seconds late, scaled from 0.6 to 1.6 by LATE_FULL
const LATE = 60, LATE_FULL = 300, MAX_LAMPS = 16, lampGeo = new THREE.BoxGeometry(1.1, 0.7, 1.1);
// hazard lights: a lamp each side at each end of a failed unit, and caution lamps on posts by a signal failure, all
// flashing about once a real second
const hazardGeo = new THREE.BoxGeometry(0.9, 0.7, 0.9), postGeo = new THREE.BoxGeometry(0.25, 4, 0.25).translate(0, 2, 0), cautionGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9).translate(0, 4.4, 0);
// the engineering train: the clock hours the fast lines are closed on a night it runs, and how many nights in a hundred
// it works one site a night, creeping ENG_CREEP of the fast lines' length through the hours it's out (the night's clock
// runs so fast that a run along the whole line went by in a real minute, too quick to see)
const ENG_FROM = 0.75, ENG_TO = 4.75, ENG_NIGHTS = 55, ENG_CREEP = 0.02, beaconGeo = new THREE.BoxGeometry(1.0, 0.8, 1.0);
const engHash = (a: number, b: number) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
/** How far along the fast lines the engineering train is at sim time t for a seed (0 at the Stockport end, 1 at
 * Piccadilly's), at the night's site, and which way it's creeping; null when it isn't out: outside the small hours, or on a night it doesn't run.
 * A night belongs to the game day it starts after midnight on. */
export function engineering(seed: number, t: number): { at: number; dir: 1 | -1 } | null {
  const clock = clockAt(t) / 3600, hour = clock % 24, night = Math.floor(clock / 24);
  if (hour < ENG_FROM || hour >= ENG_TO || engHash(seed % 9973, night * 1.37 + 11) * 100 >= ENG_NIGHTS) return null;
  const k = (hour - ENG_FROM) / (ENG_TO - ENG_FROM), dir = night % 2 ? -1 : 1, site = 0.1 + 0.8 * engHash(seed % 9973, night * 2.71 + 5);
  return { at: site + dir * (k - 0.5) * ENG_CREEP, dir };
}
/** Where the spare unit stands: in Stockport's carriage sidings, in the kit's (u, v); and the unit a contract's perk
 * stables there from the start, on the next siding. */
const SPARE_AT: [number, number] = [78, -34.6], STABLED_AT: [number, number] = [78, -39.2];
/** The sidings' other roads (the kit's v), where units that finished at Stockport stand overnight, centred on u = 0
 * (the roads beyond the spare's and the perk's unit's, then the two nearer the station). Each is one of the kit's
 * `rails` with a buffer (src/data/kits/stockport.json): at real scale since 13 October 2026, so they're on its rails. */
const SIDINGS = [-43.1, -47.4, -52, -30.6, -26.4];

/** A rescue the spare unit is out on, or coming back from: the failure's from and until (sim seconds), where the
 * spare's middle starts (in the sidings) and ends (buffered up to the failed unit), the line it runs out along and the
 * blocked one it crosses onto, and how long it takes coming back. */
export interface Rescue { from: number; until: number; s0: number; s1: number; along: string; onto: string; back: number; route?: { svc: ServiceDef; dir: number } }
const SIDING_CLEAR = 220, EASE_OUT = 300, CROSS_IN = 150;   // metres: past the platforms, onto the line, onto the blocked line
/** The rescue for a failure, worked out from the failed train where it stands. */
export function rescueFor(net: Network, svcs: ServiceDef[], g: GameState): Rescue | null {
  const f = g.trouble.fail, tr = f && g.trains.find(t => t.id === f.train), svc = tr && svcs.find(v => v.id === tr.svc);
  if (!f || !tr || !svc) return null;
  const onto = net.route(svc).track(tr.s, tr.dir), fast = svcs.find(v => v.through);
  // the stoppers' line has the fast line beside it; anything else (the branch) has only its own
  const along = fast && svc === svcs[0] ? net.route(fast).track(tr.s, tr.dir) : onto;
  // off the spine (a line out), it comes out from its service's home along the line itself, on the failed train's track
  const off = !net.spineOf.has(net.route(svc).leg(tr.s, tr.leg).corridor), home = off && svc.home ? net.station(svc.home) : null;
  const st = home ?? net.stations[0]!, sg = Math.sign(tr.s - st.s) || 1;
  const s1 = tr.s - sg * ((tr.cars * PITCH - 0.6) / 2 + (2 * PITCH - 0.6) / 2 + 0.6);
  return { from: f.from, until: f.until, s0: home ? home.s : st.at + SPARE_AT[0], s1, along, onto, back: 0.65 * (f.until - f.from), ...(home ? { route: { svc, dir: tr.dir } } : {}) };
}
/** Where the spare unit's middle is at sim time t on a rescue (along the corridor), or null once it's back. It waits a
 * tenth of the rescue for its crew, drives out to arrive three quarters through, and stands buffered up until the line
 * is clear; then it drives back. */
export function rescueAt(r: Rescue, t: number): number | null {
  const k = (t - r.from) / (r.until - r.from);
  if (t <= r.until) return r.s0 + (r.s1 - r.s0) * smooth(Math.max(0, Math.min(1, (k - 0.1) / 0.65)));
  const b = (t - r.until) / r.back;
  return b >= 1 ? null : r.s1 + (r.s0 - r.s1) * smooth(b);
}
/** The spare's offset across the line at x on a rescue: the sidings' until it's past the station's platforms, easing
 * onto the line it runs along, then across onto the blocked line for its last CROSS_IN metres. */
export function rescueOffset(net: Network, r: Rescue, x: number): number {
  const sg = Math.sign(r.s1 - r.s0) || 1, st = net.stations[0]!, d = (x - st.at) * sg;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  let o = SPARE_AT[1];
  o += (net.offsetAt(r.along, x) - o) * smooth(clamp((d - SIDING_CLEAR) / EASE_OUT));
  return o + (net.offsetAt(r.onto, x) - o) * smooth(clamp(((x - r.s1) * sg + CROSS_IN) / CROSS_IN));
}

/** Where a car stands: its middle on the ground, the way it points (a unit vector), how long it is, and how far its
 * bogies are either side of its middle. */
export interface CarPose { x: number; z: number; dx: number; dz: number; len: number; bogie: number }
const POSES: CarPose[] = [];
const fa = newFrame(), fb = newFrame(), fc = newFrame();
/** Where each car of a unit of a service is drawn, centred at s, heading dir: on its track, or by a station on the
 * platform it's running in to or leaving (berths). A car rides on its bogies: they're on the track, and its body runs
 * straight between them. Fills out (car 0 at the Stockport end) and returns how many cars; the geometry check sweeps
 * the same poses past the stations. */
export function unitPoses(net: Network, svc: ServiceDef, s: number, dir: number, cars: number, berths: Berths, out: CarPose[]): number {
  for (let c = 0; c < cars; c++) {
    const x = s + (c - (cars - 1) / 2) * PITCH, o = out[c] ?? (out[c] = { x: 0, z: 0, dx: 1, dz: 0, len: CAR, bogie: BOGIE });
    const a = onPath(net, svc, dir, cars, berths, x - BOGIE, fa), b = onPath(net, svc, dir, cars, berths, x + BOGIE, fb), n = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    o.dx = (b.x - a.x) / n; o.dz = (b.z - a.z) / n; o.x = (a.x + b.x) / 2; o.z = (a.z + b.z) / 2; o.len = CAR; o.bogie = n / 2;
  }
  return cars;
}
/** A point x along the path a unit runs: its own track, crossing to a berth's platform near a station. */
function onPath(net: Network, svc: ServiceDef, dir: number, cars: number, B: Berths, x: number, f: Frame): Frame {
  const on = net.route(svc).track(x, dir);
  return net.place(net.track(on).corridor, x, offsetOn(net, svc, dir, cars, B, x), f);
}
/** Where across the line a unit's point x runs: its own track's offset, eased onto the platform it's leaving and the
 * one it's running in to over their crossovers. */
export function offsetOn(net: Network, svc: ServiceDef, dir: number, cars: number, B: Berths, x: number): number {
  const on = net.route(svc).track(x, dir);
  let o = net.offsetAt(on, x);
  if (B.behind) o = eased(net, svc, on, B.behind, dir > 0 ? 1 : -1, true, x, o);
  if (B.ahead) o = eased(net, svc, on, B.ahead, dir > 0 ? -1 : 1, false, x, o);
  return o;
}
/** Which track a platform's trains stand on, by id: its own, or (none given) the train's own going on, which at a
 * turn is the one it leaves on (the other of its leg's pair there). */
function berthTrack(net: Network, svc: ServiceDef, on: string, b: Berth, behind: boolean): string | null {
  if (b.def?.path) return null;
  const leg = net.route(svc).leg(b.st.s);
  return b.def?.track ?? (b.turn && !behind ? (on === leg.north ? leg.south : leg.north) : on);
}
/** A platform's offset at x: its track's, or along the rails drawn into a bay (held at their ends beyond them). */
function berthOffset(net: Network, track: string | null, b: Berth, x: number): number {
  if (track) {
    // beyond the end of the platform's track (a branch's into Stockport's platform 1), the track it runs on as there
    const [e0, e1] = net.extent(track); if (x >= e0 && x <= e1) return net.offsetAt(track, x);
    const end = x > e1 ? e1 : e0, o = net.offsetAt(track, end), c = net.track(track).corridor;
    for (const t of net.tracks) {
      if (t.id === track || t.corridor !== c) continue;
      const [a0, a1] = net.extent(t.id); if (end >= a0 && end <= a1 && Math.abs(net.offsetAt(t.id, end) - o) < 1.5) return net.offsetAt(t.id, x);
    }
    return net.offsetAt(track, x);
  }
  const P = b.def?.path ?? [], u = x - b.at, U = (k: number) => P[k]?.[0] ?? 0, V = (k: number) => P[k]?.[1] ?? 0, n = P.length - 1;
  // beyond the buffers, the end's offset; beyond the far end, the track the rails join there (or the end's offset)
  if ((u - U(0)) * (U(n) - U(0)) <= 0) return V(0);
  if ((u - U(n)) * (U(0) - U(n)) <= 0) {
    if (b.joins === undefined) b.joins = net.tracks.find(t => t.corridor === b.st.corridor && Math.abs(net.offsetAt(t.id, b.at + U(n)) - V(n)) < 0.3)?.id ?? null;
    return b.joins ? net.offsetAt(b.joins, x) : V(n);
  }
  for (let k = 0; k < n; k++) if ((u - U(k)) * (u - U(k + 1)) <= 0 && U(k) !== U(k + 1)) return V(k) + (V(k + 1) - V(k)) * (u - U(k)) / (U(k + 1) - U(k));
  return V(n);
}
/** Where a unit crosses from track `on` to berth b's platform, side -1 or 1 being the way the crossover lies from the
 * station: the berth's track (null: the rails drawn into a bay), where the crossover starts (x0, its station end) and
 * how long it is; null where the unit stays on its own track. The crossover is where the two come closest (within
 * 0.3 m), the nearest such place to the station clear of the longest unit standing there (or of the platform's
 * `cross`, where it's reached across the throat's other roads), and is 12 times as long as
 * they are apart (60 m at least). The same for every unit of a service, so the map draws its rails once
 * (`crossovers`) and the trains ride them. */
export function crossing(net: Network, svc: ServiceDef, on: string, b: Berth, side: number, behind: boolean): { track: string | null; x0: number; len: number } | null {
  const track = berthTrack(net, svc, on, b, behind); if (track === on) return null;
  // each crossover worked out once, kept on the berth by track, side, way and the length it keeps clear of
  const cars = svc.through || svc.scenery ? svc.cars : LONGEST;
  const key = ((net.tracks.findIndex(t => t.id === on) * 2 + (side > 0 ? 1 : 0)) * 2 + (behind ? 1 : 0)) * 64 + cars, cross = b.cross ??= new Map();
  let c = cross.get(key);
  if (!c) {
    // clear of the longest unit standing there: centred on the stop, or an express at the end of its run with its
    // front where the longest stopping unit's is
    const stop = b.def?.stop === undefined ? b.st.s : b.at + b.def.stop, reach = b.turn && cars > LONGEST ? (cars - LONGEST / 2) * PITCH : cars * PITCH / 2;
    const near = stop + side * (reach + 5), start = b.def?.cross !== undefined && (b.at + b.def.cross - near) * side > 0 ? b.at + b.def.cross : near, [e0, e1] = net.extent(on), d = (y: number) => Math.abs(net.offsetAt(on, y) - berthOffset(net, track, b, y));
    let least = Infinity;
    for (let y = start; Math.abs(y - start) <= 1200 && y >= e0 && y <= e1; y += side * 5) least = Math.min(least, d(y));
    let x0 = start; for (let y = start; Math.abs(y - start) <= 1200 && y >= e0 && y <= e1; y += side * 5) if (d(y) <= least + 0.3) { x0 = y; break; }
    c = { x0, len: Math.max(60, 12 * d(x0 + side * 60)) }; cross.set(key, c);
  }
  return { track, ...c };
}
/** The unit's offset o at x eased onto berth b's platform over its crossover (`crossing`): fully on it from where the
 * crossover starts to the station, back on its own track beyond it. */
function eased(net: Network, svc: ServiceDef, on: string, b: Berth, side: number, behind: boolean, x: number, o: number): number {
  const c = crossing(net, svc, on, b, side, behind); if (!c) return o;
  const w = Math.max(0, Math.min(1, (c.x0 + side * c.len - x) * side / c.len));
  if (w <= 0) return o;
  const k = smooth(w); return o + (berthOffset(net, c.track, b, x) - o) * k;
}
/** A crossover the map draws: along a corridor from s0 to s1 (s0 < s1), and its offset across the line at s. */
export interface Crossover { corridor: string; s0: number; s1: number; at: (s: number) => number }
/** Every crossover a service's units take into and out of the platforms they use, wherever they call or turn round (a
 * line with a home turns wherever it's been opened to), worked out as the units ride them (`crossing`), once each,
 * leaving out those that only cross where the two ways run together. */
export function crossovers(net: Network, svcs: ServiceDef[]): Crossover[] {
  const out: Crossover[] = [], seen = new Set<string>(), berths = new Map<string, Berth>();
  for (const svc of svcs) {
    if (svc.scenery || !svc.route) continue;
    const R = net.route(svc), ids = svc.route, last = ids.length - 1, home = svc.home ? ids.indexOf(svc.home) : -1;
    ids.forEach((id, k) => {
      const st = net.station(id), kinds: ['north' | 'south' | 'turn', number, number][] = [];
      // what it does here: [kind, the way it runs in, the way it leaves], as the sim's platforms have it
      if (svc.through) { if (k === last) kinds.push(['turn', 1, -1]); else kinds.push(['north', 1, 1], ['south', -1, -1]); }
      else {
        if (k === last || (home >= 0 && k !== 0 && k === home)) kinds.push(['turn', 1, -1]);
        if (k === 0 || (home >= 0 && k !== home)) kinds.push(['turn', -1, 1]);
        if (k > 0 && k < last) kinds.push(['north', 1, 1], ['south', -1, -1]);
      }
      for (const [kind, din, dout] of kinds) {
        const listed = svc.platforms?.[id]?.[kind], P = st.platforms ?? [];
        const defs = listed ? listed.map(p => P.find(q => q.id === p) ?? null) : P.length ? P.filter(q => kind === 'turn' || (q.ways ?? ['north', 'south']).includes(kind)) : [null];
        for (const def of defs) {
          const turn = kind === 'turn', bk = `${id}|${def?.id ?? ''}|${turn}`, b = berths.get(bk) ?? { st, at: st.at, def, turn }; berths.set(bk, b);
          for (const [dir, behind] of [[din, false], [dout, true]] as const) {
            const side = behind ? dir : -dir, on = R.track(st.s + side * 50, dir), c = crossing(net, svc, on, b, side, behind); if (!c) continue;
            const a = c.x0, z = c.x0 + side * c.len, s0 = Math.min(a, z), s1 = Math.max(a, z), corridor = net.track(on).corridor;
            const at = (s: number) => eased(net, svc, on, b, side, behind, s, net.offsetAt(on, s));
            let most = 0; for (let s = s0; s <= s1; s += 5) most = Math.max(most, Math.min(Math.abs(at(s) - net.offsetAt(on, s)), Math.abs(at(s) - berthOffset(net, c.track, b, s))));
            const key = `${corridor}|${Math.round(s0)}|${Math.round(s1)}|${Math.round(at(s0) * 10)}|${Math.round(at(s1) * 10)}`;
            if (most < 0.3 || seen.has(key)) continue;
            seen.add(key); out.push({ corridor, s0, s1, at });
          }
        }
      }
    });
  }
  return out;
}
/** Where a train is drawn by the stations: the platform it has claimed (or will) at its next stop, and the one it
 * stands at or last left, while it's near it. Fills out. */
export function berthsOf(sim: Sim, tr: Train, out: Berths): Berths {
  out.ahead = null; out.behind = null;
  const near = TUNING.claim + 600;
  if (tr.pfAt >= 0 && Math.abs(sim.station(tr.pfAt).s - tr.s) < near) out.behind = berth(sim, tr.pfAt, tr.pf, sim.isEnd(tr, tr.pfAt));
  if (tr.state === 'run' && tr.next !== null && tr.next !== tr.pfAt && Math.abs(sim.station(tr.next).s - tr.s) < near) {
    const i = tr.next, kind = sim.kindAt(tr, i), p = tr.bound >= 0 ? tr.bound : sim.platsFor(tr, i, kind)[0] ?? -1;
    out.ahead = berth(sim, i, p, kind === 'turn');
  }
  return out;
}
const BERTHS: Berth[] = [];
function berth(sim: Sim, i: number, p: number, turn: boolean): Berth {
  // one berth object per station, platform and turn, made once
  const k = (i * 64 + Math.max(0, p + 1)) * 2 + (turn ? 1 : 0), st = sim.station(i);
  return BERTHS[k] ??= { st, at: st.at, def: sim.plats[i]?.[p]?.def ?? null, turn };
}
/** Where a service's units run, by their middles: a passenger service between the stops at the ends of its route; an
 * express from where its tracks begin (its tail on them) to the end of its run, standing where the longest stopping
 * unit would at its last call. */
export function serviceRange(net: Network, svc: ServiceDef): [number, number] {
  if (!svc.scenery && !svc.through) { const ss = (svc.route ?? []).map(id => net.station(id).s); return [Math.min(...ss), Math.max(...ss)]; }
  const half = (svc.cars * PITCH - 0.6) / 2, last = net.station((Array.isArray(svc.calls) ? svc.calls : []).at(-1) ?? net.stations.at(-1)!.id);
  const first = net.route(svc).legs[0]!;
  return [Math.max(net.extent(first.north)[0], net.extent(first.south)[0]) + half, last.s + (LONGEST * PITCH - 0.6) / 2 - half];
}

export class TrainLayer {
  scene: THREE.Scene;
  net: Network;
  mat: THREE.MeshLambertMaterial;
  /** Each unit's group of cars, by its place in the sim's list. */
  meshes: THREE.Group[];
  private units: Unit[];
  services: Record<string, ServiceDef>;
  /** The first express service and the stretch of fast line it runs, which the engineering train runs too. */
  private fast: { svc: ServiceDef; range: [number, number] } | null;
  private berths: Berths = { ahead: null, behind: null };
  riders: THREE.InstancedMesh;
  standing: THREE.InstancedMesh;
  coats: THREE.Color[];
  lamps: THREE.InstancedMesh;
  private counts = { r: 0, s: 0 };
  hazards: THREE.InstancedMesh;
  posts: THREE.InstancedMesh;
  cautions: THREE.InstancedMesh;
  /** The spare unit in the sidings, shown once bought; ghosted while its card is chosen. */
  spare: THREE.Group;
  private spareCars: THREE.Mesh[];
  private spareGhost = false;
  private spareRise = 1;
  private spareHad: boolean | null = null;
  /** The rescue the spare is out on or coming back from, kept once the failure's over for the drive back. */
  rescue: Rescue | null = null;
  private svcList: ServiceDef[];
  /** The unit a contract's perk stables in the sidings, shown until it's put in service. */
  stabled: THREE.Group;
  private last = 0;
  /** The engineering train and its beacons: shown only while it's out. */
  eng: THREE.Group;
  private engCars: THREE.Mesh[];
  beacons: THREE.InstancedMesh;
  constructor(scene: THREE.Scene, net: Network, services: ServiceDef[]) {
    this.scene = scene; this.net = net; this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = []; this.units = [];
    this.services = Object.fromEntries(services.map(s => [s.id, s])); this.svcList = services;
    const ex = services.find(s => s.through || s.scenery);
    this.fast = ex ? { svc: ex, range: serviceRange(net, ex) } : null;
    this.riders = new THREE.InstancedMesh(riderGeo, riderMat, MAX_RIDERS); this.standing = new THREE.InstancedMesh(standGeo, riderMat, MAX_STANDING);
    for (const im of [this.riders, this.standing]) { im.count = 0; im.frustumCulled = false; scene.add(im); }
    this.coats = [PAL.pax, PAL['pax-2'], PAL['pax-3'], PAL['pax-4']];
    this.lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: PAL.late }), MAX_LAMPS);
    this.lamps.count = 0; this.lamps.frustumCulled = false; scene.add(this.lamps);
    const flash = new THREE.MeshBasicMaterial({ color: PAL.hazard });
    this.hazards = new THREE.InstancedMesh(hazardGeo, flash, 8); this.posts = new THREE.InstancedMesh(postGeo, new THREE.MeshLambertMaterial({ color: PAL.signal }), 4);
    this.cautions = new THREE.InstancedMesh(cautionGeo, flash, 4);
    for (const im of [this.hazards, this.posts, this.cautions]) { im.count = 0; im.frustumCulled = false; scene.add(im); }
    // the spare unit: placed once in Stockport's frame, along its siding
    const spare = this.unit(2, NORTHERN);
    this.spare = spare.group; this.spareCars = spare.cars; this.spare.visible = false; this.spareHome();
    // the unit a contract's perk stables on the next siding
    const stabled = this.unit(2, NORTHERN), f = net.stationFrame(net.stations[0]?.id ?? 'stockport'), [su, sv] = STABLED_AT;
    stabled.cars.forEach((m, c) => {
      const along = su + (c - 0.5) * PITCH; m.position.set(f.x + along * f.dx + sv * f.nx, 0, f.z + along * f.dz + sv * f.nz);
      m.rotation.y = yawFor(f); m.updateMatrix();
    });
    this.stabled = stabled.group; this.stabled.visible = false;
    // the engineering train: two cars in yellow, orange-banded, beacons on its roof at both ends
    const rgb = (c: THREE.Color): RGB => [c.r, c.g, c.b], y = rgb(PAL.eng), dk = rgb(PAL['eng-dark']);
    const eng = this.unit(2, { body: y, roof: dk, band: rgb(PAL['eng-beacon']), door: dk, win: dk, nose: dk });
    this.eng = eng.group; this.engCars = eng.cars; this.eng.visible = false;
    this.beacons = new THREE.InstancedMesh(beaconGeo, new THREE.MeshBasicMaterial({ color: PAL['eng-beacon'] }), 4);
    this.beacons.count = 0; this.beacons.frustumCulled = false; scene.add(this.beacons);
    // the crossovers the units take into and out of their platforms: rails along the path they ride, as the tracks'
    // are (their ballast runs under them), each in pieces so they follow its curve
    const xs = crossovers(net, services.flatMap(d => [d, ...variants(d)])), pieces = xs.reduce((n, c) => n + Math.ceil((c.s1 - c.s0) / XSTEP), 0);
    const rails = new THREE.InstancedMesh(xGeo, MAT.rail, Math.max(1, 2 * pieces)); rails.count = 0;
    const pa = newFrame(), pb = newFrame(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const c of xs) for (let s = c.s0; s < c.s1 - 0.01; s += XSTEP) {
      const s1 = Math.min(c.s1, s + XSTEP); net.place(c.corridor, s, c.at(s), pa); net.place(c.corridor, s1, c.at(s1), pb);
      const len = Math.hypot(pb.x - pa.x, pb.z - pa.z) || 0.01, nx = -(pb.z - pa.z) / len, nz = (pb.x - pa.x) / len;
      e.set(0, Math.atan2(-(pb.z - pa.z), pb.x - pa.x), 0); q.setFromEuler(e); sc.set(len + 0.3, 0.16, 0.1);
      for (const lat of [-0.72, 0.72]) { v3.set((pa.x + pb.x) / 2 + nx * lat, 0.08, (pa.z + pb.z) / 2 + nz * lat); m4.compose(v3, q, sc); rails.setMatrixAt(rails.count++, m4); }
    }
    scene.add(byCell(rails).group);
  }
  /** Ghost the spare unit while its card is chosen and it isn't bought; returns whether it's ghosted. */
  previewSpare(on: boolean): boolean {
    this.spareGhost = on; for (const m of this.spareCars) m.material = on ? GHOST_SPARE : this.mat; return on;
  }
  /** How far through rising into place the spare unit is (1 once it stands). */
  get spareRising(): number { return this.spareRise; }
  /** The spare unit, the hazard lights on a failed one, and the caution lamps by a signal failure. */
  private trouble(g: GameState, dtReal: number): void {
    const tb = g.trouble, on = performance.now() % 1000 < 600;
    const has = !!g.line.spare;
    if (this.spareHad === false && has) this.spareRise = 0;   // just bought: it rises into place
    this.spareHad = has;
    if (this.spareRise < 1) { this.spareRise = Math.min(1, this.spareRise + dtReal); this.spare.scale.y = Math.max(0.01, this.spareRise); }
    // out on the line while a failed train is being rescued, and back again after
    if (tb.fail && has) { if (!this.rescue || this.rescue.from !== tb.fail.from) this.rescue = rescueFor(this.net, this.live, g); }
    const x = this.rescue && has ? rescueAt(this.rescue, g.t) : null;
    if (x === null) { if (this.rescue && !tb.fail) this.rescue = null; if (this.spareOut) this.spareHome(); }
    else this.spareOn(this.rescue!, x);
    this.spare.visible = this.spareGhost || has;
    let h = 0;
    const tr = tb.fail ? g.trains.find(t => t.id === tb.fail!.train) : undefined, u = tr ? this.units[g.trains.indexOf(tr)] : undefined;
    const ends = u ? [[u.cars[0], -1], [u.cars[u.cars.length - 1], 1]] as const : [];
    if (on) for (const [m, e] of ends) if (m) for (const z of [-1.55, 1.55]) {
      m4.makeTranslation(e * (CAR / 2 - 0.3), 1.6, z).premultiply(m.matrix); this.hazards.setMatrixAt(h++, m4);
    }
    this.hazards.count = h; this.hazards.instanceMatrix.needsUpdate = true;
    let c = 0;
    if (tb.caution) {
      // at each end of the stretch, on the corridor it's on there (the spine where it doesn't say)
      const on = tb.caution.on ?? [];
      for (const s of [tb.caution.s0, tb.caution.s1]) for (const off of [-12, 26]) {
        const id = on.find(id => { const k = this.net.corridors[id]; return !!k && s >= k.start && s <= k.end; });
        const p = (id ? this.net.corridor(id) : this.net.spine).at(s, off, fc); m4.makeTranslation(p.x, 0, p.z);
        this.posts.setMatrixAt(c, m4); this.cautions.setMatrixAt(c, m4); c++;
      }
    }
    this.posts.count = c; this.cautions.count = on ? c : 0;
    this.posts.instanceMatrix.needsUpdate = true; this.cautions.instanceMatrix.needsUpdate = true;
  }
  private spareOut = false;
  /** The spare's cars at x along a rescue's path, each on its bogies like any unit's. */
  private spareOn(r: Rescue, x: number): void {
    this.spareOut = true;
    this.spareCars.forEach((m, c) => {
      const xc = x + (c - 0.5) * PITCH;
      const R = r.route && this.net.route(r.route.svc), on = (x: number, f: Frame) => this.net.trackAt(R!.track(x, r.route!.dir), x, f);
      const a = R ? on(xc - BOGIE, fa) : this.net.place(SPINE, xc - BOGIE, rescueOffset(this.net, r, xc - BOGIE), fa), b = R ? on(xc + BOGIE, fb) : this.net.place(SPINE, xc + BOGIE, rescueOffset(this.net, r, xc + BOGIE), fb);
      const dx = b.x - a.x, dz = b.z - a.z;
      m.position.set((a.x + b.x) / 2, 0, (a.z + b.z) / 2); m.rotation.y = Math.atan2(-dz, dx); m.updateMatrix();
    });
  }
  /** The services' data as they run now (Sim.svcs' defs), in the sim's order. */
  private live: ServiceDef[] = [];
  /** Which of each station's resting roads are taken this frame. */
  private roadsUsed = new Map<string, number>();
  /** A unit standing overnight in Stockport's sidings, on the kth of their other roads, or resting on a road at
   * another station (centred at its kit's u0, v). */
  private stable(u: Unit, k: number, station?: string, u0 = 0, v0?: number): void {
    const f = this.net.stationFrame(station ?? this.net.stations[0]?.id ?? 'stockport'), v = v0 ?? SIDINGS[k % SIDINGS.length]!, n = u.cars.length;
    u.cars.forEach((m, c) => {
      const along = u0 + (c - (n - 1) / 2) * PITCH; m.position.set(f.x + along * f.dx + v * f.nx, 0, f.z + along * f.dz + v * f.nz);
      m.rotation.y = yawFor(f); m.updateMatrix();
    });
    u.group.visible = true;
  }
  /** The spare back in the sidings, where it was placed. */
  private spareHome(): void {
    this.spareOut = false;
    const f = this.net.stationFrame(this.net.stations[0]?.id ?? 'stockport'), [u, v] = SPARE_AT;
    this.spareCars.forEach((m, c) => {
      const along = u + (c - 0.5) * PITCH; m.position.set(f.x + along * f.dx + v * f.nx, 0, f.z + along * f.dz + v * f.nz);
      m.rotation.y = yawFor(f); m.updateMatrix();
    });
  }
  /** A unit of n cars in a livery, cabs at both ends, in the scene. */
  private unit(n: number, liv: Livery, into?: Unit): Unit {
    const u = into ?? { group: new THREE.Group(), cars: [], full: -1 };
    if (!into) this.scene.add(u.group);
    for (const m of u.cars) { m.geometry.dispose(); u.group.remove(m); }
    u.cars = []; u.full = -1;
    for (let c = 0; c < n; c++) { const m = new THREE.Mesh(carGeometry(liv, c === 0, c === n - 1), this.mat); m.castShadow = true; m.matrixAutoUpdate = false; u.group.add(m); u.cars.push(m); }
    return u;
  }
  /** Put a unit's cars where unitPoses says. */
  private pose(u: Unit, svc: ServiceDef, s: number, dir: number, berths: Berths): void {
    const n = unitPoses(this.net, svc, s, dir, u.cars.length, berths, POSES);
    for (let c = 0; c < n; c++) {
      const p = POSES[c]!, m = u.cars[c]!;
      m.position.set(p.x, 0, p.z); m.rotation.y = Math.atan2(-p.dz, p.dx); m.updateMatrix();
    }
    u.group.visible = true;
  }
  /** An amber lamp on the roof over a late train's leading cab, bigger the later it is. */
  private lateLamp(u: Unit, tr: Train): void {
    if (tr.late < LATE || this.lamps.count >= MAX_LAMPS) return;
    const lead = tr.dir > 0 ? u.cars[u.cars.length - 1] : u.cars[0]; if (!lead) return;
    const k = 0.6 + Math.min(1, (tr.late - LATE) / (LATE_FULL - LATE)), front = tr.dir * (CAR / 2 - 2.2);
    m4.makeScale(k, k, k).setPosition(front, 4.0 + 0.35 * k, 0).premultiply(lead.matrix);
    this.lamps.setMatrixAt(this.lamps.count++, m4);
  }
  /** Recolour a unit's windows for how full it is (0 to 1): only when that changes by a tenth, so not every frame. */
  private windows(u: Unit, full: number): void {
    const step = Math.round(full * 10);
    if (u.full === step) return;
    u.full = step;
    winCol.copy(PAL['win-empty']).lerp(PAL['win-busy'], Math.min(1, step / 7));
    for (const m of u.cars) {
      const col = m.geometry.getAttribute('color'), win = m.geometry.userData['win'] as number[] | undefined;
      if (!win || !(col instanceof THREE.BufferAttribute)) continue;
      for (const v0 of win) for (let v = v0; v < v0 + 36; v++) col.setXYZ(v, winCol.r, winCol.g, winCol.b);
      col.needsUpdate = true;
    }
  }
  /** The riders in a unit's windows and doorways, placed in each car's own frame and carried into the world by its matrix. */
  private ridersIn(u: Unit, tr: Train, full: number, at: { r: number; s: number }): void {
    const seated = Math.round(full * SEATS.length), x0 = -CAR / 2;
    u.cars.forEach((m, c) => {
      for (const side of [-1, 1]) {
        for (let k = 0; k < seated && at.r < MAX_RIDERS; k++) {
          const seat = SEATS[(k + c * 3 + (side > 0 ? 5 : 0)) % SEATS.length]!;
          m4.makeTranslation(x0 + SEAT_U(seat), 2.6, side * 1.48).premultiply(m.matrix);
          this.riders.setMatrixAt(at.r, m4); this.riders.setColorAt(at.r, this.coats[(tr.id + c + seat) % this.coats.length]!); at.r++;
        }
        if (full >= STANDING) for (const d of DOORS) if (at.s < MAX_STANDING) {
          m4.makeTranslation(x0 + d, 2.25, side * 1.51).premultiply(m.matrix);
          this.standing.setMatrixAt(at.s, m4); this.standing.setColorAt(at.s, this.coats[(tr.id + c + at.s) % this.coats.length]!); at.s++;
        }
      }
    });
  }
  sync(sim: Sim, dtGame: number): void {
    const g = sim.g;
    while (this.units.length < g.trains.length) { const u = this.unit(2, NORTHERN); this.units.push(u); this.meshes.push(u.group); }
    const at = this.counts; at.r = 0; at.s = 0; this.lamps.count = 0;
    let yard = 0;
    const roads = this.roadsUsed; roads.clear();
    // the services as they run now, for the rescue (a new list only when one changes variant)
    if (sim.svcs.some((v, k) => this.live[k] !== v.def)) this.live = sim.svcs.map(v => v.def);
    g.trains.forEach((tr, i) => {
      const u = this.units[i], base = this.services[tr.svc]; if (!u || !base) return;
      // the variant it runs now (the Hazel Grove trains through to Manchester once bought)
      const svc = sim.svc(tr.svc).def;
      // an express off the map isn't drawn
      if (tr.state === 'away' && base.through) { u.group.visible = false; return; }
      const op = !base.through && sim.beeLevel() >= 2 ? 'bee' : svc.operator;
      if (u.cars.length !== tr.cars || u.livery !== op) { this.unit(tr.cars, liveryFor(op), u); u.livery = op; }
      // a peak unit resting between the peaks: in Stockport's sidings, or on the roads its service rests on
      if (tr.state === 'away') {
        const f = svc.frequency, at = f ? this.net.station(f.stable) : null;
        if (at?.index === 0) this.stable(u, yard++);
        else if (at && f?.roads?.length) { const k = roads.get(at.id) ?? 0; roads.set(at.id, k + 1); const [ru = 0, rv = 0] = f.roads[k % f.roads.length]!; this.stable(u, 0, at.id, ru, rv); }
        else u.group.visible = false;
        this.windows(u, 0); return;
      }
      // overnight, a unit that finished its run at Stockport stands in the sidings (the sim keeps it at its platform)
      if (tr.pfAt === 0 && sim.stabled(tr)) { this.stable(u, yard++); this.windows(u, 0); return; }
      this.pose(u, svc, tr.s, tr.dir, berthsOf(sim, tr, this.berths));
      const full = Math.min(1, tr.onboard / (tr.cars * TUNING.seatsPerCar));
      this.windows(u, full); this.ridersIn(u, tr, full, at); this.lateLamp(u, tr);
    });
    this.lamps.instanceMatrix.needsUpdate = true;
    const now = performance.now(), dtReal = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0; this.last = now;
    this.trouble(g, dtReal);
    this.stabled.visible = sim.fx.unit && g.line.units === 0;
    this.riders.count = at.r; this.standing.count = at.s;
    for (const im of [this.riders, this.standing]) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; }
    // the engineering train, on the nights it runs, when no express is about (they don't run in the small hours)
    const works = engineering(g.seed, g.t), fast = this.fast;
    this.beacons.count = 0;
    if (works && fast) {
      const [s0, s1] = fast.range;
      this.pose({ group: this.eng, cars: this.engCars, full: 0 }, fast.svc, s0 + works.at * (s1 - s0), works.dir, NO_BERTHS);
      // two beacons on each car's roof, turning: each lit for part of a real second, out of step
      const ms = performance.now();
      this.engCars.forEach((m, c) => { for (const e of [-1, 1]) if ((ms / 1000 + c * 0.5 + (e > 0 ? 0.25 : 0)) % 1 < 0.45) {
        m4.makeTranslation(e * (CAR / 2 - 1.5), 4.0 + 0.3, 0).premultiply(m.matrix); this.beacons.setMatrixAt(this.beacons.count++, m4);
      } });
    } else this.eng.visible = false;
    this.beacons.instanceMatrix.needsUpdate = true;
  }
}
