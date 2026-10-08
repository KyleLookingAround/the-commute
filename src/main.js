import * as THREE from 'three';
import networkDef from './data/network.json';
import kitStockport from './data/kits/stockport.json';
import kitHeaton from './data/kits/heaton-chapel.json';
import kitLevenshulme from './data/kits/levenshulme.json';
import kitArdwick from './data/kits/ardwick.json';
import kitPiccadilly from './data/kits/piccadilly.json';
import { fromGeo } from './sim/network.js';
import { Sim } from './sim/sim.js';
import { createScene } from './render/scene.js';
import { buildWorld } from './render/world.js';
import { buildStations, syncStations } from './render/stations.js';
import { TrainLayer } from './render/trains.js';
import { PassengerLayer } from './render/passengers.js';
import { OrbitRig } from './render/camera.js';
import { UI, fmt } from './ui/panel.js';
import * as store from './save.js';

const GAME_PER_REAL = 6;          // 1 real second = 6 game seconds at 1x
const MAX_AWAY = 8 * 3600;        // catch up at most 8 game hours when you come back

const kits = { stockport: kitStockport, 'heaton-chapel': kitHeaton, levenshulme: kitLevenshulme, ardwick: kitArdwick, piccadilly: kitPiccadilly };
const net = fromGeo(networkDef);

// ---- state ----
const saved = store.load();
let sim = new Sim(net, saved && saved.g);
let speed = 1;

// ---- scene ----
const canvas = document.getElementById('gl');
const { renderer, scene, camera, lighting, resize } = createScene(canvas);
buildWorld(scene, net, networkDef);
const built = buildStations(scene, net, kits);
const trains = new TrainLayer(scene, net, networkDef.services);
const pax = new PassengerLayer(built);
const rig = new OrbitRig(camera, canvas, scene);

// ---- labels ----
const lblBox = document.getElementById('lbls');
const lbls = built.map(() => { const d = document.createElement('div'); d.className = 'lbl'; lblBox.appendChild(d); return d; });
const v3 = new THREE.Vector3();
function labels() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  built.forEach((b, i) => {
    const d = lbls[i]; b.label.getWorldPosition(v3); v3.project(camera);
    if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1) { d.style.display = 'none'; return; }
    d.style.display = ''; d.style.left = ((v3.x + 1) / 2 * w) + 'px'; d.style.top = ((1 - v3.y) / 2 * h) + 'px';
    const s = b.station, txt = sim.g.owned[i] ? s.name : `${s.name} · <b>${fmt(s.price)}</b>`;
    if (d.innerHTML !== txt) d.innerHTML = txt; d.classList.toggle('lock', !sim.g.owned[i]);
  });
}

// ---- ui ----
const els = Object.fromEntries(['cash', 'clock', 'sp1', 'sp3', 'vLine', 'toast', 'strip', 'panel', 'linePanel', 'reset'].map(id => [id, document.getElementById(id)]));
function stationXZ(i) { const f = net.stationFrame(net.stations[i].id); return [f.x, f.z]; }
function lineView() { const a = stationXZ(0), b = stationXZ(net.stations.length - 1); rig.focus((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 8500, 0.9, 0.7); }
const ui = new UI(sim, els, {
  speed: s => { speed = s; ui.setSpeed(s); },
  viewLine: lineView,
  focusStation: i => { const [x, z] = stationXZ(i); rig.focus(x, z, i === 4 ? 360 : 230); },
  changed: () => persist(),
  reset: () => { store.wipe(); sim = new Sim(net); ui.sim = sim; ui.selected = 0; ui.buildAll(); const [x, z] = stationXZ(0); rig.focus(x, z); },
});
function persist() { store.save({ g: sim.g, selected: ui.selected }); }

// ---- welcome back ----
if (saved && saved.at) {
  const away = Math.min(MAX_AWAY, Math.max(0, (Date.now() - saved.at) / 1000) * GAME_PER_REAL);
  if (away > 120) { const c0 = sim.g.cash, b0 = sim.g.stats.boarded; sim.advance(away); ui.toast(`While you were away: ${fmt(sim.g.cash - c0)} from ${(sim.g.stats.boarded - b0).toLocaleString('en-GB')} passengers`); }
  if (saved.selected) ui.selected = saved.selected;
}
ui.setSpeed(1); ui.buildAll();
{ const [x, z] = stationXZ(ui.selected); Object.assign(rig.o, { tx: x, ty: 2, tz: z, r: 230, th: 0.7, ph: 1.0 }); }

// ---- loop ----
let prev = performance.now(), uiAcc = 0, saveAcc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - prev) / 1000); prev = now;
  const dtGame = dt * GAME_PER_REAL * speed;
  sim.advance(dtGame);
  resize(); rig.update(dt); lighting(sim.hour());
  syncStations(built, sim.g); trains.sync(sim.g, dtGame); pax.sync(sim.g); labels();
  uiAcc += dt; if (uiAcc > 0.25) { uiAcc = 0; ui.tick(); }
  saveAcc += dt; if (saveAcc > 5) { saveAcc = 0; persist(); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
requestAnimationFrame(n => { prev = n; frame(n); });
