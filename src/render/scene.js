import * as THREE from 'three';

export const SKY = { night: new THREE.Color(0x0a0f24), dawn: new THREE.Color(0x5a3f5e), day: new THREE.Color(0x8fb4d8), dusk: new THREE.Color(0xd08a5a) };

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
export const MAT = {
  brick: lam(0x6b3f33), brickDark: lam(0x4e2e26), concrete: lam(0x8d8a80), platform: lam(0x9a968a), tactile: lam(0xd9c36a),
  ballast: lam(0x2d2a2a), rail: lam(0xb9bcc4), canopy: lam(0x3b4660, { transparent: true, opacity: 0.86 }), steel: lam(0x5d6572),
  glass: lam(0x9fc0d6, { transparent: true, opacity: 0.75, emissive: 0x27405a }), roof: lam(0x2f2a2e), timber: lam(0xcfc3a8),
  road: lam(0x3a3d44), shed: lam(0x7f8a99, { transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  glow: new THREE.MeshBasicMaterial({ color: 0xfff1c9 }), warm: new THREE.MeshBasicMaterial({ color: 0xffd88a }),
  locked: lam(0x3a4158, { transparent: true, opacity: 0.55 }), pax: lam(0xf2b63a, { emissive: 0x6a4a10 }),
  pyramid: lam(0x2f6fb0, { transparent: true, opacity: 0.8, emissive: 0x0d2a4a }), river: lam(0x1d3a5e, { emissive: 0x0b1a2e }),
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
