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
const CAR_LEN = 23, CAR_GAP = 0.6;

type Mode = 'in' | 'wait' | 'board' | 'leave';
interface Agent { u: number; v: number; tu: number; tv: number; mode: Mode; spot: number; coat: number }
/** entrance: where this face's passengers come and go: the stairs of the subway or footbridge, on the platform itself. */
interface FaceLayer { face: Face; trackV: number; agents: Agent[]; nextSpot: number; entrance: { u: number; v: number } }
interface Layer { im: THREE.InstancedMesh; heads: THREE.InstancedMesh; faces: [FaceLayer, FaceLayer]; s: number; nextCoat: number; alighted: number }

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
        im, heads, s: stationS[i] ?? 0, nextCoat: i * 7, alighted: -1,
        faces: [{ face: f.north, trackV: trackV.north, agents: [], nextSpot: 0, entrance: entranceOf(b.kit.parts, f.north) },
          { face: f.south, trackV: trackV.south, agents: [], nextSpot: 0, entrance: entranceOf(b.kit.parts, f.south) }],
      };
    });
  }

  private spot(F: FaceLayer, k: number): [number, number] {
    const len = F.face.u1 - F.face.u0, row = Math.floor(k / 2), c = k % 2;
    return [F.face.u0 + 6 + (row * 2.6) % (len - 12), F.face.v + (c - 0.5) * 1.8 + ((row * 7) % 3) * 0.5];
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
      if (!g.owned[i] || !S) { L.im.count = L.heads.count = 0; L.faces.forEach(F => { F.agents.length = 0; }); return; }
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
          F.agents.push({ u: door + (j % 3 - 1) * 0.8, v: edge, tu: F.entrance.u, tv: F.entrance.v, mode: 'leave', spot: -1, coat: L.nextCoat++ % this.coats.length });
        }
        L.alighted = S.alighted;
      }
      let k = 0;
      L.faces.forEach((F, fi) => {
        const want = (S.q[fi] ?? []).reduce((a, c) => a + c.n, 0);
        const present = F.agents.filter(a => a.mode === 'in' || a.mode === 'wait');
        // more waiting than figures: new arrivals walk in from the entrance (or stand ready when the face was empty:
        // a loaded save or a station just bought shouldn't start with a stampede)
        const fresh = F.agents.length === 0;
        for (let n = present.length; n < want && F.agents.length < this.max / 2; n++) {
          const sp = F.nextSpot++; const [tu, tv] = this.spot(F, sp);
          F.agents.push(fresh ? { u: tu, v: tv, tu, tv, mode: 'wait', spot: sp, coat: L.nextCoat++ % this.coats.length }
            : { u: F.entrance.u, v: F.entrance.v, tu, tv, mode: 'in', spot: sp, coat: L.nextCoat++ % this.coats.length });
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
          const du = a.tu - a.u, dv = a.tv - a.v, d = Math.hypot(du, dv), step = WALK * dt;
          if (d <= step) { a.u = a.tu; a.v = a.tv; if (a.mode === 'in') a.mode = 'wait'; else if (a.mode !== 'wait') { F.agents.splice(j, 1); continue; } }
          else { a.u += du / d * step; a.v += dv / d * step; }
          if (k < this.max) {
            m4.makeTranslation(a.u, 1, a.v); L.im.setMatrixAt(k, m4); L.heads.setMatrixAt(k, m4);
            L.im.setColorAt(k, this.coats[a.coat] ?? col); k++;
          }
        }
      });
      L.im.count = L.heads.count = k; L.im.instanceMatrix.needsUpdate = true; L.heads.instanceMatrix.needsUpdate = true;
      if (L.im.instanceColor) L.im.instanceColor.needsUpdate = true;
    });
  }
}
