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
import { SPINE, fromGeo, newFrame } from './sim/network.ts';
import { Sim, TUNING } from './sim/sim.ts';
import type { NetworkGeoDef } from './sim/types.ts';
import { createScene } from './render/scene.ts';
import { groundAt } from './render/terrain.ts';
import { buildWorld } from './render/world.ts';
import { buildStations, syncStations, previewUpgrade, partsBox, setReducedMotion, setPlaque, foldingCount } from './render/stations.ts';
import type { Kit } from './render/stations.ts';
import { Lineside } from './render/lineside.ts';
import { StationLife } from './render/life.ts';
import { TaxiLayer } from './render/taxis.ts';
import { BusLayer } from './render/buses.ts';
import { LinkLayer } from './render/links.ts';
import { TrainLayer } from './render/trains.ts';
import { PassengerLayer } from './render/passengers.ts';
import { OrbitRig, wrapPi } from './render/camera.ts';
import { Picker } from './render/pick.ts';
import { ReachLayer, withBought, savingText } from './render/reach.ts';
import { HomesLayer } from './render/homes.ts';
import { Sky } from './render/sky.ts';
import { WeatherLayer, solarHour } from './render/weather.ts';
import { yearAt } from './sim/weather.ts';
import { simAtHour } from './sim/day.ts';
import { Sound } from './render/sound.ts';
import { Settings } from './ui/settings.ts';
import { fullScreen } from './ui/fullscreen.ts';
import { playOffline } from './app/offline.ts';
import { loadPrefs, savePrefs, type Prefs } from './app/prefs.ts';
import { UI, fmt } from './ui/panel.ts';
import type { Els } from './ui/panel.ts';
import { wireSaves, wireStartOver } from './ui/saves.ts';
import { ContractSheet } from './ui/contract.ts';
import { careerEmpty, freshCareer, reputation } from './sim/contract.ts';
import * as store from './app/storage.ts';
import { GAME_PER_REAL, awaySeconds } from './app/clock.ts';

declare global {
  interface Window {
    /** Set by a check or a screenshot before the page loads, so a new game repeats. */
    __seed?: number;
    /** Set by a check or a screenshot before the page loads: the weather to start in (it changes the game; only for them). */
    __weather?: import('./sim/types.ts').Sky;
    /** Set by a check or a screenshot before the page loads: the game day a new game starts on, for its season. */
    __day?: number;
    /** Set by tools/shots.mjs: the hour to lock the lighting to. */
    __lockHour?: number;
    /** Set by a screenshot before the page loads: where the camera starts (any of tx, ty, tz, r, th, ph). */
    __orbit?: Partial<import('./render/camera.ts').Orbit>;
    /** For the checks: how many groups of parts the preview shows, how many are still rising into place, and how many
     * times the camera has framed something (a card's parts, a Built chip's, a train). */
    __view?: { perf?: () => { calls: number; triangles: number; geometries: number; textures: number; programs: number; meshes: number; casters: number; first: number; frames: number; sim: number; sync: number; draw: number }; reach?: () => { now: number[]; target: number[]; ghosts: number; minutes: boolean }; homes?: () => { shown: number[]; room: number[]; rising: number }; preview: number; rising: () => number; framed: number; trouble?: () => { hazards: number; cautions: number; buses: number; spare: boolean }; life?: () => { cases: number; bikes: number; figures: number; shadows: boolean; ratio: number; heard: { running: boolean; brakes: number; departs: number; calls: number; birds: number }; pools: number; lamplight: number; works: [number, number] | null; beacons: number; expresses: number };
      camera?: () => import('./render/camera.ts').Orbit & { above: number; fromLine: number; flying: boolean; riding: number; moves: number; compass: boolean; along: number };
      spot?: (kind: 'station' | 'train', i: number) => [number, number] | null; under?: (x: number, y: number) => [number, number] | null;
      weather?: () => { now: string; rain: number; snow: number; fog: number; cover: number; wet: number; settle: number; season: number; falling: boolean; brollies: number; trees: number; fogFar: number; patter: number } };
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
// the career (contract renewal) is kept apart from the run: a new run starts with the perks it has bought
let career = store.loadCareer();
/** A new run's seed: a check's, moved on for each contract so runs differ but repeat; players get a fresh one. */
const runSeed = () => seed === undefined ? undefined : seed + career.renewals;
let sim = new Sim(net, saved ? saved.g : Sim.fresh(net, runSeed(), career.perks));
if (window.__day && !saved) { sim.g.t = simAtHour(window.__day, 6.5); sim.g.day = window.__day; }
if (window.__weather) Object.assign(sim.g.weather, { now: window.__weather, was: window.__weather, until: sim.g.t + 3600 });
let speed = 1;
// the hour the light is locked to for a look around, or null to follow the game's clock; a screenshot can preset it
let lockHour: number | null = window.__lockHour ?? null;

// ---- scene ----
function el<T extends HTMLElement>(id: string): T { const e = document.getElementById(id); if (!e) throw new Error(`index.html has no #${id}`); return e as T; }
const canvas = el<HTMLCanvasElement>('gl');
const { renderer, scene, camera, sun, lighting, resize } = createScene(canvas);
const world = buildWorld(scene, net, networkDef);
const reach = new ReachLayer(world.ground, net);
const homes = new HomesLayer(scene, net, world);
const built = buildStations(scene, net, kits);
const lineside = new Lineside(scene, net);
// everything on the ground so far throws and takes shadows; the sky, added after, does neither
scene.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
const life = new StationLife(built, sim);
const taxis = new TaxiLayer(built);
const trains = new TrainLayer(scene, net, networkDef.services ?? []);
const buses = new BusLayer(scene, net, built);
const links = new LinkLayer(scene, built);
// where the track runs beside each platform face, from the service that boards there that way (at Stockport the main
// line northbound, the Hazel Grove line southbound), so passengers stand back from the right edge
const faceTrack = (st: (typeof net.stations)[number], dir: 'north' | 'south') => { const svc = net.boardingService(st.id, dir); return svc ? net.offsetAt(net.route(svc).track(st.s, dir === 'north' ? 1 : -1), st.s) : 0; };
const trackV = net.stations.map(st => ({ north: faceTrack(st, 'north'), south: faceTrack(st, 'south') }));
const pax = new PassengerLayer(built, net.stations, trackV, net.stations.findIndex(st => st.id === 'piccadilly'));
const rig = new OrbitRig(camera, canvas, scene);
{ const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; setReducedMotion(reduced); reach.setReducedMotion(reduced); rig.reduced = reduced; }
// where the camera looks stays near the line: the nearest point on it as drawn
const mainLine = net.spine, nearF = newFrame();
rig.line = (x, z) => net.place(SPINE, mainLine.nearest(x, z), 0, nearF);
/** How many lines the plaque reads, -1 while it's hidden (no contract renewed yet). */
let plaqueLines = -1;
const view = {
  preview: 0, framed: 0, rising: () => built.reduce((n, b) => n + b.gated.filter(gt => gt.rise < 1).length, 0) + (lineside.rise < 1 ? 1 : 0) + (trains.spareRising < 1 ? 1 : 0),
  // contract renewal as drawn: what's still folding down, the plaque's lines, the unit stabled in the sidings, and the
  // career and run as the page holds them
  folding: () => foldingCount(built),
  contract: () => ({ renewals: career.renewals, rep: career.rep, perks: [...career.perks], run: [...sim.g.perks], earned: reputation(sim.g), plaque: plaqueLines, stabled: trains.stabled.visible, spare: trains.spare.visible, cash: sim.g.cash, owned: sim.g.owned.filter(Boolean).length }),
  // homes that grow as drawn: how many new buildings stand at each station, and how many it has room for
  homes: () => ({ shown: homes.counts(), room: homes.plots.map(l => l.length), rising: homes.risingCount }),
  // what's going wrong as drawn: hazard lamps lit or not, caution posts, buses, and the spare unit in the sidings
  // the reach as drawn: each station's glow now and where it's easing to, the ghost rings, and the minutes view
  reach: () => ({ ...reach.radii(), ghosts: reach.ghosts(), minutes: reach.minutesOn }),
  // car parks and bus links as drawn: cars standing in each station's car parks, and the town's buses at the links
  // point the camera (for the checks' screenshots)
  look: (o: Partial<import('./render/camera.ts').Orbit>) => { Object.assign(rig.o, o); },
  access: () => ({ cars: built.map(b => b.live.parks.reduce((a, f) => a + f.mesh.count, 0)), buses: links.count }),
  trouble: () => ({ hazards: trains.hazards.count, cautions: trains.posts.count, buses: buses.count, spare: trains.spare.visible }),
  // life as drawn: suitcases and bikes beside the figures, figures drawn, and what the sound has started
  life: () => ({ cases: pax.layers.reduce((n, L) => n + L.cases.count, 0), bikes: pax.layers.reduce((n, L) => n + L.bikes.count, 0), figures: pax.layers.reduce((n, L) => n + L.im.count, 0), shadows: renderer.shadowMap.enabled, ratio: renderer.getPixelRatio(), heard: { ...sound.heard },
    pools: pax.layers.reduce((n, L) => n + L.pools.count, 0), lamplight: pax.lamplight, works: trains.eng.visible ? [trains.eng.children[0]!.position.x, trains.eng.children[0]!.position.z] as [number, number] : null, beacons: trains.beacons.count, expresses: sim.g.trains.filter(t => t.state !== 'away' && sim.svc(t.svc).express).length }),
};
window.__view = view;
// the camera as it is, for the checks: the orbit, how far above the ground and from the line, flying, riding, the compass
Object.assign(view, { camera: () => {
  const p = camera.position, n = net.place(SPINE, mainLine.nearest(rig.o.tx, rig.o.tz), 0, newFrame());
  return { ...rig.o, above: p.y - groundAt(p.x, p.z), fromLine: Math.hypot(rig.o.tx - n.x, rig.o.tz - n.z), flying: !!rig.tween, riding: rig.riding ? trains.meshes.indexOf(rig.riding as THREE.Group) : -1, moves: rig.moves, compass: !compass.hidden, along: +glide.value };
},
  // where a station's label or a train stands on the screen, in client pixels (null off it), and the ground under a point
  spot: (kind: 'station' | 'train', i: number) => {
    const r = canvas.getBoundingClientRect(), o = kind === 'station' ? built[i]?.label : trains.meshes[i];
    if (!o || (kind === 'train' && !o.visible)) return null;
    if (kind === 'station') o.getWorldPosition(v3); else new THREE.Box3().setFromObject(o).getCenter(v3);
    v3.project(camera); if (v3.z > 1 || Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1) return null;
    return [r.left + (v3.x + 1) / 2 * r.width, r.top + (1 - v3.y) / 2 * r.height];
  },
  under: (x: number, y: number) => { const v = new THREE.Vector3(); return rig.ground(x, y, v) ? [v.x, v.z] : null; },
});
// the weather as drawn: the spell and its shares, what's falling, umbrellas up, the trees, how far the fog lets you see
Object.assign(view, { weather: () => ({ now: sim.g.weather.now, ...weather.look, season: Math.floor(weather.look.year * 4) % 4, falling: weather.falling(), brollies: pax.layers.reduce((n, L) => n + L.brollies.count, 0),
  trees: weather.treeCount, fogFar: scene.fog instanceof THREE.Fog ? scene.fog.far : 0, patter: sound.heard.patter }) });
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
const weather = new WeatherLayer(scene, net, world);
if (window.__weather) weather.settled(window.__weather);

// ---- settings: sound, and graphics for older phones (kept on the device, never in the save) ----
let prefs = loadPrefs();
const sound = new Sound(prefs.sound, prefs.volume);
sound.listen(document);
const stationsXZ = net.stations.map((_, i) => stationXZ(i));
/** Apply the graphics settings: shadows (every material is rebuilt with or without them), fewer figures, sharpness. */
function graphics(p: Prefs, was: Prefs | null): void {
  if (!was || was.shadows !== p.shadows) {
    renderer.shadowMap.enabled = p.shadows;
    if (was) scene.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true; });
  }
  pax.setFewer(p.fewer); weather.setLow(p.fewer); weather.setFair(!p.weather);
  renderer.setPixelRatio(p.sharp ? Math.min(2, window.devicePixelRatio || 1) : 1);
}
graphics(prefs, null);
const settings = new Settings(el<HTMLButtonElement>('vSet'), prefs, p => {
  const was = prefs; prefs = p; savePrefs(p);
  sound.setVolume(p.volume); if (p.sound !== was.sound) sound.setOn(p.sound);
  graphics(p, was);
});

fullScreen(el<HTMLButtonElement>('vFull'));
playOffline(() => settings.offlineReady());

// ---- labels ----
const lblBox = el('lbls');
const lbls = built.map(() => { const d = document.createElement('div'); d.className = 'lbl'; lblBox.appendChild(d); return d; });
const lblKey: number[] = built.map(() => NaN);
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
    // the text only when it changes (ownership, or the price with it), so a frame makes no strings; -1 for owned
    const owned = !!sim.g.owned[i], key = owned ? -1 : sim.stationPrice(i);
    if (lblKey[i] !== key) { const s = b.station; lblKey[i] = key; d.innerHTML = owned ? s.name : `${s.name} · <b>${fmt(key)}</b>`; d.classList.toggle('lock', !owned); }
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
  reset: () => { startRun(); const [x, z] = stationXZ(0); rig.focus(x, z); },
  renew: () => sheet.open(career, sim.g, net.stations.map(s => s.id)),
});
/** Start a run again from Stockport as a halt, with the career's perks: what was bought folds back down on the map. */
function startRun(): void {
  store.wipe(); sim = new Sim(net, Sim.fresh(net, runSeed(), career.perks)); preview(null, null);
  ui.sim = sim; ui.selected = 0; ui.picked = null; ui.linePicked = null; ui.buildAll(); plaque(); persist();
}
/** The plaque by Stockport's entrance: the contract's number and a line for each renewed, once one has been. */
function plaque(): void {
  plaqueLines = !career.renewals ? -1 : 0;
  plaqueLines += setPlaque(career.renewals ? `Contract No. ${career.renewals + 1}` : null, career.contracts.map(k => `No. ${k.n} · day ${k.day} · ★ ${k.rep}`));
}
// renewing the contract: the sheet banks the reputation and buys perks; beginning the next contract keeps the career,
// starts the run again, and the whole line is in view as its stages fold down and the halts stand ready
const sheet = new ContractSheet(networkDef.contract ?? { branches: [], perks: [] }, c => {
  career = c; store.saveCareer(career); startRun(); lineView();
  ui.toast(`Contract ${career.renewals + 1} begins at Stockport`);
});
wireStartOver(el('reset'), el('resetAll'), {
  hasCareer: () => !careerEmpty(career),
  all: () => { store.wipeCareer(); career = freshCareer(); startRun(); const [x, z] = stationXZ(0); rig.focus(x, z); },
});
plaque();
// tapping the map: a train to ride alongside, a station to fly to and open
const picker = new Picker(camera, canvas, built, trains.meshes);
rig.onTap = (x, y) => {
  const hit = picker.pick(x, y); if (!hit) return;
  if (hit.kind === 'train') { const m = trains.meshes[hit.i]; if (m) rig.ride(m); } else ui.select(hit.i);
};
// the compass: shows once north isn't up, and puts it back
const compass = el<HTMLButtonElement>('vNorth'), needle = el('vNeedle');
compass.addEventListener('click', () => rig.north());
let needleAt = NaN;
function pointNorth(): void {
  const th = wrapPi(rig.o.th), off = Math.abs(th) > 0.05;
  if (compass.hidden === off) compass.hidden = !off;
  if (off && Math.abs(th - needleAt) > 0.005) { needleAt = th; needle.style.transform = `rotate(${th}rad)`; }
}
// the strip's slider: drag along it and the camera glides down the line; it follows the camera otherwise
const glide = el<HTMLInputElement>('glide');
const ends = net.stations.map(st => st.s), sLo = Math.min(...ends) - 300, sHi = Math.max(...ends) + 300;
glide.min = String(Math.round(sLo)); glide.max = String(Math.round(sHi));
let gliding = false;
glide.addEventListener('pointerdown', () => { gliding = true; });
addEventListener('pointerup', () => { gliding = false; }); addEventListener('pointercancel', () => { gliding = false; });
glide.addEventListener('input', () => { const f = net.place(SPINE, +glide.value, 0, nearF); rig.glide(f.x, f.z); });
function followGlide(): void { if (!gliding && document.activeElement !== glide) glide.value = String(Math.round(mainLine.nearest(rig.o.tx, rig.o.tz))); }
followGlide();
// the minutes view: the ground shaded by minutes to Manchester, with its key; off by default
const vMins = el<HTMLButtonElement>('vMins'), minsKey = el('minsKey');
vMins.addEventListener('click', () => { const on = !reach.minutesOn; reach.showMinutes(on); vMins.setAttribute('aria-pressed', String(on)); minsKey.hidden = !on; labelTop = on ? minsKey.offsetTop + minsKey.offsetHeight + 8 : 64; });
// a game loaded from a file is on the device and the page is reloading into it: nothing may write over it
let replaced = false;
function persist(): void { if (!replaced) store.save({ g: sim.g, selected: ui.selected }); }
// saves you can carry: the game to a file and back, through the device's own save so a load is a normal load
const WHY: Record<store.FileProblem, string> = {
  bad: "That file isn't a save from The Commute. Nothing changed.",
  newer: 'That save is from a newer version of the game. Reload to update, then try again. Nothing changed.',
  older: "That save is from an older version and can't be loaded. Nothing changed.",
};
wireSaves(el('saveFile'), el('loadFile'), el('loadPick'), {
  file: () => { persist(); return { name: store.fileName(sim.g), text: store.toFile({ g: sim.g, selected: ui.selected, career }) }; },
  read: text => { const r = store.fromFile(text); return r.ok ? { ok: true, what: `day ${r.saved.g.day}` } : { ok: false, why: WHY[r.why] }; },
  load: text => {
    const r = store.fromFile(text);
    if (!r.ok) { ui.toast(WHY[r.why]); return; }
    if (!store.put(r.saved)) { ui.toast("This device won't keep the save. Nothing changed."); return; }
    replaced = true; location.reload();
  },
  toast: msg => ui.toast(msg),
});

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
// what the frames cost, for the perf check: when the first was drawn, and the script time in the sim, the view's sync
// and the draw, summed over every frame since (read by window.__view.perf; nothing here allocates). renderer.info is
// reset by hand before each frame, since its own reset comes after the shadows are drawn and would leave them out
const cost = { first: 0, frames: 0, sim: 0, sync: 0, draw: 0 };
renderer.info.autoReset = false;
Object.assign(view, { perf: () => {
  let meshes = 0, casters = 0;
  scene.traverse(o => { if (o instanceof THREE.Mesh && o.visible) { meshes++; if (o.castShadow) casters++; } });
  const r = renderer.info.render, m = renderer.info.memory;
  return { calls: r.calls, triangles: r.triangles, geometries: m.geometries, textures: m.textures, programs: renderer.info.programs?.length ?? 0, meshes, casters, ...cost };
} });
function frame(now: number): void {
  const t0 = performance.now();
  const realDt = (now - prev) / 1000, dt = Math.min(0.1, realDt); prev = now;
  const dtGame = dt * GAME_PER_REAL * speed;
  sim.advance(dtGame);
  const t1 = performance.now();
  resize(); rig.update(dt); pointNorth();
  // the light follows the season: a long summer day, an early winter dusk
  const light = lighting(solarHour(lockHour ?? sim.hour(), yearAt(sim.g.t)), rig.o);
  sky.update(light.horizon, light.daylight, camera, dt);
  weather.update(sim.g, sky, sun, scene.fog instanceof THREE.Fog ? scene.fog : null, rig.o, dt, dtGame);
  pax.setRain(0.8 * weather.look.rain + 0.3 * weather.look.snow); sound.setWeather(weather.look.rain, weather.look.snow);
  sound.update(sim, rig.o, light.daylight, stationsXZ, trains.meshes, realDt); pax.setDaylight(light.daylight);
  // the rise takes about a second however slow the frames, so it gets the frame's real time
  syncStations(built, sim.g, realDt); reach.sync(sim, realDt); homes.sync(sim, realDt); lineside.sync(!!sim.g.line.timetable, realDt); trains.sync(sim, dtGame); pax.sync(sim.g, dtGame); labels();
  life.sync(sim, lockHour ?? sim.hour(), dt); taxis.sync(sim, dt, dtGame); buses.sync(sim); links.sync(sim);
  uiAcc += dt; if (uiAcc > 0.25) { uiAcc = 0; ui.tick(); followGlide(); ui.setLight(lockHour ?? sim.hour(), lockHour !== null); }
  saveAcc += dt; if (saveAcc > 5) { saveAcc = 0; persist(); }
  const t2 = performance.now();
  renderer.info.reset(); renderer.render(scene, camera);
  const t3 = performance.now();
  if (!cost.frames) cost.first = t3;
  cost.frames++; cost.sim += t1 - t0; cost.sync += t2 - t1; cost.draw += t3 - t2;
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
requestAnimationFrame(n => { prev = n; frame(n); });
