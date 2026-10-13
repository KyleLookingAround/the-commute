// The lineside: the line-speed boards the faster timetable brings (reading 90 where boards reading 75 stood before, at
// every other one of the network's signal sites on the main line: src/sim/network.ts, one every 440 m, clear of the
// stations), and the colour-light signals each resignalled section of line brings (the line between stations), at its
// sites re-laid closer (Sim.sites), a signal outside the outer track on either side facing the trains that run that
// side, and a location case at each end of the section. Each signal shows what the sim's blocks say for the lines it
// faces (Sim.aspect): red where the block beyond holds a train, yellow where the one after does, green when both are
// clear, refreshed on a timer. All instanced, holding only what's built. Choosing a card ghosts its work, buying it
// makes it rise into place, as a station's parts do; nothing here changes the game.
import * as THREE from 'three';
import { MAT, PAL } from './scene.ts';
import { GHOST, riseBy, settle } from './stations.ts';
import { yawFor } from './world.ts';
import { SIGNAL_CLEAR, SIGNAL_FIRST, SIGNAL_SITE, type Network } from '../sim/network.ts';
import type { Sim } from '../sim/sim.ts';

const SITE = SIGNAL_SITE;    // metres between signal sites: eight mast spans, so each stands halfway between two masts
const FIRST = SIGNAL_FIRST;  // the first site, halfway between the first two masts (world.ts puts them at 30, 85, ...)
const CLEAR = SIGNAL_CLEAR;  // no board within this of a station: its kit fills that stretch
const ASPECT_EVERY = 0.5;    // real seconds between refreshing what the signals show
const LOOK_EVERY = 0.25;     // real seconds between looking for newly resignalled sections
const OUT = 2.2;             // how far outside the outer track a post stands (the masts are at 3.2)
const BOARD_AHEAD = 12;      // a board stands this far on from its site's signals
const CASE_INSET = 60;       // a location case stands this far in from each end of its section (the speed boards at 40)

/** A 75 or 90 board's face: the token white with the number in the token ink. */
function boardFace(text: string): THREE.Material {
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 104;
  const x = cv.getContext('2d');
  if (x) {
    const ink = '#' + PAL['board-ink'].getHexString();
    x.fillStyle = ink; x.fillRect(0, 0, 128, 104);
    x.fillStyle = '#' + PAL.board.getHexString(); x.fillRect(6, 6, 116, 92);
    x.fillStyle = ink; x.font = 'bold 76px Arial, Helvetica, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, 64, 56);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return new THREE.MeshLambertMaterial({ map: t });
}

/** Two non-indexed geometries with the same attributes as one. */
function merge(a: THREE.BufferGeometry, b: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const x = a.getAttribute(name), y = b.getAttribute(name); if (!x || !y) continue;
    const arr = new Float32Array(x.count * x.itemSize + y.count * y.itemSize);
    arr.set(x.array as Float32Array); arr.set(y.array as Float32Array, x.count * x.itemSize);
    out.setAttribute(name, new THREE.BufferAttribute(arr, x.itemSize));
  }
  return out;
}

/** A place along the line with its boards. */
interface Site { line: string; s: number; x: number; z: number; board: boolean }
/** Where a signal or board stands (s along the line, off across it) and which way it faces: +1 towards Manchester,
 * at the trains coming from there, -1 the other way. */
type Spot = [s: number, off: number, face: 1 | -1, line: string];
/** A resignalled section's signal (or, with no tracks, its location case): the section, where it stands, and the
 * tracks whose trains it faces there. */
interface Sig { sec: string; spot: Spot; tracks: string[] }

/** One instanced piece of the signals: its mesh, how high its middle stands, and how far towards the trains. */
interface Piece { mesh: THREE.InstancedMesh; y: number; ahead: number; cases: boolean }

export class Lineside {
  /** The 90 boards: shown once the faster timetable is, and ghosted while its card is chosen. */
  readonly fresh = new THREE.Group();
  /** The 75 boards they replace. */
  readonly old = new THREE.Group();
  /** The resignalled sections' signals and location cases, and a section's as a ghost while its card is chosen. */
  readonly signals = new THREE.Group();
  readonly ghosts = new THREE.Group();
  readonly sites: Site[] = [];
  /** The signals standing, in the order they're drawn (two to a site, the low side's first), and the cases. */
  sigs: Sig[] = [];
  /** How far through rising into place the new boards are (1 once they stand), and each newly resignalled section. */
  rise = 1;
  private rising = new Map<string, number>();
  ghost = false;
  private shown: boolean | null = null;
  private readonly pt = new THREE.Vector3();
  private readonly net: Network;
  private pieces: Piece[] = [];
  private cases: Sig[] = [];
  /** The resignalled sections drawn, as a key; null before the first look at the sim. */
  private key: string | null = null;
  private shows: number[] = [];
  private since = Infinity; private looked = Infinity;
  private readonly colours = [PAL['signal-red'], PAL['signal-yellow'], PAL['signal-green']];
  private readonly m4 = new THREE.Matrix4(); private readonly q = new THREE.Quaternion(); private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3(); private readonly sc = new THREE.Vector3();
  /** The pieces' shapes and looks: a post, a head its real size, its lamp on the face, and a location case. */
  private readonly shapes = {
    post: new THREE.CylinderGeometry(0.14, 0.18, 4.6, 6), head: new THREE.BoxGeometry(0.45, 1.3, 0.6),
    lamp: new THREE.SphereGeometry(0.2, 8, 5), box: new THREE.BoxGeometry(0.7, 1.4, 1.2),
  };

  constructor(scene: THREE.Scene, net: Network) {
    this.net = net;
    const board: Spot[] = [];
    // along the spine (the lines out have no line-speed boards here: their sections carry their own)
    const c = net.spine, on = (corridor: string) => net.onLine(corridor, c);
    const clear = (s: number) => net.stations.every(st => !on(st.corridor) || Math.abs(st.s - s) > CLEAR);
    const sites = Object.keys(net.corridors).filter(on).flatMap(id => net.signals[id] ?? []).filter(s => s >= c.start && s < c.end);
    for (const s of sites) {
      // a site only where it's a block boundary on a track there (none too near a track's end, so no block is short)
      const k = Math.round((s - FIRST) / SITE), here = net.tracks.some(t => on(t.corridor) && net.blocks(t.id).at.some(b => Math.abs(b - s) < 0.5));
      if (!here || !this.span(c.id, s)) continue;
      const sb = s + BOARD_AHEAD, wb = k % 2 === 0 && clear(sb) ? this.span(c.id, sb) : null;
      if (wb) board.push([sb, wb[0] - OUT, -1, c.id], [sb, wb[1] + OUT, 1, c.id]);
      const m = net.place(c.id, s); this.sites.push({ line: c.id, s, x: m.x, z: m.z, board: !!wb });
    }
    // a board: two legs and a plate carrying the number on its face
    const legs = merge(new THREE.BoxGeometry(0.1, 2.4, 0.1).translate(0, 0, 0.7).toNonIndexed(), new THREE.BoxGeometry(0.1, 2.4, 0.1).translate(0, 0, -0.7).toNonIndexed());
    const plate = new THREE.BoxGeometry(0.12, 1.6, 2), back = MAT.steel;
    for (const [text, into] of [['90', this.fresh], ['75', this.old]] as const) {
      this.place(board, legs, MAT.steel, 1.2, 0, into);
      this.place(board, plate, [boardFace(text), back, back, back, back, back], 3.2, 0, into);
    }
    this.fresh.visible = false; this.ghosts.visible = false;
    scene.add(this.fresh, this.old, this.signals, this.ghosts);
  }

  /** Across a line at s, the outermost tracks running there, or null where there are none. */
  private span(line: string, s: number): [number, number] | null {
    const L = this.net.corridors[line] ?? this.net.spine;
    let lo = Infinity, hi = -Infinity;
    for (const t of this.net.tracks) { if (!this.net.onLine(t.corridor, L)) continue; const [e0, e1] = this.net.extent(t.id); if (s < e0 || s > e1) continue; const o = this.net.offsetAt(t.id, s); lo = Math.min(lo, o); hi = Math.max(hi, o); }
    return lo > hi ? null : [lo, hi];
  }
  /** One instanced mesh of a piece at every spot; local +x is the face, turned to the trains it's for. */
  private place(spots: Spot[], geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], y: number, ahead: number, into: THREE.Group): THREE.InstancedMesh {
    const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length)); inst.count = spots.length;
    spots.forEach((spot, i) => inst.setMatrixAt(i, this.pose(spot, y, ahead, 1)));
    into.add(inst);
    return inst;
  }
  /** A piece's matrix at a spot, risen `up` of the way (1 standing). */
  private pose([s, off, face, line]: Spot, y: number, ahead: number, up: number): THREE.Matrix4 {
    const p = this.net.place(line, s + face * ahead, off), h = Math.max(0.01, up);
    this.e.set(0, yawFor(p) + (face < 0 ? Math.PI : 0), 0); this.q.setFromEuler(this.e);
    return this.m4.compose(this.v.set(p.x, y * h, p.z), this.q, this.sc.set(1, h, 1));
  }
  /** A section's signals (two to each of its sites that's a block boundary on a track there, as the sim's blocks
   * stand, or as they would once it's resignalled) and its two location cases. */
  private work(sim: Sim, id: string, planned: boolean): { sigs: Sig[]; cases: Sig[] } {
    const net = this.net, x = sim.secs.find(q => q.id === id), sigs: Sig[] = [], cases: Sig[] = [];
    if (!x) return { sigs, cases };
    const line = net.lineOf(x.corridor), on = (corridor: string) => net.onLine(corridor, line);
    for (const s of planned ? net.closer(x.corridor, x.s0, x.s1) : sim.sites(x.corridor).filter(s => s >= x.s0 && s <= x.s1)) {
      const w = this.span(line.id, s); if (!w) continue;
      const here = net.tracks.filter(t => on(t.corridor) && (planned || sim.blocks(t.id).at.some(b => Math.abs(b - s) < 0.5)));
      if (!here.length) continue;
      // the down lines (towards Manchester) are on the low side, so their signals face back down the line, at the
      // trains running towards Manchester; the high side's face the trains coming back
      sigs.push({ sec: id, spot: [s, w[0] - OUT, -1, line.id], tracks: here.filter(t => net.way(t.id) === 1).map(t => t.id) });
      sigs.push({ sec: id, spot: [s, w[1] + OUT, 1, line.id], tracks: here.filter(t => net.way(t.id) === -1).map(t => t.id) });
    }
    // a location case at each end, the other side from its speed board (src/render/sections.ts)
    for (const [s, lo] of [[x.s0 + CASE_INSET, true], [x.s1 - CASE_INSET, false]] as const) {
      const w = x.s1 - x.s0 > 2 * CASE_INSET ? this.span(line.id, s) : null;
      if (w) cases.push({ sec: id, spot: [s, lo ? w[0] - OUT - 0.6 : w[1] + OUT + 0.6, lo ? -1 : 1, line.id], tracks: [] });
    }
    return { sigs, cases };
  }

  /** Ghost the faster timetable's boards on the map while its card is chosen (on), or stop. Returns how many groups
   * of parts it ghosts. */
  preview(on: boolean, bought: boolean): number {
    on = on && !bought;
    if (this.ghost !== on) {
      this.ghost = on;
      this.fresh.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        if (on) { o.userData['own'] = o.material; o.material = GHOST; o.castShadow = false; }
        else if (o.userData['own']) { o.material = o.userData['own']; o.castShadow = !o.userData['noShadow']; }
      });
    }
    this.show(bought);
    return on ? 1 : 0;
  }
  /** Ghost a section's resignalling (its signals at the closer spacing and its cases) while its card is chosen, or
   * stop (null). Returns the box round it, to frame. */
  previewSignals(sim: Sim | null, id: string | null): THREE.Box3 | null {
    for (const o of [...this.ghosts.children]) { this.ghosts.remove(o); if (o instanceof THREE.InstancedMesh) o.dispose(); }
    this.ghosts.visible = false;
    if (!sim || !id) return null;
    const { sigs, cases } = this.work(sim, id, true), spots = sigs.map(g => g.spot), box = new THREE.Box3();
    this.place(spots, this.shapes.post, GHOST, 2.3, 0, this.ghosts);
    this.place(spots, this.shapes.head, GHOST, 4.6, 0, this.ghosts);
    this.place(cases.map(g => g.spot), this.shapes.box, GHOST, 0.7, 0, this.ghosts);
    for (const g of [...sigs, ...cases]) { const p = this.net.place(g.spot[3], g.spot[0], g.spot[1]); box.expandByPoint(this.pt.set(p.x, 0, p.z)).expandByPoint(this.pt.set(p.x, 6, p.z)); }
    this.ghosts.visible = true;
    return box.isEmpty() ? null : box;
  }

  /** Follow whether the faster timetable is bought (once it is, the 90 boards rise into place and the 75s go) and
   * which sections are resignalled (their signals rise into place); and while signals stand, what each shows. dt:
   * real seconds. */
  sync(bought: boolean, dt: number, sim?: Sim): void {
    if (this.shown !== bought) {
      if (this.shown === false && bought) { this.rise = 0; this.preview(false, bought); }
      this.shown = bought; this.show(bought);
    }
    if (this.rise < 1) { this.rise = riseBy(this.rise, dt); this.fresh.scale.y = Math.max(0.01, settle(this.rise)); }
    if (!sim) return;
    this.looked += dt;
    if (this.looked >= LOOK_EVERY) { this.looked = 0; this.resignal(sim); }
    if (this.rising.size) {
      for (const [k, r] of this.rising) { const n = riseBy(r, dt); if (n >= 1) this.rising.delete(k); else this.rising.set(k, n); }
      this.poseAll();
    }
    this.since += dt;
    if (this.since >= ASPECT_EVERY && this.sigs.length) { this.since = 0; this.aspects(sim); }
  }
  /** Draw the signals and cases of every resignalled section, when which they are has changed; the newly resignalled
   * rise into place. */
  private resignal(sim: Sim): void {
    const ids = sim.secs.filter(x => sim.resignalled(x.id)).map(x => x.id), key = ids.join();
    if (key === this.key) return;
    // what was resignalled before the first look (a loaded game) stands already; what's resignalled since rises
    const had = new Set(this.key ? this.key.split(',') : []);
    if (this.key !== null) for (const id of ids) if (!had.has(id)) this.rising.set(id, 0);
    this.key = key;
    this.sigs = []; this.cases = [];
    for (const id of ids) { const w = this.work(sim, id, false); this.sigs.push(...w.sigs); this.cases.push(...w.cases); }
    // the meshes, as big as they need to be
    const want = [this.sigs.length, this.sigs.length, this.sigs.length, this.cases.length];
    if (!this.pieces.length || this.pieces.some((p, i) => p.mesh.instanceMatrix.count < want[i]!)) {
      for (const p of this.pieces) { this.signals.remove(p.mesh); p.mesh.dispose(); }
      const make = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, y: number, ahead: number, cases: boolean): Piece => {
        const mesh = new THREE.InstancedMesh(geo, mat, Math.max(8, Math.ceil(n * 1.5))); this.signals.add(mesh); return { mesh, y, ahead, cases };
      };
      this.pieces = [
        make(this.shapes.post, MAT.steel, want[0]!, 2.3, 0, false),
        make(this.shapes.head, new THREE.MeshLambertMaterial({ color: PAL.signal }), want[1]!, 4.6, 0, false),
        // the lamp glows, so it throws no shadow (noShadow), and is a plain few-sided ball: there can be over a hundred
        make(this.shapes.lamp, new THREE.MeshBasicMaterial({ color: 0xffffff }), want[2]!, 4.4, 0.25, false),
        make(this.shapes.box, MAT.steel, want[3]!, 0.7, 0, true),
      ];
      this.pieces[2]!.mesh.userData['noShadow'] = true;
      for (const p of this.pieces) { p.mesh.castShadow = !p.mesh.userData['noShadow']; p.mesh.receiveShadow = true; }
    }
    this.poseAll();
    this.shows = this.sigs.map(() => -1); this.since = Infinity;
  }
  /** Every signal's and case's matrix, those of a rising section part way up. */
  private poseAll(): void {
    for (const p of this.pieces) {
      const list = p.cases ? this.cases : this.sigs;
      list.forEach((g, i) => p.mesh.setMatrixAt(i, this.pose(g.spot, p.y, p.ahead, settle(this.rising.get(g.sec) ?? 1))));
      p.mesh.count = list.length; p.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  /** Whether any of the lineside work is still rising into place. */
  get risingNow(): boolean { return this.rise < 1 || this.rising.size > 0; }

  /** The box round the site nearest (x, z), its boards and a little line either side, to frame; a site with boards
   * shows both halves of the work, so it wins a near tie. */
  siteBox(x: number, z: number, into: THREE.Box3): THREE.Box3 | null {
    let best: Site | null = null, d = Infinity;
    for (const st of this.sites) { const dd = Math.hypot(st.x - x, st.z - z) - (st.board ? 300 : 0); if (dd < d) { d = dd; best = st; } }
    if (!best) return null;
    const a = this.net.place(best.line, best.s - 4, -3), b = this.net.place(best.line, best.s + 16, 17);
    return into.makeEmpty().expandByPoint(this.pt.set(a.x, 0, a.z)).expandByPoint(this.pt.set(b.x, 6, b.z));
  }

  /** Each signal shows the most restrictive of the lines it faces (a site with no block there for them: green). */
  private aspects(sim: Sim): void {
    const lamps = this.pieces[2]?.mesh; if (!lamps) return;
    let changed = false;
    this.sigs.forEach((f, i) => {
      let a = 2; for (const t of f.tracks) { const x = sim.aspect(t, f.spot[0]); if (x !== null && x < a) a = x; }
      if (this.shows[i] !== a) { this.shows[i] = a; lamps.setColorAt(i, this.colours[a]!); changed = true; }
    });
    if (changed && lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  }
  /** What each signal shows now (0 red, 1 yellow, 2 green), in the order of `sigs`: for checks. */
  showing(): number[] { return [...this.shows]; }
  /** The lamps' mesh: for checks. */
  get lamps(): THREE.InstancedMesh | null { return this.pieces[2]?.mesh ?? null; }

  private show(bought: boolean): void { this.fresh.visible = bought || this.ghost; this.old.visible = !bought && !this.ghost; }
}
