// Station kits: each station is a Group placed on the corridor, built from data parts in a local (u along, y up, v across) frame.
// A part with no gate is the halt a station starts as (fogged until it's bought). A part with `upgrade` appears once that
// upgrade is bought (or all of them, for a list: a canopy over the second platform needs both), and one with `until`
// goes again when that is bought (the halt's short canopy, replaced by the island's). Scenery (roads, walls, sidings,
// signal boxes) isn't the player's and always shows, never fogged. So buying things grows the station you can see:
// a card chosen in the panel previews its parts as a ghost, and buying it makes them rise into place.
// The kit format (what src/data/kits/*.json holds) is typed here too, next to the builders that read it.
import * as THREE from 'three';
import { MAT, PAL, box, boxUV, matFor } from './scene.ts';
import { yawFor } from './world.ts';
import { buildBoard, buildCarPark, buildCycles, buildShop, emptyLive, type Live } from './life.ts';
import { buildRank, type RankPart } from './taxis.ts';
import { buildBusStop, type BusStopPart } from './buses.ts';
import type { Network } from '../sim/network.ts';
import type { GameState, Station } from '../sim/types.ts';

// ---- the kit format ----
interface Gated { upgrade?: string | string[]; until?: string; scenery?: boolean }
interface Span { u0: number; u1: number }
interface Footprint extends Span { v0: number; v1: number }
export type Part =
  | (Gated & Footprint & { type: 'platform'; mat?: string })
  | (Gated & Footprint & { type: 'canopy' })
  | (Gated & Span & { type: 'lamps'; v: number; every?: number })
  | (Gated & Footprint & { type: 'box'; y0: number; y1: number; mat?: string })
  | (Gated & Span & { type: 'windows'; v: number; ys: number[]; every?: number })
  /** back: which side the glass back is on, away from the track (+1 is +v, the default). */
  | (Gated & { type: 'shelter'; u: number; v: number; back?: 1 | -1 })
  | (Gated & { type: 'footbridge'; u: number; v0: number; v1: number; towers: number[] })
  /** A footbridge's stair tower on its own, for a platform built after the bridge. */
  | (Gated & { type: 'stairs'; u: number; v: number })
  | (Gated & { type: 'lifts'; u: number; towers: number[] })
  | (Gated & { type: 'retail'; u: number; v: number; small?: boolean; y?: number; label?: string })
  | (Gated & Span & { type: 'barriers'; v: number; y?: number })
  | (Gated & { type: 'signalbox'; u: number; v: number })
  | (Gated & Span & { type: 'shed'; v: number; radius: number })
  /** A building from its real outline: (u, v) corners in order, extruded from y0 to y1. */
  | (Gated & { type: 'footprint'; outline: [number, number][]; y0: number; y1: number; mat?: string })
  /** A passage under the line at u: a stair head on each platform it serves (their v extents), with a lit doorway. */
  | (Gated & { type: 'subway'; u: number; platforms: [number, number][] })
  /** A track no service runs on (a siding, a bay, a goods line), ballast and rails through (u, v) points in order;
   * a buffer stop at the first point when `buffer` is set. */
  | (Gated & { type: 'rails'; points: [number, number][]; buffer?: boolean })
  /** A departure board listing the next trains towards Manchester (north), away (south) or both: on two posts over a
   * platform (its base at y, 1 m if not given), or fixed to a wall at y; facing across the line, or along it. */
  | (Gated & { type: 'board'; u: number; v: number; serves: 'north' | 'south' | 'both'; y?: number; wall?: boolean; along?: boolean })
  /** A car park that fills with the hour and how busy the station is: tarmac and bays at y, or bays on a deck. */
  | (Gated & Footprint & { type: 'carpark'; y?: number; deck?: boolean })
  /** n Sheffield stands in a row from (u, v), along the line or across it, with bikes that come and go. */
  | (Gated & { type: 'cycles'; u: number; v: number; n: number; y?: number; across?: boolean })
  /** A taxi rank and its cabs (src/render/taxis.ts). */
  | (Gated & RankPart & { type: 'taxi' })
  /** A stop for rail replacement buses (src/render/buses.ts). */
  | (Gated & BusStopPart & { type: 'busstop' });
export type PartType = Part['type'];
/** Where each direction's passengers wait: from a line at v (near the platform edge) from u0 to u1, back into the
 * platform as far as depth (4 m if not given). */
export interface Face { v: number; u0: number; u1: number; depth?: number }
/** entrance: where passengers come and go along the platforms, when that isn't a subway's or footbridge's stairs
 * (a terminus's concourse at the buffer-stop end). longest: the most cars the real platforms take once extended, where
 * that's fewer than the line runs; a longer unit stands off the end (the geometry check holds the rest to the platform). */
export interface Kit { id: string; note?: string; platformLength?: number; longest?: number; entrance?: number; faces: { north: Face; south: Face }; parts: Part[] }

/** live: the station's parts that move with the sim (boards, car parks, racks, shops), for StationLife (life.ts). */
type Builders = { [K in PartType]: (gp: THREE.Group, p: Extract<Part, { type: K }>, live: Live) => void };
/** A cosmetic number for a part from where it stands, so each car park and rack fills in its own order. */
const seedOf = (u: number, v: number) => Math.round(u * 31 + v * 17);
const partBuilders: Builders = {
  platform(gp, p) {
    const mat = matFor(p.mat, MAT.platform);
    boxUV(gp, { ...p, y0: 0, y1: 1 }, mat);
    boxUV(gp, { u0: p.u0, u1: p.u1, v0: p.v0 + 0.5, v1: p.v0 + 1.1, y0: 1, y1: 1.05 }, MAT.tactile);
    boxUV(gp, { u0: p.u0, u1: p.u1, v0: p.v1 - 1.1, v1: p.v1 - 0.5, y0: 1, y1: 1.05 }, MAT.tactile);
  },
  canopy(gp, p) {
    // after Stockport's platform 4: slim columns along the platform's edges, a wide roof with a valance, a ridge above
    const w = p.v1 - p.v0, cv = (p.v0 + p.v1) / 2, L = p.u1 - p.u0, cu = (p.u0 + p.u1) / 2;
    for (let u = p.u0 + 6; u < p.u1 - 3; u += 10) for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 5.2, 8), MAT.column); c.position.set(u, 3.6, cv + s * (w / 2 - 1.3)); gp.add(c); }
    // each half of the roof falls towards its edge, never further than keeps the eaves above a train (5.2 m drawn)
    const half = (w / 2 + 1.6) / 2, tilt = Math.min(0.22, 0.9 / half);
    for (const s of [-1, 1]) { const r = box(gp, L - 4, 0.3, w / 2 + 1.6, MAT.canopy, cu, 6.5, cv + s * (w / 4 + 0.3)); r.rotation.x = s * tilt; }
    for (const s of [-1, 1]) box(gp, L - 4, 0.9, 0.15, MAT.timber, cu, 5.9, cv + s * (w / 2 + 1.5));
    box(gp, L - 4, 0.5, 0.5, MAT.steel, cu, 7.3, cv);
  },
  lamps(gp, p) {
    for (let u = p.u0; u <= p.u1; u += p.every || 30) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), MAT.glow); l.position.set(u, 5.4, p.v); gp.add(l); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 5.2, 6), MAT.steel); pole.position.set(u, 2.6, p.v); gp.add(pole); }
  },
  box(gp, p) { boxUV(gp, p, matFor(p.mat, MAT.concrete)); },
  windows(gp, p) {
    for (let u = p.u0; u <= p.u1; u += p.every || 10) for (const y of p.ys) box(gp, 1.6, 2.2, 0.1, MAT.glow, u, y, p.v);
  },
  shelter(gp, p) {
    // a glazed bus-stop shelter, 1.25 times real like the platforms it stands on: the glass back at +v
    const b = p.back ?? 1;
    box(gp, 8, 0.25, 3.2, MAT.canopy, p.u, 3.5, p.v); box(gp, 8, 2.4, 0.2, MAT.glass, p.u, 2.2, p.v + b * 1.4);
    for (const du of [-3.8, 3.8]) { box(gp, 0.2, 2.4, 3, MAT.glass, p.u + du, 2.2, p.v); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 6), MAT.steel); c.position.set(p.u + du, 2.2, p.v - b * 1.4); gp.add(c); }
  },
  footbridge(gp, p) {
    const w = p.v1 - p.v0, cv = (p.v0 + p.v1) / 2;
    box(gp, 3.6, 3.2, w, MAT.glass, p.u, 7.9, cv); box(gp, 4.2, 0.5, w + 2, MAT.roof, p.u, 9.7, cv); box(gp, 3.6, 0.5, w + 2, MAT.concrete, p.u, 6.1, cv);
    for (const tv of p.towers) box(gp, 10, 5, 4.5, MAT.concrete, p.u, 3.5, tv);
  },
  stairs(gp, p) { box(gp, 10, 5, 4.5, MAT.concrete, p.u, 3.5, p.v); },
  lifts(gp, p) { for (const tv of p.towers) { box(gp, 3.2, 9.5, 3.2, MAT.glass, p.u + 7, 4.75, tv); box(gp, 3.6, 0.4, 3.6, MAT.roof, p.u + 7, 9.7, tv); } },
  retail(gp, p, live) {
    // lit inside while it's open, shuttered at night, a queue outside when the station's busy (life.ts)
    const w = p.small ? 3 : 8, d = p.small ? 2.2 : 5;
    box(gp, w, 2.8, d, MAT.timber, p.u, 1.4 + (p.y || 0), p.v); box(gp, w + 0.6, 0.3, d + 0.6, MAT.roof, p.u, 2.95 + (p.y || 0), p.v);
    buildShop(gp, p, w, d, live, seedOf(p.u, p.v));
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
  footprint(gp, p) {
    // the shape is drawn in (u, -v) and extruded along +z; turning it face up puts the extrusion on y and -v back on +z
    const shape = new THREE.Shape(p.outline.map(([u, v]) => new THREE.Vector2(u, -v)));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: p.y1 - p.y0, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2); geo.translate(0, p.y0, 0);
    const m = new THREE.Mesh(geo, matFor(p.mat, MAT.brick)); gp.add(m);
  },
  subway(gp, p) {
    for (const [v0, v1] of p.platforms) {
      const cv = (v0 + v1) / 2, w = Math.min(3.2, v1 - v0 - 1);
      box(gp, 7, 2.6, w, MAT.brick, p.u, 2.3, cv); box(gp, 7.6, 0.3, w + 0.6, MAT.roof, p.u, 3.75, cv);
      box(gp, 0.1, 1.9, 1.6, MAT.glow, p.u + 3.55, 2, cv);
    }
  },
  rails(gp, p) {
    // a straight piece of ballast and two rails between each pair of points, overlapping a little at the joins
    for (let i = 0; i < p.points.length - 1; i++) {
      const [u0, v0] = p.points[i]!, [u1, v1] = p.points[i + 1]!, len = Math.hypot(u1 - u0, v1 - v0), yaw = Math.atan2(-(v1 - v0), u1 - u0);
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, nu = -(v1 - v0) / len, nv = (u1 - u0) / len;
      box(gp, len + 0.3, 0.5, 3.4, MAT.ballast, cu, -0.24, cv).rotation.y = yaw;
      for (const d of [-0.72, 0.72]) box(gp, len + 0.3, 0.16, 0.1, MAT.rail, cu + nu * d, 0.09, cv + nv * d).rotation.y = yaw;
    }
    const first = p.points[0];
    if (p.buffer && first) box(gp, 0.8, 1.2, 3, MAT.brickDark, first[0], 0.6, first[1]);
  },
  board(gp, p, live) { buildBoard(gp, p, live); },
  carpark(gp, p, live) { buildCarPark(gp, p, live, seedOf(p.u0, p.v0)); },
  cycles(gp, p, live) { buildCycles(gp, p, live, seedOf(p.u, p.v)); },
  taxi(gp, p, live) { buildRank(gp, p, live); },
  busstop(gp, p, live) { buildBusStop(gp, p, live); },
};
// the builders are keyed by the part's type, so the one looked up always takes the part; the cast says so once
const build = (part: Part, into: THREE.Group, live: Live) => (partBuilders[part.type] as (gp: THREE.Group, p: Part, live: Live) => void)(into, part, live);
/** One part on its own, in the kit's frame: what the geometry check measures trains against. */
export function partGroup(part: Part): THREE.Group { const gp = new THREE.Group(); if (part.type in partBuilders) build(part, gp, emptyLive()); return gp; }

/** A group of parts shown together: when all of `needs` are bought and `until` isn't. shown: whether it showed last
 * sync; rise: how far through rising into place it is (1 once it stands); ghost: drawn as a preview of buying it. */
interface Gate { group: THREE.Group; needs: string[]; until: string | null; shown: boolean; rise: number; ghost: boolean }
/** A station on the map: its group, the halt (fogged while locked), its scenery, the parts its upgrades reveal, and
 * where the label floats. rise: how far the halt is through rising into place once bought. */
export interface BuiltStation {
  station: Station; kit: Kit; group: THREE.Group; fixed: THREE.Group;
  gated: Gate[]; label: THREE.Object3D; lockedNow: boolean | null; rise: number; live: Live;
}

export function buildStations(scene: THREE.Scene, net: Network, kits: Record<string, Kit>): BuiltStation[] {
  return net.stations.map(st => {
    const kit = kits[st.kit]; if (!kit) throw new Error(`no kit "${st.kit}" for ${st.name}`);
    const frame = net.stationFrame(st.id);
    const gp = new THREE.Group(); gp.position.set(frame.x, 0, frame.z); gp.rotation.y = yawFor(frame); scene.add(gp);
    const fixed = new THREE.Group(), scenery = new THREE.Group(), gates = new Map<string, Gate>(), live = emptyLive(); gp.add(fixed); gp.add(scenery);
    for (const part of kit.parts) {
      if (!(part.type in partBuilders)) { console.warn('unknown part', part.type); continue; }
      const needs = part.upgrade === undefined ? [] : Array.isArray(part.upgrade) ? part.upgrade : [part.upgrade];
      if (part.scenery) build(part, scenery, live);
      else if (needs.length || part.until) {
        const key = `${needs.join('+')}|${part.until ?? ''}`;
        let gate = gates.get(key);
        if (!gate) { gate = { group: new THREE.Group(), needs, until: part.until ?? null, shown: false, rise: 1, ghost: false }; gate.group.visible = false; gp.add(gate.group); gates.set(key, gate); }
        build(part, gate.group, live);
      } else build(part, fixed, live);
    }
    const gated = [...gates.values()];
    const label = new THREE.Object3D(); label.position.set(0, 14, 0); gp.add(label);
    return { station: st, kit, group: gp, fixed, gated, label, lockedNow: null, rise: 1, live };
  });
}

// ---- the preview and the rise ----
// Choosing an upgrade's card draws the parts it would add as a ghost in its own blueprint cyan (the chosen card's edge too), pulsing
// gently; buying it makes them rise into place over RISE_S seconds, as buying a station raises its halt out of the fog.
// Both are only the view: nothing here reads or changes the game beyond what's bought.
export const GHOST = new THREE.MeshBasicMaterial({ color: PAL.ghost, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
const RISE_S = 1;
let riseS = RISE_S;
/** Players who ask for less motion get the parts in place at once. */
export function setReducedMotion(reduced: boolean): void { riseS = reduced ? 0 : RISE_S; }
/** One frame of a rise: how far through it is after dt more real seconds (at once with reduced motion). */
export function riseBy(rise: number, dt: number): number { return riseS ? Math.min(1, rise + dt / riseS) : 1; }
/** Ease out with a little overshoot, so a part settles into place. */
export const settle = (t: number) => { const c = 1.4, x = t - 1; return 1 + (c + 1) * x * x * x + c * x * x; };

type Ups = Record<string, boolean | undefined>;
/** The gates buying `id` would show at a station with these upgrades bought. */
function gatesFor(b: BuiltStation, ups: Ups, id: string): Gate[] {
  const has = (x: string) => x === id || !!ups[x];
  return b.gated.filter(gate => gate.needs.includes(id) && gate.needs.every(has) && !(gate.until && has(gate.until)));
}
/** Where an upgrade's parts stand in the world (the box round them), or null if it adds none at this station. */
export function partsBox(b: BuiltStation, ups: Ups, id: string, into: THREE.Box3): THREE.Box3 | null {
  const gates = gatesFor(b, ups, id); if (!gates.length) return null;
  into.makeEmpty(); b.group.updateMatrixWorld(true);
  for (const gate of gates) { const v = gate.group.visible; gate.group.visible = true; into.expandByObject(gate.group); gate.group.visible = v; }
  return into.isEmpty() ? null : into;
}
function ghost(gate: Gate, on: boolean): void {
  if (gate.ghost === on) return;
  gate.ghost = on;
  gate.group.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    if (on) { o.userData['own'] = o.material; o.material = GHOST; o.castShadow = false; }
    else if (o.userData['own']) { o.material = o.userData['own']; o.castShadow = true; }
  });
}
/** Show what buying `id` at a station would add, as a ghost, or clear the preview (null). Returns how many gates show. */
export function previewUpgrade(built: BuiltStation[], i: number | null, ups: Ups, id: string | null): number {
  for (const b of built) for (const gate of b.gated) ghost(gate, false);
  const b = i === null ? undefined : built[i]; if (!b || !id) return 0;
  const gates = gatesFor(b, ups, id); for (const gate of gates) ghost(gate, true);
  return gates.length;
}
let pulse = 0;

// Reflect ownership and upgrades: locked stations go grey and translucent, bought upgrades rise into place, the
// preview's ghosts pulse. dt: real seconds since the last frame.
export function syncStations(built: BuiltStation[], g: GameState, dt: number): void {
  pulse += dt; GHOST.opacity = 0.4 + 0.2 * Math.sin(pulse * 4);
  built.forEach((b, i) => {
    const locked = !g.owned[i], ups = (g.ups[i] ?? {}) as Ups, first = b.lockedNow === null;
    if (b.lockedNow !== locked) {
      if (!first && !locked) b.rise = 0;   // bought: the halt rises out of the fog
      b.lockedNow = locked;
      b.fixed.traverse(o => {
        if (!(o instanceof THREE.Mesh)) return;
        if (locked) { if (!o.userData['mat']) o.userData['mat'] = o.material; o.material = MAT.locked; }
        else if (o.userData['mat']) o.material = o.userData['mat'];
      });
    }
    if (b.rise < 1) { b.rise = riseBy(b.rise, dt); b.fixed.scale.y = Math.max(0.01, settle(b.rise)); }
    const has = (id: string) => !!ups[id];
    for (const gate of b.gated) {
      const show = !locked && gate.needs.every(has) && !(gate.until && has(gate.until));
      if (show && !gate.shown && !first) { gate.rise = 0; ghost(gate, false); }   // just bought: it stops being a ghost and rises
      gate.shown = show;
      gate.group.visible = show || gate.ghost;
      if (gate.rise < 1) { gate.rise = riseBy(gate.rise, dt); gate.group.scale.y = Math.max(0.01, settle(gate.rise)); }
    }
  });
}
