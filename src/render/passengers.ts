// Passengers as figures that move: they come in through the station's entrance, walk to a spot on their platform face,
// and when a train stands at that face they walk to its nearest door and board; the ones the sim gives up on walk back
// out. All of it is cosmetic and runs in game time: the sim only says how many are waiting on each face, and the
// figures catch up with that number. Figures are about 1.4 times life size so a queue reads from the stock zoom.
// The sim's lost count shows too: someone who gives up shrugs before walking out, and when a full platform turns people
// away a few come in at the stairs, see the crowd, shrug and go back. The station earning most has a gold coin turning
// slowly over its name.
// Who's travelling shows too, from what the sim says about the hour and where people are going: commuters in work
// clothes at the peaks, students wheeling suitcases (more of them on platforms whose people are going to Piccadilly,
// for the universities), cyclists with their bikes by day, and on a few match days a crowd in the club's colours
// heading for the ground before kick-off and home after. Who someone is never changes how many there are.
// After dark each bought platform's lamps throw a warm pool of light on it (the lamps of what's been built: a second
// platform's once it's bought), so a quiet night platform reads as lamp-lit rather than gone.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAT, PAL } from './scene.ts';
import type { BuiltStation, Face, Kit } from './stations.ts';
import { TUNING } from '../sim/sim.ts';
import { clockAt } from '../sim/day.ts';
import type { GameState, Train } from '../sim/types.ts';

const geo = new THREE.CylinderGeometry(0.34, 0.42, 2.0, 7); geo.translate(0, 1.0, 0);
const head = new THREE.SphereGeometry(0.36, 7, 6); head.translate(0, 2.3, 0);
const m4 = new THREE.Matrix4(), col = new THREE.Color();
const WALK = 1.6;             // metres a game second
const AMBLE = 0.6;            // the pace of a waiting figure shuffling to a new spot
/** A fixed hash in [0, 1): the scatter is cosmetic, so it never touches the game's rng. */
const hash = (a: number, b: number) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
const CAR_LEN = 23, CAR_GAP = 0.6;
const SHRUG = 1.6;            // game seconds a figure stands and shrugs before turning back
const EARN_TAU = 900;         // game seconds the earnings rate is averaged over (a game hour and a half)
const coin = new THREE.CylinderGeometry(4, 4, 0.8, 24); coin.rotateX(Math.PI / 2);
const coinMat = new THREE.MeshLambertMaterial({ color: PAL.coin, emissive: PAL['coin-glow'] });
const COIN_Y = 36;   // clear above the station's name (which floats at 14 m) from the stock zoom, and over the tallest roof
const q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
// a suitcase on its wheels beside a student, and a bike wheeled beside a cyclist (along the platform), both 1.4 times
// life like the figures
const caseGeo = new THREE.BoxGeometry(0.7, 1.0, 0.42); caseGeo.translate(0, 0.55, 0);
const bikeGeo = (() => {
  const wheel = (x: number) => new THREE.CylinderGeometry(0.48, 0.48, 0.08, 12).rotateX(Math.PI / 2).translate(x, 0.48, 0);
  const bar = (w: number, h: number, x: number, y: number) => new THREE.BoxGeometry(w, h, 0.09).translate(x, y, 0);
  return mergeGeometries([wheel(-0.78), wheel(0.78), bar(1.5, 0.09, 0, 0.9), bar(0.09, 0.55, -0.25, 0.7), bar(0.09, 0.5, 0.62, 1.1), bar(0.12, 0.09, 0.62, 1.36)]);
})();
// a pool of lamplight on the platform under each lamp: flat, brighter in the middle where a smaller disc overlaps it,
// added to what's under it so it reads as light
const poolGeo = mergeGeometries([new THREE.CircleGeometry(4.2, 20), new THREE.CircleGeometry(2.4, 16).translate(0, 0, 0.01)]).rotateX(-Math.PI / 2);
const poolMat = new THREE.MeshBasicMaterial({ color: PAL.lamp, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const POOL_Y = 1.04, MAX_POOLS = 96;
/** A kit's lamp: where it stands and what has to be bought (and not yet bought) for it to stand. */
interface Lamp { u: number; v: number; needs: string[]; until: string | undefined }
// an umbrella: a shallow canopy over the head, bright, its colour from the instance
const brollyGeo = new THREE.ConeGeometry(1.0, 0.42, 8, 1, true); brollyGeo.translate(0, 2.98, 0);
const brollyMat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
const caseMat = new THREE.MeshLambertMaterial({ color: 0xffffff }), bikeMat = new THREE.MeshLambertMaterial({ color: PAL.bike });

/** Who a figure is: a commuter in work clothes, a student with a suitcase, a cyclist wheeling a bike, a fan in the
 * club's colours, or anyone else. */
export type Kind = 'commuter' | 'student' | 'cyclist' | 'fan' | 'other';
/** The clubs whose crowds ride the line on a match day: where their ground is (towards Manchester or at Stockport,
 * Edgeley Park) and the coat their fans wear (an index into the layer's coats). */
export const CLUBS = [{ name: 'City', ground: 'north', coat: 8 }, { name: 'United', ground: 'north', coat: 9 }, { name: 'County', ground: 'south', coat: 10 }] as const;
/** The club playing at home on a game day, by its place in CLUBS, or -1: about one day in six, the same every time for
 * a seed. Cosmetic: it changes nobody's journey. */
export function matchOn(seed: number, day: number): number {
  if (hash(seed % 9973, day * 3.17) >= 0.17) return -1;
  const h = hash(day, seed % 9973 + 5); return h < 0.45 ? 0 : h < 0.8 ? 1 : 2;
}
/** How much of a match day's crowd is about at an hour: going to the ground before a three o'clock kick-off, coming
 * home after the final whistle; 0 outside those. */
export function crowdAt(hour: number): { share: number; going: boolean } {
  if (hour >= 12 && hour < 15) return { share: 0.45, going: true };
  if (hour >= 16.8 && hour < 19) return { share: 0.45, going: false };
  return { share: 0, going: true };
}
/** Who someone joining a platform at an hour is: fans (a share of everyone, on a match day's platform towards or from
 * the ground), commuters mostly at the peaks, students more where people are going to the city (toCity, 0 to 1) and by
 * day, cyclists by day, then anyone. h: a cosmetic number in [0, 1). */
export function kindOf(hour: number, toCity: number, fans: number, h: number): Kind {
  if (h < fans) return 'fan';
  const x = fans < 1 ? (h - fans) / (1 - fans) : 0;
  const day = hour >= 6 && hour < 21, peak = (hour >= 6.5 && hour < 9.5) || (hour >= 16 && hour < 19);
  const commuter = peak ? 0.55 : day ? 0.2 : 0.3, student = (day ? 0.08 : 0.03) + 0.22 * Math.min(1, Math.max(0, toCity)), cyclist = day ? 0.07 : 0.03;
  return x < commuter ? 'commuter' : x < commuter + student ? 'student' : x < commuter + student + cyclist ? 'cyclist' : 'other';
}

/** balk: turned away by a full platform, walking in far enough to see it before shrugging and going back. */
type Mode = 'in' | 'wait' | 'board' | 'leave' | 'balk';
/** pace: this figure's walking speed as a share of WALK, so a group strings out as it comes down the stairs. shrug:
 * game seconds left of a shrug, standing still, before it walks on. */
interface Agent { u: number; v: number; tu: number; tv: number; mode: Mode; spot: number; coat: number; idle: number; pace: number; shrug: number; kind: Kind; few: boolean }
/** What a new figure is dressed as, and whether it's one of the third still drawn when figures are set to fewer. */
interface Dress { coat: number; kind: Kind; few: boolean }
/** entrance: where this face's passengers come and go: the stairs of the subway or footbridge, on the platform itself.
 * due: game seconds until the next group comes in; the sim's count rises a little every step, and letting a figure
 * in each time made a steady drip, so arrivals are held back and released a few at a time at uneven gaps. */
interface FaceLayer { face: Face; trackV: number; agents: Agent[]; nextSpot: number; entrance: { u: number; v: number }; due: number }
/** primed: the station has been synced while owned, so the figures already stand in place; before that (a loaded save,
 * a station just bought) the first count is placed directly rather than walked in as a stampede. */
/** s: where trains stop; at: where the kit stands (u = 0), so a train's u in the kit is its s minus at. lost: the sim's
 * lost count already shown; balks: turned-away people still to show, a few at a time (balkDue the gap to the next).
 * revenue, rate: the station's takings last seen and their recent rate, for the coin. */
interface Layer {
  pools: THREE.InstancedMesh; lamps: Lamp[]; lit: string;
  im: THREE.InstancedMesh; heads: THREE.InstancedMesh; cases: THREE.InstancedMesh; bikes: THREE.InstancedMesh; brollies: THREE.InstancedMesh; faces: [FaceLayer, FaceLayer]; s: number; at: number; nextCoat: number; alighted: number; primed: boolean;
  lost: number; balks: number; balkDue: number; revenue: number; rate: number; coin: THREE.Mesh;
}

/** Where a face's passengers come and go: the kit's own entrance (a terminus's concourse), else the subway or
 * footbridge's stairs, else the platform's south end. */
function entranceOf(kit: Kit, face: Face): { u: number; v: number } {
  const way = kit.parts.find(p => p.type === 'subway' || p.type === 'footbridge');
  return { u: kit.entrance ?? (way && 'u' in way ? way.u : face.u0 - 8), v: face.v };
}

/** Every lamp in a kit's rows of lamps, with what it needs bought. */
function lampsOf(kit: Kit): Lamp[] {
  const out: Lamp[] = [];
  for (const p of kit.parts) if (p.type === 'lamps' && !p.scenery) {
    const needs = p.upgrade === undefined ? [] : Array.isArray(p.upgrade) ? p.upgrade : [p.upgrade];
    for (let u = p.u0; u <= p.u1; u += p.every || 30) out.push({ u, v: p.v, needs, until: p.until });
  }
  return out;
}

export class PassengerLayer {
  max: number;
  layers: Layer[];
  private coats: THREE.Color[];
  /** Fewer figures, for older phones: a third of them drawn, none throwing a shadow. */
  private fewer = false;
  /** How lit the platforms' lamps are, 0 by day to 1 at night. */
  lamplight = 0;
  /** The station whose platforms students head for (Piccadilly, for the universities), by index; -1 for none. */
  private city: number;
  // this sync's hour, the club playing today (-1 for none) and its crowd
  private hour = 12; private club = -1; private crowd = { share: 0, going: true };
  /** stations: where each one's trains stop and its kit stands along the corridor; trackV: where the stopping service's
   * tracks run across each station, by direction. */
  constructor(builtStations: BuiltStation[], stations: { s: number; at: number }[], trackV: { north: number; south: number }[], city = -1, max = 320) {
    this.max = max; this.city = city;
    // anyone's coats first (0-3), then work clothes (4-6), a cyclist's jacket (7) and the clubs' colours (8-10)
    this.coats = [PAL.pax, PAL['pax-2'], PAL['pax-3'], PAL['pax-4'], PAL['suit-1'], PAL['suit-2'], PAL['suit-3'], PAL.cyclist, PAL['kit-city'], PAL['kit-united'], PAL['kit-county']];
    this.layers = builtStations.map((b, i) => {
      const im = new THREE.InstancedMesh(geo, MAT.paxCoat, max), heads = new THREE.InstancedMesh(head, MAT.paxHead, max);
      const cases = new THREE.InstancedMesh(caseGeo, caseMat, max / 4), bikes = new THREE.InstancedMesh(bikeGeo, bikeMat, max / 4);
      const brollies = new THREE.InstancedMesh(brollyGeo, brollyMat, max / 2);
      im.count = heads.count = cases.count = bikes.count = brollies.count = 0; im.castShadow = true; cases.frustumCulled = bikes.frustumCulled = brollies.frustumCulled = false; for (const m of [im, heads, cases, bikes, brollies]) b.group.add(m);
      const f = b.kit.faces;
      // the coin turns over the station's name, which floats over the kit's origin
      const cm = new THREE.Mesh(coin, coinMat); cm.position.copy(b.label.position).y = COIN_Y; cm.visible = false; b.group.add(cm);
      return {
        pools: this.pools(b), lamps: lampsOf(b.kit), lit: '-',
        im, heads, cases, bikes, brollies, s: stations[i]?.s ?? 0, at: stations[i]?.at ?? 0, nextCoat: i * 7, alighted: -1, primed: false,
        lost: -1, balks: 0, balkDue: 0, revenue: -1, rate: 0, coin: cm,
        faces: [{ face: f.north, trackV: trackV[i]?.north ?? 0, agents: [], nextSpot: 0, entrance: entranceOf(b.kit, f.north), due: 0 },
          { face: f.south, trackV: trackV[i]?.south ?? 0, agents: [], nextSpot: 0, entrance: entranceOf(b.kit, f.south), due: 0 }],
      };
    });
  }

  /** Where the k-th arrival stands: scattered along the platform, more of them near the stairs, and spread back from
   * the edge into the platform rather than in a line along it. */
  private spot(F: FaceLayer, k: number): [number, number] {
    const len = F.face.u1 - F.face.u0 - 8, into = Math.sign(F.face.v - F.trackV) || 1;
    // a mix of two spreads along the platform: most within 40 m of the stairs, the rest anywhere
    const nearStairs = hash(k, 1) < 0.6;
    const u = nearStairs ? F.entrance.u + (hash(k, 2) - 0.5) * 80 : F.face.u0 + 4 + hash(k, 3) * len;
    const v = F.face.v + into * (0.4 + hash(k, 4) * ((F.face.depth ?? 4) - 0.4));
    return [Math.max(F.face.u0 + 4, Math.min(F.face.u1 - 4, u)), v];
  }

  /** The door nearest u on a train standing at this station: doors sit near each car's ends. */
  private nearestDoor(tr: Train, at: number, u: number): number {
    const total = tr.cars * CAR_LEN + (tr.cars - 1) * CAR_GAP, x0 = tr.s - at - total / 2;
    let best = u, bd = Infinity;
    for (let c = 0; c < tr.cars; c++) for (const d of [2.9, CAR_LEN - 2.9]) { const x = x0 + c * (CAR_LEN + CAR_GAP) + d; const dd = Math.abs(x - u); if (dd < bd) { bd = dd; best = x; } }
    return best;
  }

  /** The station earning most: the owned one with the highest recent takings, kept until another beats it by a tenth so
   * the coin doesn't hop between two close stations. None while only one station is owned. */
  private top = -1;
  private spin = 0;

  /** The pools of lamplight for a station, none lit yet. */
  private pools(b: BuiltStation): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(poolGeo, poolMat, MAX_POOLS); m.count = 0; m.frustumCulled = false; m.renderOrder = 1; b.group.add(m); return m;
  }
  /** How lit the lamps are, from the daylight (0 night, 1 noon): on from dusk to dawn, as the scene's lamps are. */
  setDaylight(daylight: number): void {
    const lit = this.lamplight = 1 - Math.max(0, Math.min(1, (daylight - 0.04) / 0.2));
    poolMat.opacity = 0.26 * lit; poolMat.visible = lit > 0.01;
  }
  /** Light the pools under the lamps a station has standing: owned, and each lamp's upgrades bought (and its `until`
   * not). Redone only when what's bought changes. */
  private light(L: Layer, g: GameState, i: number): void {
    const ups = g.ups[i] ?? {}, owned = !!g.owned[i];
    let key = owned ? 'o' : '';
    if (owned) for (const k in ups) if (ups[k as keyof typeof ups]) key += k;
    if (key === L.lit) return;
    L.lit = key; let n = 0;
    if (owned) for (const l of L.lamps) {
      if (n >= MAX_POOLS || !l.needs.every(x => ups[x as keyof typeof ups]) || (l.until && ups[l.until as keyof typeof ups])) continue;
      m4.makeTranslation(l.u, POOL_Y, l.v); L.pools.setMatrixAt(n++, m4);
    }
    L.pools.count = n; L.pools.instanceMatrix.needsUpdate = true;
  }

  /** The share of people with an umbrella up (0 to 1): most of them in the rain, a few in the snow. */
  setRain(share: number): void { this.brollyShare = share; }
  private brollyShare = 0;
  private brollies: THREE.Color[] = [PAL['brolly-1'], PAL['brolly-2'], PAL['brolly-3'], PAL['brolly-4'], PAL['brolly-5'], PAL['suit-2']];

  /** Figures for older phones: fewer drawn (a third), none throwing a shadow. */
  setFewer(on: boolean): void { this.fewer = on; for (const L of this.layers) L.im.castShadow = !on; }

  /** Dress someone joining a face (fi, 0 towards Manchester) of station i: toCity is the share of its people going to
   * the city; arriving, they've just got off a train. Fans are on the face towards the ground before kick-off, the face
   * away from it after, and getting off at the ground's own station before. */
  private dress(L: Layer, i: number, fi: number, toCity: number, arriving: boolean): Dress {
    const n = L.nextCoat++, h = hash(n, 17 + i), h2 = hash(n, 19);
    const club = CLUBS[this.club], ground = club?.ground === 'north' ? 0 : 1;
    const fans = !club ? 0 : arriving ? (this.crowd.going ? (i === (ground === 0 ? this.city : 0) ? this.crowd.share : 0) : this.crowd.share * 0.5)
      : (fi === ground) === this.crowd.going ? this.crowd.share : 0;
    const kind = kindOf(this.hour, toCity, fans, h);
    const coat = kind === 'fan' && club ? club.coat : kind === 'commuter' ? 4 + Math.floor(h2 * 3) : kind === 'cyclist' ? 7 : Math.floor(h2 * 4);
    return { coat, kind, few: hash(n, 23) < 0.34 };
  }

  sync(g: GameState, dt: number): void {
    this.earners(g, dt);
    const clock = clockAt(g.t) / 3600;
    this.hour = clock % 24; this.club = matchOn(g.seed, Math.floor(clock / 24)); this.crowd = crowdAt(this.hour);
    this.layers.forEach((L, i) => {
      const S = g.st[i];
      this.light(L, g, i);
      if (!g.owned[i] || !S) { L.im.count = L.heads.count = L.cases.count = L.bikes.count = L.brollies.count = 0; L.primed = false; L.alighted = -1; L.lost = -1; L.balks = 0; L.faces.forEach(F => { F.agents.length = 0; F.due = 0; }); return; }
      // a train standing here, and which way it will leave: its face is the one that boards, and the one its arrivals step onto
      // (two can stand at once where two services turn round, Stockport's platforms 4 and 1); the one that came in last
      // is the one whose passengers are getting off now
      let standing: Train | null = null, standingAt: [Train | null, Train | null] = [null, null];
      for (const t of g.trains) if (t.state === 'dwell' && Math.abs(t.s - L.s) < 3) {
        standingAt[t.dir > 0 ? 0 : 1] = t; if (!standing || t.dwell > standing.dwell) standing = t;
      }
      // arrivals: the sim's count of who got off here rose, so that many step out of the doors and walk to the way out;
      // those changing trains walk out the same way and come back in on the other platform, through its own stairs,
      // when that platform's figures catch up with its count
      const off = S.alighted + S.changed;
      if (L.alighted < 0) L.alighted = off;
      else if (off > L.alighted) {
        const F = L.faces[standing && standing.dir < 0 ? 1 : 0], n = Math.min(off - L.alighted, 60);
        for (let j = 0; j < n && F.agents.length < this.max / 2; j++) {
          const door = standing ? this.nearestDoor(standing, L.at, F.face.u0 + ((j * 37) % (F.face.u1 - F.face.u0))) : (F.face.u0 + F.face.u1) / 2;
          const edge = F.face.v + Math.sign(F.trackV - F.face.v) * (Math.abs(F.trackV - F.face.v) - 2.6);
          F.agents.push({ u: door + (j % 3 - 1) * 0.8, v: edge, tu: F.entrance.u, tv: F.entrance.v, mode: 'leave', spot: -1, idle: 0, pace: 0.85 + hash(j, 8) * 0.3, shrug: 0, ...this.dress(L, i, standing && standing.dir < 0 ? 1 : 0, i === this.city ? 1 : 0.3, true) });
        }
        L.alighted = off;
      }
      // the lost count rose: whoever gave up waiting is shown below, walking out with a shrug; the rest were turned away
      // at a full platform, and a few of them (never a crowd) come in at the stairs of the fuller face to show it
      if (L.lost < 0) L.lost = S.lost;
      const lostNow = S.lost - L.lost; L.lost = S.lost;
      let shrugged = 0;
      let k = 0, nc = 0, nb = 0, nu = 0;
      L.faces.forEach((F, fi) => {
        const want = (S.q[fi] ?? []).reduce((a, c) => a + c.n, 0);
        // the share of this face's people going to the city, for who the newcomers are
        const toCity = want > 0 ? (S.q[fi] ?? []).reduce((a, c) => a + (c.dest === this.city ? c.n : 0), 0) / want : 0;
        const present = F.agents.filter(a => a.mode === 'in' || a.mode === 'wait');
        // more waiting than figures: the first count stands ready (a loaded save or a station just bought shouldn't
        // start with a stampede); after that the shortfall comes in through the entrance a group at a time, when the
        // face's timer is due. A group is one to four people, more when the figures have fallen well behind, and the
        // gap to the next is three to twenty seconds, shorter while there's a backlog, so the count still catches up.
        const short = Math.min(want - present.length, this.max / 2 - F.agents.length), into = Math.sign(F.face.v - F.trackV) || 1;
        F.due -= dt;
        if (short > 0 && (!L.primed || F.due <= 0)) {
          const sp0 = F.nextSpot, group = L.primed ? Math.min(short, 1 + Math.floor(hash(sp0, 6) * 4) + Math.floor(short / 8)) : short;
          for (let j = 0; j < group; j++) {
            const sp = F.nextSpot++; const [tu, tv] = this.spot(F, sp), idle = 10 + hash(sp, 5) * 30, pace = 0.85 + hash(sp, 8) * 0.3, dress = this.dress(L, i, fi, toCity, false);
            F.agents.push(L.primed
              // the group starts strung out behind the stairs' foot, so they come down one after another
              ? { u: F.entrance.u + (j - group / 2) * 0.9, v: F.entrance.v + into * hash(sp, 9) * 1.2, tu, tv, mode: 'in', spot: sp, idle, pace, shrug: 0, ...dress }
              : { u: tu, v: tv, tu, tv, mode: 'wait', spot: sp, idle, pace, shrug: 0, ...dress });
          }
          F.due = (3 + hash(sp0, 7) * 17) * (short > 20 ? 0.3 : 1);
        }
        // fewer: the longest-waiting board the standing train if it leaves this way, or give up and walk out
        const boarding = standingAt[fi as 0 | 1], boards = boarding !== null;
        for (let n = present.length; n > want; n--) {
          const leaver = present.find(p => p.mode === 'wait') ?? present[present.length - 1]; if (!leaver) break;
          if (boards && boarding) { leaver.mode = 'board'; leaver.tu = this.nearestDoor(boarding, L.at, leaver.u); leaver.tv = F.face.v + Math.sign(F.trackV - F.face.v) * (Math.abs(F.trackV - F.face.v) - 2.6); }
          else { leaver.mode = 'leave'; leaver.tu = F.entrance.u; leaver.tv = F.entrance.v; if (shrugged < lostNow) { leaver.shrug = SHRUG * leaver.pace; shrugged++; } }
          present.splice(present.indexOf(leaver), 1);
        }
        // walk everyone towards where they're going
        for (let j = F.agents.length - 1; j >= 0; j--) {
          const a = F.agents[j]!;
          // a waiting figure shuffles a couple of metres every so often, staying on the platform
          if (a.mode === 'wait') { a.idle -= dt; if (a.idle <= 0) { a.idle = 15 + hash(a.spot, a.idle + 7) * 40; const [su, sv] = this.spot(F, a.spot); a.tu = su + (hash(a.spot, a.idle) - 0.5) * 4; a.tv = sv + (hash(a.spot, a.idle + 1) - 0.5) * 1.5; } }
          // a shrug: stand still, shoulders up and head to one side, then walk on
          let lift = 0;
          if (a.shrug > 0) { a.shrug -= dt; lift = Math.sin(Math.max(0, a.shrug) / (SHRUG * a.pace) * Math.PI); }
          else {
            const du = a.tu - a.u, dv = a.tv - a.v, d = Math.hypot(du, dv), step = (a.mode === 'wait' ? AMBLE : WALK * a.pace) * dt;
            if (d <= step) {
              a.u = a.tu; a.v = a.tv;
              if (a.mode === 'in') a.mode = 'wait';
              else if (a.mode === 'balk') { a.mode = 'leave'; a.shrug = SHRUG * a.pace; a.tu = F.entrance.u; a.tv = F.entrance.v; }
              else if (a.mode !== 'wait') { F.agents.splice(j, 1); continue; }
            } else { a.u += du / d * step; a.v += dv / d * step; }
          }
          if (k < this.max && (a.few || !this.fewer)) {
            // a student's case at their side, a cyclist's bike beside them along the platform
            if (a.kind === 'student' && nc < this.max / 4) { m4.makeTranslation(a.u + 0.75, 1, a.v); L.cases.setMatrixAt(nc, m4); L.cases.setColorAt(nc, a.coat % 2 ? PAL.case : PAL['case-2']); nc++; }
            else if (a.kind === 'cyclist' && nb < this.max / 4) { m4.makeTranslation(a.u, 1, a.v + 0.85); L.bikes.setMatrixAt(nb++, m4); }
            if (lift > 0) {
              // a little hop with the shoulders up and the head to one side: readable from the stock zoom, and a shrug
              const y = 1 + 0.5 * lift;
              m4.compose(pos.set(a.u, y, a.v), q.identity(), sc.set(1 + 0.25 * lift, 1, 1 + 0.25 * lift)); L.im.setMatrixAt(k, m4);
              m4.makeTranslation(a.u + 0.3 * lift, y - 0.15 * lift, a.v); L.heads.setMatrixAt(k, m4);
            } else { m4.makeTranslation(a.u, 1, a.v); L.im.setMatrixAt(k, m4); L.heads.setMatrixAt(k, m4); }
            L.im.setColorAt(k, this.coats[a.coat] ?? col); k++;
            // an umbrella up in the rain, over most heads; never on a cyclist wheeling a bike
            const own = (a.pace * 97.13) % 1;
            if (own < this.brollyShare && a.kind !== 'cyclist' && nu < this.max / 2) {
              m4.makeTranslation(a.u, 1 + 0.5 * lift, a.v); L.brollies.setMatrixAt(nu, m4);
              L.brollies.setColorAt(nu, this.brollies[Math.floor(own * 61) % this.brollies.length]!); nu++;
            }
          }
        }
      });
      // the turned-away: one or two at a time, every few seconds, at the face with the bigger crowd
      const fuller = L.faces[(S.q[1] ?? []).reduce((a, c) => a + c.n, 0) > (S.q[0] ?? []).reduce((a, c) => a + c.n, 0) ? 1 : 0];
      L.balks = Math.min(6, L.balks + Math.max(0, lostNow - shrugged)); L.balkDue -= dt;
      if (L.balks > 0 && L.balkDue <= 0 && fuller.agents.length < this.max / 2) {
        const n = Math.min(L.balks, 1 + Math.floor(hash(L.nextCoat, 11) * 2)), into2 = Math.sign(fuller.face.v - fuller.trackV) || 1;
        for (let j = 0; j < n; j++) {
          const h = hash(L.nextCoat, 12 + j), toward = Math.sign((fuller.face.u0 + fuller.face.u1) / 2 - fuller.entrance.u) || 1;
          fuller.agents.push({ u: fuller.entrance.u - toward * j * 0.9, v: fuller.entrance.v, tu: fuller.entrance.u + toward * (3 + h * 4), tv: fuller.entrance.v + into2 * (0.5 + h * 1.5),
            mode: 'balk', spot: -1, idle: 0, pace: 0.85 + h * 0.3, shrug: 0, ...this.dress(L, i, fuller === L.faces[0] ? 0 : 1, 0, false) });
        }
        L.balks -= n; L.balkDue = 2 + hash(L.nextCoat, 13) * 5;
      }
      L.primed = true;
      L.im.count = L.heads.count = k; L.im.instanceMatrix.needsUpdate = true; L.heads.instanceMatrix.needsUpdate = true;
      if (L.im.instanceColor) L.im.instanceColor.needsUpdate = true;
      L.brollies.count = nu; L.brollies.instanceMatrix.needsUpdate = true; if (L.brollies.instanceColor) L.brollies.instanceColor.needsUpdate = true;
      L.cases.count = nc; L.bikes.count = nb; L.cases.instanceMatrix.needsUpdate = true; L.bikes.instanceMatrix.needsUpdate = true;
      if (L.cases.instanceColor) L.cases.instanceColor.needsUpdate = true;
    });
  }

  /** Follow each station's takings and hang the coin over the name of the one earning most. */
  private earners(g: GameState, dt: number): void {
    let best = -1, bestRate = 0, owned = 0;
    this.layers.forEach((L, i) => {
      const S = g.st[i];
      if (!g.owned[i] || !S) { L.revenue = -1; L.rate = 0; return; }
      owned++;
      // first seen (a loaded save, a page just opened): start from the station's takings over the whole game so far
      if (L.revenue < 0) { L.revenue = S.revenue; L.rate = g.t > 0 ? S.revenue / g.t : 0; }
      const k = dt > 0 ? Math.min(1, dt / EARN_TAU) : 0;
      L.rate += ((dt > 0 ? (S.revenue - L.revenue) / dt : 0) - L.rate) * k; L.revenue = S.revenue;
      if (L.rate > bestRate) { bestRate = L.rate; best = i; }
    });
    const cur = this.layers[this.top];
    if (owned < 2 || best < 0) this.top = -1;
    else if (!cur || !g.owned[this.top] || bestRate > cur.rate * 1.1) this.top = best;
    this.spin += dt;
    this.layers.forEach((L, i) => {
      L.coin.visible = i === this.top;
      if (L.coin.visible) { L.coin.rotation.y = this.spin * 0.8; L.coin.position.y = COIN_Y + Math.sin(this.spin * 0.9) * 0.4; }
    });
  }
}
