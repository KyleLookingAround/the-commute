// Bus links: a bus link's stop (the kit part `buslink`), or a bus station with its bays under a roof garden (Stockport
// Interchange), and the town's buses pulling in, standing and pulling away, in their own livery. The kit part is
// built here and noted per station; LinkLayer reads only whether each station's link is built and the sim's clock, so
// the buses come and go on a timetable of their own (busier in the peaks), never changing the game. Instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, PAL, box } from './scene.ts';
import { demandCurve, type Sim } from '../sim/sim.ts';

/** The kit part: the head of the first bay at (u, v), `bays` of them (1 if not given) back along `back` (a direction in
 * (u, v), +u if not given), shelters on the `kerb` side (+1 to the left looking along `back`); `hall`, a bus station's
 * building beside them [u0, u1, v0, v1, height] with a garden on its roof. */
export interface LinkPart { u: number; v: number; back?: [number, number]; kerb?: 1 | -1; bays?: number; hall?: [number, number, number, number, number]; note?: string }

const LEN = 12, BAY = 16;     // a single-deck bus, and the length of a bay, metres
const MAX_BUSES = 24;
const RUN = 90;               // how far a bus drives in from and out to, past the bays
const lam = (c: THREE.Color) => new THREE.MeshLambertMaterial({ color: c });
const B = (w: number, h: number, d: number, x: number, y: number, z: number) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
// a bus pointing along +z, its real width (2.5 m) across: body, wheels, and the glass as its own mesh
const W = 2.5 / 3.1;
const BODY = mergeGeometries([B(3.1, 2.4, LEN, 0, 1.75, 0), B(3.2, 0.7, 1.2, 0, 0.45, LEN / 2 - 2.2), B(3.2, 0.7, 1.2, 0, 0.45, -LEN / 2 + 2.6)]).scale(W, 1, 1);
const BAND = B(3.16, 0.5, LEN - 0.6, 0, 1.2, 0).scale(W, 1, 1);
const GLASS = mergeGeometries([B(3.18, 0.9, LEN - 2.4, 0, 2.55, -0.4), B(2.7, 1.3, 0.1, 0, 2.35, LEN / 2 + 0.01)]).scale(W, 1, 1);

/** A link as built: its group (whose frame turns kit (u, v) into the world) and its bays' heads and direction there. */
interface Link { gp: THREE.Group; p: LinkPart; bu: number; bv: number }
const links = new WeakMap<object, Link>();

/** Build a link into a station's group: each bay's tarmac, kerb and shelter, and a bus station's hall. `owner` is the
 * station's Live, which LinkLayer finds its link by. */
export function buildLink(gp: THREE.Group, p: LinkPart, owner: object): void {
  const [bu0, bv0] = p.back ?? [1, 0], bl = Math.hypot(bu0, bv0) || 1, bu = bu0 / bl, bv = bv0 / bl;
  const k = p.kerb ?? 1, su = -bv * k, sv = bu * k, yaw = Math.atan2(bu, bv), n = p.bays ?? 1;
  const piece = (w: number, h: number, d: number, mat: THREE.Material, along: number, across: number, y0: number) => {
    const m = box(gp, w, h, d, mat, p.u + bu * along + su * across, y0, p.v + bv * along + sv * across); m.rotation.y = yaw; return m;
  };
  const len = n * BAY;
  piece(4.4, 0.06, len + 4, MAT.road, len / 2 - BAY / 2, 0, 0.03);
  piece(0.4, 0.2, len + 4, MAT.concrete, len / 2 - BAY / 2, 2.4, 0.1);
  piece(3, 0.06, len + 4, MAT.concrete, len / 2 - BAY / 2, 4, 0.04);
  for (let b = 0; b < n; b++) {
    // a shelter on the pavement at each bay, and its flag
    piece(2.4, 0.15, 4.5, MAT.canopy, b * BAY, 4, 2.7);
    piece(2.4, 2.5, 0.08, MAT.glass, b * BAY, 5, 1.35).rotation.y = yaw + Math.PI / 2;
    piece(0.12, 3.2, 0.12, MAT.steel, b * BAY + LEN / 2, 2.9, 1.6);
    piece(0.9, 0.9, 0.1, lam(PAL['link-band']), b * BAY + LEN / 2, 2.9, 3).rotation.y = yaw + Math.PI / 2;
  }
  if (p.hall) {
    // a bus station's hall: brick and glass under a deep roof, the park on top, its edge planted
    const [u0, u1, v0, v1, h] = p.hall, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, w = u1 - u0, d = v1 - v0;
    box(gp, w, h - 1.2, d, MAT.brick, cu, (h - 1.2) / 2, cv);
    box(gp, w + 0.2, 2.2, d + 0.2, MAT.glass, cu, 2, cv);
    box(gp, w + 2, 1.2, d + 2, MAT.concrete, cu, h - 0.6, cv);
    box(gp, w, 0.3, d, MAT.park, cu, h + 0.15, cv);
    for (let t = 0; t < 7; t++) box(gp, 3, 3, 3, lam(PAL['link-trees']), u0 + 6 + (w - 12) * ((t * 0.37) % 1), h + 1.8, v0 + 5 + (d - 10) * ((t * 0.61) % 1));
  }
  links.set(owner, { gp, p, bu, bv });
}

const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), turn = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), v3 = new THREE.Vector3();
/** A cosmetic number in [0, 1) from an integer: when each bay's bus is due. */
const hash = (n: number) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; };

/** The town's buses at every built bus link. */
export class LinkLayer {
  /** How many buses are drawn. */
  count = 0;
  private links: (Link | null)[];
  private readonly body: THREE.InstancedMesh; private readonly band: THREE.InstancedMesh; private readonly glass: THREE.InstancedMesh;
  /** A bus's parts (made once, so a frame makes no arrays). */
  private readonly parts: THREE.InstancedMesh[];
  constructor(scene: THREE.Scene, private built: { live: object }[]) {
    this.links = built.map(b => links.get(b.live) ?? null);
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => { const m = new THREE.InstancedMesh(geo, mat, MAX_BUSES); m.count = 0; m.frustumCulled = false; scene.add(m); return m; };
    this.body = mk(BODY, lam(PAL['link-bus'])); this.band = mk(BAND, lam(PAL['link-band'])); this.glass = mk(GLASS, MAT.glass);
    this.parts = [this.body, this.band, this.glass];
    this.body.castShadow = true;
  }
  /** The links again, once the lines out's stations are built (after the first frame). */
  refit(): void { this.links = this.built.map(b => links.get(b.live) ?? null); }
  /** Each frame: where every built link's buses are, from the sim's clock. A bay sees a bus every `every` sim seconds
   * (twelve minutes by the clock, five in the peaks): it drives in along the bays, stands a while, and pulls away. */
  sync(sim: Sim): void {
    const g = sim.g; let n = 0;
    for (let i = 0; i < this.links.length; i++) {
      const L = this.links[i];
      if (!L || !g.owned[i] || !g.ups[i]?.bus) continue;
      const bays = L.p.bays ?? 1, busy = Math.min(1, demandCurve(sim.hour()) / 1.1), every = 120 - 70 * busy;
      for (let b = 0; b < bays && n < MAX_BUSES; b++) {
        // through its cycle: driving in (0-0.15), standing (to 0.75), pulling out (to 0.9), then gone
        const f = ((g.t / every) + hash(i * 97 + b)) % 1; if (f > 0.9) continue;
        const stand = b * BAY + LEN / 2;
        const along = f < 0.15 ? stand + RUN * (1 - f / 0.15) ** 2 : f < 0.75 ? stand : stand - RUN * ((f - 0.75) / 0.15) ** 2;
        // the bus faces the way it drives, against `back` (it comes in from the back of the bays)
        const u = L.p.u + L.bu * along, v = L.p.v + L.bv * along;
        v3.set(u, 0, v); L.gp.localToWorld(v3);
        L.gp.getWorldQuaternion(qt); qt.multiply(turn.setFromAxisAngle(up, Math.atan2(-L.bu, -L.bv)));
        pos.copy(v3); pos.y += 0.1; m4.compose(pos, qt, one);
        this.body.setMatrixAt(n, m4); this.band.setMatrixAt(n, m4); this.glass.setMatrixAt(n, m4); n++;
      }
    }
    for (const im of this.parts) { im.count = n; im.instanceMatrix.needsUpdate = true; }
    this.count = n;
  }
}
