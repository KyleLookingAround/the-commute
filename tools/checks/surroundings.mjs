// What stands round the stations against the real ground and the real streets, every station with every upgrade bought,
// from the kits, the terrain's tiles (every fine tile loaded) and the real streets in the world's squares
// (src/data/world, painted on the ground). No browser.
// - On the ground: every taxi rank, car park, bus stop and bus link stands within RISE m of the real ground under it
//   (the LIDAR less the rail's level: a rank on the station's pad in a cutting is metres below it), at its middle and,
//   for a rank or a stop, along its kerb.
// - On a road: every taxi rank, bus stop and bus link touches a street (within TOUCH m of its bay), every car park
//   comes within REACH m of one: a real street painted on the ground, a kit's `road`, or a bridge's deck.
// - Clear of the buildings: none of them stands on a real building (the map would leave the building out), but a car
//   park on a `deck`, which stands on the real building that carries it at its own height; a bus station's bays are
//   its own roads.
// - Joined up: each end of every kit's `road` meets a real street, another road, a bridge's deck, the map's edge or
//   the station's own rank, stop or car park (the end of its approach);
//   no kit road lies on the railway's land or its banks but on a bridge's deck (or a forecourt at grade, where the
//   real ground is at rail level); the roads the replacement buses drive
//   (`roads`), laid as the page lays them from stop to stop, cross the railway's land between streets straight from
//   one side's height to the other's (over a cutting on a bridge, not down at rail level) and never run along it.
// Covers: @sim src/render/** src/data/**
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
const { fromGeo, projectLatLon } = await import('../../src/sim/network.ts');
const { Terrain, setTerrain } = await import('../../src/render/terrain.ts');
const { pathThrough } = await import('../../src/render/buses.ts');
const { bridgesOf } = await import('../../src/render/landmarks.ts');
const { decodeWorld, SQUARE } = await import('../../src/render/buildings.ts');
const { streetBox } = await import('../../src/render/stations.ts');

const RISE = 1.5;     // m a part may stand off the real ground under its middle
const RISE_END = 2;   // ...and a rank's or stop's bay off it at its ends (it's drawn level, the street may not be)
const TOUCH = 3;      // m from a rank's or stop's bay to the edge of a street
const REACH = 25;     // m from a car park to the edge of a street (its own way in between)
const MEET = 3;       // m from a road's end to the edge of what it meets
const ALONG = 80;     // m a road may run on the railway's land or its banks (a crossing at a slant, a station's forecourt)
const KINDS = ['taxi', 'carpark', 'busstop', 'buslink'];
// the stations still to put right (docs/audits/station-surroundings.md), worst first, a few at a time: what's found
// at them, and on the roads to them, is listed but doesn't fail yet (none now).
const LATER = new Set([]);

export default async function ({ ok, root, kits: given }) {
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def);
  const kits = given ?? Object.fromEntries(net.stations.map(st => [st.kit, JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8'))]));
  const t = new Terrain(net, kits, l => bridgesOf(l, def));
  const fineDir = join(root, 'src/data/terrain/fine');
  for (const f of readdirSync(fineDir)) t.addFine(f.replace('.txt', ''), readFileSync(join(fineDir, f), 'utf8'));
  const out = JSON.parse(readFileSync(join(root, 'src/data/terrain/out.json'), 'utf8')); t.addOut(out.near);
  const real = (x, z) => t.raw(x, z) - t.datumAt(x, z);

  // the real streets and buildings, from the world's squares near any station
  const worldDir = join(root, 'src/data/world'), streets = [], buildings = [];
  const near = net.stations.map(st => net.stationFrame(st.id));
  for (const f of readdirSync(worldDir)) {
    // (a square spans i * SQUARE to (i + 1) * SQUARE: any within 600 m of a station)
    const key = f.replace('.txt', ''), [i, j] = key.split('_').map(Number), x0 = i * SQUARE, z0 = j * SQUARE;
    if (!near.some(F => Math.hypot(Math.max(x0 - F.x, 0, F.x - x0 - SQUARE), Math.max(z0 - F.z, 0, F.z - z0 - SQUARE)) < 600)) continue;
    const w = decodeWorld(key, readFileSync(join(worldDir, f), 'utf8'));
    for (const c of w.cover) if (c.cls === 'r') for (let k = 2; k < c.pts.length; k += 2) streets.push({ a: [c.pts[k - 2], c.pts[k - 1]], b: [c.pts[k], c.pts[k + 1]], half: c.w / 2 });
    for (const p of w.pieces) buildings.push(p);
  }
  // the streets by 50 m cell, each in every cell its line passes near
  const CELL = 50, grid = new Map(), cellOf = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  for (const sg of streets) {
    const [ax, az] = sg.a, [bx, bz] = sg.b, n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL / 2));
    const keys = new Set(); for (let j = 0; j <= n; j++) { const x = ax + (bx - ax) * j / n, z = az + (bz - az) * j / n; for (const di of [-1, 0, 1]) for (const dj of [-1, 0, 1]) keys.add(cellOf(x + di * CELL, z + dj * CELL)); }
    for (const k of keys) { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(sg); }
  }
  const segDist = ([px, pz], [ax, az], [bx, bz]) => { const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, s = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)) : 0; return Math.hypot(px - ax - dx * s, pz - az - dz * s); };

  // every kit's roads and bridge decks, in the world
  const kitRoads = [], decks = [];
  for (const st of net.stations) {
    const F = net.stationFrame(st.id), W = (u, v) => [F.x + F.dx * u + F.nx * v, F.z + F.dz * u + F.nz * v];
    for (const p of kits[st.kit].parts) {
      if (p.type === 'road') kitRoads.push({ st, p, pts: p.points.map(q => [...W(q[0], q[1]), q[2]]), half: (p.w ?? 7) / 2 });
      if (p.type === 'box' && p.mat === 'road' && p.y1 >= 3) decks.push({ st, corners: [W(p.u0, p.v0), W(p.u1, p.v0), W(p.u1, p.v1), W(p.u0, p.v1)] });
    }
  }
  const inQuad = ([x, z], q) => { let s = 0; for (let k = 0; k < 4; k++) { const [ax, az] = q[k], [bx, bz] = q[(k + 1) % 4]; s += Math.sign((bx - ax) * (z - az) - (bz - az) * (x - ax)); } return Math.abs(s) === 4; };
  const onDeck = (p, pad = 0) => decks.some(d => inQuad(p, d.corners) || (pad && d.corners.some((c, k) => segDist(p, c, d.corners[(k + 1) % 4]) < pad)));
  /** How far a point is beyond the nearest street's edge (negative inside it): a real street, a kit's road but `but`. */
  const toStreet = (p, but = null) => {
    let d = Infinity;
    for (const s of grid.get(cellOf(p[0], p[1])) ?? []) d = Math.min(d, segDist(p, s.a, s.b) - s.half);
    for (const r of kitRoads) if (r !== but) for (let k = 1; k < r.pts.length; k++) d = Math.min(d, segDist(p, r.pts[k - 1], r.pts[k]) - r.half);
    return d;
  };

  const sunk = [], off = [], over = [], later = [];
  /** A finding: a failure, or noted for later at a station still to put right. */
  const find = (list, ids, what) => (ids.some(id => LATER.has(id)) ? later : list).push(what);
  for (const st of net.stations) {
    const F = net.stationFrame(st.id), W = (u, v) => [F.x + F.dx * u + F.nx * v, F.z + F.dz * u + F.nz * v];
    for (const p of kits[st.kit].parts) {
      if (!KINDS.includes(p.type)) continue;
      const [u0, u1, v0, v1] = streetBox(p), name = `${st.id} ${p.type}${p.upgrade ? ` (${[].concat(p.upgrade).join('+')})` : ''}`;
      const kerb = p.type === 'taxi' || p.type === 'busstop' || p.type === 'buslink';
      const under = [[(u0 + u1) / 2, (v0 + v1) / 2], ...(kerb ? [[u0, v0], [u1, v1]] : [])].map(([u, v]) => W(u, v));
      // drawn: a street-level part on the ground as the page seats it, else at its own height on the station's pad
      const seat = p.type === 'taxi' || p.type === 'busstop' ? [[(u0 + u1) / 2, (v0 + v1) / 2], [u0, v0], [u0, v1], [u1, v0], [u1, v1]] : [[(u0 + u1) / 2, (v0 + v1) / 2]];
      const drawn = p.street ? seat.reduce((a, [u, v]) => a + t.groundY(...W(u, v)), 0) / seat.length : (p.y ?? 0);
      // a car park on a deck stands on the real building that carries it, its own height above the ground
      // (its middle within RISE; a rank's or stop's ends, level on a sloping street, within RISE_END)
      const worst = p.deck ? 0 : Math.max(...under.map((q, k) => Math.abs(drawn - real(...q)) - (k ? RISE_END - RISE : 0)));
      if (worst > RISE) find(sunk, [st.id], `${name} ${worst.toFixed(1)} m off the ground`);
      // touching a street: a rank's or stop's bay along its length, a car park anywhere round its edge
      const edge = kerb ? under : [[u0, v0], [u1, v0], [u1, v1], [u0, v1], [(u0 + u1) / 2, v0], [(u0 + u1) / 2, v1], [u0, (v0 + v1) / 2], [u1, (v0 + v1) / 2]].map(([u, v]) => W(u, v));
      const gap = Math.min(...edge.map(q => onDeck(q, 2) ? 0 : toStreet(q)));
      // (a bus station's bays are its own roads)
      if (gap > (kerb ? TOUCH : REACH) && !p.hall) find(off, [st.id], gap > 50 ? `${name} with no street within 50 m` : `${name} ${gap.toFixed(0)} m from a street`);
      // on a real building
      const box = [W(u0, v0), W(u1, v0), W(u1, v1), W(u0, v1)];
      const hit = buildings.find(b => inQuad([b.x, b.z], box) && Math.hypot(b.w, b.d) > 4);
      if (hit && !p.deck) find(over, [st.id], `${name} on a building at ${hit.x.toFixed(0)}, ${hit.z.toFixed(0)}`);
    }
  }
  ok('surroundings: every taxi rank, car park, bus stop and bus link stands on the real ground under it', !sunk.length, sunk.join('; '));
  ok('surroundings: every taxi rank, bus stop and bus link touches a street, every car park comes within reach of one', !off.length, off.join('; '));
  ok('surroundings: no taxi rank, car park, bus stop or bus link stands on a real building', !over.length, over.join('; '));
  // the kits' roads: both ends joined, and none at rail level across the railway or through a bank
  const loose = [], cross = [];
  const edgeOfMap = ([x, z]) => !near.some(F => Math.hypot(F.x - x, F.z - z) < 600);
  for (const r of kitRoads) {
    for (const end of [r.pts[0], r.pts[r.pts.length - 1]]) {
      const p = [end[0], end[1]];
      // (or at the station's own rank, stop or car park, the end of its approach)
      const atPart = kits[r.st.kit].parts.some(q => KINDS.includes(q.type) && (() => { const [u0, u1, v0, v1] = streetBox(q), F = net.stationFrame(r.st.id), x = p[0] - F.x, z = p[1] - F.z, u = x * F.dx + z * F.dz, v = x * F.nx + z * F.nz; return u > u0 - MEET && u < u1 + MEET && v > v0 - MEET && v < v1 + MEET; })());
      if (!(onDeck(p, MEET) || toStreet(p, r) <= MEET || edgeOfMap(p) || atPart)) find(loose, [r.st.id], `${r.st.id} road end at ${toStreet(p, r).toFixed(0)} m from a street`);
    }
  }
  // along each road every 4 m: on the railway's land (or its cutting and bank sides) only on a deck
  const along = (pts, fn) => { for (let k = 1; k < pts.length; k++) { const [ax, az] = pts[k - 1], [bx, bz] = pts[k], n = Math.ceil(Math.hypot(bx - ax, bz - az) / 4); for (let j = 0; j <= n; j++) fn([ax + (bx - ax) * j / n, az + (bz - az) * j / n]); } };
  // (a stretch between points that give their own height is on a structure: a deck, an abutment)
  for (const r of kitRoads) { let bad = 0; for (let k = 1; k < r.pts.length; k++) if (r.pts[k - 1][2] === undefined || r.pts[k][2] === undefined) along([r.pts[k - 1], r.pts[k]], q => { if (!onDeck(q) && t.railLand(q[0], q[1], 0) && Math.abs(real(q[0], q[1])) > RISE) bad++; }); if (bad) find(cross, [r.st.id], `${r.st.id}'s road on the railway's land for ${bad * 4} m`); }
  // the roads the replacement buses drive, laid as the page lays them, from stop to stop: over the railway's land between
  // streets they're on a bridge, straight from one side's height to the other's; and none runs along the land
  setTerrain(t);
  const stopAt = id => { const st = net.station(id), p = kits[st.kit].parts.find(q => q.type === 'busstop'), F = net.stationFrame(id); return p ? [F.x + F.dx * p.u + F.nx * p.v, F.z + F.dz * p.u + F.nz * p.v] : null; };
  for (const r of def.roads ?? []) {
    const A = stopAt(r.from), B = stopAt(r.to); if (!A || !B) continue;
    const mid = r.points.map(([la, lo]) => { const p = projectLatLon(la, lo, def.origin); return [p.x, p.z]; }), path = pathThrough([A, ...mid, B]);
    // (the railway's land itself, drawn at rail level: a real street beside the line may run along its banks)
    const rail = path.pts.map(([x, z]) => t.railLand(x, z, 0) && t.groundY(x, z) === 0);
    let dip = 0, run = 0, longest = 0, where = '';
    for (let k = 1; k < path.pts.length - 1; k++) {
      if (!rail[k]) { run = 0; continue; }
      run += path.d[k] - path.d[k - 1]; if (run > longest) { longest = run; where = path.pts[k].map(n => n.toFixed(0)).join(', '); }
      if (rail[k - 1]) continue;
      // a crossing between streets: its ends' heights, and the lowest it goes between them
      let e = k; while (e < path.pts.length - 1 && rail[e]) e++;
      if (rail[e]) continue;
      for (let j = k; j < e; j++) { const f = (path.d[j] - path.d[k - 1]) / (path.d[e] - path.d[k - 1]), want = path.y[k - 1] + (path.y[e] - path.y[k - 1]) * f; dip = Math.max(dip, want - path.y[j]); }
    }
    if (dip > RISE) find(cross, [r.from, r.to], `the road ${r.from} to ${r.to} drops ${dip.toFixed(1)} m into the railway`);
    if (longest > ALONG) find(cross, [r.from, r.to], `the road ${r.from} to ${r.to} runs ${longest.toFixed(0)} m along the railway, to ${where}`);
  }
  setTerrain(null);
  ok('surroundings: both ends of every street a kit lays meet a street, a bridge or the map\'s edge', !loose.length, loose.join('; '));
  ok('surroundings: every street crosses the railway straight from one side to the other, and none runs along it', !cross.length, cross.join('; '));
  if (later.length) console.log(`      still to put right at ${[...LATER].join(', ')}: ${later.join('; ')}`);
}
