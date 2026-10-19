// The main roads (`mainRoads` in the network data, from OpenStreetMap by tools/osm-to-roads.mjs --main; drawn by
// src/render/mainroads.ts) against the real roads and the line, from the data and the tiles on disk, with every fine
// terrain tile loaded. No browser.
// - Junctions: every junction a road names with another main road (`with`) is a real one: both roads have a carriageway
//   within 3 m of it (the node OpenStreetMap shares between them), and each road's junctions lie on it, near its course.
// - Bridges: wherever a carriageway crosses a line's tracks, it's well clear of the rail as laid: over it (4.5 m or
//   more above) where OpenStreetMap has the road on a bridge, under it (4 m or more below) everywhere else, never across
//   at rail level. Shown failing on a made-up way across the line on the ground, and passing once laid as a main road.
// - Gridlock's stretches (src/data/traffic.json) each run on a road the data has, centred on their count point within
//   60 m of its course, their queues backing up from one of its junctions.
// - The buses' roads give way along the A6: no bus road is drawn over a main road's carriageway.
// - The bus routes the player runs (the 192, the 358) have their buses on their own roads once bought, none before,
//   and a stop with a shelter each way by at least half their stations.
// Covers: src/render/mainroads.ts src/render/mainways.ts src/render/traffic.ts src/render/buses.ts src/render/busroutes.ts src/data/network.json src/data/traffic.json src/data/terrain/** tools/osm-to-roads.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
const { fromGeo, projectLatLon } = await import('../../src/sim/network.ts');
const { Terrain, setTerrain } = await import('../../src/render/terrain.ts');
const { bridgesOf } = await import('../../src/render/landmarks.ts');
const { mainWays, courseOf, onMainRoad } = await import('../../src/render/mainways.ts');
const { wayPath } = await import('../../src/render/mainroads.ts');

const OVER = 4.5, UNDER = 4;   // m a road over the line stands above the rail, and a road under it below

export default async function ({ ok, root }) {
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def);
  const traffic = JSON.parse(readFileSync(join(root, 'src/data/traffic.json'), 'utf8'));
  const xz = ([lat, lon]) => { const p = projectLatLon(lat, lon, def.origin); return [p.x, p.z]; };
  const roads = def.mainRoads ?? [], ways = mainWays(def);
  const nearOn = (pts, [x, z]) => {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1], [bx, bz] = pts[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
      best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
    }
    return best;
  };
  const pointNear = (id, p) => Math.min(...ways.filter(w => w.road === id).map(w => nearOn(w.pts, p)));

  // junctions
  {
    const bad = [], seen = [];
    for (const r of roads) for (const j of r.junctions) {
      const p = xz(j.at), own = pointNear(r.id, p), course = nearOn(courseOf(def, r.id), p);
      if (own > 3 || course > 150) bad.push(`${r.name} ${j.name}: ${own.toFixed(1)} m from its own carriageway, ${course.toFixed(0)} m from its course`);
      if (!j.with) continue;
      const other = roads.find(o => o.id === j.with), d = other ? pointNear(other.id, p) : Infinity;
      seen.push(`${r.name}–${other?.name ?? j.with}`);
      if (d > 3) bad.push(`${r.name} ${j.name}: the ${other?.name ?? j.with + ' (not in the data)'} ${Number.isFinite(d) ? d.toFixed(1) + ' m away' : ''}`);
    }
    for (const id of ['a6', 'm60', 'a5145', 'a57', 'a560', 'a626']) if (!roads.some(r => r.id === id)) bad.push(`no ${id}`);
    ok('roads: each main road joins the others at its real junctions', !bad.length && seen.length >= 8, bad.slice(0, 4).join('; ') || `${seen.length} junctions: ${[...new Set(seen)].join(', ')}`);
  }

  // bridges: the ground as the page lays it, every fine tile in
  const kits = Object.fromEntries(net.stations.map(st => [st.kit, JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8'))]));
  const t = new Terrain(net, kits, l => bridgesOf(l, def));
  const fineDir = join(root, 'src/data/terrain/fine');
  for (const f of readdirSync(fineDir)) t.addFine(f.replace('.txt', ''), readFileSync(join(fineDir, f), 'utf8'));
  setTerrain(t);
  const lines = net.def.corridors.map(c => c.points);
  /** Every crossing of a laid way with a line's centreline: where, the road's height there, and what it should be. */
  const crossings = (path, bridge) => {
    const out = [];
    for (let i = 1; i < path.pts.length; i++) for (const L of lines) for (let k = 1; k < L.length; k++) {
      const a = path.pts[i - 1], b = path.pts[i], c = L[k - 1], d = L[k];
      const r = [b[0] - a[0], b[1] - a[1]], q = [d[0] - c[0], d[1] - c[1]], den = r[0] * q[1] - r[1] * q[0]; if (!den) continue;
      const u = ((c[0] - a[0]) * q[1] - (c[1] - a[1]) * q[0]) / den, v = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const y = path.y[i - 1] + (path.y[i] - path.y[i - 1]) * u, x = a[0] + r[0] * u, z = a[1] + r[1] * u;
      out.push({ x, z, y, ok: bridge ? y >= OVER : y <= -UNDER, bridge });
    }
    return out;
  };
  const all = ways.flatMap(w => crossings(wayPath(w), !!w.def.bridge).map(c => ({ ...c, name: `${w.road} ${w.def.name}` })));
  const wrong = all.filter(c => !c.ok);
  // the rule shown failing: a way laid across the main line on the ground between Stockport and Heaton Chapel
  const F = net.place('main', (net.station('stockport').s + net.station('heaton-chapel').s) / 2, 0);
  const fake = { road: 'test', def: { name: 'made up', lanes: 2, points: [] }, width: 7.6, pts: [[F.x - F.nx * 60, F.z - F.nz * 60], [F.x + F.nx * 60, F.z + F.nz * 60]] };
  const flat = { pts: fake.pts, y: fake.pts.map(([x, z]) => t.groundY(x, z)) };
  const caught = crossings(flat, false).some(c => !c.ok) && !crossings(wayPath(fake), false).some(c => !c.ok);
  setTerrain(null);
  ok('roads: no main road crosses a line at rail level: over it where the real one bridges it, under it everywhere else',
    !wrong.length && all.length > 0 && caught, `${all.length} crossings (${all.filter(c => c.bridge).length} over); ${wrong.slice(0, 4).map(c => `${c.name} at ${c.x.toFixed(0)},${c.z.toFixed(0)}: ${c.y.toFixed(1)} m ${c.bridge ? 'on its bridge' : 'not on a bridge'}`).join('; ') || 'none at rail level'}; a made-up way across the line on the ground ${caught ? 'fails, and laid as a main road dips under it' : 'passes'}`);

  // gridlock's stretches
  {
    const bad = [];
    for (const s of traffic.stretches) {
      const r = roads.find(o => o.id === s.on);
      if (!r) { bad.push(`${s.id}: no road "${s.on}"`); continue; }
      const d = nearOn(courseOf(def, r.id), xz(s.at));
      if (d > 60) bad.push(`${s.id}: its count point ${d.toFixed(0)} m off the ${r.name}`);
      if (!r.junctions.some(j => j.name === s.head)) bad.push(`${s.id}: no junction "${s.head}" on the ${r.name}`);
    }
    ok('roads: gridlock\'s stretches all run on the real roads, from their count points, queuing back from a junction', !bad.length, bad.slice(0, 4).join('; ') || `${traffic.stretches.length} stretches`);
  }

  // the buses' roads give way along the main roads (src/render/buses.ts draws a segment only off them): the A6 is
  // under the bus roads for a good share of their length
  {
    const on = onMainRoad(def, -1);
    let along = 0, all = 0;
    for (const r of net.def.roads ?? []) for (let i = 1; i < r.points.length; i++) { const [ax, az] = r.points[i - 1], [bx, bz] = r.points[i], l = Math.hypot(bx - ax, bz - az); all += l; if (on(ax, az) && on(bx, bz)) along += l; }
    ok('roads: the buses\' roads run on the main roads\' carriageways where they share them', along > 3000, `${(along / 1000).toFixed(1)} of ${(all / 1000).toFixed(1)} km on a main road`);
  }

  // the bus routes the player runs (src/render/busroutes.ts): each runs along its own road's course, as many buses as
  // its step of More buses says, every one within 6 m of its road, and none until it's bought
  {
    const THREE = await import('three');
    const { Sim } = await import('../../src/sim/sim.ts');
    const { BusRouteLayer } = await import('../../src/render/busroutes.ts');
    const sim = new Sim(net, Sim.halt(net, 1)), scene = new THREE.Scene(), layer = new BusRouteLayer(scene, def, st => { const F = net.stationFrame(st); return [F.x, F.z]; });
    layer.sync(sim, 1); const before = layer.count;
    for (const b of def.busRoutes ?? []) sim.grant(`bus:${b.id}`);
    layer.sync(sim, 600);
    const want = (def.busRoutes ?? []).reduce((a, b) => a + (b.buses ?? [8])[0], 0), mesh = scene.getObjectByName('bus-routes'), m = new THREE.Matrix4(), v = new THREE.Vector3();
    const courses = (def.busRoutes ?? []).map(b => courseOf(def, b.road));
    let far = 0;
    for (let k = 0; k < layer.count; k++) { mesh.getMatrixAt(k, m); v.setFromMatrixPosition(m); far = Math.max(far, Math.min(...courses.map(c => nearOn(c, [v.x, v.z])))); }
    // and a stop by most of its stations, a shelter each way set back beside its road (within 16 m of its course)
    const stops = scene.getObjectByName('bus-route-stops'), need = (def.busRoutes ?? []).reduce((a, b) => a + 2 * Math.ceil(b.along.length / 2), 0);
    let off = 0;
    for (let k = 0; k < stops.count; k++) { stops.getMatrixAt(k, m); v.setFromMatrixPosition(m); off = Math.max(off, Math.min(...courses.map(c => nearOn(c, [v.x, v.z])))); }
    ok('roads: each bus route the player runs has its buses on its own road, none before it\'s bought, and its stops by its stations', before === 0 && layer.count === want && far < 6 && stops.count >= need && off < 16,
      `${before} before, ${layer.count} of ${want} after, the furthest ${far.toFixed(1)} m off its road; ${stops.count} shelters (${need} at least), the furthest ${off.toFixed(1)} m off`);
  }
}
