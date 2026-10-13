// The line between stations on the map (docs/briefs/line-between-stations.md): a section whose line speed has been
// raised shows its renewed track, fresh pale ballast (--map-ballast-new) along it under every track, and a line-speed
// board at each end reading its speed, so what was bought shows. While its card's step is chosen they stand as a ghost.
// A tap on the line between two stations (one the camera's picker found nothing at) opens its section's card. Only the
// view: it reads the sim's sections and changes nothing. Fetched just after the start, so it isn't in the script before
// the first frame; it looks at the sim a few times a second, not every frame.
import * as THREE from 'three';
import type { Network } from '../sim/network.ts';
import type { Sim } from '../sim/sim.ts';
import { PAL, MAT } from './scene.ts';
import { GHOST } from './stations.ts';

/** Points along a section every STEP metres; the ballast reaches EDGE beyond its outer tracks; boards stand INSET in
 * from its ends and OUT beyond its outer track. A tap within TAP_PX of the line on screen is on it. */
const STEP = 20, EDGE = 2.2, INSET = 40, OUT = 3.4, TAP_PX = 22;

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
  constructor(scene: THREE.Scene, net: Network, sim: () => Sim, camera: THREE.Camera, canvas: HTMLCanvasElement) {
    this.net = net; this.sim = sim; this.camera = camera; this.canvas = canvas;
    this.ballast = new THREE.MeshLambertMaterial({ color: token('ballast-new', '#b9ad9b'), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.root.name = 'sections'; scene.add(this.root);
    this.sync(); setInterval(() => this.sync(), 250);
  }
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

  /** Bring the map up to date with the sections' line speeds (and the ghost), when either changed. */
  private sync(): void {
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
