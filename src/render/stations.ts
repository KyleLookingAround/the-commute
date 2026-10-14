// Station kits: each station is a Group placed on the corridor, built from data parts in a local (u along, y up, v across) frame.
// A part with no gate is the halt a station starts as (fogged until it's bought). A part with `upgrade` appears once that
// upgrade is bought (or all of them, for a list: a canopy over the second platform needs both), and one with `until`
// goes again when that is bought (the halt's short canopy, replaced by the island's). Scenery (roads, walls, sidings,
// signal boxes) isn't the player's and always shows, never fogged. So buying things grows the station you can see:
// a card chosen in the panel previews its parts as a ghost, and buying it makes them rise into place.
// The kit format (what src/data/kits/*.json holds) is typed here too, next to the builders that read it.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, PAL, box, boxUV, matFor } from './scene.ts';
import { yawFor } from './world.ts';
import { buildBoard, buildCarPark, buildCycles, buildShop, buildShutter, emptyLive, type Live } from './life.ts';
import { buildRank, type RankPart } from './taxis.ts';
import { buildBusStop, type BusStopPart } from './buses.ts';
import { buildLink, type LinkPart } from './links.ts';
import { groundAt, groundVersion, partBoxes } from './terrain.ts';
import { newFrame, type Network } from '../sim/network.ts';
import type { Frame, GameState, Station } from '../sim/types.ts';

// ---- the kit format ----
/** street: the part stands on the ground at street level (where its middle is), not at rail level on the station's pad:
 * a car park, bus stop or bus station away from the platforms. */
interface Gated { upgrade?: string | string[]; until?: string; scenery?: boolean; street?: boolean }
interface Span { u0: number; u1: number }
interface Footprint extends Span { v0: number; v1: number }
export type Part =
  | (Gated & Footprint & { type: 'platform'; mat?: string })
  | (Gated & Footprint & { type: 'canopy' })
  | (Gated & Span & { type: 'lamps'; v: number; every?: number })
  | (Gated & Footprint & { type: 'box'; y0: number; y1: number; mat?: string })
  | (Gated & Span & { type: 'windows'; v: number; ys: number[]; every?: number })
  /** back: which side the glass back is on, away from the track (+1 is +v, the default). vault: a barrel roof over
   * Northern-blue lower panels (Levenshulme's) instead of the flat roof. */
  | (Gated & { type: 'shelter'; u: number; v: number; back?: 1 | -1; vault?: boolean })
  | (Gated & { type: 'footbridge'; u: number; v0: number; v1: number; towers: number[] })
  /** An open footbridge of riveted plate girders with lattice parapets (Ardwick's), its deck at u from v0 to v1 on
   * lattice trestles (their v; each platform's `flights` brings its own). */
  | (Gated & { type: 'lattice'; u: number; v0: number; v1: number; trestles?: number[] })
  /** A lattice footbridge's open stair down to a platform at v: a trestle under the deck, then two flights along the
   * line towards `dir` along u. */
  | (Gated & { type: 'flights'; u: number; v: number; dir: 1 | -1 })
  /** A brick bridge over the line from u0 to u1 (its width along the line), its face from v0 to v1 up to y1, with
   * segmental arches cut through it: each span [va, vb, spring, crown]. Piers stand between the spans to the ground. */
  | (Gated & Span & { type: 'arches'; v0: number; v1: number; y1: number; spans: [number, number, number, number][]; mat?: string })
  /** A glass entrance round in plan (Stockport's on Station Road): half an ellipse w along the line and d out from its
   * flat back at (u, v) towards `facing` across the line, glazed to y1 under a flat roof slab that overhangs it. */
  | (Gated & { type: 'drum'; u: number; v: number; w: number; d: number; y1: number; facing: 1 | -1 })
  /** A ramp along the line at v, w wide, from (u0, y0) to (u1, y1), with a handrail each side; `steps` makes it a flight
   * of solid steps instead. */
  | (Gated & Span & { type: 'ramp'; v: number; w: number; y0: number; y1: number; steps?: boolean })
  /** A row of n arched recesses set into an embankment's wall from u0 to u1, its face at v looking towards `facing`
   * across the line (+1, the default, is +v): each an opening h high to its springing under a round head, with brick
   * piers between. Stands at street level (with `street`), at the wall's foot. */
  | (Gated & Span & { type: 'recesses'; v: number; n: number; h: number; facing?: 1 | -1 })
  /** A hipped roof over a building's footprint: eaves at y0 all round, sloping up on all four sides to a ridge `rise`
   * above them along the longer side (a point over a square). */
  | (Gated & Footprint & { type: 'hipped'; y0: number; rise: number; mat?: string })
  /** A footbridge's stair tower on its own, for a platform built after the bridge. */
  | (Gated & { type: 'stairs'; u: number; v: number })
  | (Gated & { type: 'lifts'; u: number; towers: number[] })
  | (Gated & { type: 'retail'; u: number; v: number; small?: boolean; y?: number; label?: string })
  | (Gated & Span & { type: 'barriers'; v: number; y?: number })
  | (Gated & { type: 'signalbox'; u: number; v: number })
  | (Gated & Span & { type: 'shed'; v: number; radius: number })
  /** A building from its real outline: (u, v) corners in order, extruded from y0 to y1. floors: that many storeys, each
   * a band of the material under a band of glass (an office block's ribbon windows, Gateway House's). */
  | (Gated & { type: 'footprint'; outline: [number, number][]; y0: number; y1: number; mat?: string; floors?: number })
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
  /** A roller shutter across a way in, w wide and h high, and up to `crowd` people gathered outside it (30): shown
   * while the station is shut (the start holds a train there, docs/design/gridlock.md section 4), rolled up as it
   * reopens. Never fogged with the halt. */
  | (Gated & { type: 'shutter'; u: number; v: number; w: number; h: number; crowd?: number; y?: number })
  /** A taxi rank and its cabs (src/render/taxis.ts). */
  | (Gated & RankPart & { type: 'taxi' })
  /** A stop for rail replacement buses (src/render/buses.ts). */
  | (Gated & BusStopPart & { type: 'busstop' })
  /** A bus link's stop or bus station, with its buses coming and going (src/render/links.ts). */
  | (Gated & LinkPart & { type: 'buslink' })
  /** The contract's brass plaque on a stone pier, its face towards `facing` across the line: it reads the contract's
   * number and grows a line for each one renewed (setPlaque), and stands only once a contract has been. */
  | (Gated & { type: 'plaque'; u: number; v: number; facing: 1 | -1 })
  /** A street from OpenStreetMap through (u, v) points in order, w wide (7 m if not given), laid on the ground as drawn
   * under each point, or at a point's own height where it gives one ([u, v, y]: onto a bridge's deck). It joins a
   * station's ranks, stops and bridges to the real streets painted on the ground round them, and is seated again as the
   * ground is read more finely. Never on the station's pad. */
  | (Gated & { type: 'road'; points: ([number, number] | [number, number, number])[]; w?: number });
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
// ---- lattice ironwork (Ardwick's footbridge) ----
// One diamond-lattice texture, cut out by its alpha, shared by every lattice panel; each panel's UVs are scaled to its
// size so the diamonds stay the same size everywhere. Without a canvas (the geometry check) the panels are solid.
const DECK_Y = 7.2, LATTICE_M = 1.1;
let latticeMat: THREE.Material | null = null;
function lattice(): THREE.Material {
  if (latticeMat) return latticeMat;
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas'), ctx = canvas?.getContext('2d');
  let map: THREE.CanvasTexture | null = null;
  if (canvas && ctx) {
    canvas.width = canvas.height = 64; ctx.strokeStyle = '#fff'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(64, 64); ctx.moveTo(64, 0); ctx.lineTo(0, 64); ctx.stroke();
    ctx.strokeRect(0, 0, 64, 64);
    map = new THREE.CanvasTexture(canvas); map.wrapS = map.wrapT = THREE.RepeatWrapping;
  }
  latticeMat = new THREE.MeshLambertMaterial({ color: MAT.rust.color, map, alphaTest: 0.5, side: THREE.DoubleSide });
  return latticeMat;
}
/** A lattice panel w long and h high, centred at (u, y, v), turned yaw about y and tilted pitch about its own length. */
function panel(gp: THREE.Group, w: number, h: number, u: number, y: number, v: number, yaw: number, pitch = 0): void {
  const geo = new THREE.PlaneGeometry(w, h), uv = geo.attributes['uv'] as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / LATTICE_M, uv.getY(i) * h / LATTICE_M);
  const m = new THREE.Mesh(geo, lattice()); m.rotation.set(0, yaw, pitch, 'YXZ'); m.position.set(u, y, v); gp.add(m);
}
/** A lattice trestle from the ground to y1 under (u, v): four posts and lattice sides, on a brick base. */
function trestle(gp: THREE.Group, u: number, v: number, y1: number, wu = 2.2, wv = 2): void {
  box(gp, wu + 0.6, 1.4, wv + 0.6, MAT.brick, u, 0.7, v);
  for (const su of [-1, 1]) for (const sv of [-1, 1]) box(gp, 0.22, y1 - 1.4, 0.22, MAT.rust, u + su * wu / 2, (y1 + 1.4) / 2, v + sv * wv / 2);
  for (const s of [-1, 1]) {
    panel(gp, wu, y1 - 1.6, u, (y1 + 1.4) / 2, v + s * wv / 2, 0);
    panel(gp, wv, y1 - 1.6, u + s * wu / 2, (y1 + 1.4) / 2, v, Math.PI / 2);
  }
}
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
    for (let u = p.u0 + 6; u < p.u1 - 3; u += 10) for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 4.2, 8), MAT.column); c.position.set(u, 3.1, cv + s * (w / 2 - 1.3)); gp.add(c); }
    // each half of the roof falls towards its edge, never further than keeps the eaves above a train (4 m drawn, and
    // its beacons)
    const half = (w / 2 + 1.6) / 2, tilt = Math.min(0.22, 0.9 / half);
    for (const s of [-1, 1]) { const r = box(gp, L - 4, 0.3, w / 2 + 1.6, MAT.canopy, cu, 5.5, cv + s * (w / 4 + 0.3)); r.rotation.x = s * tilt; }
    for (const s of [-1, 1]) box(gp, L - 4, 0.9, 0.15, MAT.timber, cu, 4.9, cv + s * (w / 2 + 1.5));
    box(gp, L - 4, 0.5, 0.5, MAT.steel, cu, 6.3, cv);
  },
  lamps(gp, p) {
    for (let u = p.u0; u <= p.u1; u += p.every || 30) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), MAT.glow); l.userData['noShadow'] = true; l.position.set(u, 5.1, p.v); gp.add(l); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 4.0, 6), MAT.steel); pole.position.set(u, 3.0, p.v); gp.add(pole); }
  },
  box(gp, p) { boxUV(gp, p, matFor(p.mat, MAT.concrete)); },
  windows(gp, p) {
    for (let u = p.u0; u <= p.u1; u += p.every || 10) for (const y of p.ys) box(gp, 1.6, 2.2, 0.1, MAT.glow, u, y, p.v);
  },
  shelter(gp, p) {
    // a glazed bus-stop shelter: the glass back at +v
    const b = p.back ?? 1;
    if (p.vault) {
      // a half-cylinder roof along the line on a solid blue dado, glazed above
      const r = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 8, 12, 1, false, 0, Math.PI), MAT.shed);
      r.rotation.z = Math.PI / 2; r.position.set(p.u, 3.4, p.v); gp.add(r);
      box(gp, 8, 1, 0.2, MAT.shelter, p.u, 1.5, p.v + b * 1.1); box(gp, 8, 1.4, 0.2, MAT.glass, p.u, 2.7, p.v + b * 1.1);
      for (const du of [-3.9, 3.9]) { box(gp, 0.2, 1, 2.4, MAT.shelter, p.u + du, 1.5, p.v); box(gp, 0.2, 1.4, 2.4, MAT.glass, p.u + du, 2.7, p.v); }
      for (const du of [-3.9, 0, 3.9]) box(gp, 0.18, 2.4, 0.18, MAT.shelter, p.u + du, 2.2, p.v - b * 1.2);
      return;
    }
    box(gp, 8, 0.25, 2.6, MAT.canopy, p.u, 3.5, p.v); box(gp, 8, 2.4, 0.2, MAT.glass, p.u, 2.2, p.v + b * 1.1);
    for (const du of [-3.8, 3.8]) { box(gp, 0.2, 2.4, 2.4, MAT.glass, p.u + du, 2.2, p.v); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 6), MAT.steel); c.position.set(p.u + du, 2.2, p.v - b * 1.1); gp.add(c); }
  },
  footbridge(gp, p) {
    const w = p.v1 - p.v0, cv = (p.v0 + p.v1) / 2;
    box(gp, 3.6, 3.2, w, MAT.glass, p.u, 7.9, cv); box(gp, 4.2, 0.5, w + 2, MAT.roof, p.u, 9.7, cv); box(gp, 3.6, 0.5, w + 2, MAT.concrete, p.u, 6.1, cv);
    for (const tv of p.towers) box(gp, 10, 5, 4.5, MAT.concrete, p.u, 3.5, tv);
  },
  lattice(gp, p) {
    // the deck clears the trains (4 m drawn) and the wires, between plate girders with a lattice parapet on top
    const w = p.v1 - p.v0, cv = (p.v0 + p.v1) / 2;
    box(gp, 2.8, 0.25, w, MAT.rust, p.u, DECK_Y - 0.12, cv);
    for (const s of [-1, 1]) {
      box(gp, 0.25, 1.1, w, MAT.rust, p.u + s * 1.4, DECK_Y - 0.05, cv);
      panel(gp, w, 0.9, p.u + s * 1.4, DECK_Y + 0.95, cv, Math.PI / 2);
      box(gp, 0.18, 0.12, w, MAT.rust, p.u + s * 1.4, DECK_Y + 1.45, cv);
    }
    for (const tv of p.trestles ?? []) trestle(gp, p.u, tv, DECK_Y - 0.6);
  },
  flights(gp, p) {
    // from the deck's edge down to a landing on a trestle, then on down to the platform (1 m up), each flight with
    // its stringers and lattice sides
    const R = 5.4, rise = (DECK_Y - 1) / 2, d = p.dir;
    trestle(gp, p.u, p.v, DECK_Y - 0.6);
    const flight = (ua: number, ya: number) => {
      const ub = ua + d * R, yb = ya - rise, cu = (ua + ub) / 2, cy = (ya + yb) / 2, len = Math.hypot(R, rise);
      const tilt = Math.atan2(yb - ya, ub - ua);
      box(gp, len, 0.3, 1.8, MAT.rust, cu, cy, p.v).rotation.z = tilt;
      for (const s of [-1, 1]) panel(gp, len, 0.9, cu, cy + 0.6, p.v + s * 0.95, 0, tilt);
      return ub;
    };
    const ub = flight(p.u + d * 1.5, DECK_Y);
    box(gp, 2, 0.25, 1.8, MAT.rust, ub + d, DECK_Y - rise - 0.12, p.v);
    trestle(gp, ub + d, p.v, DECK_Y - rise - 0.25, 1.6, 1.6);
    flight(ub + d * 2, DECK_Y - rise);
  },
  arches(gp, p) {
    // piers as boxes to the ground, and over each span the wall above its arch as its own shape (u, y, v from (-v, y)
    // extruded along u), so nothing solid reaches below an arch's springing
    const mat = matFor(p.mat, MAT.brickDark), L = p.u1 - p.u0;
    let v = p.v0;
    for (const [va, vb, spring, crown] of p.spans) {
      if (va > v) boxUV(gp, { u0: p.u0, u1: p.u1, v0: v, v1: va, y0: 0, y1: p.y1 }, mat);
      const c = (vb - va) / 2, h = crown - spring, R = (c * c + h * h) / (2 * h), mid = (va + vb) / 2, cy = crown - R;
      const shape = new THREE.Shape();
      shape.moveTo(-va, spring); shape.lineTo(-va, p.y1); shape.lineTo(-vb, p.y1); shape.lineTo(-vb, spring);
      const a0 = Math.atan2(spring - cy, c);
      for (let k = 1; k < 12; k++) { const t = a0 + (Math.PI - 2 * a0) * k / 12; shape.lineTo(-(mid + R * Math.cos(t)), cy + R * Math.sin(t)); }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: L, bevelEnabled: false });
      geo.rotateY(Math.PI / 2); geo.translate(p.u0, 0, 0);
      gp.add(new THREE.Mesh(geo, mat));
      v = vb;
    }
    if (p.v1 > v) boxUV(gp, { u0: p.u0, u1: p.u1, v0: v, v1: p.v1, y0: 0, y1: p.y1 }, mat);
  },
  drum(gp, p) {
    // a half cylinder of glass (its curve from +u round to -u through `facing`), squashed to d across, mullions round
    // it, and a thin slab on top that follows the curve
    const half = (r: number, h: number, mat: THREE.Material, y: number, open: boolean) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24, 1, open, Math.PI / 2, Math.PI), mat);
      m.scale.z = -p.facing * (p.d + r - p.w / 2) / r; m.position.set(p.u, y, p.v); gp.add(m);
    };
    half(p.w / 2, p.y1, MAT.glass, p.y1 / 2, true);
    half(p.w / 2 + 1.2, 0.5, MAT.steel, p.y1 + 0.25, false);
    for (let k = 1; k < 8; k++) {
      const t = Math.PI * k / 8; box(gp, 0.25, p.y1, 0.25, MAT.steel, p.u + Math.cos(t) * p.w / 2, p.y1 / 2, p.v + p.facing * Math.sin(t) * p.d);
    }
    for (const y of [p.y1 / 3, (2 * p.y1) / 3]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(p.w / 2, 0.12, 4, 24, Math.PI), MAT.steel);
      band.rotation.x = -Math.PI / 2; band.scale.y = -p.facing * p.d / (p.w / 2); band.position.set(p.u, y, p.v); gp.add(band);
    }
  },
  ramp(gp, p) {
    const du = p.u1 - p.u0, dy = p.y1 - p.y0, len = Math.hypot(du, dy), tilt = Math.atan2(dy, du), cu = (p.u0 + p.u1) / 2, cy = (p.y0 + p.y1) / 2;
    if (p.steps) {
      const n = Math.max(2, Math.ceil(Math.abs(dy) / 0.4));
      for (let k = 0; k < n; k++) { const top = p.y0 + dy * (k + 0.5) / n; box(gp, Math.abs(du) / n + 0.02, top, p.w, MAT.concrete, p.u0 + du * (k + 0.5) / n, top / 2, p.v); }
    } else box(gp, len, 0.3, p.w, MAT.concrete, cu, cy - 0.15, p.v).rotation.z = tilt;
    for (const s of [-1, 1]) box(gp, len, 0.08, 0.08, MAT.tactile, cu, cy + 1, p.v + s * (p.w / 2 - 0.1)).rotation.z = tilt;
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
    const mat = matFor(p.mat, MAT.brick);
    if (p.floors) {
      // one shape a metre high, scaled into each storey's solid band and the glass band above it
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
      const h = (p.y1 - p.y0) / p.floors;
      for (let k = 0; k < p.floors; k++) for (const [m, y, dy] of [[mat, 0, 0.35], [MAT.glass, 0.35, 0.65]] as const) {
        const band = new THREE.Mesh(geo, m); band.scale.y = h * dy; band.position.y = p.y0 + h * (k + y); gp.add(band);
      }
      return;
    }
    const geo = new THREE.ExtrudeGeometry(shape, { depth: p.y1 - p.y0, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2); geo.translate(0, p.y0, 0);
    const m = new THREE.Mesh(geo, mat); gp.add(m);
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
  hipped(gp, p) {
    // the ridge runs along the longer side, the hips coming in by half the shorter at each end
    const along = p.u1 - p.u0 >= p.v1 - p.v0, cu = (p.u0 + p.u1) / 2, cv = (p.v0 + p.v1) / 2, inset = Math.min(p.u1 - p.u0, p.v1 - p.v0) / 2;
    const y = p.y0 + 0.25, top = y + p.rise;
    const A = [p.u0, y, p.v0], B = [p.u1, y, p.v0], C = [p.u1, y, p.v1], D = [p.u0, y, p.v1];
    const R0 = along ? [p.u0 + inset, top, cv] : [cu, top, p.v0 + inset], R1 = along ? [p.u1 - inset, top, cv] : [cu, top, p.v1 - inset];
    // each face as triangles, wound to face outwards and up
    const tris = along ? [A, R0, B, B, R0, R1, B, R1, C, C, R1, D, D, R1, R0, D, R0, A] : [A, R0, B, B, R0, C, C, R0, R1, C, R1, D, D, R1, A, A, R1, R0];
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3)); geo.computeVertexNormals();
    const mat = matFor(p.mat, MAT.roof); gp.add(new THREE.Mesh(geo, mat));
    // the eaves: a thin slab under the slopes
    box(gp, p.u1 - p.u0, 0.25, p.v1 - p.v0, mat, cu, p.y0 + 0.125, cv);
  },
  recesses(gp, p) {
    // each opening as a flat shape just proud of the wall: a dark brick ring, and the shadowed recess inside it, both
    // running a little below the ground under the row's middle so they meet it where it falls away
    const span = (p.u1 - p.u0) / p.n, w = span - 1.4, r = w / 2, f = p.facing ?? 1;
    const arch = (half: number, h: number) => {
      const sh = new THREE.Shape(); sh.moveTo(-half, -1.2); sh.lineTo(half, -1.2); sh.lineTo(half, h); sh.absarc(0, h, half, 0, Math.PI, false); sh.lineTo(-half, -1.2);
      return new THREE.ShapeGeometry(sh, 8);
    };
    const ring = arch(r + 0.35, p.h), hole = arch(r, p.h);
    for (let k = 0; k < p.n; k++) {
      const u = p.u0 + span * (k + 0.5);
      for (const [geo, mat, out] of [[ring, MAT.brickDark, 0.03], [hole, MAT.roof, 0.06]] as const) {
        const m = new THREE.Mesh(geo, mat); m.position.set(u, 0, p.v + f * out); m.rotation.y = f > 0 ? 0 : Math.PI; gp.add(m);
      }
    }
  },
  board(gp, p, live) { buildBoard(gp, p, live); },
  carpark(gp, p, live) { buildCarPark(gp, p, live, seedOf(p.u0, p.v0)); },
  cycles(gp, p, live) { buildCycles(gp, p, live, seedOf(p.u, p.v)); },
  shutter(gp, p, live) { buildShutter(gp, p, live, seedOf(p.u, p.v)); },
  taxi(gp, p, live) { buildRank(gp, p, live); },
  busstop(gp, p, live) { buildBusStop(gp, p, live); },
  buslink(gp, p, live) { buildLink(gp, p, live); },
  road(gp, p) {
    const m = new THREE.Mesh(new THREE.BufferGeometry(), MAT.road), bank = new THREE.Mesh(new THREE.BufferGeometry(), BANK_MAT ??= new THREE.MeshLambertMaterial({ color: PAL.bank, side: THREE.DoubleSide }));
    m.receiveShadow = true; bank.receiveShadow = true; m.userData['bank'] = bank; gp.add(m, bank); ROADS.set(m, p); layRoad(m, p, null);
  },
  plaque(gp, p) {
    const g = new THREE.Group(); g.position.set(p.u, 0, p.v); g.rotation.y = p.facing > 0 ? 0 : Math.PI; g.visible = false; gp.add(g);
    const pier = box(g, PLAQUE_W + 0.6, 1, 0.5, MAT.sandstone, 0, 0.5, 0);
    const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
    const tex = canvas ? new THREE.CanvasTexture(canvas) : null;
    if (tex) tex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ color: tex ? 0xffffff : PAL.brass, map: tex }));
    plate.position.z = 0.26; g.add(plate);
    PLAQUES.push({ group: g, pier, plate, canvas, tex });
  },
};
// ---- the contract's plaque ----
// One part, by Stockport's entrance: a brass plate on a sandstone pier that reads the contract's number, with a line
// for each contract renewed; the plate and its pier grow a line taller each time. Drawn on a canvas where there is one.
const PLAQUE_W = 5, PLAQUE_HEAD = 1.4, PLAQUE_LINE = 0.6, PLAQUE_PX = 84;
interface Plaque { group: THREE.Group; pier: THREE.Mesh; plate: THREE.Mesh; canvas: HTMLCanvasElement | null; tex: THREE.CanvasTexture | null }
const PLAQUES: Plaque[] = [];
/** Show the plaques reading `head` over `lines` (one for each contract renewed), or hide them (null: no contract
 * renewed yet). Returns how many lines they read. */
export function setPlaque(head: string | null, lines: string[] = []): number {
  for (const q of PLAQUES) {
    q.group.visible = head !== null; if (head === null) continue;
    const h = PLAQUE_HEAD + PLAQUE_LINE * lines.length, top = 1.6 + h;
    q.pier.scale.y = top; q.pier.position.y = top / 2;
    q.plate.scale.set(PLAQUE_W, h, 1); q.plate.position.y = 1.3 + h / 2;
    const c = q.canvas, ctx = c?.getContext('2d');
    if (!c || !ctx || !q.tex) continue;
    c.width = Math.round(PLAQUE_W * PLAQUE_PX); c.height = Math.round(h * PLAQUE_PX);
    const brass = '#' + PAL.brass.getHexString(), ink = '#' + PAL['brass-ink'].getHexString();
    ctx.fillStyle = brass; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = ink; ctx.lineWidth = 8; ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
    ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 54px Georgia, serif'; ctx.fillText(head, c.width / 2, PLAQUE_HEAD * PLAQUE_PX / 2 + 6);
    ctx.font = '36px Georgia, serif';
    lines.forEach((l, k) => ctx.fillText(l, c.width / 2, (PLAQUE_HEAD + PLAQUE_LINE * (k + 0.5)) * PLAQUE_PX));
    q.tex.needsUpdate = true;
  }
  return lines.length;
}
// ---- what stands at street level, seated on the ground as drawn and again as it's read more finely ----
/** Each street's mesh and its part, and each street-level part's group with where its middle is in the world. */
const ROADS = new Map<THREE.Mesh, Extract<Part, { type: 'road' }>>();
const SEATS: { g: THREE.Group; under: [number, number][]; roads: { m: THREE.Mesh; f: Seat }[] }[] = [];
type Seat = { x: number; z: number; dx: number; dz: number; nx: number; nz: number };
const ROAD_STEP = 4, ROAD_LIFT = 0.08;
/** The grass bank a street stands on where it's above the ground (coming down off a bridge's deck). */
let BANK_MAT: THREE.Material | null = null;
/** A street's ribbon: every ROAD_STEP m or less along its points, each at the ground's height there in the world (with
 * the station at `f`), or at its own height; with no frame yet, at 0 (laid properly once the station is placed). */
function layRoad(m: THREE.Mesh, p: Extract<Part, { type: 'road' }>, f: Seat | null): void {
  const w = (p.w ?? 7) / 2, pts: [number, number, number | undefined][] = [];
  p.points.forEach((q, i) => {
    const prev = p.points[i - 1];
    if (prev) { const n = Math.max(1, Math.ceil(Math.hypot(q[0] - prev[0], q[1] - prev[1]) / ROAD_STEP)); for (let k = 1; k < n; k++) { const t = k / n, a = prev[2], b = q[2]; pts.push([prev[0] + (q[0] - prev[0]) * t, prev[1] + (q[1] - prev[1]) * t, a !== undefined && b !== undefined ? a + (b - a) * t : undefined]); } }
    pts.push([q[0], q[1], q[2]]);
  });
  const P: number[] = [], idx: number[] = [], S: number[] = [], sidx: number[] = [];
  pts.forEach(([u, v, y], i) => {
    // the ribbon's width square to the street there (the mean of the pieces either side)
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(pts.length - 1, i + 1)]!, l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nu = -(b[1] - a[1]) / l * w, nv = (b[0] - a[0]) / l * w;
    const h = (uu: number, vv: number) => y !== undefined ? y : f ? groundAt(f.x + f.dx * uu + f.nx * vv, f.z + f.dz * uu + f.nz * vv) : 0;
    const yl = h(u + nu, v + nv), yr = h(u - nu, v - nv);
    P.push(u + nu, yl + ROAD_LIFT, v + nv, u - nu, yr + ROAD_LIFT, v - nv);
    if (i) { const k = 2 * i; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    // its bank: from each edge down to the ground below it (nothing where it lies on the ground)
    const gl = f ? groundAt(f.x + f.dx * (u + nu) + f.nx * (v + nv), f.z + f.dz * (u + nu) + f.nz * (v + nv)) : yl, gr = f ? groundAt(f.x + f.dx * (u - nu) + f.nx * (v - nv), f.z + f.dz * (u - nu) + f.nz * (v - nv)) : yr;
    S.push(u + nu, yl, v + nv, u + nu * 1.6, Math.min(gl, yl) - 0.3, v + nv * 1.6, u - nu, yr, v - nv, u - nu * 1.6, Math.min(gr, yr) - 0.3, v - nv * 1.6);
    if (i) { const k = 4 * i; for (const o of [0, 2]) sidx.push(k - 4 + o, k + o, k - 3 + o, k - 3 + o, k + o, k + 1 + o); }
  });
  const g = m.geometry; g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals(); g.computeBoundingSphere();
  const bank = m.userData['bank'] as THREE.Mesh | undefined;
  if (bank) { const b = bank.geometry; b.setAttribute('position', new THREE.Float32BufferAttribute(S, 3)); b.setIndex(sidx); b.computeVertexNormals(); b.computeBoundingSphere(); }
}
let seatedAt = -1;
/** Seat every street-level part and street on the ground as it's drawn now. */
function seatAll(): void { for (const s of SEATS) seatOn(s); }
function seatOn(s: (typeof SEATS)[number]): void {
  if (s.under.length) s.g.position.y = s.under.reduce((a, [x, z]) => a + groundAt(x, z), 0) / s.under.length;
  for (const r of s.roads) layRoad(r.m, ROADS.get(r.m)!, r.f);
}

// the builders are keyed by the part's type, so the one looked up always takes the part; the cast says so once
const build = (part: Part, into: THREE.Group, live: Live) => (partBuilders[part.type] as (gp: THREE.Group, p: Part, live: Live) => void)(into, part, live);
/** A part at street level: built into a group of its own lifted (or sunk) to the ground under its middle, in a station
 * group placed at `frame` (the ground is in the world's frame; the station's group only turns about y). */
function onGround(part: Part, into: THREE.Group, live: Live, frame: { x: number; z: number; dx: number; dz: number; nx: number; nz: number }): void {
  const [u0, u1, v0, v1] = streetBox(part), at = (u: number, v: number): [number, number] => [frame.x + frame.dx * u + frame.nx * v, frame.z + frame.dz * u + frame.nz * v];
  // seated on the ground under its middle; a rank or a stop, a strip of kerb along a street, on the mean of the ground
  // under its bay's middle and corners, so on a hill neither end stands far off it
  const under = [at((u0 + u1) / 2, (v0 + v1) / 2), ...(part.type === 'taxi' || part.type === 'busstop' ? [at(u0, v0), at(u0, v1), at(u1, v0), at(u1, v1)] : [])];
  const g = new THREE.Group(); into.add(g); build(part, g, live);
  const seat = { g, under, roads: [] }; SEATS.push(seat); seatOn(seat);
}
/** The box (u0, u1, v0, v1) a street-level part stands on: a rank's or stop's bay and kerb as drawn (a rank's from a
 * cab's length before its front back past its last space, a stop's centred on it), else what the terrain would clear
 * for it (its last box, the part's own). */
export function streetBox(part: Part): [number, number, number, number] {
  const q = part as unknown as { u?: number; v?: number; back?: [number, number]; n?: number; kerb?: number };
  if ((part.type === 'taxi' || part.type === 'busstop') && q.u !== undefined && q.v !== undefined) {
    const [bu0, bv0] = q.back ?? [1, 0], l = Math.hypot(bu0, bv0) || 1, bu = bu0 / l, bv = bv0 / l, k = q.kerb ?? 1, su = -bv * k, sv = bu * k;
    const [a0, a1] = part.type === 'taxi' ? [-6.25, (q.n ?? 5) * 6.5 - 0.25] : [-9, 9], us: number[] = [], vs: number[] = [];
    for (const a of [a0, a1]) for (const c of [-2, 2.4]) { us.push(q.u + bu * a + su * c); vs.push(q.v + bv * a + sv * c); }
    return [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)];
  }
  const boxes = partBoxes({ ...part, street: false } as unknown as Parameters<typeof partBoxes>[0]), b = boxes[boxes.length - 1];
  return b ?? [0, 0, 0, 0];
}
/** A street: laid on the ground in the station's frame, and noted to be laid again as the ground is read more finely. */
function onStreet(part: Extract<Part, { type: 'road' }>, into: THREE.Group, live: Live, frame: Seat): void {
  const g = new THREE.Group(); into.add(g); build(part, g, live);
  const roads = g.children.filter((m): m is THREE.Mesh => m instanceof THREE.Mesh && ROADS.has(m)).map(m => ({ m, f: frame }));
  for (const r of roads) layRoad(r.m, part, frame);
  SEATS.push({ g, under: [], roads });
}
/** One part on its own, in the kit's frame: what the geometry check measures trains against. */
export function partGroup(part: Part): THREE.Group { const gp = new THREE.Group(); if (part.type in partBuilders) build(part, gp, emptyLive()); return gp; }

/** A group of parts shown together: when all of `needs` are bought and `until` isn't. shown: whether it showed last
 * sync; rise: how far through rising into place it is (1 once it stands); ghost: drawn as a preview of buying it. */
interface Gate { group: THREE.Group; needs: string[]; until: string | null; shown: boolean; rise: number; ghost: boolean; fold: number }
/** A station on the map: its group, the halt (fogged while locked), its scenery, the parts its upgrades reveal, and
 * where the label floats. rise: how far the halt is through rising into place once bought; fold: how far it still has
 * to fold down when it's locked again (a contract renewed), 0 once it has. */
export interface BuiltStation {
  station: Station; kit: Kit; group: THREE.Group; fixed: THREE.Group;
  gated: Gate[]; label: THREE.Object3D; lockedNow: boolean | null; rise: number; fold: number; live: Live;
}

/** A kit's rails as the map draws them: (u, v) is v across the line at u along it, as a track's offset is, so they
 * follow the line where it bends beyond the station's straight stretch (Stockport's north end turns onto the viaduct);
 * in the kit's own frame, every few metres. */
export function alongLine(net: Network, st: Station, F: Frame, points: [number, number][]): [number, number][] {
  const out: [number, number][] = [], f = newFrame();
  const put = (u: number, v: number) => {
    net.place(st.corridor, st.at + u, v, f);
    const p: [number, number] = [(f.x - F.x) * F.dx + (f.z - F.z) * F.dz, (f.x - F.x) * F.nx + (f.z - F.z) * F.nz], last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) out.push(p);   // no piece of no length
  };
  for (let i = 0; i < points.length; i++) {
    const [u1, v1] = points[i]!, prev = points[i - 1];
    if (prev) { const [u0, v0] = prev, n = Math.max(1, Math.ceil(Math.abs(u1 - u0) / 5)); for (let k = 1; k < n; k++) put(u0 + (u1 - u0) * k / n, v0 + (v1 - v0) * k / n); }
    put(u1, v1);
  }
  return out;
}

export function buildStations(scene: THREE.Scene, net: Network, kits: Record<string, Kit>): BuiltStation[] {
  return net.stations.map(st => {
    const frame = net.stationFrame(st.id);
    const gp = new THREE.Group(); gp.position.set(frame.x, 0, frame.z); gp.rotation.y = yawFor(frame); scene.add(gp);
    const label = new THREE.Object3D(); label.position.set(0, 14, 0); gp.add(label);
    const b: BuiltStation = { station: st, kit: EMPTY_KIT, group: gp, fixed: new THREE.Group(), gated: [], label, lockedNow: null, rise: 1, fold: 0, live: emptyLive() };
    const kit = kits[st.kit]; if (kit) fill(net, b, kit);
    return b;
  });
}
/** A station whose kit isn't in yet (a line out's, before the first frame's done): an empty group where it stands. */
const EMPTY_KIT: Kit = { id: '', faces: { north: { v: 0, u0: 0, u1: 0 }, south: { v: 0, u0: 0, u1: 0 } }, parts: [] };
/** Whether a station's kit is in. */
export function filled(b: BuiltStation): boolean { return b.kit !== EMPTY_KIT; }
/** Build the stations whose kits have come in since (every line out's, after the first frame) into the groups they
 * already have, so whatever holds them sees them; the indices of those built. */
export function fillStations(net: Network, built: BuiltStation[], kits: Record<string, Kit>): number[] {
  const done: number[] = [];
  built.forEach((b, i) => { const kit = kits[b.station.kit]; if (!filled(b) && kit) { fill(net, b, kit); done.push(i); } });
  return done;
}
/** Build a station's kit into its group: the halt, the scenery, a group for each set of stages. */
function fill(net: Network, b: BuiltStation, kit: Kit): void {
  const st = b.station, gp = b.group, frame = net.stationFrame(st.id);
  const fixed = b.fixed, scenery = new THREE.Group(), gates = new Map<string, Gate>(), live = b.live; gp.add(fixed); gp.add(scenery);
  // what stands at street level is seated again as the ground is read more finely, so it's never folded together
  const seats = SEATS.length;
  for (const kitPart of kit.parts) {
    if (!(kitPart.type in partBuilders)) { console.warn('unknown part', kitPart.type); continue; }
    const part = kitPart.type === 'rails' ? { ...kitPart, points: alongLine(net, st, frame, kitPart.points) } : kitPart;
    const needs = part.upgrade === undefined ? [] : Array.isArray(part.upgrade) ? part.upgrade : [part.upgrade];
    const put = (into: THREE.Group) => part.type === 'road' ? onStreet(part, into, live, frame) : part.street ? onGround(part, into, live, frame) : build(part, into, live);
    if (part.scenery || part.type === 'shutter') put(scenery);
    else if (needs.length || part.until) {
      const key = `${needs.join('+')}|${part.until ?? ''}`;
      let gate = gates.get(key);
      if (!gate) { gate = { group: new THREE.Group(), needs, until: part.until ?? null, shown: false, rise: 1, ghost: false, fold: 0 }; gate.group.visible = false; gp.add(gate.group); gates.set(key, gate); }
      put(gate.group);
    } else put(fixed);
  }
  const gated = [...gates.values()];
  // what life moves or changes stays as it is; the rest is folded together
  const keep = new Set<THREE.Object3D>();
  for (const s of SEATS.slice(seats)) s.g.traverse(q => keep.add(q));
  for (const o of [...live.boards.map(x => x.mesh), ...live.shops.map(x => x.shutter), ...live.shut.map(x => x.shutter)]) o.traverse(q => keep.add(q));
  for (const into of [fixed, scenery, ...gated.map(gt => gt.group)]) mergeStill(into, keep);
  b.kit = kit; b.gated = gated; b.lockedNow = null;   // the next sync fogs it (or not) as at the start
}

/** Fold a group's still parts into one mesh for each material (and shape of geometry): a station is hundreds of boxes,
 * each its own draw call, twice over with shadows. Only opaque meshes shown from the start and not in `keep` (what the
 * station's life moves or changes); instanced and transparent ones, whose draw order matters, stay as they are. The
 * group's own visibility, scale and materials (the ghost, the fog while locked) still apply to what's folded. */
function mergeStill(into: THREE.Group, keep: Set<THREE.Object3D>): void {
  into.updateMatrixWorld(true);
  const inv = into.matrixWorld.clone().invert(), rel = new THREE.Matrix4();
  const lists = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; from: THREE.Mesh[] }>();
  into.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || keep.has(o) || Array.isArray(o.material) || o.material.transparent) return;
    for (let p: THREE.Object3D | null = o; p && p !== into; p = p.parent) if (!p.visible) return;
    const g = o.geometry as THREE.BufferGeometry, names = Object.keys(g.attributes).sort().join();
    if (g.morphAttributes && Object.keys(g.morphAttributes).length) return;
    const key = `${o.material.uuid}|${g.index ? 'i' : 'n'}|${names}`;
    let list = lists.get(key); if (!list) { list = { mat: o.material, geos: [], from: [] }; lists.set(key, list); }
    list.geos.push(g.clone().applyMatrix4(rel.multiplyMatrices(inv, o.matrixWorld))); list.from.push(o);
  });
  for (const { mat, geos, from } of lists.values()) {
    if (from.length < 2) continue;
    const merged = mergeGeometries(geos); if (!merged) continue;
    for (const o of from) o.removeFromParent();
    const m = new THREE.Mesh(merged, mat); if (from.every(o => o.userData['noShadow'])) m.userData['noShadow'] = true; into.add(m);
  }
  for (const g of lists.values()) if (g.from.length < 2) g.geos.forEach(x => x.dispose());
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
    else if (o.userData['own']) { o.material = o.userData['own']; o.castShadow = !o.userData['noShadow']; }
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

/** One frame of folding down: how far is left after dt more real seconds (at once with reduced motion). */
const foldBy = (fold: number, dt: number) => riseS ? Math.max(0, fold - dt / riseS) : 0;
/** How many stations and parts are still folding down (a contract just renewed). */
export const foldingCount = (built: BuiltStation[]): number => built.reduce((n, b) => n + (b.fold > 0 ? 1 : 0) + b.gated.filter(gt => gt.fold > 0).length, 0);
/** Lock or unlock a station's halt: the fog's material, or its own back. */
function fog(b: BuiltStation, locked: boolean): void {
  b.fixed.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    if (locked) { if (!o.userData['mat']) o.userData['mat'] = o.material; o.material = MAT.locked; }
    else if (o.userData['mat']) o.material = o.userData['mat'];
  });
}

// Reflect ownership and upgrades: locked stations go grey and translucent, bought upgrades rise into place, the
// preview's ghosts pulse. When a contract is renewed everything bought folds back down: each stage sinks away, and each
// halt sinks and rises again in the fog, ready to buy. dt: real seconds since the last frame.
export function syncStations(built: BuiltStation[], g: GameState, dt: number): void {
  pulse += dt; GHOST.opacity = 0.4 + 0.2 * Math.sin(pulse * 4);
  if (groundVersion() !== seatedAt) { seatedAt = groundVersion(); seatAll(); }
  built.forEach((b, i) => {
    const locked = !g.owned[i], ups = (g.ups[i] ?? {}) as Ups, first = b.lockedNow === null;
    if (b.lockedNow !== locked) {
      if (!first && !locked) { b.rise = 0; b.fold = 0; fog(b, false); }   // bought: the halt rises out of the fog
      else if (!first && locked) { b.fold = 1; b.rise = 1; }              // the contract renewed: it folds down first
      else fog(b, locked);
      b.lockedNow = locked;
    }
    if (b.fold > 0) {
      b.fold = foldBy(b.fold, dt); b.fixed.scale.y = Math.max(0.01, b.fold);
      if (b.fold <= 0) { fog(b, true); b.rise = 0; }                       // ...then stands again in the fog
    } else if (b.rise < 1) { b.rise = riseBy(b.rise, dt); b.fixed.scale.y = Math.max(0.01, settle(b.rise)); }
    const has = (id: string) => !!ups[id];
    for (const gate of b.gated) {
      const show = !locked && gate.needs.every(has) && !(gate.until && has(gate.until));
      if (show && !gate.shown && !first) { gate.rise = 0; gate.fold = 0; ghost(gate, false); }   // just bought: it stops being a ghost and rises
      else if (!show && gate.shown && !first && !gate.until) { gate.fold = 1; gate.rise = 1; }  // taken away: it folds down
      gate.shown = show;
      if (gate.fold > 0) { gate.fold = foldBy(gate.fold, dt); gate.group.scale.y = Math.max(0.01, gate.fold); }
      gate.group.visible = show || gate.ghost || gate.fold > 0;
      if (gate.rise < 1) { gate.rise = riseBy(gate.rise, dt); gate.group.scale.y = Math.max(0.01, settle(gate.rise)); }
      else if (gate.fold <= 0 && gate.group.scale.y !== 1 && show) gate.group.scale.y = 1;
    }
  });
}
