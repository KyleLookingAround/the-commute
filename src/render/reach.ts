// The reach on the map: a warm glow on the ground round each owned station, over the homes from which the trip to where
// people are going fits their time budget door to door, a fainter outer ring where its car park or bus link brings
// people from, and a view that shades the ground by minutes to Manchester.
// Read from the sim's journeys (Sim.journey), never changing it; one shader on the terrain, its targets worked out
// again only when the journeys change (a purchase, units in service), its radii easing towards them.
import * as THREE from 'three';
import { Sim, TUNING } from '../sim/sim.ts';
import type { Network } from '../sim/network.ts';
import type { GameState, LineUpgradeId } from '../sim/types.ts';
import { build } from '../sim/places.ts';
import { PAL } from './scene.ts';
import { accessReach } from '../sim/access.ts';

/** How fast people walk from home to the station on the map: metres a minute as the crow flies (4.8 km/h on the road). */
export const WALK_M = 70;
/** Minutes to Manchester where each of the minutes view's bands ends (the last band ends the shading). */
export const BANDS = [20, 30, 40, 50] as const;

/** Where people from station i are mostly going (`Sim.destination`): Piccadilly for every station but itself. */
export function destination(sim: Sim, i: number): number | null { return sim.destination(i); }

/** The reach of an owned station, in metres from it: how far from home the walk can start and the trip to where people
 * are going still feel no longer than the budget (half of people's budgets are longer, so the edge is soft). The sim's
 * walk is the average one, `TUNING.walk`, plus the station's own (round to the far side, the stairs); a home at the
 * station's door walks only the station's own part. 0 for a locked station. */
export function reachOf(sim: Sim, i: number): number {
  if (!sim.g.owned[i]) return 0;
  const j = destination(sim, i), J = j === null ? null : sim.journey(i, j);
  if (!J) return 0;
  return Math.max(0, WALK_M * ((TUNING.budget - J.felt) / TUNING.walkWeight + TUNING.walk) / 60);
}

/** Minutes to Manchester from station i's door, as people really spend them (not as they feel): the station's own part
 * of the walk, the wait, the ride and any change, and the walk at the far end. Piccadilly's door is Manchester. null
 * for a locked station or one no train takes to Piccadilly. */
export function minutesOf(sim: Sim, i: number, picc: number): number | null {
  if (i === picc) return 0;
  if (!sim.g.owned[i]) return null;
  const J = sim.journey(i, picc);
  return J ? (J.walk - TUNING.walk + J.wait + J.ride) / 60 : null;
}

/** A copy of the sim with one more thing bought, for looking ahead: its state's places are its own, the rest is shared
 * and never stepped. */
export function withBought(sim: Sim, i: number | null, id: string): Sim {
  const g = { ...sim.g, places: Object.fromEntries(Object.entries(sim.g.places).map(([k, r]) => [k, { ...r }])) } as GameState;
  const at = i === null ? (id in sim.g.line ? sim.linePlace(id as LineUpgradeId) : null) : sim.upgradePlace(i, id)?.[0] ?? null;
  if (at) build(g, at, i === null || id !== 'bus' ? id : undefined);
  return new Sim(sim.net, g);
}

/** What buying something saves, in words for its card ("4 min less walk for about 1,200 homes"), or null when it
 * saves no minutes on the trips people make most. Homes are the stations' homes now (grown), weighted by how much each saves. */
export function savingText(sim: Sim, i: number | null, id: string): string | null {
  const after = withBought(sim, i, id);
  let homes = 0, walk = 0, wait = 0, ride = 0, felt = 0;
  sim.S.forEach((_, k) => {
    if (!sim.g.owned[k]) return;
    const j = destination(sim, k), a = j === null ? null : sim.journey(k, j), b = j === null ? null : after.journey(k, j);
    if (!a || !b) return;
    const dw = a.walk - b.walk, dq = a.wait - b.wait, dr = a.ride - b.ride, df = a.felt - b.felt;
    if (Math.max(dw + dq + dr, df) < 30) return;
    const h = sim.homes(k);
    homes += h; walk += h * dw; wait += h * dq; ride += h * dr; felt += h * df;
  });
  if (!homes) return null;
  const min = (s: number) => `${Math.max(1, Math.round(s / homes / 60))} min`, who = `for about ${about(homes)} homes`;
  const all = walk + wait + ride;
  if (all < 30 * homes) return `Waits feel ${min(felt)} shorter ${who}`;
  if (walk >= 0.8 * all) return `${min(walk)} less walk ${who}`;
  if (wait >= 0.8 * all) return `${min(wait)} less waiting ${who}`;
  if (ride >= 0.8 * all) return `${min(ride)} quicker ride ${who}`;
  return `${min(all)} quicker door to door ${who}`;
}
/** A count rounded to two figures, the way people say it: 260, 1,200. */
function about(n: number): string {
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(1, n))) - 1));
  return (Math.round(n / p) * p).toLocaleString('en-GB');
}

const EASE = 4;   // the glow eases towards a new reach at this rate a second: most of the way in about a second

/** The terrain's reach: the glow, the ghost ring a card's preview draws, and the minutes view, as one shader patch. */
export class ReachLayer {
  readonly n: number;
  private xz: Float32Array; private r: Float32Array; private target: Float32Array; private ghost: Float32Array; private mins: Float32Array;
  /** The outer ring (a car park's or bus link's reach): drawn now, easing to, and the preview's ghost of it. */
  private o: Float32Array; private oTarget: Float32Array; private oGhost: Float32Array;
  private uniforms: Record<string, THREE.IUniform>;
  private key = -1; private picc: number; private reduced = false; private minsOn = 0; private minsTarget = 0;
  constructor(ground: THREE.MeshLambertMaterial, net: Network) {
    const n = this.n = net.stations.length;
    this.xz = new Float32Array(n * 2); this.r = new Float32Array(n); this.target = new Float32Array(n); this.ghost = new Float32Array(n); this.mins = new Float32Array(n);
    this.o = new Float32Array(n); this.oTarget = new Float32Array(n); this.oGhost = new Float32Array(n);
    net.stations.forEach((st, i) => { const f = net.stationFrame(st.id); this.xz[i * 2] = f.x; this.xz[i * 2 + 1] = f.z; });
    this.picc = net.stations.findIndex(s => s.id === 'piccadilly');
    this.uniforms = {
      uSt: { value: this.xz }, uR: { value: this.r }, uGhost: { value: this.ghost }, uMins: { value: this.mins },
      uO: { value: this.o }, uOGhost: { value: this.oGhost }, uOuter: { value: PAL['reach-outer'] },
      uMinsOn: { value: 0 }, uWalk: { value: WALK_M },
      uReach: { value: PAL.reach }, uGhostC: { value: PAL.ghost },
      uBand: { value: [PAL['mins-1'], PAL['mins-2'], PAL['mins-3'], PAL['mins-4']] },
      uBandAt: { value: new Float32Array(BANDS) },
    };
    patch(ground, n, this.uniforms);
  }
  setReducedMotion(reduced: boolean): void { this.reduced = reduced; }
  /** Show the minutes view (the ground shaded by minutes to Manchester) or the glow. */
  showMinutes(on: boolean): void { this.minsTarget = on ? 1 : 0; }
  get minutesOn(): boolean { return this.minsTarget === 1; }
  /** The radius each station's glow is drawing now, and what it's easing to (for the checks). */
  radii(): { now: number[]; target: number[]; outer: number[] } { return { now: [...this.r], target: [...this.target], outer: [...this.oTarget] }; }
  /** Draw a ghost ring where buying something would put each station's reach (only where it moves), or none. */
  preview(after: Sim | null): void {
    this.ghost.fill(0); this.oGhost.fill(0); if (!after) return;
    for (let i = 0; i < this.n; i++) {
      const r = reachOf(after, i); if (Math.abs(r - this.target[i]!) > 5) this.ghost[i] = Math.max(1, r);
      const o = accessReach(after, TUNING, i); if (Math.abs(o - this.oTarget[i]!) > 5) this.oGhost[i] = Math.max(1, o);
    }
  }
  /** How many ghost rings are drawn. */
  ghosts(): number { let k = 0; for (let i = 0; i < this.n; i++) { if (this.ghost[i]! > 0) k++; if (this.oGhost[i]! > 0) k++; } return k; }
  /** One frame: work the targets out again if the journeys changed, and ease the glow towards them. */
  sync(sim: Sim, dt: number): void {
    // the journeys, and which car parks and bus links are built (they don't change the journeys, only the outer ring)
    let k = sim.journeyKey();
    for (let i = 0; i < this.n; i++) { const u = sim.g.ups[i]; if (u?.carpark || u?.bus) k = (Math.imul(k, 31) + i + 1) >>> 0; }
    if (k !== this.key) {
      this.key = k;
      for (let i = 0; i < this.n; i++) { this.target[i] = reachOf(sim, i); this.oTarget[i] = accessReach(sim, TUNING, i); this.mins[i] = minutesOf(sim, i, this.picc) ?? -1; }
      if (this.reduced) { this.r.set(this.target); this.o.set(this.oTarget); }
    }
    const t = this.reduced ? 1 : 1 - Math.exp(-EASE * dt);
    for (let i = 0; i < this.n; i++) { const d = this.target[i]! - this.r[i]!; this.r[i] = Math.abs(d) < 0.5 ? this.target[i]! : this.r[i]! + d * t; }
    for (let i = 0; i < this.n; i++) { const d = this.oTarget[i]! - this.o[i]!; this.o[i] = Math.abs(d) < 0.5 ? this.oTarget[i]! : this.o[i]! + d * t; }
    this.minsOn = this.reduced ? this.minsTarget : this.minsOn + (this.minsTarget - this.minsOn) * Math.min(1, dt * 6);
    this.uniforms['uMinsOn']!.value = this.minsOn;
  }
}

/** Add the reach to the terrain's material: its world position to the fragment shader, then the glow (or the minutes
 * view's bands) mixed into the ground's colour, with a little light of its own so it still shows at dusk. */
function patch(mat: THREE.MeshLambertMaterial, n: number, uniforms: Record<string, THREE.IUniform>): void {
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = 'varying vec2 vReachXZ;\n' + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvReachXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = `#define REACH_N ${n}
varying vec2 vReachXZ;
uniform vec2 uSt[REACH_N]; uniform float uR[REACH_N]; uniform float uGhost[REACH_N]; uniform float uMins[REACH_N];
uniform float uO[REACH_N]; uniform float uOGhost[REACH_N]; uniform vec3 uOuter;
uniform float uMinsOn; uniform float uWalk; uniform vec3 uReach; uniform vec3 uGhostC; uniform vec3 uBand[4]; uniform float uBandAt[4];
` + shader.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
float reachA = 0.0, ring = 0.0, best = 1e6, outerA = 0.0;
for (int i = 0; i < REACH_N; i++) {
  float d = distance(vReachXZ, uSt[i]), r = uR[i];
  // the glow: full well inside, fading over the last third, the edge itself a touch brighter
  if (r > 0.0) reachA = max(reachA, (1.0 - smoothstep(r * 0.62, r, d)) * 0.32 + 0.45 * exp(-pow((d - r) / max(10.0, r * 0.05), 2.0)) * step(d, r * 1.2));
  if (uGhost[i] > 0.0) ring = max(ring, exp(-pow((d - uGhost[i]) / 7.0, 2.0)));
  // the outer ring: a faint wash out to where a car park or bus link reaches, and a thin edge there
  float o = uO[i];
  if (o > 0.0) outerA = max(outerA, (1.0 - smoothstep(o * 0.85, o, d)) * 0.1 + 0.32 * exp(-pow((d - o) / max(14.0, o * 0.008), 2.0)));
  if (uOGhost[i] > 0.0) ring = max(ring, exp(-pow((d - uOGhost[i]) / 12.0, 2.0)));
  if (uMins[i] >= 0.0) best = min(best, uMins[i] + d / uWalk);
}
vec3 bandC = uBand[3]; float bandA = 1.0 - smoothstep(uBandAt[3] - 0.6, uBandAt[3] + 0.6, best);
for (int b = 2; b >= 0; b--) bandC = mix(uBand[b], bandC, smoothstep(uBandAt[b] - 0.6, uBandAt[b] + 0.6, best));
float glowA = reachA * (1.0 - uMinsOn), outA = outerA * (1.0 - uMinsOn);
diffuseColor.rgb = mix(diffuseColor.rgb, uOuter, outA * 0.6);
diffuseColor.rgb = mix(diffuseColor.rgb, uReach, glowA * 0.6);
diffuseColor.rgb = mix(diffuseColor.rgb, bandC, bandA * 0.62 * uMinsOn);
diffuseColor.rgb = mix(diffuseColor.rgb, uGhostC, ring * 0.85);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += uReach * glowA * 0.12 + uOuter * outA * 0.08 + uGhostC * ring * 0.35 + bandC * bandA * uMinsOn * 0.08;`);
  };
  mat.needsUpdate = true;
}
