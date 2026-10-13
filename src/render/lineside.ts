// The lineside work the faster timetable buys: colour-light signals and line-speed boards reading 90, where boards
// reading 75 stood before. At the network's signal sites (src/sim/network.ts: one every 440 m along the line, clear of
// the stations): a signal outside the outer track on either side, facing the trains that run that side, and at every
// other site a board beside each. Each signal shows what the sim's blocks say for the lines it faces (Sim.aspect): red
// where the block beyond holds a train, yellow where the one after does, green when both are clear, refreshed on a
// timer. All instanced. Choosing the card ghosts them, buying it makes them rise into place, as a station's parts do;
// nothing here changes the game.
import * as THREE from 'three';
import { MAT, PAL } from './scene.ts';
import { GHOST, riseBy, settle } from './stations.ts';
import { yawFor } from './world.ts';
import { SIGNAL_CLEAR, SIGNAL_FIRST, SIGNAL_SITE, SPINE, type Network } from '../sim/network.ts';
import type { Sim } from '../sim/sim.ts';

const SITE = SIGNAL_SITE;    // metres between signals: eight mast spans, so each stands halfway between two masts
const FIRST = SIGNAL_FIRST;  // the first site, halfway between the first two masts (world.ts puts them at 30, 85, ...)
const CLEAR = SIGNAL_CLEAR;  // no signal or board within this of a station: its kit fills that stretch
const ASPECT_EVERY = 0.5;    // real seconds between refreshing what the signals show
const OUT = 2.2;             // how far outside the outer track a post stands (the masts are at 3.2)
const BOARD_AHEAD = 12;      // a board stands this far on from its site's signals

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

/** A place along the line with its signals, and whether it has boards too. */
interface Site { s: number; x: number; z: number; board: boolean }
/** Where a signal or board stands (s along the line, off across it) and which way it faces: +1 towards Manchester,
 * at the trains coming from there, -1 the other way. */
type Spot = [s: number, off: number, face: 1 | -1];

export class Lineside {
  /** The signals and the 90 boards: shown once bought, and ghosted while the card is chosen. */
  readonly fresh = new THREE.Group();
  /** The 75 boards they replace. */
  readonly old = new THREE.Group();
  readonly sites: Site[] = [];
  /** How far through rising into place the new work is (1 once it stands). */
  rise = 1;
  ghost = false;
  private shown: boolean | null = null;
  private readonly pt = new THREE.Vector3();
  private readonly net: Network;
  /** Each signal's lamp, and the tracks whose trains it faces at its site (the lines running its way). */
  private lamps: THREE.InstancedMesh | null = null;
  private faces: { s: number; tracks: string[] }[] = [];
  private shows: number[] = [];
  private since = Infinity;
  private readonly colours = [PAL['signal-red'], PAL['signal-yellow'], PAL['signal-green']];

  constructor(scene: THREE.Scene, net: Network) {
    this.net = net;
    const c = net.spine;
    // across the line, the outermost tracks running at s, or null where there are none
    const span = (s: number): [number, number] | null => {
      let lo = Infinity, hi = -Infinity;
      for (const t of net.tracks) { const [e0, e1] = net.extent(t.id); if (s < e0 || s > e1) continue; const o = net.offsetAt(t.id, s); lo = Math.min(lo, o); hi = Math.max(hi, o); }
      return lo > hi ? null : [lo, hi];
    };
    const clear = (s: number) => net.stations.every(st => Math.abs(st.s - s) > CLEAR);
    const sig: Spot[] = [], board: Spot[] = [];
    // the network's signal sites along the spine (the sim's block boundaries), the kth from the first
    const sites = [...net.spineOf].flatMap(id => net.signals[id] ?? []).filter(s => s < c.length);
    for (const s of sites) {
      // a site only where it's a block boundary on a track there (none too near a track's end, so no block is short)
      const k = Math.round((s - FIRST) / SITE), w = span(s), here = net.tracks.filter(t => net.spineOf.has(t.corridor) && net.blocks(t.id).at.some(b => Math.abs(b - s) < 0.5));
      if (!w || !here.length) continue;
      // the down lines (towards Manchester) are on the low side, so their signals face back down the line, at the trains
      // running towards Manchester; the high side's face the trains coming back
      sig.push([s, w[0] - OUT, -1], [s, w[1] + OUT, 1]);
      for (const way of [1, -1] as const) this.faces.push({ s, tracks: here.filter(t => net.way(t.id) === way).map(t => t.id) });
      const sb = s + BOARD_AHEAD, wb = k % 2 === 0 && clear(sb) ? span(sb) : null;
      if (wb) board.push([sb, wb[0] - OUT, -1], [sb, wb[1] + OUT, 1]);
      const m = net.place(SPINE, s); this.sites.push({ s, x: m.x, z: m.z, board: !!wb });
    }

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    // one instanced mesh of a piece at every spot; local +x is the face, turned to the trains it's for; ahead: how far
    // towards them the piece stands from the spot
    const place = (spots: Spot[], geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], y: number, ahead: number, into: THREE.Group): THREE.InstancedMesh => {
      const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length)); inst.count = spots.length;
      spots.forEach(([s, off, face], i) => {
        const p = net.place(SPINE, s + face * ahead, off);
        e.set(0, yawFor(p) + (face < 0 ? Math.PI : 0), 0); q.setFromEuler(e); v.set(p.x, y, p.z); m4.compose(v, q, one); inst.setMatrixAt(i, m4);
      });
      into.add(inst);
      return inst;
    };
    // a signal: a post, a head a little larger than life so it reads on the map, and its green lamp on the face
    place(sig, new THREE.CylinderGeometry(0.14, 0.18, 4.6, 6), MAT.steel, 2.3, 0, this.fresh);
    place(sig, new THREE.BoxGeometry(0.6, 2.2, 1.1), new THREE.MeshLambertMaterial({ color: PAL.signal }), 4.9, 0, this.fresh);
    this.lamps = place(sig, new THREE.SphereGeometry(0.42, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), 4.4, 0.35, this.fresh);
    this.shows = sig.map(() => -1);
    for (let i = 0; i < sig.length; i++) this.lamps.setColorAt(i, this.colours[2]!);
    // a board: two legs and a plate carrying the number on its face
    const legs = merge(new THREE.BoxGeometry(0.1, 2.4, 0.1).translate(0, 0, 0.7).toNonIndexed(), new THREE.BoxGeometry(0.1, 2.4, 0.1).translate(0, 0, -0.7).toNonIndexed());
    const plate = new THREE.BoxGeometry(0.12, 1.6, 2), back = MAT.steel;
    for (const [text, into] of [['90', this.fresh], ['75', this.old]] as const) {
      place(board, legs, MAT.steel, 1.2, 0, into);
      place(board, plate, [boardFace(text), back, back, back, back, back], 3.2, 0, into);
    }
    this.fresh.visible = false;
    scene.add(this.fresh, this.old);
  }

  /** Ghost the new work on the map while its card is chosen (on), or stop. Returns how many groups of parts it ghosts. */
  preview(on: boolean, bought: boolean): number {
    on = on && !bought;
    if (this.ghost !== on) {
      this.ghost = on;
      this.fresh.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        if (on) { o.userData['own'] = o.material; o.material = GHOST; o.castShadow = false; }
        else if (o.userData['own']) { o.material = o.userData['own']; o.castShadow = true; }
      });
    }
    this.show(bought);
    return on ? 1 : 0;
  }

  /** Follow whether the faster timetable is bought: once it is, the new work rises into place and the 75s go; and while
   * the signals show, what each shows. dt: real seconds. */
  sync(bought: boolean, dt: number, sim?: Sim): void {
    if (this.shown !== bought) {
      if (this.shown === false && bought) { this.rise = 0; this.preview(false, bought); }
      this.shown = bought; this.show(bought);
    }
    if (this.rise < 1) { this.rise = riseBy(this.rise, dt); this.fresh.scale.y = Math.max(0.01, settle(this.rise)); }
    this.since += dt;
    if (sim && this.lamps && this.fresh.visible && this.since >= ASPECT_EVERY) { this.since = 0; this.aspects(sim, this.lamps); }
  }

  /** The box round the site nearest (x, z), its signals and boards and a little line either side, to frame; a site with
   * boards shows both halves of the work, so it wins a near tie. */
  siteBox(x: number, z: number, into: THREE.Box3): THREE.Box3 | null {
    let best: Site | null = null, d = Infinity;
    for (const st of this.sites) { const dd = Math.hypot(st.x - x, st.z - z) - (st.board ? 300 : 0); if (dd < d) { d = dd; best = st; } }
    if (!best) return null;
    const a = this.net.place(SPINE, best.s - 4, -3), b = this.net.place(SPINE, best.s + 16, 17);
    return into.makeEmpty().expandByPoint(this.pt.set(a.x, 0, a.z)).expandByPoint(this.pt.set(b.x, 6, b.z));
  }

  /** Each signal shows the most restrictive of the lines it faces (a site with no block there for them: green). */
  private aspects(sim: Sim, lamps: THREE.InstancedMesh): void {
    let changed = false;
    this.faces.forEach((f, i) => {
      let a = 2; for (const t of f.tracks) { const x = sim.aspect(t, f.s); if (x !== null && x < a) a = x; }
      if (this.shows[i] !== a) { this.shows[i] = a; lamps.setColorAt(i, this.colours[a]!); changed = true; }
    });
    if (changed && lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  }
  /** What each signal shows now (0 red, 1 yellow, 2 green), in the order they stand: for checks. */
  showing(): number[] { return [...this.shows]; }

  private show(bought: boolean): void { this.fresh.visible = bought || this.ghost; this.old.visible = !bought && !this.ghost; }
}
