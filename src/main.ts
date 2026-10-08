// Wires it together: the sim, the scene, the UI, saving and the frame loop. The only file that knows about all of them.
import * as THREE from 'three';
import networkJson from './data/network.json';
import kitStockport from './data/kits/stockport.json';
import kitHeaton from './data/kits/heaton-chapel.json';
import kitLevenshulme from './data/kits/levenshulme.json';
import kitArdwick from './data/kits/ardwick.json';
import kitPiccadilly from './data/kits/piccadilly.json';
import { fromGeo } from './sim/network.ts';
import { Sim } from './sim/sim.ts';
import type { NetworkGeoDef } from './sim/types.ts';
import { createScene } from './render/scene.ts';
import { buildWorld } from './render/world.ts';
import { buildStations, syncStations } from './render/stations.ts';
import type { Kit } from './render/stations.ts';
import { TrainLayer } from './render/trains.ts';
import { PassengerLayer } from './render/passengers.ts';
import { OrbitRig } from './render/camera.ts';
import { Sky } from './render/sky.ts';
import { UI, fmt } from './ui/panel.ts';
import type { Els } from './ui/panel.ts';
import * as store from './app/storage.ts';
import { GAME_PER_REAL, awaySeconds } from './app/clock.ts';

declare global {
  interface Window {
    /** Set by a check or a screenshot before the page loads, so a new game repeats. */
    __seed?: number;
    /** Set by tools/shots.mjs: the hour to lock the lighting to. */
    __lockHour?: number;
    /** Set by a screenshot before the page loads: where the camera starts (any of tx, ty, tz, r, th, ph). */
    __orbit?: Partial<import('./render/camera.ts').Orbit>;
  }
}

// the JSON is the data layer's; it's typed here, where it's read, so the data stays plain
const networkDef = networkJson as NetworkGeoDef;
const kits: Record<string, Kit> = { stockport: kitStockport as Kit, 'heaton-chapel': kitHeaton as Kit, levenshulme: kitLevenshulme as Kit, ardwick: kitArdwick as Kit, piccadilly: kitPiccadilly as Kit };
const net = fromGeo(networkDef);

// ---- state ----
const saved = store.load();
// a page opened by a check sets window.__seed so a new game repeats; players get a fresh seed
const seed = typeof window.__seed === 'number' ? window.__seed : undefined;
let sim = new Sim(net, saved ? saved.g : Sim.fresh(net, seed));
let speed = 1;
// the hour the light is locked to for a look around, or null to follow the game's clock; a screenshot can preset it
let lockHour: number | null = window.__lockHour ?? null;

// ---- scene ----
function el<T extends HTMLElement>(id: string): T { const e = document.getElementById(id); if (!e) throw new Error(`index.html has no #${id}`); return e as T; }
const canvas = el<HTMLCanvasElement>('gl');
const { renderer, scene, camera, sun, lighting, resize } = createScene(canvas);
buildWorld(scene, net, networkDef);
const built = buildStations(scene, net, kits);
// everything on the ground so far throws and takes shadows; the sky, added after, does neither
scene.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
const trains = new TrainLayer(scene, net, networkDef.services ?? []);
const stopper = (networkDef.services ?? []).find(s => s.id === 'stopper');
const trackV = { north: stopper ? net.track(stopper.tracks.north).offset : -13, south: stopper ? net.track(stopper.tracks.south).offset : 19 };
const pax = new PassengerLayer(built, net.stations.map(s => s.s), trackV);
const rig = new OrbitRig(camera, canvas, scene);
const sky = new Sky(scene, sun, lineMiddle());

// ---- labels ----
const lblBox = el('lbls');
const lbls = built.map(() => { const d = document.createElement('div'); d.className = 'lbl'; lblBox.appendChild(d); return d; });
const v3 = new THREE.Vector3();
function labels(): void {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  built.forEach((b, i) => {
    const d = lbls[i]; if (!d) return;
    b.label.getWorldPosition(v3); v3.project(camera);
    const top = (1 - v3.y) / 2 * h;
    // off screen, or in the top band where the stage's own controls sit
    if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1 || top < 64) { d.style.display = 'none'; return; }
    d.style.display = ''; d.style.left = ((v3.x + 1) / 2 * w) + 'px'; d.style.top = top + 'px';
    const s = b.station, owned = !!sim.g.owned[i], txt = owned ? s.name : `${s.name} · <b>${fmt(s.price)}</b>`;
    if (d.innerHTML !== txt) d.innerHTML = txt; d.classList.toggle('lock', !owned);
  });
}

// ---- ui ----
const els: Els = {
  cash: el('cash'), clock: el('clock'), sp1: el('sp1'), sp3: el('sp3'), sp10: el('sp10'), vLine: el('vLine'),
  toast: el('toast'), strip: el('strip'), panel: el('panel'), linePanel: el('linePanel'), reset: el('reset'),
  hour: el('hour'), hourLbl: el('hourLbl'), hourLive: el('hourLive'),
};
function stationXZ(i: number): [number, number] { const st = net.stations[i]; if (!st) throw new Error(`no station ${i}`); const f = net.stationFrame(st.id); return [f.x, f.z]; }
function lineMiddle(): { x: number; z: number } { const a = stationXZ(0), b = stationXZ(net.stations.length - 1); return { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2 }; }
function lineView(): void { const m = lineMiddle(); rig.focus(m.x, m.z, 8500, 0.9, 1.05); }
const ui = new UI(sim, els, {
  speed: s => { speed = s; ui.setSpeed(s); },
  viewLine: lineView,
  focusStation: i => { const [x, z] = stationXZ(i); rig.focus(x, z, i === 4 ? 360 : 230); },
  changed: () => persist(),
  lockHour: h => { lockHour = h; ui.setLight(lockHour ?? sim.hour(), lockHour !== null); },
  reset: () => { store.wipe(); sim = new Sim(net, Sim.fresh(net, seed)); ui.sim = sim; ui.selected = 0; ui.buildAll(); const [x, z] = stationXZ(0); rig.focus(x, z); },
});
function persist(): void { store.save({ g: sim.g, selected: ui.selected }); }

// ---- welcome back ----
if (saved && saved.at) {
  const away = awaySeconds(saved.at);
  if (away) { const c0 = sim.g.cash, b0 = sim.g.stats.boarded; sim.advance(away); ui.toast(`While you were away: ${fmt(sim.g.cash - c0)} from ${(sim.g.stats.boarded - b0).toLocaleString('en-GB')} passengers`); }
  if (saved.selected) ui.selected = saved.selected;
}
ui.setSpeed(1); ui.buildAll(); ui.setLight(lockHour ?? sim.hour(), lockHour !== null);
document.documentElement.dataset['sim'] = 'ready';   // the checks wait for this
{ const [x, z] = stationXZ(ui.selected); Object.assign(rig.o, { tx: x, ty: 2, tz: z, r: 230, th: 5.5, ph: 1.2 }, window.__orbit ?? {}); }

// ---- loop ----
let prev = performance.now(), uiAcc = 0, saveAcc = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  const dtGame = dt * GAME_PER_REAL * speed;
  sim.advance(dtGame);
  resize(); rig.update(dt);
  const light = lighting(lockHour ?? sim.hour(), rig.o);
  sky.update(light.horizon, light.daylight, camera, dt);
  syncStations(built, sim.g); trains.sync(sim.g, dtGame); pax.sync(sim.g, dtGame); labels();
  uiAcc += dt; if (uiAcc > 0.25) { uiAcc = 0; ui.tick(); ui.setLight(lockHour ?? sim.hour(), lockHour !== null); }
  saveAcc += dt; if (saveAcc > 5) { saveAcc = 0; persist(); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
requestAnimationFrame(n => { prev = n; frame(n); });
