// Wires it together: the sim, the scene, the UI, saving and the frame loop. The only file that knows about all of them.
import * as THREE from 'three';
import networkJson from './data/network.json';
import kitStockport from './data/kits/stockport.json';
import kitHeaton from './data/kits/heaton-chapel.json';
import kitLevenshulme from './data/kits/levenshulme.json';
import kitArdwick from './data/kits/ardwick.json';
import kitPiccadilly from './data/kits/piccadilly.json';
import kitDavenport from './data/kits/davenport.json';
import kitWoodsmoor from './data/kits/woodsmoor.json';
import kitHazelGrove from './data/kits/hazel-grove.json';
import { fromGeo } from './sim/network.ts';
import { Sim } from './sim/sim.ts';
import type { NetworkGeoDef } from './sim/types.ts';
import { createScene } from './render/scene.ts';
import { buildWorld } from './render/world.ts';
import { buildStations, syncStations, previewUpgrade, partsBox, setReducedMotion } from './render/stations.ts';
import type { Kit } from './render/stations.ts';
import { Lineside } from './render/lineside.ts';
import { StationLife } from './render/life.ts';
import { TaxiLayer } from './render/taxis.ts';
import { BusLayer } from './render/buses.ts';
import { TrainLayer } from './render/trains.ts';
import { PassengerLayer } from './render/passengers.ts';
import { OrbitRig } from './render/camera.ts';
import { ReachLayer, withBought, savingText } from './render/reach.ts';
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
    /** For the checks: how many groups of parts the preview shows, how many are still rising into place, and how many
     * times the camera has framed something (a card's parts, a Built chip's, a train). */
    __view?: { reach?: () => { now: number[]; target: number[]; ghosts: number; minutes: boolean }; preview: number; rising: () => number; framed: number; trouble?: () => { hazards: number; cautions: number; buses: number; spare: boolean } };
  }
}

// the JSON is the data layer's; it's typed here, where it's read, so the data stays plain. Only the waypoints and the
// roads' points need a word: JSON can't say an array is a pair; everything else is checked against the type as it is
const networkDef: NetworkGeoDef = {
  ...networkJson, corridors: networkJson.corridors.map(c => ({ ...c, waypoints: c.waypoints as [number, number][] })),
  roads: networkJson.roads.map(r => ({ ...r, points: r.points as [number, number][] })),
};
const kits: Record<string, Kit> = {
  stockport: kitStockport as Kit, 'heaton-chapel': kitHeaton as Kit, levenshulme: kitLevenshulme as Kit, ardwick: kitArdwick as Kit, piccadilly: kitPiccadilly as Kit,
  davenport: kitDavenport as Kit, woodsmoor: kitWoodsmoor as Kit, 'hazel-grove': kitHazelGrove as Kit,
};
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
const world = buildWorld(scene, net, networkDef);
const reach = new ReachLayer(world.ground, net);
const built = buildStations(scene, net, kits);
const lineside = new Lineside(scene, net);
// everything on the ground so far throws and takes shadows; the sky, added after, does neither
scene.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
const life = new StationLife(built, sim);
const taxis = new TaxiLayer(built);
const trains = new TrainLayer(scene, net, networkDef.services ?? []);
const buses = new BusLayer(scene, net, built);
// where the track runs beside each platform face, from the service that boards there that way (at Stockport the main
// line northbound, the Hazel Grove line southbound), so passengers stand back from the right edge
const faceTrack = (st: (typeof net.stations)[number], dir: 'north' | 'south') => { const svc = net.boardingService(st.id, dir); return svc ? net.offsetAt(svc.tracks[dir], st.s) : 0; };
const trackV = net.stations.map(st => ({ north: faceTrack(st, 'north'), south: faceTrack(st, 'south') }));
const pax = new PassengerLayer(built, net.stations, trackV);
const rig = new OrbitRig(camera, canvas, scene);
{ const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; setReducedMotion(reduced); reach.setReducedMotion(reduced); }
const view = {
  preview: 0, framed: 0, rising: () => built.reduce((n, b) => n + b.gated.filter(gt => gt.rise < 1).length, 0) + (lineside.rise < 1 ? 1 : 0) + (trains.spareRising < 1 ? 1 : 0),
  // what's going wrong as drawn: hazard lamps lit or not, caution posts, buses, and the spare unit in the sidings
  // the reach as drawn: each station's glow now and where it's easing to, the ghost rings, and the minutes view
  reach: () => ({ ...reach.radii(), ghosts: reach.ghosts(), minutes: reach.minutesOn }),
  trouble: () => ({ hazards: trains.hazards.count, cautions: trains.posts.count, buses: buses.count, spare: trains.spare.visible }),
};
window.__view = view;
const partBox = new THREE.Box3();
/** Preview an upgrade at a station on the map (or stop), and put the camera on what it adds. */
function preview(i: number | null, id: string | null): void {
  const ups = i === null ? {} : sim.ups(i);
  lineside.preview(false, !!sim.g.line.timetable); trains.previewSpare(false);
  view.preview = previewUpgrade(built, i, ups, id);
  reach.preview(i !== null && id ? withBought(sim, i, id) : null);
  const b = i === null ? undefined : built[i], box = b && id ? partsBox(b, ups, id, partBox) : null;
  if (box) frameBox(box);
}
function frameBox(box: THREE.Box3, near?: number): void { rig.frame(box, near); view.framed++; }
/** Put the camera on what an upgrade at a station built, with no ghost. */
function showBuilt(i: number, id: string): void {
  preview(null, null);
  const b = built[i], box = b ? partsBox(b, sim.ups(i), id, partBox) : null; if (box) frameBox(box);
}
const trainBox = new THREE.Box3();
/** Show a line upgrade on the map: for units and cars a main-line unit (the newest once one's been bought, otherwise
 * the one nearest the line's home, where the units turn), for the timetable its signals and boards nearest where the
 * camera is looking, as a ghost until it's bought. null stops the preview. */
function showLine(id: string | null, bought = false): void {
  preview(null, null);
  if (id === null) return;
  if (!bought) reach.preview(withBought(sim, null, id));
  if (id === 'timetable') {
    view.preview = lineside.preview(!bought, !!sim.g.line.timetable);
    const box = lineside.siteBox(rig.o.tx, rig.o.tz, partBox); if (box) frameBox(box, 40);
    return;
  }
  if (id === 'spare') {
    view.preview = trains.previewSpare(!bought && !sim.g.line.spare) ? 1 : 0;
    frameBox(trainBox.setFromObject(trains.spare), 60);
    return;
  }
  const main = sim.svcs[0], home = main ? sim.station(main.route[0]!).s : 0;
  let k = -1;
  sim.g.trains.forEach((tr, j) => { if (tr.svc !== main?.id) return; if (k < 0 || (id === 'units' && bought ? j > k : Math.abs(tr.s - home) < Math.abs(sim.g.trains[k]!.s - home))) k = j; });
  const m = trains.meshes[k]; if (m) frameBox(trainBox.setFromObject(m));
}
const sky = new Sky(scene, sun, lineMiddle());

// ---- labels ----
const lblBox = el('lbls');
const lbls = built.map(() => { const d = document.createElement('div'); d.className = 'lbl'; lblBox.appendChild(d); return d; });
const v3 = new THREE.Vector3();
/** Labels hide above this line, where the stage's own controls (and the minutes view's key, while it shows) sit. */
let labelTop = 64;
function labels(): void {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  built.forEach((b, i) => {
    const d = lbls[i]; if (!d) return;
    b.label.getWorldPosition(v3); v3.project(camera);
    const top = (1 - v3.y) / 2 * h;
    // off screen, or in the top band where the stage's own controls sit
    if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1 || top < labelTop) { d.style.display = 'none'; return; }
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
/** Halfway between the stations at the two ends of the line (by distance along it, not by the order they're bought). */
function lineMiddle(): { x: number; z: number } {
  const byS = [...net.stations].sort((p, q) => p.s - q.s), a = stationXZ(byS[0]!.index), b = stationXZ(byS[byS.length - 1]!.index);
  return { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2 };
}
function lineView(): void { const m = lineMiddle(); rig.focus(m.x, m.z, 10500, 0.9, 1.05); }
const ui = new UI(sim, els, {
  speed: s => { speed = s; ui.setSpeed(s); },
  viewLine: lineView,
  focusStation: i => { const [x, z] = stationXZ(i); rig.focus(x, z, net.stations[i]?.id === 'piccadilly' ? 360 : 230); },
  changed: () => persist(),
  preview: (i, id) => preview(i, id),
  built: (i, id) => showBuilt(i, id),
  showBuilt: (i, id) => showBuilt(i, id),
  // a unit just bought, or longer cars, show on the map at the next frame's sync: frame it after that
  showLine: (id, bought) => { if (bought) requestAnimationFrame(() => requestAnimationFrame(() => showLine(id, true))); else showLine(id); },
  saves: (i, id) => savingText(sim, i, id),
  lockHour: h => { lockHour = h; ui.setLight(lockHour ?? sim.hour(), lockHour !== null); },
  reset: () => { store.wipe(); sim = new Sim(net, Sim.fresh(net, seed)); preview(null, null); ui.sim = sim; ui.selected = 0; ui.picked = null; ui.linePicked = null; ui.buildAll(); const [x, z] = stationXZ(0); rig.focus(x, z); },
});
// the minutes view: the ground shaded by minutes to Manchester, with its key; off by default
const vMins = el<HTMLButtonElement>('vMins'), minsKey = el('minsKey');
vMins.addEventListener('click', () => { const on = !reach.minutesOn; reach.showMinutes(on); vMins.setAttribute('aria-pressed', String(on)); minsKey.hidden = !on; labelTop = on ? minsKey.offsetTop + minsKey.offsetHeight + 8 : 64; });
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

// how far a train running in to the end of its run has to go, so the view can cross it over to its departure platform
const endAhead = (tr: (typeof sim.g.trains)[number]): number | null =>
  tr.state === 'run' && tr.next !== null && sim.isEnd(tr, tr.next) ? Math.abs(sim.station(tr.next).s - tr.s) : null;

// ---- loop ----
let prev = performance.now(), uiAcc = 0, saveAcc = 0;
function frame(now: number): void {
  const realDt = (now - prev) / 1000, dt = Math.min(0.1, realDt); prev = now;
  const dtGame = dt * GAME_PER_REAL * speed;
  sim.advance(dtGame);
  resize(); rig.update(dt);
  const light = lighting(lockHour ?? sim.hour(), rig.o);
  sky.update(light.horizon, light.daylight, camera, dt);
  // the rise takes about a second however slow the frames, so it gets the frame's real time
  syncStations(built, sim.g, realDt); reach.sync(sim, realDt); lineside.sync(!!sim.g.line.timetable, realDt); trains.sync(sim.g, dtGame, endAhead); pax.sync(sim.g, dtGame); labels();
  life.sync(sim, lockHour ?? sim.hour(), dt); taxis.sync(sim, dt, dtGame); buses.sync(sim);
  uiAcc += dt; if (uiAcc > 0.25) { uiAcc = 0; ui.tick(); ui.setLight(lockHour ?? sim.hour(), lockHour !== null); }
  saveAcc += dt; if (saveAcc > 5) { saveAcc = 0; persist(); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
requestAnimationFrame(n => { prev = n; frame(n); });
