// Station life: what makes a bought station look busy rather than placed. Departure boards listing the next trains off
// the timetable (late ones in amber), shops lit inside and open by day, shuttered at night, with a queue at the counter
// when the station's busy, car parks filling through the morning and emptying in the evening, cycle racks with bikes
// coming and going. The kit parts (board, carpark, cycles, and the shop in retail) are built here and noted in each
// station's Live; StationLife reads the sim on a timer, never every frame, and only ever reads it. Cars, bikes, bay
// lines and customers are instanced.
import * as THREE from 'three';
import { MAT, PAL, box } from './scene.ts';
import { TUNING, type Sim } from '../sim/sim.ts';
import { runTime } from '../sim/journeys.ts';

/** Which way's trains a board lists: towards Manchester, away, or both (a booking office's). */
export type Serves = 'north' | 'south' | 'both';
interface Board { mesh: THREE.Mesh; serves: Serves }
interface Fill { mesh: THREE.InstancedMesh; cap: number; n: number }
interface Shop { shutter: THREE.Mesh; people: Fill }
/** The parts of a station that move with the sim: built with the kit, brought to life by StationLife. */
export interface Live { boards: Board[]; parks: Fill[]; racks: Fill[]; shops: Shop[] }
export const emptyLive = (): Live => ({ boards: [], parks: [], racks: [], shops: [] });

// ---- shapes ----
const lam = (c: THREE.Color) => new THREE.MeshLambertMaterial({ color: c });
const WHITE = new THREE.MeshLambertMaterial({ color: 0xffffff });   // each car, bike or customer's colour is its instance's
const LED = '#' + PAL['board-led'].getHexString(), LATE = '#' + PAL.late.getHexString(), INK = '#' + PAL['board-ink'].getHexString();
/** Lit shop windows: warm inside whenever the shop is open, day or night. */
const SHOP = new THREE.MeshBasicMaterial({ color: PAL['shop-lit'] });
const SHUTTER = lam(PAL.shutter), LINES = lam(PAL['bay-line']);
const CARS = ['car-1', 'car-2', 'car-3', 'car-4', 'car-5', 'car-6'] as const;
const COATS = ['pax', 'pax-2', 'pax-3', 'pax-4'] as const;

/** Boxes and cylinders as one geometry, each moved to its place: [geometry, x, y, z]. */
function merged(parts: [THREE.BufferGeometry, number, number, number][]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [];
  for (const [g0, x, y, z] of parts) {
    const g = g0.toNonIndexed(); g.translate(x, y, z);
    pos.push(...(g.getAttribute('position').array as Float32Array)); nor.push(...(g.getAttribute('normal').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return out;
}
const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
// a car pointing along z: body and cabin, 1.25 times real across the line like everything else
const CAR = merged([[B(1.9, 0.75, 4.6), 0, 0.6, 0], [B(1.7, 0.6, 2.4), 0, 1.25, -0.2]]);
// a bike standing along z: two wheels and the frame
const wheel = () => new THREE.CylinderGeometry(0.34, 0.34, 0.06, 10).rotateZ(Math.PI / 2);
const BIKE = merged([[wheel(), 0, 0.34, -0.55], [wheel(), 0, 0.34, 0.55], [B(0.06, 0.08, 1.1), 0, 0.62, 0], [B(0.06, 0.5, 0.06), 0, 0.5, -0.15], [B(0.45, 0.05, 0.05), 0, 0.95, 0.5]]);
// a Sheffield stand, its hoop across z
const STAND = merged([[B(0.08, 0.8, 0.08), 0, 0.4, -0.35], [B(0.08, 0.8, 0.08), 0, 0.4, 0.35], [B(0.08, 0.08, 0.78), 0, 0.8, 0]]);
// someone at a counter: a coat and a head
const PERSON = merged([[new THREE.CylinderGeometry(0.26, 0.3, 1.25, 8), 0, 0.62, 0], [new THREE.SphereGeometry(0.2, 8, 6), 0, 1.45, 0]]);
// a painted bay line
const LINE = B(0.12, 0.04, 5.2);

/** A cosmetic number in [0, 1) from an integer: which colour each car is, which bay fills first. */
const hash = (n: number) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), at = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), col = new THREE.Color();

/** An instanced shape at each of `spots` ([x, y, z, yaw]), coloured from `colours` (if any) by a hash of `seed`, none shown yet. */
function instanced(gp: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material, spots: number[][], colours: readonly string[] | null, seed: number): Fill {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  spots.forEach(([x, y, z, yaw], k) => {
    m4.compose(at.set(x!, y!, z!), q.setFromAxisAngle(up, yaw!), one); mesh.setMatrixAt(k, m4);
    if (colours) mesh.setColorAt(k, col.copy(PAL[colours[Math.floor(hash(seed + k * 7919) * colours.length)] as keyof typeof PAL] as THREE.Color));
  });
  // bounds from every spot, worked out now: three works them out once, from however many are showing then
  mesh.count = spots.length; mesh.computeBoundingSphere(); mesh.computeBoundingBox(); mesh.count = 0;
  gp.add(mesh); return { mesh, cap: spots.length, n: 0 };
}

// ---- the parts (built from src/render/stations.ts) ----
/** A dot-matrix departure board, both faces lit, on two posts over a platform (base y, 1 m by default) or fixed to a wall. */
export function buildBoard(gp: THREE.Group, p: { u: number; v: number; serves: Serves; y?: number; wall?: boolean; along?: boolean }, live: Live): void {
  // 7 m by 2.6, bigger than life so it reads on a phone at platform zoom
  const y = (p.y ?? 1) + (p.wall ? 1.3 : 3.3), b = box(gp, 7, 2.6, 0.2, MAT.steel, p.u, y, p.v);
  if (p.along) b.rotation.y = Math.PI / 2;
  if (!p.wall) for (const d of [-3, 3]) box(gp, 0.12, y - (p.y ?? 1), 0.12, MAT.steel, p.u + (p.along ? 0 : d), (y + (p.y ?? 1)) / 2, p.v + (p.along ? d : 0));
  live.boards.push({ mesh: b, serves: p.serves });
}
/** A car park: tarmac (none on a deck someone else built) and bay lines, bays in double rows across the line. */
export function buildCarPark(gp: THREE.Group, p: { u0: number; u1: number; v0: number; v1: number; y?: number; deck?: boolean }, live: Live, seed: number): void {
  const y = p.y ?? 0;
  if (!p.deck) box(gp, p.u1 - p.u0, 0.1, p.v1 - p.v0, MAT.road, (p.u0 + p.u1) / 2, y + 0.05, (p.v0 + p.v1) / 2);
  const cars: number[][] = [], lines: number[][] = [];
  // rows of bays 6.5 m deep, two back to back, then a 7 m aisle; bays 2.7 m wide along the line
  for (let v = p.v0 + 1, k = 0; v + 6.5 <= p.v1 - 1; v += k % 2 ? 13.5 : 6.5, k++) {
    const yaw = k % 2 ? Math.PI : 0, cv = v + 3.25;
    for (let u = p.u0 + 1.5; u + 1.35 <= p.u1 - 1; u += 2.7) { cars.push([u, y + 0.1, cv, yaw]); lines.push([u - 1.35, y + 0.1, cv, 0]); }
  }
  // the bays fill in a scattered order, the same every time
  cars.sort((a, b) => hash(seed + a[0]! * 13 + a[2]! * 7) - hash(seed + b[0]! * 13 + b[2]! * 7));
  const bays = instanced(gp, LINE, LINES, lines, null, 0); bays.mesh.count = bays.cap;
  live.parks.push(instanced(gp, CAR, WHITE, cars, CARS, seed));
}
/** A row of Sheffield stands, two bikes to a stand; the row runs along the line, or across it. */
export function buildCycles(gp: THREE.Group, p: { u: number; v: number; n: number; y?: number; across?: boolean }, live: Live, seed: number): void {
  const y = p.y ?? 0, stands: number[][] = [], bikes: number[][] = [];
  for (let k = 0; k < p.n; k++) {
    const u = p.u + (p.across ? 0 : k * 1.2), v = p.v + (p.across ? k * 1.2 : 0), yaw = p.across ? Math.PI / 2 : 0;
    stands.push([u, y, v, yaw]);
    for (const s of [-0.22, 0.22]) bikes.push([u + (p.across ? 0 : s), y, v + (p.across ? s : 0), yaw]);
  }
  bikes.sort((a, b) => hash(seed + a[0]! * 31 + a[2]! * 17) - hash(seed + b[0]! * 31 + b[2]! * 17));
  const st = instanced(gp, STAND, MAT.steel, stands, null, 0); st.mesh.count = st.cap;
  live.racks.push(instanced(gp, BIKE, WHITE, bikes, CARS, seed));
}
/** A shop's lit window on its +v face, the shutter that comes down over it at night, and room for a queue outside. */
export function buildShop(gp: THREE.Group, p: { u: number; v: number; y?: number }, w: number, d: number, live: Live, seed: number): void {
  const y = p.y ?? 0;
  box(gp, w - 0.6, 1.2, 0.1, SHOP, p.u, 1.8 + y, p.v + d / 2 + 0.02);
  const shutter = box(gp, w - 0.4, 1.4, 0.1, SHUTTER, p.u, 1.8 + y, p.v + d / 2 + 0.1); shutter.visible = false;
  const spots = [-1, 0, 1].map((k, n) => [p.u + k * Math.min(1.1, w / 3) + 0.2 * n, y, p.v + d / 2 + 1 + 0.3 * Math.abs(k), 0]);
  live.shops.push({ shutter, people: instanced(gp, PERSON, WHITE, spots, COATS, seed) });
}

// ---- the departure boards' timetable ----
interface Dep { t: number; late: number; dest: number; d: 0 | 1 }
const ROWS = 2;
/** The next departures from station i, both ways, earliest first: each unit's next two calls here each way, worked on
 * from when it's due away from the stop it's at or running to, the way the sim plans them (the run at line speed, the
 * planned stop or turnaround), carrying the lateness it has now. */
export function departures(sim: Sim, i: number, out: Dep[]): Dep[] {
  out.length = 0;
  for (const tr of sim.g.trains) {
    let stop = tr.state === 'dwell' ? (tr.calling ?? tr.next) : tr.next;
    if (stop === null || tr.due < 0) continue;
    const sp = sim.span(sim.svc(tr.svc)); if (sp.length < 2) continue;
    const first = sp[0]!, last = sp[sp.length - 1]!, s = (k: number) => sim.station(k).s;
    // a running train turns round at the end of its run before it leaves there; a standing one already has
    let dir = tr.state === 'run' && (stop === first || stop === last) ? -tr.dir : tr.dir, t = tr.due, found = 0;
    for (let hop = 0; hop < sp.length * 4 && found < 4; hop++) {
      const d: 0 | 1 = dir > 0 ? 0 : 1;
      if (stop === i) { out.push({ t, late: tr.late, dest: d === 0 ? last : first, d }); found++; }
      // the next stop it calls at that way: the end of its run, or an owned station with a platform its way
      let nx = d === 0 ? last : first;
      for (let k = 0; k < sp.length; k++) {
        const j = d === 0 ? sp[k]! : sp[sp.length - 1 - k]!;
        if ((s(j) - s(stop)) * dir > 1 && (j === first || j === last || (!!sim.g.owned[j] && sim.serves(j, d)))) { nx = j; break; }
      }
      const end = nx === first || nx === last;
      t += runTime(Math.abs(s(nx) - s(stop)), sim.vmax(), TUNING.accel, TUNING.brake) + (end ? sim.turnaround() : TUNING.dwell);
      if (end) dir = -dir;
      stop = nx;
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
/** A sim time as the game's clock reads it. */
const clock = (t: number) => { const s = Math.floor((t * TUNING.dayRate) % 86400); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`; };
/** How late a train is, in the game clock's minutes, once its cab lamp shows (a minute or more). */
const lateMins = (late: number) => late >= 60 ? Math.round(late * TUNING.dayRate / 60) : 0;

/** One board face, drawn on a canvas: the next two trains, each its time and destination over On time or how late. */
class Face {
  readonly tex: THREE.CanvasTexture; readonly mat: THREE.MeshBasicMaterial;
  private readonly cv = document.createElement('canvas'); private text = '';
  constructor() {
    this.cv.width = 512; this.cv.height = 192;
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex });
    this.draw([], []);
  }
  draw(rows: Dep[], names: string[]): void {
    const text = rows.map(r => `${r.t}|${r.dest}|${lateMins(r.late)}`).join(',') || 'none';
    if (text === this.text) return;
    this.text = text;
    const x = this.cv.getContext('2d'); if (!x) return;
    x.fillStyle = INK; x.fillRect(0, 0, 512, 192);
    x.textBaseline = 'middle'; x.textAlign = 'left'; x.fillStyle = LED;
    if (!rows.length) { x.font = '600 40px Arial, Helvetica, sans-serif'; x.textAlign = 'center'; x.fillText('No trains', 256, 96); }
    rows.forEach((r, k) => {
      const y = 30 + k * 96, m = lateMins(r.late);
      x.font = '600 40px Arial, Helvetica, sans-serif'; x.fillStyle = LED;
      x.fillText(clock(r.t), 12, y); x.fillText(names[r.dest] ?? '', 138, y, 362);
      x.font = '600 34px Arial, Helvetica, sans-serif'; x.fillStyle = m ? LATE : LED;
      x.fillText(m ? `${m} min late` : 'On time', 138, y + 42);
    });
    this.tex.needsUpdate = true;
  }
}

// ---- how busy each station is, and the day's shape ----
const TICK = 0.5;              // real seconds between looks at the sim
const BOARD_TICK = 1;          // ...and between board redraws
const REF = 0.25;              // people a sim second boarding and leaving that counts as busy (Stockport's morning peak)
const FAST = 300, SLOW = 3600; // sim seconds: busyness rises over five minutes and falls over an hour
/** How full a car park is through the day: empty at dawn, filling to mid-morning, full through the day, emptying in
 * the evening, a few left overnight. */
export function parkShape(h: number): number {
  const ease = (a: number, b: number) => { const t = Math.max(0, Math.min(1, (h - a) / (b - a))); return t * t * (3 - 2 * t); };
  return 0.04 + 0.96 * ease(5.5, 9.5) - 0.86 * ease(16, 20) - 0.1 * ease(21, 24);
}
const openHours = (h: number) => h >= 6 && h < 21;

/** Brings every station's live parts round: boards, shops, car parks and racks, from the sim and the hour shown. */
export class StationLife {
  private readonly built: { live: Live }[];
  private readonly faces = new Map<string, Face>();
  private readonly deps: Dep[] = []; private readonly rows: Dep[] = [];
  private readonly names: string[];
  private readonly busy: { last: number; t: number; now: number; held: number }[];
  private acc = TICK; private boardAcc = BOARD_TICK; private fresh = true;

  constructor(built: { live: Live }[], sim: Sim) {
    this.built = built;
    this.names = sim.S.map(s => s.name);
    // a booking office's board and a platform's showing the same way share one face
    built.forEach((b, i) => { for (const bd of b.live.boards) {
      const key = `${i}:${bd.serves}`; let f = this.faces.get(key); if (!f) { f = new Face(); this.faces.set(key, f); }
      bd.mesh.material = [MAT.steel, MAT.steel, MAT.steel, MAT.steel, f.mat, f.mat];
    } });
    this.busy = built.map(() => ({ last: -1, t: 0, now: 0, held: 0 }));
  }

  /** dt: real seconds since the last frame; hour: the hour the map shows (the game's, or the one the light is locked to). */
  sync(sim: Sim, hour: number, dt: number): void {
    this.acc += dt; this.boardAcc += dt;
    if (this.acc >= TICK) { this.acc = 0; this.life(sim, hour); }
    if (this.boardAcc >= BOARD_TICK) { this.boardAcc = 0; this.boards(sim); }
  }

  private life(sim: Sim, hour: number): void {
    const g = sim.g, snap = this.fresh; this.fresh = false;
    const park = parkShape(hour), open = openHours(hour);
    this.built.forEach((b, i) => {
      const st = g.st[i], bz = this.busy[i]!; if (!st) return;
      const count = st.boarded + st.alighted, dt = g.t - bz.t;
      if (bz.last < 0 || count < bz.last || dt < 0 || dt > SLOW) {
        // a new look (the page opened, a new game, back from away): start from the average since the game began
        const avg = count / Math.max(600, g.t - 6.5 * 3600 / TUNING.dayRate);
        bz.now = bz.held = Math.min(REF, avg * 2); bz.last = count; bz.t = g.t;
      } else if (dt > 0) {
        const rate = (count - bz.last) / dt, k = 1 - Math.exp(-dt / FAST);
        bz.now += (rate - bz.now) * k;
        bz.held += (bz.now - bz.held) * (bz.now > bz.held ? k : 1 - Math.exp(-dt / SLOW));
        bz.last = count; bz.t = g.t;
      }
      const owned = !!g.owned[i], held = Math.min(1, bz.held / REF), now = Math.min(1, bz.now / REF);
      for (const f of b.live.parks) step(f, owned ? f.cap * park * (0.15 + 0.85 * held) : 0, snap);
      for (const f of b.live.racks) step(f, owned ? f.cap * park * (0.2 + 0.8 * held) : 0, snap);
      for (const s of b.live.shops) { s.shutter.visible = !open; step(s.people, owned && open ? s.people.cap * now * 1.2 : 0, snap); }
    });
  }

  private boards(sim: Sim): void {
    this.built.forEach((b, i) => {
      if (!b.live.boards.length || !sim.g.owned[i]) return;
      const deps = departures(sim, i, this.deps);
      for (const serves of ['north', 'south', 'both'] as const) {
        const f = this.faces.get(`${i}:${serves}`); if (!f) continue;
        this.rows.length = 0;
        for (const d of deps) if (this.rows.length < ROWS && (serves === 'both' || d.d === (serves === 'north' ? 0 : 1))) this.rows.push(d);
        f.draw(this.rows, this.names);
      }
    });
  }
}
/** Bring a fill a step towards how many it should show: a car or two at a time, or straight there on the first look. */
function step(f: Fill, target: number, snap: boolean): void {
  const want = Math.max(0, Math.min(f.cap, Math.round(target)));
  if (snap) f.n = want; else if (f.n !== want) f.n += Math.sign(want - f.n) * Math.min(Math.abs(want - f.n), Math.max(1, Math.round(f.cap / 30)));
  f.mesh.count = f.n;
}
