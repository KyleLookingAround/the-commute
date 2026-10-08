// The renderer, scene, camera, lights and materials, and the lighting that follows the game clock.
import * as THREE from 'three';

import { readPalette } from './palette.ts';

export const PAL = readPalette();
export const SKY = { night: PAL['sky-night'], dawn: PAL['sky-dawn'], day: PAL['sky-day'], dusk: PAL['sky-dusk'] };

const lam = (c: THREE.Color, o: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
export const MAT = {
  brick: lam(PAL.brick), brickDark: lam(PAL['brick-dark']), concrete: lam(PAL.concrete), platform: lam(PAL.platform), tactile: lam(PAL.tactile),
  ballast: lam(PAL.ballast), rail: lam(PAL.rail), canopy: lam(PAL.canopy, { transparent: true, opacity: 0.6 }), steel: lam(PAL.steel),
  glass: lam(PAL.glass, { transparent: true, opacity: 0.75, emissive: PAL['glass-glow'] }), roof: lam(PAL.roof), timber: lam(PAL.timber),
  road: lam(PAL.road), shed: lam(PAL.shed, { transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  glow: new THREE.MeshBasicMaterial({ color: PAL.lamp }), warm: new THREE.MeshBasicMaterial({ color: PAL.warm }),
  locked: lam(PAL.locked, { transparent: true, opacity: 0.55 }), pax: lam(PAL.pax, { emissive: PAL['pax-glow'] }), paxHead: lam(PAL['pax-head']),
  column: lam(PAL.column),
  pyramid: lam(PAL.pyramid, { transparent: true, opacity: 0.8, emissive: PAL['pyramid-glow'] }), river: lam(PAL.river, { emissive: 0x0b1a2e }),
};
export type MatName = keyof typeof MAT;
/** The material a kit part names, or the fallback when it names none or one that doesn't exist. */
export function matFor(name: string | undefined, fallback: THREE.Material): THREE.Material {
  return (name && (MAT as Record<string, THREE.Material | undefined>)[name]) || fallback;
}

/** What the clock did to the light this frame: the horizon colour and how much daylight there is (0 night, 1 noon). */
export interface Light { horizon: THREE.Color; daylight: number }
/** Where the camera is looking and how far out it is; the sun and its shadow box follow it. */
export interface Focus { tx: number; ty: number; tz: number; r: number }
export interface SceneParts {
  renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; sun: THREE.DirectionalLight;
  lighting: (hour: number, focus: Focus) => Light; resize: () => void;
}
const SHADOW_ZOOM = 900;      // shadows only this close in: one map, 640 m across, around the point the camera looks at

export function createScene(canvas: HTMLCanvasElement): SceneParts {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const background = new THREE.Color(0x16203f), fog = new THREE.Fog(background, 300, 1800);
  scene.background = background; scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 9000);
  // physical light units (three r155+): a sunlit day wants a sun near 3 and a sky near 1.5, not the old 0.6 and 0.9
  const hemi = new THREE.HemisphereLight(0x5b6fb8, 0x6b5a48, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc48a, 0.6); sun.position.set(-300, 200, 200); scene.add(sun); scene.add(sun.target);
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
  Object.assign(sun.shadow.camera, { left: -320, right: 320, top: 320, bottom: -320, near: 1, far: 2400 });
  const SUN_LOW = new THREE.Color(0xffb070), SUN_HIGH = new THREE.Color(0xfff6e6), sunDir = new THREE.Vector3();

  const tmp = new THREE.Color(), tmpWhite = new THREE.Color(0xffffff), light: Light = { horizon: tmp, daylight: 0 };
  function lighting(hour: number, focus: Focus): Light {
    const mix = (a: THREE.Color, b: THREE.Color, t: number) => tmp.copy(a).lerp(b, Math.max(0, Math.min(1, t)));
    let c: THREE.Color;
    if (hour < 5) c = mix(SKY.night, SKY.night, 0); else if (hour < 7.5) c = mix(SKY.night, SKY.dawn, (hour - 5) / 2.5); else if (hour < 10) c = mix(SKY.dawn, SKY.day, (hour - 7.5) / 2.5);
    else if (hour < 17) c = mix(SKY.day, SKY.day, 0); else if (hour < 19.5) c = mix(SKY.day, SKY.dusk, (hour - 17) / 2.5); else if (hour < 21.5) c = mix(SKY.dusk, SKY.night, (hour - 19.5) / 2); else c = mix(SKY.night, SKY.night, 0);
    background.copy(c); fog.color.copy(c);
    const el = Math.sin(Math.max(0, Math.min(Math.PI, (hour - 6) / 12 * Math.PI)));
    sun.intensity = 0.2 + 2.8 * el; hemi.intensity = 0.4 + 0.9 * el;
    sun.color.copy(SUN_LOW).lerp(SUN_HIGH, Math.min(1, el * 1.5));   // orange near the horizon, white overhead
    // the sun's arc: up in the east (+x) at six, through the south (+z) at noon, down in the west at six; it keeps
    // a little height after dark so the lamps' side of things still has a key light
    const a = Math.max(0, Math.min(Math.PI, (hour - 6) / 12 * Math.PI));
    sunDir.set(Math.cos(a), 0.08 + Math.sin(a) * 0.8, Math.sin(a) * 0.55).normalize();
    sun.position.set(focus.tx, focus.ty, focus.tz).addScaledVector(sunDir, 900);
    sun.target.position.set(focus.tx, focus.ty, focus.tz);
    sun.castShadow = focus.r < SHADOW_ZOOM && el > 0.04;
    // lamps, windows and the lit signs: off and glassy by day, on from dusk
    const lit = 1 - Math.max(0, Math.min(1, (el - 0.04) / 0.2));
    MAT.glow.color.copy(PAL['lamp-off']).lerp(PAL.lamp, lit); MAT.warm.color.copy(PAL.road).lerp(PAL.warm, lit);
    hemi.color.copy(c).lerp(tmpWhite, 0.3);
    light.daylight = el; return light;
  }

  function resize(): void {
    const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }
  return { renderer, scene, camera, sun, lighting, resize };
}

/** Extents in a local (u, y, v) frame: u -> x, v -> z. */
export interface Extents { u0: number; u1: number; v0: number; v1: number; y0: number; y1: number }

// Box helper in any parent. Positions are centre coordinates.
export function box(parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m;
}
// Box from extents in a local (u, y, v) frame: u -> x, v -> z
export function boxUV(parent: THREE.Object3D, p: Extents, mat: THREE.Material): THREE.Mesh {
  return box(parent, p.u1 - p.u0, p.y1 - p.y0, p.v1 - p.v0, mat, (p.u0 + p.u1) / 2, (p.y0 + p.y1) / 2, (p.v0 + p.v1) / 2);
}
