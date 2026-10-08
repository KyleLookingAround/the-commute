// Station kits: each station is a Group placed on the corridor, built from data parts in a local (u along, y up, v across) frame.
// Parts with an "upgrade" field only appear once that upgrade is bought, so buying things changes the station you can see.
// The kit format (what src/data/kits/*.json holds) is typed here too, next to the builders that read it.
import * as THREE from 'three';
import { MAT, box, boxUV, matFor } from './scene.ts';
import { yawFor } from './world.ts';
import type { Network } from '../sim/network.ts';
import type { GameState, Station } from '../sim/types.ts';

// ---- the kit format ----
interface Gated { upgrade?: string }
interface Span { u0: number; u1: number }
interface Footprint extends Span { v0: number; v1: number }
export type Part =
  | (Gated & Footprint & { type: 'platform'; mat?: string })
  | (Gated & Footprint & { type: 'canopy' })
  | (Gated & Span & { type: 'lamps'; v: number; every?: number })
  | (Gated & Footprint & { type: 'box'; y0: number; y1: number; mat?: string })
  | (Gated & Span & { type: 'windows'; v: number; ys: number[]; every?: number })
  | (Gated & { type: 'shelter'; u: number; v: number })
  | (Gated & { type: 'footbridge'; u: number; v0: number; v1: number; towers: number[] })
  | (Gated & { type: 'lifts'; u: number; towers: number[] })
  | (Gated & { type: 'retail'; u: number; v: number; small?: boolean; y?: number; label?: string })
  | (Gated & Span & { type: 'barriers'; v: number; y?: number })
  | (Gated & { type: 'signalbox'; u: number; v: number })
  | (Gated & Span & { type: 'shed'; v: number; radius: number });
export type PartType = Part['type'];
/** Where each direction's queue stands: a line at v from u0 to u1. */
export interface Face { v: number; u0: number; u1: number }
export interface Kit { id: string; note?: string; platformLength?: number; faces: { north: Face; south: Face }; parts: Part[] }

type Builders = { [K in PartType]: (gp: THREE.Group, p: Extract<Part, { type: K }>) => void };
const partBuilders: Builders = {
  platform(gp, p) {
    const mat = matFor(p.mat, MAT.platform);
    boxUV(gp, { ...p, y0: 0, y1: 1 }, mat);
    boxUV(gp, { u0: p.u0, u1: p.u1, v0: p.v0 + 0.5, v1: p.v0 + 1.1, y0: 1, y1: 1.05 }, MAT.tactile);
    boxUV(gp, { u0: p.u0, u1: p.u1, v0: p.v1 - 1.1, v1: p.v1 - 0.5, y0: 1, y1: 1.05 }, MAT.tactile);
  },
  canopy(gp, p) {
    const w = p.v1 - p.v0, cv = (p.v0 + p.v1) / 2, L = p.u1 - p.u0, cu = (p.u0 + p.u1) / 2;
    for (let u = p.u0 + 8; u < p.u1 - 4; u += 12) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 4.6, 8), MAT.steel); c.position.set(u, 3.3, cv); gp.add(c); }
    for (const s of [-1, 1]) { const r = box(gp, L - 6, 0.25, w / 2 + 1.4, MAT.canopy, cu, 6.1, cv + s * (w / 4 + 0.2)); r.rotation.x = s * 0.3; }
    box(gp, L - 6, 0.6, 0.4, MAT.steel, cu, 6.9, cv);
  },
  lamps(gp, p) {
    for (let u = p.u0; u <= p.u1; u += p.every || 30) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), MAT.glow); l.position.set(u, 4.6, p.v); gp.add(l); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 4.4, 5), MAT.steel); pole.position.set(u, 2.9, p.v); gp.add(pole); }
  },
  box(gp, p) { boxUV(gp, p, matFor(p.mat, MAT.concrete)); },
  windows(gp, p) {
    for (let u = p.u0; u <= p.u1; u += p.every || 10) for (const y of p.ys) box(gp, 1.6, 2.2, 0.1, MAT.glow, u, y, p.v);
  },
  shelter(gp, p) {
    box(gp, 10, 0.3, 6, MAT.canopy, p.u, 3.2, p.v); box(gp, 10, 2.4, 0.3, MAT.glass, p.u, 2, p.v + 2.8);
    for (const du of [-4.5, 4.5]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.4, 6), MAT.steel); c.position.set(p.u + du, 2, p.v - 2.6); gp.add(c); }
  },
  footbridge(gp, p) {
    const w = p.v1 - p.v0, cv = (p.v0 + p.v1) / 2;
    box(gp, 3.6, 3.2, w, MAT.glass, p.u, 7.9, cv); box(gp, 4.2, 0.5, w + 2, MAT.roof, p.u, 9.7, cv); box(gp, 3.6, 0.5, w + 2, MAT.concrete, p.u, 6.1, cv);
    for (const tv of p.towers) box(gp, 10, 5, 4.5, MAT.concrete, p.u, 3.5, tv);
  },
  lifts(gp, p) { for (const tv of p.towers) { box(gp, 3.2, 9.5, 3.2, MAT.glass, p.u + 7, 4.75, tv); box(gp, 3.6, 0.4, 3.6, MAT.roof, p.u + 7, 9.7, tv); } },
  retail(gp, p) {
    const w = p.small ? 3 : 8, d = p.small ? 2.2 : 5;
    box(gp, w, 2.8, d, MAT.timber, p.u, 1.4 + (p.y || 0), p.v); box(gp, w + 0.6, 0.3, d + 0.6, MAT.roof, p.u, 2.95 + (p.y || 0), p.v);
    box(gp, w - 0.6, 1.2, 0.1, MAT.glow, p.u, 1.8 + (p.y || 0), p.v + d / 2 + 0.02);
  },
  barriers(gp, p) { for (let u = p.u0; u <= p.u1; u += 2) box(gp, 0.3, 1.1, 1.6, MAT.steel, u, 0.55 + (p.y || 0), p.v); box(gp, p.u1 - p.u0, 0.1, 0.4, MAT.glow, (p.u0 + p.u1) / 2, 1.1 + (p.y || 0), p.v); },
  signalbox(gp, p) {
    box(gp, 10, 3.5, 6, MAT.brick, p.u, 1.75, p.v); box(gp, 10, 3, 6, MAT.glass, p.u, 5, p.v); box(gp, 11.5, 0.3, 7.5, MAT.roof, p.u, 6.6, p.v);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0, 7.2, 2.4, 4), MAT.roof); roof.position.set(p.u, 7.9, p.v); roof.rotation.y = Math.PI / 4; roof.scale.z = 0.72; gp.add(roof);
  },
  shed(gp, p) {
    const L = p.u1 - p.u0;
    const r = new THREE.Mesh(new THREE.CylinderGeometry(p.radius, p.radius, L, 24, 1, true, 0, Math.PI), MAT.shed);
    r.rotation.z = Math.PI / 2; r.position.set((p.u0 + p.u1) / 2, 6, p.v); gp.add(r);
  },
};
// the builders are keyed by the part's type, so the one looked up always takes the part; the cast says so once
const build = (part: Part, into: THREE.Group) => (partBuilders[part.type] as (gp: THREE.Group, p: Part) => void)(into, part);

/** A station on the map: its group, the parts always there, the parts each upgrade reveals, and where the label floats. */
export interface BuiltStation {
  station: Station; kit: Kit; group: THREE.Group; fixed: THREE.Group;
  gated: Record<string, THREE.Group>; label: THREE.Object3D; lockedNow: boolean | null;
}

export function buildStations(scene: THREE.Scene, net: Network, kits: Record<string, Kit>): BuiltStation[] {
  return net.stations.map(st => {
    const kit = kits[st.kit]; if (!kit) throw new Error(`no kit "${st.kit}" for ${st.name}`);
    const frame = net.stationFrame(st.id);
    const gp = new THREE.Group(); gp.position.set(frame.x, 0, frame.z); gp.rotation.y = yawFor(frame); scene.add(gp);
    const fixed = new THREE.Group(), gated: Record<string, THREE.Group> = {}; gp.add(fixed);
    for (const part of kit.parts) {
      if (!(part.type in partBuilders)) { console.warn('unknown part', part.type); continue; }
      if (part.upgrade) {
        let grp = gated[part.upgrade];
        if (!grp) { grp = new THREE.Group(); grp.visible = false; gp.add(grp); gated[part.upgrade] = grp; }
        build(part, grp);
      } else build(part, fixed);
    }
    const label = new THREE.Object3D(); label.position.set(0, 14, 0); gp.add(label);
    return { station: st, kit, group: gp, fixed, gated, label, lockedNow: null };
  });
}

// Reflect ownership and upgrades: locked stations go grey and translucent, bought upgrades appear.
export function syncStations(built: BuiltStation[], g: GameState): void {
  built.forEach((b, i) => {
    const locked = !g.owned[i], ups = g.ups[i] ?? {};
    if (b.lockedNow !== locked) {
      b.lockedNow = locked;
      b.fixed.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        if (locked) { if (!o.userData['mat']) o.userData['mat'] = o.material; o.material = MAT.locked; }
        else if (o.userData['mat']) o.material = o.userData['mat'];
      });
    }
    for (const [id, grp] of Object.entries(b.gated)) grp.visible = !locked && !!(ups as Record<string, boolean | undefined>)[id];
  });
}
