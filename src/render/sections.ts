// The line between stations on the map (docs/briefs/line-between-stations.md): a section whose line speed has been
// raised shows its renewed track, fresh pale ballast (--map-ballast-new) along it under every track, and a line-speed
// board at each end reading its speed, so what was bought shows. While its card's step is chosen they stand as a ghost.
// A tap on the line between two stations (one the camera's picker found nothing at) opens its section's card. Only the
// view: it reads the sim's sections and changes nothing. Fetched just after the start, so it isn't in the script before
// the first frame; it looks at the sim a few times a second, not every frame.
// An electrified section (one the real line runs without wires, wired since) shows masts outside its outer tracks
// every MAST metres with an arm over them and a contact wire over each track, as the wired lines' (src/render/world.ts),
// rising into place when bought; its card's stage ghosts them.
// A flying junction shows as a flyover: a concrete deck that leaves the line on one side, climbs over its tracks at the
// junction on piers and comes down on the other, rising into place when bought; its card's stage ghosts it. The
// trains' own tracks stay drawn at grade (the flyover's own tracks in the sim are handed on).
import * as THREE from 'three';
import { newFrame, type Network } from '../sim/network.ts';
import type { Sim } from '../sim/sim.ts';
import { PAL, MAT } from './scene.ts';
import { GHOST, riseBy, settle } from './stations.ts';

/** Points along a section every STEP metres; the ballast reaches EDGE beyond its outer tracks; boards stand INSET in
 * from its ends and OUT beyond its outer track. A tap within TAP_PX of the line on screen is on it. */
const STEP = 20, EDGE = 2.2, INSET = 40, OUT = 3.4, TAP_PX = 22;
/** Masts every MAST metres on the same grid as the wired lines' (30 m on from a line's start), MAST_OUT outside the
 * outer track, the arm ARM long; the contact wire WIRE_Y up, drawn in WIRE_STEP pieces. */
const MAST = 55, MAST_OUT = 3.2, ARM = 3, WIRE_Y = 5.4, WIRE_STEP = 10;
/** A flyover runs FLY_LEN metres either side of its junction, FLY_OUT beyond the outer tracks at its ends, its deck
 * FLY_H up over the tracks (climbing over FLY_RAMP metres), FLY_W wide, in FLY_STEP pieces. */
const FLY_LEN = 260, FLY_OUT = 8, FLY_H = 7.5, FLY_RAMP = 150, FLY_W = 6, FLY_STEP = 20;

function token(name: string, fallback: string): THREE.Color {
  const v = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).getPropertyValue(`--map-${name}`).trim() : '';
  return new THREE.Color(v || fallback);
}
/** A line-speed board's face, as the lineside's: the token white, the number in the token ink. */
const faces = new Map<number, THREE.Material>();
function face(mph: number): THREE.Material {
  let m = faces.get(mph); if (m) return m;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 104;
  const x = cv.getContext('2d');
  if (x) {
    const ink = '#' + PAL['board-ink'].getHexString();
    x.fillStyle = ink; x.fillRect(0, 0, 128, 104);
    x.fillStyle = '#' + PAL.board.getHexString(); x.fillRect(6, 6, 116, 92);
    x.fillStyle = ink; x.font = 'bold 76px Arial, Helvetica, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(String(mph), 64, 56);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  m = new THREE.MeshLambertMaterial({ map: t }); faces.set(mph, m);
  return m;
}

interface Drawn { id: string; group: THREE.Group; pts: THREE.Vector3[]; mph: number; ghost: boolean; box: THREE.Box3 }

export class SectionLayer {
  private net: Network; private sim: () => Sim; private camera: THREE.Camera; private canvas: HTMLCanvasElement;
  private root = new THREE.Group(); private drawn = new Map<string, Drawn>(); private key = '';
  private ballast: THREE.MeshLambertMaterial; private ghostOf: string | null = null;
  private v = new THREE.Vector3();
  /** Each electrified section's masts and wires (or its ghost, under the key `ghost`), and how far each is through
   * rising into place. */
  private wires = new Map<string, THREE.Group>(); private wireKey = ''; private wireGhost: string | null = null; private flyGhost: string | null = null;
  private rising = new Map<string, number>(); private wireMat: THREE.LineBasicMaterial; private last = 0;
  private timer: ReturnType<typeof setInterval>;
  constructor(scene: THREE.Scene, net: Network, sim: () => Sim, camera: THREE.Camera, canvas: HTMLCanvasElement) {
    this.net = net; this.sim = sim; this.camera = camera; this.canvas = canvas;
    this.ballast = new THREE.MeshLambertMaterial({ color: token('ballast-new', '#b9ad9b'), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.wireMat = new THREE.LineBasicMaterial({ color: token('wire', '#8c93a3') });
    this.root.name = 'sections'; scene.add(this.root);
    this.sync(); this.timer = setInterval(() => this.sync(), 250);
  }
  /** Stop looking at the sim (for the checks, which make a layer of their own). */
  stop(): void { clearInterval(this.timer); }
  /** How many sections show their renewed track, and how many stand as a ghost (for the checks). */
  stats(): { shown: number; ghosts: number } { let shown = 0, ghosts = 0; for (const d of this.drawn.values()) if (d.group.visible) { if (d.ghost) ghosts++; else shown++; } return { shown, ghosts }; }
  /** Ghost a section's next line speed step (null: none). Returns the box round it, to frame. */
  preview(id: string | null): THREE.Box3 | null {
    this.ghostOf = id; this.key = ''; this.sync();
    return id ? this.drawn.get(id)?.box ?? null : null;
  }
  /** The box round a section's line, to frame. */
  boxOf(id: string): THREE.Box3 | null { this.sync(); return this.ensure(id, this.sim().sectionAt(id)?.mph ?? 75)?.box ?? null; }
  /** The section of line a tap at client (x, y) is on, or null. */
  tap(x: number, y: number): string | null {
    const r = this.canvas.getBoundingClientRect(), px = x - r.left, py = y - r.top, W = r.width, H = r.height, sim = this.sim();
    let best: string | null = null, bd = TAP_PX;
    for (const p of sim.P.all) {
      if (p.kind !== 'section') continue;
      const pts = this.line(p.id); let ax = NaN, ay = NaN;
      for (const q of pts) {
        this.v.copy(q).project(this.camera);
        const bx = (this.v.x + 1) / 2 * W, by = (1 - this.v.y) / 2 * H, on = this.v.z <= 1;
        if (on && Number.isFinite(ax)) {
          const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, u = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0, d = Math.hypot(px - ax - u * dx, py - ay - u * dy);
          if (d < bd) { bd = d; best = p.id; }
        }
        ax = on ? bx : NaN; ay = by;
      }
    }
    return best;
  }

  /** Ghost a section's electrification (null: none). Returns the box round it, to frame. */
  previewWires(id: string | null): THREE.Box3 | null {
    this.wireGhost = id; this.syncWires();
    const g = id ? this.wires.get('ghost') : null;
    return g ? new THREE.Box3().setFromObject(g) : null;
  }
  /** Ghost a junction's flying junction (null: none). Returns the box round it, to frame. */
  previewFlyover(id: string | null): THREE.Box3 | null {
    this.flyGhost = id; this.syncWires();
    const g = id ? this.wires.get('fly-ghost') : null;
    return g ? new THREE.Box3().setFromObject(g) : null;
  }
  /** The box round a junction's flyover, built or not, to frame. */
  flyoverBox(id: string): THREE.Box3 | null { const g = this.wires.get(id) ?? this.flyoverFor(id, true); const b = g ? new THREE.Box3().setFromObject(g) : null; if (g && !this.wires.has(id)) this.root.remove(g); return b; }
  /** How many junctions show a bought flyover (for the checks). */
  flyovers(): number { let n = 0; for (const k of this.wires.keys()) if (k.startsWith('junction:')) n++; return n; }
  /** How many sections show bought masts and wires (for the checks). */
  wired(): number { let n = 0; for (const [k, g] of this.wires) if (k.startsWith('section:') && g.visible) n++; return n; }

  /** Bring the map up to date with the sections' wires: a group for each electrified section (rising into place if
   * it's new since the last look) and the ghost. */
  private syncWires(): void {
    const sim = this.sim(), ids = sim.secs.filter(x => sim.sectionAt(x.id)!.wiresBought).map(x => x.id);
    const flown = this.net.junctions.filter(j => sim.flown(j.id)).map(j => `junction:${j.id}`);
    const key = ids.join() + '|' + flown.join() + '|' + this.wireGhost + '|' + this.flyGhost;
    if (key === this.wireKey) return;
    const first = this.wireKey === ''; this.wireKey = key;
    for (const [k, g] of this.wires) if (k === 'ghost' || k === 'fly-ghost' || (!ids.includes(k) && !flown.includes(k))) { this.root.remove(g); this.wires.delete(k); }
    for (const id of [...ids, ...flown]) if (!this.wires.has(id)) {
      const g = id.startsWith('junction:') ? this.flyoverFor(id, false) : this.mastsFor(id, false);
      if (g) { this.wires.set(id, g); if (!first) { this.rising.set(id, 0); g.scale.y = 0.01; } }
    }
    const gh = this.wireGhost, x = gh ? sim.sectionAt(gh) : null;
    if (gh && x && !x.wired) { const g = this.mastsFor(gh, true); if (g) this.wires.set('ghost', g); }
    const fg = this.flyGhost;
    if (fg && !sim.flown(fg.slice('junction:'.length))) { const g = this.flyoverFor(fg, true); if (g) this.wires.set('fly-ghost', g); }
    if (this.rising.size) { this.last = performance.now(); requestAnimationFrame(() => this.rise()); }
  }
  /** One frame of the newly electrified sections' masts rising into place. */
  private rise(): void {
    const now = performance.now(), dt = Math.min(0.5, (now - this.last) / 1000); this.last = now;
    for (const [k, r] of this.rising) {
      const n = riseBy(r, dt), g = this.wires.get(k);
      if (g) g.scale.y = Math.max(0.01, settle(n));
      if (n >= 1) this.rising.delete(k); else this.rising.set(k, n);
    }
    if (this.rising.size) requestAnimationFrame(() => this.rise());
  }
  /** A junction's flyover: a deck from beyond the outer tracks on the low side, over them at the junction, down beyond
   * them on the high side, on piers where it's up, as one group, or as a ghost. Rising scales it up from the ground. */
  private flyoverFor(id: string, ghost: boolean): THREE.Group | null {
    const net = this.net, jid = id.slice('junction:'.length), j = net.junctions.find(q => q.id === jid); if (!j) return null;
    const c = j.corridor, tracks = net.tracks.filter(t => t.corridor === c);
    const across = (s: number): [number, number] => {
      let lo = Infinity, hi = -Infinity;
      for (const t of tracks) { const [e0, e1] = net.extent(t.id); if (s < e0 || s > e1) continue; const o = net.offsetAt(t.id, s); lo = Math.min(lo, o); hi = Math.max(hi, o); }
      return lo > hi ? [-4, 4] : [lo, hi];
    };
    const [lo0] = across(j.s - FLY_LEN), [, hi1] = across(j.s + FLY_LEN), n = Math.ceil(2 * FLY_LEN / FLY_STEP), pts: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) {
      const u = -FLY_LEN + 2 * FLY_LEN * k / n, f = k / n, v = (lo0 - FLY_OUT) * (1 - f) + (hi1 + FLY_OUT) * f;
      const y = FLY_H * Math.max(0, Math.min(1, (FLY_LEN - Math.abs(u)) / FLY_RAMP)), p = net.place(c, j.s + u, v);
      pts.push(new THREE.Vector3(p.x, y + 0.5, p.z));
    }
    const group = new THREE.Group(), deckMat = ghost ? GHOST : MAT.concrete, m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    const deck = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), deckMat, n), piers = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.7, 1, 8, 1, true), deckMat, n + 1);
    const dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(), z = new THREE.Vector3(), basis = new THREE.Matrix4();
    let np = 0;
    for (let k = 0; k < n; k++) {
      const a = pts[k]!, b = pts[k + 1]!; dir.subVectors(b, a); const len = dir.length(); dir.normalize();
      side.crossVectors(up, dir).normalize(); z.crossVectors(dir, side).normalize();
      basis.makeBasis(dir, z, side); q.setFromRotationMatrix(basis);
      deck.setMatrixAt(k, m4.compose(this.v.addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(len + 0.2, 1, FLY_W)));
    }
    for (const p of pts) if (p.y > 3) { piers.setMatrixAt(np++, m4.compose(this.v.set(p.x, (p.y - 0.5) / 2, p.z), q.identity(), new THREE.Vector3(1, p.y - 0.5, 1))); }
    piers.count = np; deck.computeBoundingSphere(); piers.computeBoundingSphere();
    deck.castShadow = piers.castShadow = !ghost; deck.receiveShadow = true;
    group.add(deck, piers); this.root.add(group);
    return group;
  }
  /** A section's masts, arms and contact wires where its line has none, as one group (instanced), or as a ghost. */
  private mastsFor(id: string, ghost: boolean): THREE.Group | null {
    const net = this.net, x = this.sim().secs.find(q => q.id === id); if (!x) return null;
    const line = net.lineOf(x.corridor), tracks = net.tracks.filter(t => net.onLine(t.corridor, line));
    const spots: [number, number, number][] = [], wire: number[] = [], box = new THREE.Box3();
    const pa = newFrame(), pb = newFrame();
    for (let s = line.start + 30 + Math.ceil((x.s0 - line.start - 30) / MAST) * MAST; s <= x.s1; s += MAST) {
      let lo = Infinity, hi = -Infinity;
      for (const t of tracks) { if (net.wired(t.corridor, s)) continue; const [e0, e1] = net.extent(t.id); if (s < e0 || s > e1) continue; const o = net.offsetAt(t.id, s); lo = Math.min(lo, o); hi = Math.max(hi, o); }
      if (lo > hi) continue;
      spots.push([s, lo - MAST_OUT, 1], [s, hi + MAST_OUT, -1]);
    }
    for (const t of tracks) {
      if (t.corridor !== x.corridor) continue;
      const [e0, e1] = net.extent(t.id), a = Math.max(e0, x.s0), b = Math.min(e1, x.s1);
      for (let s = a; s < b; s += WIRE_STEP) { if (net.wired(t.corridor, s)) continue; net.trackAt(t.id, s, pa); net.trackAt(t.id, Math.min(b, s + WIRE_STEP), pb); wire.push(pa.x, WIRE_Y, pa.z, pb.x, WIRE_Y, pb.z); }
    }
    if (!spots.length && !wire.length) return null;
    const group = new THREE.Group(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.25, 7.5, 6, 1, true), ghost ? GHOST : MAT.steel, Math.max(1, spots.length));
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.3, 6), ghost ? GHOST : MAT.steel, Math.max(1, spots.length));
    spots.forEach(([s, off, inward], i) => {
      const p = net.place(line.id, s, off); e.set(0, Math.atan2(-p.dz, p.dx), 0); q.setFromEuler(e);
      poles.setMatrixAt(i, m4.compose(this.v.set(p.x, 3.75, p.z), q, one));
      const pa2 = net.place(line.id, s, off + inward * ARM); arms.setMatrixAt(i, m4.compose(this.v.set(pa2.x, 6.8, pa2.z), q, one));
      box.expandByPoint(this.v.set(p.x, 0, p.z)).expandByPoint(this.v.set(p.x, 7.5, p.z));
    });
    poles.count = arms.count = spots.length;
    poles.computeBoundingSphere(); arms.computeBoundingSphere();
    poles.castShadow = arms.castShadow = !ghost;
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(wire), 3));
    group.add(poles, arms, new THREE.LineSegments(wg, ghost ? GHOST : this.wireMat));
    group.userData['box'] = box;
    this.root.add(group);
    return group;
  }

  /** Bring the map up to date with the sections' line speeds (and the ghost), when either changed. */
  private sync(): void {
    this.syncWires();
    const sim = this.sim(), key = sim.secs.map(x => sim.sectionAt(x.id)!.level).join() + '|' + this.ghostOf;
    if (key === this.key) return;
    this.key = key;
    for (const d of this.drawn.values()) d.group.visible = false;
    for (const x of sim.secs) {
      const at = sim.sectionAt(x.id)!, ghost = x.id === this.ghostOf && at.price !== undefined;
      if (!at.level && !ghost) continue;
      const mph = ghost ? Math.min(90, at.mph + 15) : at.mph;
      let d = this.drawn.get(x.id);
      if (d && (d.mph !== mph || d.ghost !== ghost)) { this.root.remove(d.group); this.drawn.delete(x.id); d = undefined; }
      d = d ?? this.ensure(x.id, mph, ghost) ?? undefined; if (d) d.group.visible = true;
    }
  }
  /** Points along a section's line, on its corridor, at the middle of its tracks. */
  private line(id: string): THREE.Vector3[] {
    const x = this.sim().secs.find(q => q.id === id); if (!x) return [];
    const n = Math.max(2, Math.ceil((x.s1 - x.s0) / 200)), out: THREE.Vector3[] = [];
    for (let k = 0; k <= n; k++) { const f = this.net.place(x.corridor, x.s0 + (x.s1 - x.s0) * k / n); out.push(new THREE.Vector3(f.x, 0.5, f.z)); }
    return out;
  }
  /** The renewed track of a section as drawn, made the first time it's needed (at this speed, ghosted or not). */
  private ensure(id: string, mph: number, ghost = false): Drawn | null {
    const had = this.drawn.get(id); if (had) return had;
    const x = this.sim().secs.find(q => q.id === id); if (!x) return null;
    const net = this.net, tracks = net.tracks.filter(t => t.corridor === x.corridor);
    const group = new THREE.Group(), pos: number[] = [], idx: number[] = [], box = new THREE.Box3();
    // the ballast: a strip from beyond the outermost track one side to beyond it the other, every STEP metres
    const n = Math.max(2, Math.ceil((x.s1 - x.s0) / STEP)), across = (s: number): [number, number] => {
      let lo = Infinity, hi = -Infinity;
      for (const t of tracks) { const [e0, e1] = net.extent(t.id); if (s < e0 || s > e1) continue; const o = net.offsetAt(t.id, s); lo = Math.min(lo, o); hi = Math.max(hi, o); }
      return lo > hi ? [-3, 3] : [lo - EDGE, hi + EDGE];
    };
    for (let k = 0; k <= n; k++) {
      const s = x.s0 + (x.s1 - x.s0) * k / n, [a, b] = across(s), p = net.place(x.corridor, s, a), q = net.place(x.corridor, s, b);
      pos.push(p.x, 0.02, p.z, q.x, 0.02, q.z); box.expandByPoint(this.v.set(p.x, 0, p.z)).expandByPoint(this.v.set(q.x, 6, q.z));
      if (k) { const i = (k - 1) * 2; idx.push(i, i + 2, i + 1, i + 1, i + 2, i + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const strip = new THREE.Mesh(geo, ghost ? GHOST : this.ballast); strip.receiveShadow = true; group.add(strip);
    // a board at each end, beyond the outer track, facing the trains coming into the section
    const legs = new THREE.BoxGeometry(0.1, 2.4, 0.1), plate = new THREE.BoxGeometry(0.12, 1.6, 2), back = MAT.steel;
    for (const [s, dir] of [[x.s0 + INSET, 1], [x.s1 - INSET, -1]] as const) {
      const [a, b] = across(s), f = net.place(x.corridor, s, dir > 0 ? b + OUT : a - OUT), yaw = Math.atan2(-f.dz, f.dx) + (dir > 0 ? 0 : Math.PI);
      const post = new THREE.Mesh(legs, ghost ? GHOST : back); post.position.set(f.x, 1.2, f.z); group.add(post);
      const face1 = ghost ? GHOST : face(mph), sign = new THREE.Mesh(plate, ghost ? GHOST : [face1, back, back, back, back, back]);
      sign.position.set(f.x, 3.2, f.z); sign.rotation.y = yaw; group.add(sign);
      if (!ghost) { post.castShadow = sign.castShadow = true; }
    }
    group.visible = false; this.root.add(group);
    const d: Drawn = { id, group, pts: this.line(id), mph, ghost, box };
    this.drawn.set(id, d);
    return d;
  }
}
