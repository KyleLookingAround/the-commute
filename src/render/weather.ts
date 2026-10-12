// Weather and seasons on the map (docs/DESIGN.md, Weather and seasons), all of it view only: it reads the sim's spell
// and the year and changes nothing in the game. Rain falls as streaks and snow as flakes in a box round where the
// camera looks, moved in their shaders so nothing is written per frame; clouds thicken and the sun dims under cover
// (the sky's own, src/render/sky.ts); fog closes the view; platforms take a wet sheen in the rain and snow settles on
// the roofs, the platforms and the ground, melting after. A belt of trees along the line turns with the year: blossom
// in spring, deep green in summer, gold in autumn, bare in winter; and the day's length and the sun's height follow the
// season (solarHour). The fair-weather setting draws every spell as a sunny or cloudy one; the seasons still turn.
import * as THREE from 'three';
import { PAL, MAT } from './scene.ts';
import type { Sky } from './sky.ts';
import type { World } from './world.ts';
import type { Network } from '../sim/network.ts';
import type { GameState, Sky as Spell } from '../sim/types.ts';
import { yearAt } from '../sim/weather.ts';
import { clockAt } from '../sim/day.ts';

const FADE = 180;              // sim seconds a new spell takes to come in (a minute of real time at 1x)
const COVER: Record<Spell, number> = { sun: 0.12, cloud: 0.62, rain: 1, fog: 0.8, snow: 0.9 };
const RAIN = 2600, SNOW = 1600;   // drops and flakes in the box round the camera; the low setting draws a third
const FAR = 2200;              // camera distance past which nothing falls (the line view sees the cover and the fog)
const TREE_EVERY = 22;
const STATION_CLEAR = 230;     // metres either side of a station with no trees: its kit         // metres along the line between trees on each side, give or take
/** The ground's tint by season, spring to winter, as multiples of its own red, green and blue. */
const TINTS = [[1.02, 1.08, 0.94], [0.96, 1.04, 0.9], [1.12, 1.0, 0.74], [0.95, 0.84, 0.82]] as const;
const hash = (a: number, b: number) => { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); };

/** The hour the light shows for a clock hour in a year (0 to 1 from spring): the day is longer in summer (16 hours of
 * daylight at midsummer) and shorter in winter (eight, so dusk comes early), and the lighting's own day runs 06:00 to
 * 18:00, so the clock's sunrise to sunset is stretched or squeezed onto that. The equinox is early in spring, as the
 * real one is (20 March against a spring of March to May). */
export function solarHour(hour: number, year: number): number {
  const L = 12 + 4 * Math.cos(2 * Math.PI * (year - 0.305)), rise = 12 - L / 2, set = 12 + L / 2;
  if (hour >= rise && hour <= set) return 6 + (hour - rise) * 12 / L;
  return (18 + ((hour - set + 24) % 24) * 12 / (24 - L)) % 24;
}

/** How high the sun stands at its noon against the year's average: lower in winter. */
function sunHeight(year: number): number { return 1 + 0.35 * Math.cos(2 * Math.PI * (year - 0.305)); }

const fallVert = `
uniform float uTime, uBox, uHeight, uSpeed, uLen, uSway, uSize; uniform vec3 uCentre;
attribute float aEnd;
varying float vEnd;
void main() {
  vec3 s = position;
  float hb = uBox * 0.5;
  float x = uCentre.x - hb + mod(s.x * uBox + uTime * uSpeed * 0.12 - (uCentre.x - hb), uBox);
  float z = uCentre.z - hb + mod(s.z * uBox - (uCentre.z - hb), uBox);
  float y = uCentre.y - uHeight * 0.15 + mod(s.y * uHeight - uTime * uSpeed, uHeight);
  x += sin(uTime * 0.9 + s.z * 40.0) * uSway; z += cos(uTime * 0.7 + s.x * 40.0) * uSway;
  y += aEnd * uLen; x -= aEnd * uLen * 0.12;
  vEnd = aEnd;
  vec4 mv = viewMatrix * vec4(x, y, z, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * 300.0 / max(1.0, -mv.z);
}`;
const rainFrag = `
uniform vec3 uColor; uniform float uOpacity; varying float vEnd;
void main() {
  gl_FragColor = vec4(uColor, uOpacity * (0.25 + 0.75 * vEnd));
  #include <colorspace_fragment>
}`;
const snowFrag = `
uniform vec3 uColor; uniform float uOpacity;
void main() {
  vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard;
  gl_FragColor = vec4(uColor, uOpacity * (1.0 - r * 3.0));
  #include <colorspace_fragment>
}`;

/** Falling rain or snow: points seeded once in a unit cube, moved by the shader into a box round the camera. */
class Fall {
  readonly mat: THREE.ShaderMaterial;
  readonly obj: THREE.LineSegments | THREE.Points;
  private readonly n: number;
  constructor(scene: THREE.Scene, n: number, streaks: boolean, color: THREE.Color, speed: number, sway: number) {
    this.n = n;
    const per = streaks ? 2 : 1, pos = new Float32Array(n * per * 3), end = new Float32Array(n * per);
    for (let i = 0; i < n; i++) for (let k = 0; k < per; k++) {
      const j = i * per + k;
      pos[j * 3] = hash(i, 1); pos[j * 3 + 1] = hash(i, 2); pos[j * 3 + 2] = hash(i, 3); end[j] = k;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uBox: { value: 200 }, uHeight: { value: 120 }, uSpeed: { value: speed }, uLen: { value: 3 }, uSway: { value: sway }, uSize: { value: 0.6 },
        uCentre: { value: new THREE.Vector3() }, uColor: { value: color.clone() }, uOpacity: { value: 0 } },
      vertexShader: fallVert, fragmentShader: streaks ? rainFrag : snowFrag, transparent: true, depthWrite: false, fog: false,
    });
    this.obj = streaks ? new THREE.LineSegments(geo, this.mat) : new THREE.Points(geo, this.mat);
    this.obj.frustumCulled = false; this.obj.visible = false; this.obj.renderOrder = 2; scene.add(this.obj);
  }
  /** Fall at `level` (0 to 1) round the point the camera looks at, r out; `share` of the drops drawn. */
  update(level: number, time: number, focus: { tx: number; ty: number; tz: number; r: number }, share: number): void {
    const on = level > 0.01 && focus.r < FAR; this.obj.visible = on; if (!on) return;
    const u = this.mat.uniforms, box = Math.min(700, Math.max(90, focus.r * 1.1));
    u['uTime']!.value = time; u['uBox']!.value = box; u['uHeight']!.value = box * 0.55; u['uLen']!.value = box * 0.022; u['uSize']!.value = box * 0.004;
    (u['uCentre']!.value as THREE.Vector3).set(focus.tx, focus.ty, focus.tz);
    u['uOpacity']!.value = level * (focus.r < FAR * 0.6 ? 0.42 : 0.42 * (FAR - focus.r) / (FAR * 0.4));
    const per = this.obj instanceof THREE.LineSegments ? 2 : 1;
    this.obj.geometry.setDrawRange(0, Math.ceil(this.n * share * Math.max(0.25, level)) * per);
  }
}

/** The weather as drawn now: each spell's share as it fades in, and what's lying: wet surfaces, settled snow. */
export interface Look { rain: number; snow: number; fog: number; cover: number; wet: number; settle: number; year: number }

export class WeatherLayer {
  readonly look: Look = { rain: 0, snow: 0, fog: 0, cover: 0, wet: 0, settle: 0, year: 0 };
  /** The trees along the line: trunks and crowns, a crown's colour from the season. */
  readonly trees: THREE.InstancedMesh;
  private readonly crowns: THREE.InstancedMesh;
  private readonly rain: Fall; private readonly snowFall: Fall;
  private readonly tree: { x: number; y: number; z: number; h: number; k: number }[] = [];
  private fair = false; private low = false;
  private time = 0; private treeYear = -1; private treeSnow = -1;
  private readonly mats: { mat: THREE.MeshLambertMaterial; c: THREE.Color }[];
  private readonly base = { sun: 0, near: 0, far: 0 }; private readonly wrote = { sun: -1, near: -1, far: -1 };
  private readonly ground: THREE.MeshLambertMaterial; private readonly groundC: THREE.Color;
  private readonly col = new THREE.Color(); private readonly col2 = new THREE.Color(); private readonly m4 = new THREE.Matrix4();
  private readonly v = new THREE.Vector3(); private readonly q = new THREE.Quaternion(); private readonly s = new THREE.Vector3();

  constructor(scene: THREE.Scene, net: Network, world: World) {
    this.rain = new Fall(scene, RAIN, true, PAL.rain, 34, 0);
    this.snowFall = new Fall(scene, SNOW, false, PAL.snow, 2.2, 1.6);
    // what snow settles on and rain wets: the roofs, the platforms, the canopies' glass; and the ground's tint
    this.mats = [MAT.roof, MAT.platform, MAT.canopy, MAT.concrete].map(mat => ({ mat, c: mat.color.clone() }));
    this.ground = world.ground; this.groundC = world.ground.color.clone();
    // the trees: both sides of every corridor, a belt beyond the fences, where nothing else stands: clear of the
    // stations and their yards, and of the city
    const stations = net.stations.map(st => ({ c: st.corridor, s: st.s }));
    for (const [id, c] of Object.entries(net.corridors)) {
      for (let s = 40; s < c.length - 1600; s += TREE_EVERY) for (const side of [-1, 1]) {
        if (stations.some(st => st.c === id && Math.abs(st.s - s) < STATION_CLEAR)) continue;
        const k = this.tree.length, h = hash(s, side + 3);
        if (h < 0.3) continue;   // gaps, so it reads as trees rather than a hedge
        // beyond the outermost track that side (yards and sidings spread wide), the fence and a verge
        let edge = 0; for (const t of net.tracks) if (t.corridor === id) { const o = net.offsetAt(t.id, s) * side; if (o > edge) edge = o; }
        const off = side * (Math.max(40, edge + 18) + hash(s, side + 5) * 16), p = c.at(s + (hash(s, side + 7) - 0.5) * 14, off);
        if (!world.buildable(p.x, p.z, 4)) continue;
        this.tree.push({ x: p.x, y: world.groundY(p.x, p.z), z: p.z, h: 7 + 7 * hash(s, side + 9), k });
      }
    }
    const trunk = new THREE.CylinderGeometry(0.35, 0.5, 1, 6); trunk.translate(0, 0.5, 0);
    const crown = new THREE.IcosahedronGeometry(1, 1);
    this.trees = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: PAL.trunk }), this.tree.length);
    this.crowns = new THREE.InstancedMesh(crown, new THREE.MeshLambertMaterial({ color: 0xffffff }), this.tree.length);
    this.tree.forEach((t, i) => {
      this.m4.compose(this.v.set(t.x, t.y, t.z), this.q, this.s.set(1, t.h * 0.55, 1)); this.trees.setMatrixAt(i, this.m4);
      this.crowns.setColorAt(i, PAL['leaf-summer']);
    });
    for (const m of [this.trees, this.crowns]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  }

  /** Start with the ground already wet or snowy, as if the spell had gone on a while (a check's or a screenshot's). */
  settled(kind: Spell): void { this.look.wet = kind === 'rain' ? 1 : 0; this.look.settle = kind === 'snow' ? 1 : 0; }
  /** Whether rain or snow is being drawn falling now. */
  falling(): boolean { return this.rain.obj.visible || this.snowFall.obj.visible; }
  /** Fair weather: every spell drawn as sun or cloud (the game is the same either way). Low: a third of the rain. */
  setFair(on: boolean): void { this.fair = on; }
  setLow(on: boolean): void { this.low = on; }

  /** The spell's share of the weather now: 1 once it's faded in, the one before fading out. */
  private share(g: GameState, kind: Spell, fade: number): number {
    const w = g.weather, now = this.fair && kind !== 'sun' && kind !== 'cloud' ? false : w.now === kind, was = this.fair && kind !== 'sun' && kind !== 'cloud' ? false : w.was === kind;
    return (now ? fade : 0) + (was ? 1 - fade : 0);
  }
  private cover(kind: Spell): number { return this.fair ? Math.min(COVER[kind], COVER.cloud * 0.8) : COVER[kind]; }

  /** Follow the sim: dt real seconds, dtGame sim seconds; focus where the camera looks; daylight 0 to 1. */
  update(g: GameState, sky: Sky, sun: THREE.DirectionalLight, fog: THREE.Fog | null, focus: { tx: number; ty: number; tz: number; r: number }, dt: number, dtGame: number): void {
    const L = this.look, w = g.weather, fade = Math.min(1, Math.max(0, (g.t - w.since) / FADE));
    L.rain = this.share(g, 'rain', fade); L.snow = this.share(g, 'snow', fade); L.fog = this.share(g, 'fog', fade);
    L.cover = this.cover(w.now) * fade + this.cover(w.was) * (1 - fade);
    L.year = yearAt(g.t);
    // wet surfaces dry over a game hour or so; snow settles over a game hour and melts over three, by the clock
    const k = (clockAt(g.t) - clockAt(g.t - dtGame)) / 3600;
    L.wet = Math.min(1, Math.max(0, L.wet + (L.rain > 0.5 ? k * 2 : -k * 0.8)));
    L.settle = Math.min(1, Math.max(0, L.settle + (L.snow > 0.5 ? k : -k / 3)));
    if (this.fair) { L.wet = 0; L.settle = 0; }
    // the sky: cover thickens the clouds and greys the dome; the sun dims under it, and stands lower in winter
    sky.setCover(L.cover, L.fog);
    // the camera and the clock set the fog's reach and the sun's strength each frame; scaled from what they set, never
    // from what this wrote last frame, so it can't compound if one of them stops resetting it
    if (sun.intensity !== this.wrote.sun) this.base.sun = sun.intensity;
    sun.intensity = this.wrote.sun = this.base.sun * (1 - 0.6 * Math.max(0, L.cover - 0.15) - 0.2 * L.fog);
    this.v.subVectors(sun.position, sun.target.position); this.v.y *= sunHeight(L.year); this.v.setLength(900); sun.position.copy(sun.target.position).add(this.v);
    // fog closes the view; rain and snow draw it in a little
    if (fog) {
      const close = 1 - 0.8 * L.fog - 0.35 * L.rain - 0.5 * L.snow;
      if (fog.near !== this.wrote.near || fog.far !== this.wrote.far) { this.base.near = fog.near; this.base.far = fog.far; }
      fog.near = this.wrote.near = this.base.near * Math.max(0.12, close * close); fog.far = this.wrote.far = this.base.far * Math.max(0.25, close);
      fog.color.lerp(PAL.fog, 0.75 * L.fog + 0.35 * (L.rain + L.snow) * (1 - L.fog));
      sky.setFogColour(fog.color, L.fog);
    }
    // what's lying: the platforms darker and bluer in the wet; snow on the roofs, platforms and canopies, and the ground
    for (const b of this.mats) {
      b.mat.color.copy(b.c);
      if (b.mat === MAT.platform || b.mat === MAT.concrete) b.mat.color.lerp(PAL.wet, 0.35 * L.wet);
      b.mat.color.lerp(PAL.snow, 0.85 * L.settle);
    }
    this.groundTint(L);
    this.time += dt;
    this.rain.update(L.rain, this.time, focus, this.low ? 0.33 : 1);
    this.snowFall.update(L.snow, this.time, focus, this.low ? 0.33 : 1);
    this.treesFor(L);
  }

  /** The ground through the year: fresh in spring, deeper in summer, a little gold in autumn, dull in winter; and white
   * where snow has settled. A tint on the terrain's own colours. */
  private groundTint(L: Look): void {
    const y = L.year * 4, i = Math.floor(y) % 4, f = y - Math.floor(y);
    const a = TINTS[i]!, b = TINTS[(i + 1) % 4]!, t = f < 0.75 ? 0 : (f - 0.75) / 0.25;   // a season holds, then eases into the next
    this.ground.color.setRGB(this.groundC.r * (a[0] + (b[0] - a[0]) * t), this.groundC.g * (a[1] + (b[1] - a[1]) * t), this.groundC.b * (a[2] + (b[2] - a[2]) * t));
    this.ground.emissive.copy(PAL.snow).multiplyScalar(0.55 * L.settle);
    this.ground.color.lerp(PAL.snow, 0.5 * L.settle);
  }

  /** The trees' crowns by the year: redone only when the year or the snow has moved enough to see. */
  private treesFor(L: Look): void {
    if (Math.abs(L.year - this.treeYear) < 0.004 && Math.abs(L.settle - this.treeSnow) < 0.05) return;
    this.treeYear = L.year; this.treeSnow = L.settle;
    const y = L.year * 4, i = Math.floor(y) % 4, f = y - Math.floor(y), t = f < 0.75 ? 0 : (f - 0.75) / 0.25;
    this.tree.forEach((tr, n) => {
      const h = hash(tr.k, 11);
      this.leaf(i, h, this.col); this.leaf((i + 1) % 4, h, this.col2); this.col.lerp(this.col2, t).lerp(PAL.snow, 0.6 * L.settle);
      this.crowns.setColorAt(n, this.col);
      // bare in winter: a smaller, thinner crown of twigs
      const bare = (i === 3 ? 1 - t : 0) + (i === 2 ? t : 0), r = tr.h * (0.36 - 0.12 * bare);
      this.m4.compose(this.v.set(tr.x, tr.y + tr.h * 0.62, tr.z), this.q, this.s.set(r, r * (1.1 - 0.2 * bare), r)); this.crowns.setMatrixAt(n, this.m4);
    });
    this.crowns.instanceMatrix.needsUpdate = true; if (this.crowns.instanceColor) this.crowns.instanceColor.needsUpdate = true;
  }
  /** A tree's crown in a season: some in blossom in spring, gold or rust in autumn, twigs in winter. h: the tree's own. */
  private leaf(season: number, h: number, out: THREE.Color): THREE.Color {
    if (season === 0) return out.copy(h < 0.35 ? PAL.blossom : PAL['leaf-spring']);
    if (season === 1) return out.copy(PAL['leaf-summer']).lerp(PAL['leaf-spring'], h * 0.3);
    if (season === 2) return out.copy(PAL['leaf-autumn']).lerp(PAL['leaf-autumn-2'], h);
    return out.copy(PAL.trunk).lerp(PAL['sky-grey'], 0.2);
  }
}
