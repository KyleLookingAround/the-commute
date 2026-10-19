// Wires it together: the sim, the scene, the UI, saving and the frame loop. The only file that knows about all of them.
import * as THREE from 'three';
import networkJson from './data/network.json';
import { SPINE, fromGeo, newFrame } from './sim/network.ts';
import { Sim, TUNING } from './sim/sim.ts';
import type { NetworkGeoDef } from './sim/types.ts';
import { createScene, snapShadow } from './render/scene.ts';
import { groundAt } from './render/terrain.ts';
import { buildWorld } from './render/world.ts';
import { kits, loadOutKits } from './render/kits.ts';
import { buildStations, fillStations, syncStations, previewUpgrade, partsBox, setReducedMotion, setPlaque, foldingCount } from './render/stations.ts';
import type { Kit } from './render/stations.ts';
import { Lineside } from './render/lineside.ts';
import { StationLife } from './render/life.ts';
import { TaxiLayer } from './render/taxis.ts';
import { BusLayer } from './render/buses.ts';
import { FeederLayer } from './render/feeders.ts';
import { LinkLayer } from './render/links.ts';
import { TrainLayer } from './render/trains.ts';
import { PassengerLayer } from './render/passengers.ts';
import { cullCells } from './render/cells.ts';
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
import { statsView } from './app/stats.ts';
import { loadPrefs, savePrefs, type Prefs } from './app/prefs.ts';
import { ROAD, UI, fmt } from './ui/panel.ts';
import type { ContractSheet } from './ui/contract.ts';
import type { Els } from './ui/panel.ts';
import { wireSaves, wireStartOver } from './ui/saves.ts';
import { Sheet } from './ui/sheet.ts';
import { EdgeMarkers } from './ui/edges.ts';
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
    __view?: { programNames?: () => string[]; triangles?: () => { seen: Record<string, number>; shadow: Record<string, number> }; perf?: () => { calls: number; triangles: number; geometries: number; textures: number; programs: number; meshes: number; casters: number; first: number; frames: number; sim: number; sync: number; draw: number }; reach?: () => { now: number[]; target: number[]; ghosts: number; minutes: boolean }; homes?: () => { shown: number[]; room: number[]; rising: number }; preview: number; rising: () => number; framed: number; trouble?: () => { hazards: number; cautions: number; buses: number; spare: boolean }; life?: () => { cases: number; bikes: number; figures: number; shadows: boolean; ratio: number; heard: { running: boolean; brakes: number; departs: number; calls: number; birds: number }; pools: number; lamplight: number; works: [number, number] | null; beacons: number; expresses: number };
      camera?: () => import('./render/camera.ts').Orbit & { above: number; fromLine: number; flying: boolean; riding: number; moves: number; compass: boolean; along: number };
      spot?: (kind: 'station' | 'train' | 'ghost', i: number) => [number, number] | null; open?: () => { x: number; y: number; w: number; h: number }; under?: (x: number, y: number) => [number, number] | null;
      weather?: () => { now: string; rain: number; snow: number; fog: number; cover: number; wet: number; settle: number; season: number; falling: boolean; brollies: number; trees: number; fogFar: number; patter: number } };
  }
}

// the JSON is the data layer's; it's typed here, where it's read, so the data stays plain. Only the waypoints, the
// roads' points and the feeders' need a word: JSON can't say an array is a pair; everything else is checked against the type as it is
const networkDef: NetworkGeoDef = {
  ...networkJson, corridors: networkJson.corridors.map(c => ({ ...c, waypoints: c.waypoints as [number, number][] })),
  roads: networkJson.roads.map(r => ({ ...r, points: r.points as [number, number][] })),
  stops: networkJson.stops.map(s => ({ ...s, feeder: s.feeder && { ...s.feeder, points: s.feeder.points as [number, number][] } })),
};
const net = fromGeo(networkDef);
statsView(net);   // ?stats: the stats view, loaded after the first frame (and ?stats&save=busy, the busy save)

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
// the real buildings come in after the first frame: the new homes keep off them
void world.buildings.ready.then(() => homes.replan());
const built = buildStations(scene, net, kits);
const lineside = new Lineside(scene, net);
// everything on the ground so far throws and takes shadows (but what glows, or lies flat on a wall, marked noShadow);
// the sky, added after, does neither
scene.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = !o.userData['noShadow']; o.receiveShadow = true; } });
const life = new StationLife(built, sim);
const taxis = new TaxiLayer(built);
const trains = new TrainLayer(scene, net, networkDef.services ?? []);
const buses = new BusLayer(scene, net, built);
const feeders = new FeederLayer(scene, net);
// the lines out's ground comes in after the first frame: the buses' roads are laid on it again
let outIn = false;
void world.terrain.outReady.then(() => { buses.relay(); outIn = true; });
/** After the first frame: the lines out's kits and ground (the script before it holds only the opening). Their
 * stations, empty until then, are built as their kits come, and whatever reads a kit takes them in. */
function more(): void {
  // the network view at wide zoom (src/render/networkview.ts), fetched now so it's not in the script before the first frame
  void import('./render/networkview.ts').then(m => {
    netView = new m.NetworkView({ scene, net, camera, canvas, reduced: rig.reduced, stations: stationsXZ.map(([x, z]) => [x, z, groundAt(x, z)]) });
    Object.assign(view, { network: () => netView ? { ...netView.stats(sim), clouds: sky.shown, at: netView.onScreen() } : null });
  });
  if (cameBack) { const cb = cameBack; cameBack = null; void import('./render/away.ts').then(m => {
    back = new m.WelcomeBack({ camera, canvas, layer: lblBox, reduced: rig.reduced, stations: stationsXZ.map(([x, z]) => [x, z, groundAt(x, z)]),
      wide: () => lineView(true), settle: () => { const [x, z] = stationXZ(ui.selected); rig.focus(x, z, net.stations[ui.selected]?.id === 'piccadilly' ? 360 : 230); },
      moves: () => rig.moves, release: () => { homes.hold = null; life.hold = null; life.fast = 2; }, toast: () => ui.toast(cb.msg) }, cb.earned, THREE.Vector3);
    Object.assign(view, { away: () => back ? { ...back.stats(), homesRising: homes.risingCount, held: !!homes.hold, parks: built.map(b => b.live.parks.reduce((n, f) => n + f.n, 0)) } : null });
  }); }
  // the main roads along their real courses (src/render/mainroads.ts), then gridlock on the map (src/render/traffic.ts):
  // the roads' cars and wash, with the stretches' data, each in its own chunk
  void import('./render/mainroads.ts').then(m => {
    mainRoads = new m.MainRoadLayer({ scene, def: networkDef, focus: () => rig.o });
    Object.assign(view, { mainRoads: () => mainRoads?.stats() ?? null });
  });
  void import('./render/traffic.ts').then(m => {
    roads = new m.TrafficLayer({ scene, net, def: networkDef, sim: () => sim, focus: () => rig.o, ground: world.buildings.layer.then(() => world.ground), reduced: rig.reduced });
    roads.setLow(prefs.fewer);
    Object.assign(view, { traffic: () => roads?.stats() ?? null, roadPoint: (id: string) => roads?.screenOf(id, camera, canvas.clientWidth, canvas.clientHeight) ?? null });
    // the roads' cards and the Network card's score (src/ui/panel.ts)
    const R = roads; ui.roads = { road: id => R.road(id), def: id => R.def(id), score: () => R.score() };
  });
  void world.more().then(() => {
    for (const i of fillStations(net, built, kits)) {
      built[i]!.group.traverse(o => { if (o instanceof THREE.Mesh) { o.castShadow = !o.userData['noShadow']; o.receiveShadow = true; } });
      pax.refit(i, built[i]!, net.stations[i]?.platforms);
    }
    taxis.refit(); links.refit(); kitsIn = true;
  });
}
let kitsIn = false;
let roads: import('./render/traffic.ts').TrafficLayer | null = null;
let mainRoads: import('./render/mainroads.ts').MainRoadLayer | null = null;
let netView: import('./render/networkview.ts').NetworkView | null = null;
/** After time away: what each station earned and the toast, until the welcome back plays (src/render/away.ts). */
let cameBack: { earned: number[]; msg: string } | null = null;
let back: import('./render/away.ts').WelcomeBack | null = null;
const links = new LinkLayer(scene, built);
// where the track runs beside each platform face, from the service that boards there that way (at Stockport the main
// line northbound, the Hazel Grove line southbound), so passengers stand back from the right edge
const faceTrack = (st: (typeof net.stations)[number], dir: 'north' | 'south') => { const svc = net.boardingService(st.id, dir); return svc ? net.offsetAt(net.route(svc).track(st.s, dir === 'north' ? 1 : -1), st.s) : 0; };
const trackV = net.stations.map(st => ({ north: faceTrack(st, 'north'), south: faceTrack(st, 'south') }));
const pax = new PassengerLayer(built, net.stations, trackV, net.stations.findIndex(st => st.id === 'piccadilly'));
const rig = new OrbitRig(camera, canvas, scene);
{ const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; setReducedMotion(reduced); reach.setReducedMotion(reduced); rig.reduced = reduced; life.reduced = reduced; }
// where the camera looks stays near the line: the nearest point on any line as drawn (the spine or a line out)
const mainLine = net.spine, nearF = newFrame();
rig.line = (x, z) => { const at = world.terrain.t.nearest(x, z); return net.place(net.lines[at.k]!.id, at.s, 0, nearF); };
/** How many lines the plaque reads, -1 while it's hidden (no contract renewed yet). */
let plaqueLines = -1;
const view = {
  preview: 0, framed: 0, rising: () => built.reduce((n, b) => n + b.gated.filter(gt => gt.rise < 1).length, 0) + (lineside.risingNow ? 1 : 0) + (trains.spareRising < 1 ? 1 : 0),
  // contract renewal as drawn: what's still folding down, the plaque's lines, the unit stabled in the sidings, and the
  // career and run as the page holds them
  folding: () => foldingCount(built),
  contract: () => ({ renewals: career.renewals, rep: career.rep, perks: [...career.perks], run: [...sim.g.perks], earned: reputation(sim.g), plaque: plaqueLines, stabled: trains.stabled.visible, spare: trains.spare.visible, cash: sim.g.cash, owned: sim.g.owned.filter(Boolean).length }),
  // homes that grow as drawn: how many new buildings stand at each station, and how many it has room for
  homes: () => ({ shown: homes.counts(), room: homes.plots.map(l => l.length), rising: homes.risingCount, gaps: homes.gaps() }),
  // what's going wrong as drawn: hazard lamps lit or not, caution posts, buses, and the spare unit in the sidings
  // the reach as drawn: each station's glow now and where it's easing to, the ghost rings, and the minutes view
  reach: () => ({ ...reach.radii(), ghosts: reach.ghosts(), minutes: reach.minutesOn }),
  // car parks and bus links as drawn: cars standing in each station's car parks, and the town's buses at the links
  // point the camera (for the checks' screenshots)
  look: (o: Partial<import('./render/camera.ts').Orbit>) => { Object.assign(rig.o, o); },
  // the real buildings as drawn: what was read, drawn and left out; loadAll fetches every square (and the fine terrain) now
  buildings: () => world.buildings.layer.then(l => ({ ...l.stats, squares: l.squares.size })),
  loadBuildings: () => world.buildings.layer.then(l => l.loadAll()),
  access: () => ({ cars: built.map(b => b.live.parks.reduce((a, f) => a + f.mesh.count, 0)), buses: links.count }),
  // the ground: whether the lines out's ring (fetched after the first frame) is in and laid
  ground: () => ({ outIn, kitsIn }),
  trouble: () => ({ hazards: trains.hazards.count, cautions: trains.posts.count, buses: buses.count, spare: trains.spare.visible }),
  // life as drawn: suitcases and bikes beside the figures, figures drawn, and what the sound has started
  life: () => ({ cases: pax.layers.reduce((n, L) => n + L.cases.count, 0), bikes: pax.layers.reduce((n, L) => n + L.bikes.count, 0), figures: pax.layers.reduce((n, L) => n + L.im.count, 0), shadows: renderer.shadowMap.enabled, ratio: renderer.getPixelRatio(), heard: { ...sound.heard },
    pools: pax.layers.reduce((n, L) => n + L.pools.count, 0), lamplight: pax.lamplight, works: trains.eng.visible ? [trains.eng.children[0]!.position.x, trains.eng.children[0]!.position.z] as [number, number] : null, beacons: trains.beacons.count, expresses: sim.g.trains.filter(t => t.state !== 'away' && sim.svc(t.svc).express).length }),
};
window.__view = view;
// the camera as it is, for the checks: the orbit, how far above the ground and from the line, flying, riding, the compass
Object.assign(view, { camera: () => {
  const p = camera.position, at = world.terrain.t.nearest(rig.o.tx, rig.o.tz), n = net.place(net.lines[at.k]!.id, at.s, 0, newFrame());
  return { ...rig.o, above: p.y - groundAt(p.x, p.z), fromLine: Math.hypot(rig.o.tx - n.x, rig.o.tz - n.z), flying: !!rig.tween, riding: rig.riding ? trains.meshes.indexOf(rig.riding as THREE.Group) : -1, moves: rig.moves, compass: !compass.hidden, along: +glide.value };
},
  // where a station's label, a train or the middle of the last ghost framed stands on the screen, in client pixels (null
  // off it), and the ground under a point
  spot: (kind: 'station' | 'train' | 'ghost', i: number) => {
    const r = canvas.getBoundingClientRect();
    if (kind === 'ghost') { if (partBox.isEmpty()) return null; partBox.getCenter(v3); }
    else {
      const o = kind === 'station' ? built[i]?.label : trains.meshes[i];
      if (!o || (kind === 'train' && !o.visible)) return null;
      if (kind === 'station') o.getWorldPosition(v3); else new THREE.Box3().setFromObject(o).getCenter(v3);
    }
    v3.project(camera); if (v3.z > 1 || Math.abs(v3.x) > 1 || Math.abs(v3.y) > 1) return null;
    return [r.left + (v3.x + 1) / 2 * r.width, r.top + (1 - v3.y) / 2 * r.height];
  },
  // the map's open part, beside or above the sheet, in client pixels
  open: () => { const r = canvas.getBoundingClientRect(); return { x: r.left + rig.cover.left, y: r.top, w: r.width - rig.cover.left, h: r.height - rig.cover.bottom }; },
  under: (x: number, y: number) => { const v = new THREE.Vector3(); return rig.ground(x, y, v) ? [v.x, v.z] : null; },
});
// the weather as drawn: the spell and its shares, what's falling, umbrellas up, the trees, how far the fog lets you see
Object.assign(view, { weather: () => ({ now: sim.g.weather.now, ...weather.look, season: Math.floor(weather.look.year * 4) % 4, falling: weather.falling(), brollies: pax.layers.reduce((n, L) => n + L.brollies.count, 0),
  trees: weather.treeCount, fogFar: scene.fog instanceof THREE.Fog ? scene.fog.far : 0, patter: sound.heard.patter }) });
const partBox = new THREE.Box3();
/** Preview an upgrade at a station on the map (or stop), and put the camera on what it adds. */
function preview(i: number | null, id: string | null): void {
  const ups = i === null ? {} : sim.ups(i);
  lineside.preview(false, !!sim.g.line.timetable); lineside.previewSignals(null, null); trains.previewSpare(false);
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
/** Put the camera on a place that isn't a station: a train service's unit nearest its home, the unit in the sidings
 * (or Stockport, with none there), the bays of a bus stop. */
function focusPlace(id: string): void {
  preview(null, null);
  const p = sim.P.byId.get(id); if (!p) return;
  if (p.kind === 'stop') { const b = built[p.station!], box = b ? partsBox(b, sim.ups(p.station!), 'bus', partBox) : null; if (box) frameBox(box, 60); return; }
  if (p.kind === 'depot') {
    const u = trains.spare.visible ? trains.spare : trains.stabled.visible ? trains.stabled : null;
    if (u) frameBox(trainBox.setFromObject(u), 60); else { const [x, z] = stationXZ(p.station!); rig.focus(x, z); }
    return;
  }
  if (p.kind !== 'route') return;
  const v = sim.svc(p.svc!), home = sim.station(v.home ?? v.route[0]!).s;
  let k = -1;
  sim.g.trains.forEach((tr, j) => { if (tr.svc === v.id && (k < 0 || Math.abs(tr.s - home) < Math.abs(sim.g.trains[k]!.s - home))) k = j; });
  const m = trains.meshes[k]; if (m?.visible) frameBox(trainBox.setFromObject(m));
}
const sky = new Sky(scene, sun, lineMiddle());
const weather = new WeatherLayer(scene, net, world);
if (window.__weather) weather.settled(window.__weather);

// ---- settings: sound, and graphics for older phones (kept on the device, never in the save) ----
let prefs = loadPrefs();
const sound = new Sound(prefs.sound, prefs.volume);
sound.listen(document);
const stationsXZ = net.stations.map((_, i) => stationXZ(i));
/** Further than this from the camera (the whole network in view) a kit is a few pixels across: it's left out and its
 * name stands for it, so a frame of the whole line stays quick. */
const KIT_FAR = 9000;
function farKits(): void {
  const c = camera.position;
  for (let i = 0; i < built.length; i++) { const p = stationsXZ[i]!, g = built[i]!.group, on = Math.hypot(c.x - p[0], c.y, c.z - p[1]) < KIT_FAR; if (g.visible !== on) g.visible = on; }
}
/** Apply the graphics settings: shadows (every material is rebuilt with or without them), fewer figures, sharpness. */
function graphics(p: Prefs, was: Prefs | null): void {
  if (!was || was.shadows !== p.shadows) {
    renderer.shadowMap.enabled = p.shadows;
    if (was) scene.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true; });
  }
  pax.setFewer(p.fewer); roads?.setLow(p.fewer); weather.setLow(p.fewer); world.buildings.setLow(p.fewer); weather.setFair(!p.weather);
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

// ---- the sheet: over the map's bottom in portrait, docked to its left on wider screens; the camera frames beside it ----
const app = el('sheet').parentElement!, sheet = new Sheet(el('sheet'), el<HTMLButtonElement>('sheetHandle'), el('sheetGrip'));
sheet.onCover = (left, bottom) => { rig.cover.left = left; rig.cover.bottom = bottom; app.style.setProperty('--cover-l', `${left}px`); app.style.setProperty('--cover-b', `${bottom}px`); };
// (the UI is made further down: until then there's no Buy bar to show)
let uiMade = false;
sheet.onMove = at => { app.dataset['sheet'] = sheet.docked ? 'docked' : at; if (uiMade) ui.updateBar(); };
sheet.fit(); sheet.onMove(sheet.at);
// the Light button opens the light's slider in a popover
const vLight = el<HTMLButtonElement>('vLight'), lightPop = el('lightPop');
vLight.addEventListener('click', () => { const on = lightPop.hidden; lightPop.hidden = !on; vLight.setAttribute('aria-expanded', String(on)); });

// ---- labels ----
const lblBox = el('lbls');
const lbls = built.map(() => { const d = document.createElement('div'); d.className = 'lbl'; lblBox.appendChild(d); return d; });
const lblKey: number[] = built.map(() => NaN);
/** The meter on an offered station's name: how near the cash is to its price. */
const lblMeter: (HTMLElement | null)[] = built.map(() => null);
// where each label stands this frame (its centre's x, its bottom, its depth) and its width, read only when its text
// changes, so two names that line up in the distance can be told apart: the nearer one shows
const lblX = built.map(() => 0), lblY = built.map(() => 0), lblZ = built.map(() => 0), lblW = built.map(() => 0), lblH = built.map(() => 24), lblOn = built.map(() => false);
const v3 = new THREE.Vector3();
/** Labels hide above this line, where the stage's own controls (and the minutes view's key, while it shows) sit. */
let labelTop = 64;
// edge markers for the offered stations, at most three, nearest where the camera looks first, when they're off the open
// map: which they are and what they say, refreshed with the panels (not every frame); and how near the cash is to each
// offered station's price, for the meter on its name
const EDGES = 3;
const edges = new EdgeMarkers(el('edges'), built.length, i => ui.select(i));
const edgeHtml: (string | null)[] = built.map(() => null), edgeLabel: string[] = built.map(() => '');
const offered: boolean[] = built.map(() => false);
function nextStations(): void {
  const near: number[] = [];
  sim.S.forEach((s, i) => { offered[i] = sim.offerable(i) && !sim.stationNeeds(i); edgeHtml[i] = null; if (offered[i]) near.push(i); });
  const d = (i: number) => Math.hypot(stationsXZ[i]![0] - rig.o.tx, stationsXZ[i]![1] - rig.o.tz);
  for (const i of near.sort((a, b) => d(a) - d(b)).slice(0, EDGES)) {
    const s = sim.station(i);
    edgeHtml[i] = `<em>${s.name.replace('Manchester ', '')}</em><b>${fmt(sim.stationPrice(i))}</b>`;
    edgeLabel[i] = `${s.name}, ${fmt(sim.stationPrice(i))}: open it`;
  }
  // an owned station that can build a stage with the cash in hand: a dot on its name, as on its chip
  built.forEach((_, i) => { const d = lbls[i], can = !!sim.g.owned[i] && sim.canGrow(sim.P.station[i]!); if (d && d.classList.contains('can') !== can) d.classList.toggle('can', can); });
  built.forEach((_, i) => { const m = lblMeter[i]; if (m) { const w = `${Math.min(100, Math.floor(100 * sim.g.cash / sim.stationPrice(i)))}%`; if (m.style.width !== w) m.style.width = w; } });
}
/** A station further out than the next ones (not offered) shows its dim price only within this of the camera; further,
 * its name alone. */
const DIM_FAR = 2500;
function labels(): void {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  built.forEach((b, i) => {
    const d = lbls[i]; if (!d) return;
    b.label.getWorldPosition(v3); v3.project(camera);
    const top = (1 - v3.y) / 2 * h, html = edgeHtml[i];
    if (html) edges.place(i, html, edgeLabel[i] ?? '', (v3.x + 1) / 2 * w, top, v3.z > 1, rig.cover.left, labelTop, w, h - rig.cover.bottom);
    else edges.hide(i);
    // off screen, or in the top band where the stage's own controls sit
    lblOn[i] = false;
    if (v3.z > 1 || Math.abs(v3.x) > 1.1 || Math.abs(v3.y) > 1.1 || top < labelTop) { d.style.display = 'none'; return; }
    const owned = !!sim.g.owned[i], far = !owned && !offered[i] && Math.hypot(camera.position.x - stationsXZ[i]![0], camera.position.y, camera.position.z - stationsXZ[i]![1]) > DIM_FAR;
    // a name whose point is on the open map near its side slides in to stay whole (its width known once its text is)
    const half = lblW[i]! / 2, x = (v3.x + 1) / 2 * w, lo = rig.cover.left + half + 4, hi = w - half - 4;
    lblOn[i] = true; lblX[i] = x >= rig.cover.left && x < lo ? lo : x <= w && x > hi ? hi : x; lblY[i] = top; lblZ[i] = v3.z;
    d.style.left = lblX[i] + 'px'; d.style.top = top + 'px';
    // the text only when it changes (ownership, being offered, near or far, or the price), so a frame makes no strings;
    // -1 for owned. An offered station's price is bright, with a meter of how near the cash is; the rest dim, and left
    // off far from the camera, where the fogged station's name stands alone
    const key = owned ? -1 : sim.stationPrice(i) * 4 + (offered[i] ? 1 : 0) + (far ? 2 : 0);
    if (lblKey[i] !== key) {
      const s = b.station, price = fmt(sim.stationPrice(i)); lblKey[i] = key;
      d.innerHTML = owned || far ? s.name : `${s.name} · <b>${price}</b>${offered[i] ? '<i class="lm"><i></i></i>' : ''}`;
      d.classList.toggle('lock', !owned); d.classList.toggle('offer', !owned && !!offered[i]);
      lblMeter[i] = d.querySelector<HTMLElement>('.lm > i');
      d.style.display = ''; lblW[i] = d.offsetWidth; lblH[i] = d.offsetHeight || 24;
    }
  });
  // where two names overlap on screen (each standing up from its point, a price pill taller than a name), a fogged one
  // gives way to one owned or offered, and otherwise the farther one gives way
  const ahead = (i: number) => sim.g.owned[i] || offered[i] ? 0 : 1;
  for (let i = 0; i < lbls.length; i++) {
    let show = lblOn[i]!;
    for (let j = 0; show && j < lbls.length; j++) {
      if (j === i || !lblOn[j]) continue;
      const pi = ahead(i), pj = ahead(j);
      if (pj > pi || (pj === pi && (lblZ[j]! > lblZ[i]! || (lblZ[j] === lblZ[i] && j > i)))) continue;
      if (Math.abs(lblX[i]! - lblX[j]!) * 2 < lblW[i]! + lblW[j]! && lblY[i]! - lblH[i]! < lblY[j]! && lblY[j]! - lblH[j]! < lblY[i]!) show = false;
    }
    const d = lbls[i]!, disp = show ? '' : 'none'; if (d.style.display !== disp) d.style.display = disp;
  }
}

// ---- ui ----
const els: Els = {
  shName: el('shName'), shSub: el('shSub'),
  buybar: el('buybar'), barName: el('barName'), barAdds: el('barAdds'), barClose: el('barClose'), barBuy: el('barBuy'), cash: el('cash'), clock: el('clock'), sp1: el('sp1'), sp3: el('sp3'), sp10: el('sp10'), vLine: el('vLine'),
  toast: el('toast'), strip: el('strip'), panel: el('panel'), reset: el('reset'),
  hour: el('hour'), hourLbl: el('hourLbl'), hourLive: el('hourLive'),
};
function stationXZ(i: number): [number, number] { const st = net.stations[i]; if (!st) throw new Error(`no station ${i}`); const f = net.stationFrame(st.id); return [f.x, f.z]; }
/** Halfway between the stations at the two ends of the line (by distance along it, not by the order they're bought). */
function lineMiddle(): { x: number; z: number } {
  const byS = [...net.stations].sort((p, q) => p.s - q.s), a = stationXZ(byS[0]!.index), b = stationXZ(byS[byS.length - 1]!.index);
  return { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2 };
}
/** Whole line: every station on the open map with its name, as near as they'll all fit (a name's half-width from its
 * text: the labels' monospace, about 7.7 px a character, and their padding). */
function lineView(now = false): void {
  rig.fitAll(net.stations.map(st => {
    const [x, z] = stationXZ(st.index), text = sim.g.owned[st.index] ? st.name : `${st.name} · ${fmt(sim.stationPrice(st.index))}`;
    return [x, z, (text.length * 7.7 + 18) / 2];
  }), now);
}
// the line between stations (src/render/sections.ts): each section's renewed track on the map, fetched just after the start
const lineLayer = import('./render/sections.ts').then(m => { const L = new m.SectionLayer(scene, net, () => sim, camera, canvas); Object.assign(view, { sections: () => ({ ...L.stats(), wired: L.wired(), flyovers: L.flyovers() }) }); return L; });
const ui = new UI(sim, els, {
  speed: s => { speed = s; ui.setSpeed(s); },
  viewLine: lineView,
  focusStation: i => { const [x, z] = stationXZ(i); rig.focus(x, z, net.stations[i]?.id === 'piccadilly' ? 360 : 230); },
  focusPlace: id => focusPlace(id),
  changed: () => persist(),
  preview: (i, id) => preview(i, id),
  built: (i, id) => showBuilt(i, id),
  showBuilt: (i, id) => showBuilt(i, id),
  // a unit just bought, or longer cars, show on the map at the next frame's sync: frame it after that
  showLine: (id, bought) => { if (bought) requestAnimationFrame(() => requestAnimationFrame(() => showLine(id, true))); else showLine(id); },
  saves: (i, id) => savingText(sim, i, id),
  lockHour: h => { lockHour = h; ui.setLight(lockHour ?? sim.hour(), lockHour !== null); },
  reset: () => { startRun(); const [x, z] = stationXZ(0); rig.focus(x, z); },
  renew: () => void contractSheet().then(c => c.open(career, sim.g, net.stations.map(s => s.id))),
  showSection: (id, bought, stage) => void lineLayer.then(L => {
    const signals = stage === 'signals' && !bought ? lineside.previewSignals(sim, id) : lineside.previewSignals(null, null);
    const wires = L.previewWires(stage === 'wires' && !bought ? id : null), fly = L.previewFlyover(stage === 'flyover' && !bought ? id : null);
    if (stage === 'flyover') { const box = fly ?? (id ? L.flyoverBox(id) : null); if (box) frameBox(box); return; }
    const box = signals ?? wires ?? L.preview(bought || stage !== 'speed' && stage !== undefined ? null : id) ?? (id ? L.boxOf(id) : null); if (box) frameBox(box);
  }),
}, sheet);
uiMade = true;
/** Start a run again from the start (Stockport shut), with the career's perks: what was bought folds back down on the map. */
function startRun(): void {
  store.wipe(); sim = new Sim(net, Sim.fresh(net, runSeed(), career.perks)); preview(null, null);
  ui.sim = sim; ui.selected = 0; ui.open = null; ui.picked = null; ui.buildAll(); ui.updateBar(); plaque(); persist();
}
/** The plaque by Stockport's entrance: the contract's number and a line for each renewed, once one has been. */
function plaque(): void {
  plaqueLines = !career.renewals ? -1 : 0;
  plaqueLines += setPlaque(career.renewals ? `Contract No. ${career.renewals + 1}` : null, career.contracts.map(k => `No. ${k.n} · day ${k.day} · ★ ${k.rep}`));
}
// renewing the contract: the sheet banks the reputation and buys perks; beginning the next contract keeps the career,
// starts the run again, and the whole line is in view as its stages fold down and the halts stand ready. The sheet is
// fetched when it's first opened, to keep it out of the script before the first frame
let renewal: Promise<ContractSheet> | null = null;
const contractSheet = () => renewal ??= import('./ui/contract.ts').then(m => new m.ContractSheet(networkDef.contract ?? { branches: [], perks: [] }, c => {
  career = c; store.saveCareer(career); startRun(); lineView();
  ui.toast(`Contract ${career.renewals + 1} begins at Stockport`);
}));
wireStartOver(el('reset'), el('resetAll'), {
  hasCareer: () => !careerEmpty(career),
  all: () => { store.wipeCareer(); career = freshCareer(); startRun(); const [x, z] = stationXZ(0); rig.focus(x, z); },
});
plaque();
// tapping the map: a train to ride alongside and open its service, a unit in the sidings to open the depot, a station
// (or the bays of the bus stop by it) to fly to and open
const picker = new Picker(camera, canvas, built, trains.meshes, [trains.spare, trains.stabled]);
rig.onTap = (x, y) => {
  // an edge marker first: the map keeps the gestures that start on one, and its tap opens the station
  const r = canvas.getBoundingClientRect(), mark = edges.hit(x - r.left, y - r.top); if (mark >= 0) { ui.select(mark); return; }
  const hit = netView?.pick(x, y) ?? picker.pick(x, y);
  // nothing tapped: a road's traffic (its card), else a section of line
  if (!hit) { const r = roads?.tap(x, y, camera, canvas.clientWidth, canvas.clientHeight); if (r) { ui.show(ROAD + r); return; } void lineLayer.then(L => { const s = L.tap(x, y); if (s) ui.show(s); }); return; }
  if (hit.kind === 'train') {
    const m = trains.meshes[hit.i], tr = sim.g.trains[hit.i]; if (m) rig.ride(m);
    if (tr && sim.owns(`route:${tr.svc}`)) ui.show(`route:${tr.svc}`, false);
  } else if (hit.kind === 'depot') { if (sim.P.sidings) ui.show(sim.P.sidings); }
  else if (hit.kind === 'stop') { const s = sim.P.stopOf[hit.i]; if (s) ui.show(s); else ui.select(hit.i); }
  else ui.select(hit.i);
};
// Strain, where the network hurts (src/ui/strain.ts): read from just after the start, its glows fetched when the view
// is first turned on, so neither is in the script before the first frame
void import('./ui/strain.ts').then(m => m.wireStrain({ sim: () => sim, ui, rig, view, button: el('vStrain'),
  map: { scene, net, built, camera, canvas, ground: world.ground, labels: lblBox, sim: () => sim, reduced: rig.reduced } }));
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
  if (away) {
    // the map is held as it stood (homes, car parks) and plays what happened after the first frame (src/render/away.ts)
    const c0 = sim.g.cash, b0 = sim.g.stats.boarded, revenue = sim.g.st.map(S => S.revenue);
    homes.hold = homes.wanted(sim); life.hold = life.parkShares(sim);
    sim.advance(away);
    const msg = `While you were away: ${fmt(sim.g.cash - c0)} from ${(sim.g.stats.boarded - b0).toLocaleString('en-GB')} passengers`;
    cameBack = { earned: sim.g.st.map((S, i) => S.revenue - (revenue[i] ?? 0)), msg };
  }
  if (saved.selected) ui.selected = saved.selected;
}
nextStations(); ui.setSpeed(1); ui.buildAll(); ui.setLight(lockHour ?? sim.hour(), lockHour !== null);
sheet.fit(); void document.fonts?.ready.then(() => sheet.fit());
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
},
// the triangles in view by layer (the scene's child each mesh is under, by name), and again for those casting shadows
// (drawn a second time into the sun's map): where a frame's triangles go, for the perf check's log and the stats view
triangles: () => {
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const seen: Record<string, number> = {}, shadow: Record<string, number> = {};
  scene.traverseVisible(o => {
    if (!(o instanceof THREE.Mesh) || (o.frustumCulled && !fr.intersectsObject(o))) return;
    const g = o.geometry, n = Math.round((g.index ? g.index.count : g.getAttribute('position')?.count ?? 0) / 3 * (o instanceof THREE.InstancedMesh ? o.count : 1));
    let top: THREE.Object3D = o; while (top.parent && top.parent !== scene) top = top.parent;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material, hex = mat && 'color' in mat && mat.color instanceof THREE.Color ? mat.color.getHexString() : '';
    const key = top.name || o.name || `${top.type}#${hex}`;
    seen[key] = (seen[key] ?? 0) + n; if (o.castShadow && renderer.shadowMap.enabled) shadow[key] = (shadow[key] ?? 0) + n;
  });
  return { seen, shadow };
},
// the shader programs held, each its name and the end of its cache key (which carries any patch's own key): the perf
// check prints them when there are too many
programNames: () => (renderer.info.programs ?? []).map(p => `${p.name} ${p.cacheKey.slice(-60)}`) });
function frame(now: number): void {
  const t0 = performance.now();
  const realDt = (now - prev) / 1000, dt = Math.min(0.1, realDt); prev = now;
  const dtGame = dt * GAME_PER_REAL * speed;
  sim.advance(dtGame);
  const t1 = performance.now();
  resize(); rig.update(dt, realDt); pointNorth(); farKits(); cullCells(camera.position);
  // the light follows the season: a long summer day, an early winter dusk
  const light = lighting(solarHour(lockHour ?? sim.hour(), yearAt(sim.g.t)), rig.o);
  sky.update(light.horizon, light.daylight, camera, dt);
  weather.update(sim.g, sky, sun, scene.fog instanceof THREE.Fog ? scene.fog : null, rig.o, dt, dtGame); snapShadow(sun);
  pax.setRain(0.8 * weather.look.rain + 0.3 * weather.look.snow); sound.setWeather(weather.look.rain, weather.look.snow);
  sound.update(sim, rig.o, light.daylight, stationsXZ, trains.meshes, realDt); pax.setDaylight(light.daylight);
  // the rise takes about a second however slow the frames, so it gets the frame's real time
  syncStations(built, sim.g, realDt); reach.sync(sim, realDt); homes.sync(sim, realDt); lineside.sync(!!sim.g.line.timetable, realDt, sim); trains.sync(sim, dtGame); pax.sync(sim.g, dtGame); pax.placeCoin(camera); labels();
  life.sync(sim, lockHour ?? sim.hour(), dt); taxis.sync(sim, dt, dtGame); buses.sync(sim); links.sync(sim); feeders.sync(sim, dtGame); netView?.update(sim, rig.o.r, realDt); back?.update(realDt); roads?.sync(dt, dtGame, light.daylight); mainRoads?.sync();
  uiAcc += dt; if (uiAcc > 0.25) { uiAcc = 0; ui.tick(); nextStations(); followGlide(); ui.setLight(lockHour ?? sim.hour(), lockHour !== null); }
  saveAcc += dt; if (saveAcc > 5) { saveAcc = 0; persist(); }
  const t2 = performance.now();
  renderer.info.reset(); renderer.render(scene, camera);
  const t3 = performance.now();
  if (!cost.frames) { cost.first = t3; setTimeout(more, 0); }
  cost.frames++; cost.sim += t1 - t0; cost.sync += t2 - t1; cost.draw += t3 - t2;
  requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });
requestAnimationFrame(n => { prev = n; frame(n); });
