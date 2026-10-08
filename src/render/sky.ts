// The sky: a dome with a zenith-to-horizon gradient that follows the clock, a sun disc where the sun light is, and a
// layer of soft clouds drifting over the line. Everything here follows the camera, so the dome never has an edge, and
// nothing here changes the game. Colours come from the --map-* tokens through the palette.
import * as THREE from 'three';
import { PAL } from './scene.ts';

const DOME_RADIUS = 2500;      // inside the nearest the camera's far plane ever comes (3000)
const CLOUD_HEIGHT = 520;
const CLOUD_SPREAD = 16000;    // metres across, centred on the line
const CLOUDS = 70;

const seed = (a: number, b: number) => { const s = Math.sin(a * 91.3 + b * 227.1) * 23421.631; return s - Math.floor(s); };

/** A soft round sprite drawn once: the cloud puff. Drawn, so it's cosmetic and never touches the game. */
function puffTexture(): THREE.Texture {
  const size = 128, cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,0.75)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Sky {
  dome: THREE.Mesh;
  sunDisc: THREE.Mesh;
  clouds: THREE.InstancedMesh;
  cloudMat: THREE.MeshBasicMaterial;
  stars: THREE.Points;
  starMat: THREE.PointsMaterial;
  private zenith: THREE.Color; private horizon: THREE.Color;
  private uniforms: { zenith: { value: THREE.Color }; horizon: { value: THREE.Color } };
  private tmp = new THREE.Vector3();
  private drift = 0;
  /** Each puff's resting place and size; the drift is added each frame and wrapped, so a cloud leaving one edge returns at the other. */
  private puffs: { x: number; y: number; z: number; w: number; d: number }[] = [];
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private p = new THREE.Vector3(); private s = new THREE.Vector3();

  constructor(scene: THREE.Scene, private sun: THREE.DirectionalLight, private centre: { x: number; z: number }) {
    this.zenith = PAL['zenith-day'].clone(); this.horizon = PAL['sky-day'].clone();
    this.uniforms = { zenith: { value: this.zenith }, horizon: { value: this.horizon } };
    // the dome: a sphere seen from inside, coloured by how high each point sits
    const domeMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying float vUp; void main(){ vUp = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 zenith; uniform vec3 horizon; varying float vUp; void main(){ float t = pow(clamp(vUp * 1.6, 0.0, 1.0), 0.6); gl_FragColor = vec4(mix(horizon, zenith, t), 1.0); }',
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 16), domeMat);
    this.dome.renderOrder = -2; this.dome.frustumCulled = false; scene.add(this.dome);
    // stars: points on the upper half of the dome, faded in after dark
    const pts: number[] = [];
    for (let i = 0; i < 700; i++) { const u = seed(i, 7) * Math.PI * 2, v = 0.08 + seed(i, 8) * 0.9, r = DOME_RADIUS * 0.97; pts.push(Math.cos(u) * Math.sqrt(1 - v * v) * r, v * r, Math.sin(u) * Math.sqrt(1 - v * v) * r); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.starMat = new THREE.PointsMaterial({ color: PAL.star, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    this.stars = new THREE.Points(sg, this.starMat); this.stars.renderOrder = -1; this.stars.frustumCulled = false; this.dome.add(this.stars);
    // the sun: a disc that sits on the dome in the sun light's direction
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(90, 32), new THREE.MeshBasicMaterial({ color: PAL.sun, fog: false, depthWrite: false }));
    this.sunDisc.renderOrder = -1; this.sunDisc.frustumCulled = false; scene.add(this.sunDisc);
    // the clouds: flat puffs, a few per cloud, lit by the sky so they dim at night
    this.cloudMat = new THREE.MeshBasicMaterial({ map: puffTexture(), transparent: true, depthWrite: false, color: PAL.cloud, opacity: 0.9 });
    const puff = new THREE.PlaneGeometry(1, 1); puff.rotateX(-Math.PI / 2);
    this.clouds = new THREE.InstancedMesh(puff, this.cloudMat, CLOUDS * 5);
    for (let c = 0; c < CLOUDS; c++) {
      const cx = (seed(c, 1) - 0.5) * CLOUD_SPREAD, cz = (seed(c, 2) - 0.5) * CLOUD_SPREAD, big = 260 + seed(c, 3) * 420;
      const puffs = 3 + Math.floor(seed(c, 4) * 3);
      for (let k = 0; k < puffs; k++) {
        const w = big * (0.6 + seed(c, 10 + k) * 0.7);
        this.puffs.push({ x: cx + (seed(c, 20 + k) - 0.5) * big, y: CLOUD_HEIGHT + seed(c, 30 + k) * 60, z: cz + (seed(c, 40 + k) - 0.5) * big * 0.6, w, d: w * (0.55 + seed(c, 50 + k) * 0.3) });
      }
    }
    this.clouds.count = this.puffs.length; this.clouds.frustumCulled = false; scene.add(this.clouds);
    this.placeClouds();
  }

  private placeClouds(): void {
    const half = CLOUD_SPREAD / 2;
    this.puffs.forEach((pf, i) => {
      let x = pf.x + this.drift; if (x > half) x -= CLOUD_SPREAD;
      this.p.set(this.centre.x + x, pf.y, this.centre.z + pf.z); this.s.set(pf.w, 1, pf.d);
      this.m4.compose(this.p, this.q, this.s); this.clouds.setMatrixAt(i, this.m4);
    });
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  /** Follow the camera and the clock: horizon and zenith colours, the sun's place, the clouds' drift and brightness. */
  update(horizon: THREE.Color, daylight: number, camera: THREE.Camera, dt: number): void {
    this.horizon.copy(horizon);
    this.zenith.copy(PAL['zenith-night']).lerp(PAL['zenith-day'], daylight);
    this.dome.position.copy(camera.position);
    this.tmp.copy(this.sun.position).normalize();
    this.sunDisc.position.copy(camera.position).addScaledVector(this.tmp, DOME_RADIUS * 0.98);
    this.sunDisc.lookAt(camera.position);
    this.sunDisc.visible = daylight > 0.01;    // the light keeps a little height after dark for the lamps' sake; the disc doesn't
    this.starMat.opacity = Math.max(0, 1 - daylight * 6);
    // clouds: white by day, nearly the night sky's colour after dark (the lerp is in linear light, so a little goes far);
    // drifting east a few metres a second, in world space, so they stay put when the camera pans
    this.cloudMat.color.copy(PAL['zenith-night']).lerp(PAL.cloud, 0.03 + 0.97 * daylight);
    this.drift = (this.drift + dt * 4) % CLOUD_SPREAD;
    this.placeClouds();
  }
}
