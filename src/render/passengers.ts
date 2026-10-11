// Passengers as figures that move: they come in through the station's entrance, walk to a spot on their platform face,
// and when a train stands at that face they walk to its nearest door and board; the ones the sim gives up on walk back
// out. All of it is cosmetic and runs in game time: the sim only says how many are waiting on each face, and the
// figures catch up with that number. Figures are about 1.4 times life size so a queue reads from the stock zoom.
// The sim's lost count shows too: someone who gives up shrugs before walking out, and when a full platform turns people
// away a few come in at the stairs, see the crowd, shrug and go back. The station earning most has a gold coin turning
// slowly over its name.
import * as THREE from 'three';
import { MAT, PAL } from './scene.ts';
import type { BuiltStation, Face, Kit } from './stations.ts';
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

/** balk: turned away by a full platform, walking in far enough to see it before shrugging and going back. */
type Mode = 'in' | 'wait' | 'board' | 'leave' | 'balk';
/** pace: this figure's walking speed as a share of WALK, so a group strings out as it comes down the stairs. shrug:
 * game seconds left of a shrug, standing still, before it walks on. */
interface Agent { u: number; v: number; tu: number; tv: number; mode: Mode; spot: number; coat: number; idle: number; pace: number; shrug: number }
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
  im: THREE.InstancedMesh; heads: THREE.InstancedMesh; faces: [FaceLayer, FaceLayer]; s: number; at: number; nextCoat: number; alighted: number; primed: boolean;
  lost: number; balks: number; balkDue: number; revenue: number; rate: number; coin: THREE.Mesh;
}

/** Where a face's passengers come and go: the kit's own entrance (a terminus's concourse), else the subway or
 * footbridge's stairs, else the platform's south end. */
function entranceOf(kit: Kit, face: Face): { u: number; v: number } {
  const way = kit.parts.find(p => p.type === 'subway' || p.type === 'footbridge');
  return { u: kit.entrance ?? (way && 'u' in way ? way.u : face.u0 - 8), v: face.v };
}

export class PassengerLayer {
  max: number;
  layers: Layer[];
  private coats: THREE.Color[];
  /** stations: where each one's trains stop and its kit stands along the corridor; trackV: where the stopping service's
   * tracks run across each station, by direction. */
  constructor(builtStations: BuiltStation[], stations: { s: number; at: number }[], trackV: { north: number; south: number }[], max = 320) {
    this.max = max;
    this.coats = [PAL.pax, PAL['pax-2'], PAL['pax-3'], PAL['pax-4']];
    this.layers = builtStations.map((b, i) => {
      const im = new THREE.InstancedMesh(geo, MAT.paxCoat, max), heads = new THREE.InstancedMesh(head, MAT.paxHead, max);
      im.count = heads.count = 0; im.castShadow = true; b.group.add(im); b.group.add(heads);
      const f = b.kit.faces;
      // the coin turns over the station's name, which floats over the kit's origin
      const cm = new THREE.Mesh(coin, coinMat); cm.position.copy(b.label.position).y = COIN_Y; cm.visible = false; b.group.add(cm);
      return {
        im, heads, s: stations[i]?.s ?? 0, at: stations[i]?.at ?? 0, nextCoat: i * 7, alighted: -1, primed: false,
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

  sync(g: GameState, dt: number): void {
    this.earners(g, dt);
    this.layers.forEach((L, i) => {
      const S = g.st[i];
      if (!g.owned[i] || !S) { L.im.count = L.heads.count = 0; L.primed = false; L.alighted = -1; L.lost = -1; L.balks = 0; L.faces.forEach(F => { F.agents.length = 0; F.due = 0; }); return; }
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
          F.agents.push({ u: door + (j % 3 - 1) * 0.8, v: edge, tu: F.entrance.u, tv: F.entrance.v, mode: 'leave', spot: -1, coat: L.nextCoat++ % this.coats.length, idle: 0, pace: 0.85 + hash(j, 8) * 0.3, shrug: 0 });
        }
        L.alighted = off;
      }
      // the lost count rose: whoever gave up waiting is shown below, walking out with a shrug; the rest were turned away
      // at a full platform, and a few of them (never a crowd) come in at the stairs of the fuller face to show it
      if (L.lost < 0) L.lost = S.lost;
      const lostNow = S.lost - L.lost; L.lost = S.lost;
      let shrugged = 0;
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
              ? { u: F.entrance.u + (j - group / 2) * 0.9, v: F.entrance.v + into * hash(sp, 9) * 1.2, tu, tv, mode: 'in', spot: sp, coat, idle, pace, shrug: 0 }
              : { u: tu, v: tv, tu, tv, mode: 'wait', spot: sp, coat, idle, pace, shrug: 0 });
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
          if (k < this.max) {
            if (lift > 0) {
              // a little hop with the shoulders up and the head to one side: readable from the stock zoom, and a shrug
              const y = 1 + 0.5 * lift;
              m4.compose(pos.set(a.u, y, a.v), q.identity(), sc.set(1 + 0.25 * lift, 1, 1 + 0.25 * lift)); L.im.setMatrixAt(k, m4);
              m4.makeTranslation(a.u + 0.3 * lift, y - 0.15 * lift, a.v); L.heads.setMatrixAt(k, m4);
            } else { m4.makeTranslation(a.u, 1, a.v); L.im.setMatrixAt(k, m4); L.heads.setMatrixAt(k, m4); }
            L.im.setColorAt(k, this.coats[a.coat] ?? col); k++;
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
            mode: 'balk', spot: -1, coat: L.nextCoat++ % this.coats.length, idle: 0, pace: 0.85 + h * 0.3, shrug: 0 });
        }
        L.balks -= n; L.balkDue = 2 + hash(L.nextCoat, 13) * 5;
      }
      L.primed = true;
      L.im.count = L.heads.count = k; L.im.instanceMatrix.needsUpdate = true; L.heads.instanceMatrix.needsUpdate = true;
      if (L.im.instanceColor) L.im.instanceColor.needsUpdate = true;
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
