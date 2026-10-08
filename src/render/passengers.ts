// Passengers as figures that move: they come in through the station's entrance, walk to a spot on their platform face,
// and when a train stands at that face they walk to its nearest door and board; the ones the sim gives up on walk back
// out. All of it is cosmetic and runs in game time: the sim only says how many are waiting on each face, and the
// figures catch up with that number. Figures are about 1.4 times life size so a queue reads from the stock zoom.
import * as THREE from 'three';
import { MAT, PAL } from './scene.ts';
import type { BuiltStation, Face, Part } from './stations.ts';
import type { GameState, Train } from '../sim/types.ts';

const geo = new THREE.CylinderGeometry(0.34, 0.42, 2.0, 7); geo.translate(0, 1.0, 0);
const head = new THREE.SphereGeometry(0.36, 7, 6); head.translate(0, 2.3, 0);
const m4 = new THREE.Matrix4(), col = new THREE.Color();
const WALK = 1.6;             // metres a game second
const AMBLE = 0.6;            // the pace of a waiting figure shuffling to a new spot
/** A fixed hash in [0, 1): the scatter is cosmetic, so it never touches the game's rng. */
const hash = (a: number, b: number) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };
const CAR_LEN = 23, CAR_GAP = 0.6;

type Mode = 'in' | 'wait' | 'board' | 'leave';
/** pace: this figure's walking speed as a share of WALK, so a group strings out as it comes down the stairs. */
interface Agent { u: number; v: number; tu: number; tv: number; mode: Mode; spot: number; coat: number; idle: number; pace: number }
/** entrance: where this face's passengers come and go: the stairs of the subway or footbridge, on the platform itself.
 * due: game seconds until the next group comes in; the sim's count rises a little every step, and letting a figure
 * in each time made a steady drip, so arrivals are held back and released a few at a time at uneven gaps. */
interface FaceLayer { face: Face; trackV: number; agents: Agent[]; nextSpot: number; entrance: { u: number; v: number }; due: number }
/** primed: the station has been synced while owned, so the figures already stand in place; before that (a loaded save,
 * a station just bought) the first count is placed directly rather than walked in as a stampede. */
interface Layer { im: THREE.InstancedMesh; heads: THREE.InstancedMesh; faces: [FaceLayer, FaceLayer]; s: number; nextCoat: number; alighted: number; primed: boolean }

/** Where a face's passengers come and go: the subway or footbridge's stairs if the kit has one, else the platform's south end. */
function entranceOf(parts: Part[], face: Face): { u: number; v: number } {
  const way = parts.find(p => p.type === 'subway' || p.type === 'footbridge');
  return { u: way && 'u' in way ? way.u : face.u0 - 8, v: face.v };
}

export class PassengerLayer {
  max: number;
  layers: Layer[];
  private coats: THREE.Color[];
  /** stationS: each station's distance along the corridor; trackV: the stopping service's track offsets by direction. */
  constructor(builtStations: BuiltStation[], stationS: number[], trackV: { north: number; south: number }, max = 320) {
    this.max = max;
    this.coats = [PAL.pax, PAL['pax-2'], PAL['pax-3'], PAL['pax-4']];
    this.layers = builtStations.map((b, i) => {
      const im = new THREE.InstancedMesh(geo, MAT.paxCoat, max), heads = new THREE.InstancedMesh(head, MAT.paxHead, max);
      im.count = heads.count = 0; im.castShadow = true; b.group.add(im); b.group.add(heads);
      const f = b.kit.faces;
      return {
        im, heads, s: stationS[i] ?? 0, nextCoat: i * 7, alighted: -1, primed: false,
        faces: [{ face: f.north, trackV: trackV.north, agents: [], nextSpot: 0, entrance: entranceOf(b.kit.parts, f.north), due: 0 },
          { face: f.south, trackV: trackV.south, agents: [], nextSpot: 0, entrance: entranceOf(b.kit.parts, f.south), due: 0 }],
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
    const v = F.face.v + into * (0.6 + hash(k, 4) * 5.5);
    return [Math.max(F.face.u0 + 4, Math.min(F.face.u1 - 4, u)), v];
  }

  /** The door nearest u on a train standing at this station: doors sit near each car's ends. */
  private nearestDoor(tr: Train, stationS: number, u: number): number {
    const total = tr.cars * CAR_LEN + (tr.cars - 1) * CAR_GAP, x0 = tr.s - stationS - total / 2;
    let best = u, bd = Infinity;
    for (let c = 0; c < tr.cars; c++) for (const d of [2.9, CAR_LEN - 2.9]) { const x = x0 + c * (CAR_LEN + CAR_GAP) + d; const dd = Math.abs(x - u); if (dd < bd) { bd = dd; best = x; } }
    return best;
  }

  sync(g: GameState, dt: number): void {
    this.layers.forEach((L, i) => {
      const S = g.st[i];
      if (!g.owned[i] || !S) { L.im.count = L.heads.count = 0; L.primed = false; L.alighted = -1; L.faces.forEach(F => { F.agents.length = 0; F.due = 0; }); return; }
      // a train standing here, and which way it will leave: its face is the one that boards, and the one its arrivals step onto
      const standing = g.trains.find(t => t.state === 'dwell' && Math.abs(t.s - L.s) < 3) ?? null;
      // arrivals: the sim's count of who got off here rose, so that many step out of the doors and walk to the exit
      // (when a second service exists, a transfer would instead be sent to the other face's spot)
      if (L.alighted < 0) L.alighted = S.alighted;
      else if (S.alighted > L.alighted) {
        const F = L.faces[standing && standing.dir < 0 ? 1 : 0], n = Math.min(S.alighted - L.alighted, 60);
        for (let j = 0; j < n && F.agents.length < this.max / 2; j++) {
          const door = standing ? this.nearestDoor(standing, L.s, F.face.u0 + ((j * 37) % (F.face.u1 - F.face.u0))) : (F.face.u0 + F.face.u1) / 2;
          const edge = F.face.v + Math.sign(F.trackV - F.face.v) * (Math.abs(F.trackV - F.face.v) - 2.6);
          F.agents.push({ u: door + (j % 3 - 1) * 0.8, v: edge, tu: F.entrance.u, tv: F.entrance.v, mode: 'leave', spot: -1, coat: L.nextCoat++ % this.coats.length, idle: 0, pace: 0.85 + hash(j, 8) * 0.3 });
        }
        L.alighted = S.alighted;
      }
      let k = 0;
      L.faces.forEach((F, fi) => {
        const want = (S.q[fi] ?? []).reduce((a, c) => a + c.n, 0);
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
            const sp = F.nextSpot++; const [tu, tv] = this.spot(F, sp), coat = L.nextCoat++ % this.coats.length, idle = 10 + hash(sp, 5) * 30, pace = 0.85 + hash(sp, 8) * 0.3;
            F.agents.push(L.primed
              // the group starts strung out behind the stairs' foot, so they come down one after another
              ? { u: F.entrance.u + (j - group / 2) * 0.9, v: F.entrance.v + into * hash(sp, 9) * 1.2, tu, tv, mode: 'in', spot: sp, coat, idle, pace }
              : { u: tu, v: tv, tu, tv, mode: 'wait', spot: sp, coat, idle, pace });
          }
          F.due = (3 + hash(sp0, 7) * 17) * (short > 20 ? 0.3 : 1);
        }
        // fewer: the longest-waiting board the standing train if it leaves this way, or give up and walk out
        const boards = standing !== null && (standing.dir > 0 ? 0 : 1) === fi;
        for (let n = present.length; n > want; n--) {
          const leaver = present.find(p => p.mode === 'wait') ?? present[present.length - 1]; if (!leaver) break;
          if (boards && standing) { leaver.mode = 'board'; leaver.tu = this.nearestDoor(standing, L.s, leaver.u); leaver.tv = F.face.v + Math.sign(F.trackV - F.face.v) * (Math.abs(F.trackV - F.face.v) - 2.6); }
          else { leaver.mode = 'leave'; leaver.tu = F.entrance.u; leaver.tv = F.entrance.v; }
          present.splice(present.indexOf(leaver), 1);
        }
        // walk everyone towards where they're going
        for (let j = F.agents.length - 1; j >= 0; j--) {
          const a = F.agents[j]!;
          // a waiting figure shuffles a couple of metres every so often, staying on the platform
          if (a.mode === 'wait') { a.idle -= dt; if (a.idle <= 0) { a.idle = 15 + hash(a.spot, a.idle + 7) * 40; const [su, sv] = this.spot(F, a.spot); a.tu = su + (hash(a.spot, a.idle) - 0.5) * 4; a.tv = sv + (hash(a.spot, a.idle + 1) - 0.5) * 1.5; } }
          const du = a.tu - a.u, dv = a.tv - a.v, d = Math.hypot(du, dv), step = (a.mode === 'wait' ? AMBLE : WALK * a.pace) * dt;
          if (d <= step) { a.u = a.tu; a.v = a.tv; if (a.mode === 'in') a.mode = 'wait'; else if (a.mode !== 'wait') { F.agents.splice(j, 1); continue; } }
          else { a.u += du / d * step; a.v += dv / d * step; }
          if (k < this.max) {
            m4.makeTranslation(a.u, 1, a.v); L.im.setMatrixAt(k, m4); L.heads.setMatrixAt(k, m4);
            L.im.setColorAt(k, this.coats[a.coat] ?? col); k++;
          }
        }
      });
      L.primed = true;
      L.im.count = L.heads.count = k; L.im.instanceMatrix.needsUpdate = true; L.heads.instanceMatrix.needsUpdate = true;
      if (L.im.instanceColor) L.im.instanceColor.needsUpdate = true;
    });
  }
}
