// The renderer, scene, camera, lights and materials, and the lighting that follows the game clock.
import * as THREE from 'three';

import { readPalette } from './palette.js';

export const PAL = readPalette();
export const SKY = { night: PAL['sky-night'], dawn: PAL['sky-dawn'], day: PAL['sky-day'], dusk: PAL['sky-dusk'] };

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
export const MAT = {
  brick: lam(PAL.brick), brickDark: lam(PAL['brick-dark']), concrete: lam(PAL.concrete), platform: lam(PAL.platform), tactile: lam(PAL.tactile),
  ballast: lam(PAL.ballast), rail: lam(PAL.rail), canopy: lam(PAL.canopy, { transparent: true, opacity: 0.86 }), steel: lam(PAL.steel),
  glass: lam(PAL.glass, { transparent: true, opacity: 0.75, emissive: PAL['glass-glow'] }), roof: lam(PAL.roof), timber: lam(PAL.timber),
  road: lam(PAL.road), shed: lam(PAL.shed, { transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  glow: new THREE.MeshBasicMaterial({ color: PAL.lamp }), warm: new THREE.MeshBasicMaterial({ color: PAL.warm }),
  locked: lam(PAL.locked, { transparent: true, opacity: 0.55 }), pax: lam(PAL.pax, { emissive: PAL['pax-glow'] }),
  pyramid: lam(PAL.pyramid, { transparent: true, opacity: 0.8, emissive: PAL['pyramid-glow'] }), river: lam(PAL.river, { emissive: 0x0b1a2e }),
};

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16203f);
  scene.fog = new THREE.Fog(scene.background, 300, 1800);
  const camera = new THREE.PerspectiveCamera(50, 1, 1, 9000);
  const hemi = new THREE.HemisphereLight(0x5b6fb8, 0x2a1f1a, 0.9); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffc48a, 0.6); sun.position.set(-300, 200, 200); scene.add(sun);

  const tmp = new THREE.Color();
  function lighting(hour) {
    const mix = (a, b, t) => tmp.copy(a).lerp(b, Math.max(0, Math.min(1, t)));
    let c;
    if (hour < 5) c = mix(SKY.night, SKY.night, 0); else if (hour < 7.5) c = mix(SKY.night, SKY.dawn, (hour - 5) / 2.5); else if (hour < 10) c = mix(SKY.dawn, SKY.day, (hour - 7.5) / 2.5);
    else if (hour < 17) c = mix(SKY.day, SKY.day, 0); else if (hour < 19.5) c = mix(SKY.day, SKY.dusk, (hour - 17) / 2.5); else if (hour < 21.5) c = mix(SKY.dusk, SKY.night, (hour - 19.5) / 2); else c = mix(SKY.night, SKY.night, 0);
    scene.background.copy(c); scene.fog.color.copy(c);
    const el = Math.sin(Math.max(0, Math.min(Math.PI, (hour - 6) / 12 * Math.PI)));
    sun.intensity = 0.15 + 0.75 * el; hemi.intensity = 0.35 + 0.6 * el;
    sun.position.set(-300 + 600 * ((hour - 6) / 12), 60 + 260 * el, 200);
    hemi.color.copy(c).lerp(tmpWhite, 0.3);
  }
  const tmpWhite = new THREE.Color(0xffffff);

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight, pr = renderer.getPixelRatio();
    if (canvas.width !== Math.floor(w * pr) || canvas.height !== Math.floor(h * pr)) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
  }
  return { renderer, scene, camera, lighting, resize };
}

// Box helper in any parent. Positions are centre coordinates.
export function box(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m;
}
// Box from extents in a local (u, y, v) frame: u -> x, v -> z
export function boxUV(parent, p, mat) {
  return box(parent, p.u1 - p.u0, p.y1 - p.y0, p.v1 - p.v0, mat, (p.u0 + p.u1) / 2, (p.y0 + p.y1) / 2, (p.v0 + p.v1) / 2);
}
