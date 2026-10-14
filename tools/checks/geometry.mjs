// The line's geometry, measured from the data and the renderer's own shapes rather than by eye. No browser: the kits'
// parts are built with the renderer's builders (src/render/stations.ts) and the trains posed as the renderer poses them
// (unitPoses in src/render/trains.ts), each in the station's own frame (u along, v across).
// - Platform edges: at every station, on every face a train stands at, the platform edge runs EDGE m (1.68 m,
//   a real gap, for trains drawn at their real 2.8 m width) from that track's centreline, the
//   same all the way along the platform and its extension.
// - Clearance: no solid part (anything between rail top and roof height but the rails themselves: platforms,
//   buildings, stairs, shelters, columns, piers, walls, lamps, boards) stands in the space a train's bodies sweep on
//   any track a service runs on, expresses included, at any point through a station, running in to and out of every
//   platform each service uses there (its crossovers, and the turn at the end of a run) included. The open line has
//   no kit parts; its masts and signals are placed outside the outer track.
// - Stops: every unit standing at every platform its service uses is wholly alongside it (the shortest unit on the
//   halt's platform, the longest with the extension, or the longest the kit says its real platforms take; an express
//   its own length), on the platform's edge EDGE m from where it stands, short of any buffer stop.
// - The drawing matches the sim: wherever a unit runs on its own track, the bogies of each car it draws (its body
//   straight between) lie on its track's centreline as the sim's network gives it (within ON m); standing, on its
//   platform's track or rails; and a standing unit is centred where the sim stops it.
// - Crossovers: wherever a unit running in to or out of a platform is drawn between tracks (on no track and no
//   platform's rails), it's on a crossover the map draws with its rails (`crossovers`), within ON m, and no crossover
//   shifts sideways faster than 1 in 6.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
// a part that paints a sign on a canvas (a taxi rank's) gets one that paints nothing: only its shape is measured here
globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { fromGeo, variants } = await import('../../src/sim/network.ts');
const { partGroup } = await import('../../src/render/stations.ts');
const { unitPoses, serviceRange, offsetOn, crossovers, NO_BERTHS } = await import('../../src/render/trains.ts');
const { Sim, UPGRADES } = await import('../../src/sim/sim.ts');

const EDGE = 1.68, EDGE_TOL = 0.1;   // platform edge from the track's centreline
const HALF = 1.51;                  // a body's half width as drawn, real, with the riders in its windows
const Y0 = 0.5, Y1 = 4.35;          // a body's underframe to its roof (and the beacons on it), as drawn
const ON = 0.05;                    // how far a car's bogies may stray from its track's centreline
const CARS = [2, 4, 6];             // the unit lengths the line can run
const STEP = 1;                     // metres between sampled positions along the line

export default async function ({ ok, root, kits: given }) {
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def);
  const kits = given ?? Object.fromEntries(net.stations.map(st => [st.kit, JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8'))]));
  // every service as it can run: its own and its variants (the Hazel Grove trains through to Manchester)
  const services = (def.services ?? []).flatMap(d => [d, ...variants(d)]);
  const poses = [];
  const lengths = svc => svc.scenery || svc.through ? [svc.cars] : CARS;
  // the crossovers the map draws, and none sharper than a turnout
  const drawn = crossovers(net, services);
  let sharp = { k: 0, at: '' };
  for (const c of drawn) for (let s = c.s0; s < c.s1 - 1; s += 1) { const k = Math.abs(c.at(s + 1) - c.at(s)); if (k > sharp.k) sharp = { k, at: `on ${c.corridor} at ${s.toFixed(0)}` }; }
  ok('geometry: the crossovers drawn shift sideways no faster than 1 in 6', drawn.length > 0 && sharp.k <= 1 / 6 + 1e-6, `${drawn.length} drawn; the sharpest 1 in ${(1 / sharp.k).toFixed(1)} ${sharp.at}`);
  // the line fully built and every station owned, so every platform is there
  const sim = new Sim(net); sim.P.station.forEach((id, i) => { sim.grant(id); for (const u of UPGRADES) { const at = sim.upgradePlace(i, u.id); if (at) sim.grant(...at); } });
  // and the same with every service running through where it can, for its variants' platforms
  const through = new Sim(net, JSON.parse(JSON.stringify(sim.g))); for (const v of through.svcs) if (v.base.manchester) through.grant(`route:${v.id}`, 'through');
  /** Where each service stands at a station, and on which platforms: [service, kind, the way it runs in, the way it
   * stands, platform indices]. A line turns at its ends (a line with a home, wherever it's been opened to as well). */
  const standsAt = i => {
    const out = [];
    for (const v of [...sim.svcs, ...through.svcs.filter(v => v.def !== v.base)]) {
      const k = v.route.indexOf(i); if (k < 0) continue;
      const last = v.route.length - 1, home = v.home === null ? -1 : v.route.indexOf(v.home), kinds = [];
      if (v.express) { kinds.push(k === last ? ['turn', 1, -1] : ['north', 1, 1], ...(k === last ? [] : [['south', -1, -1]])); }
      else {
        if (k === last || (home >= 0 && k !== 0 && k === home)) kinds.push(['turn', 1, -1]);
        if (k === 0 || (home >= 0 && k !== home)) kinds.push(['turn', -1, 1]);
        if (k > 0 && k < last && home < 0) kinds.push(['north', 1, 1], ['south', -1, -1]);
        if (home >= 0 && k !== home && k !== 0 && k !== last) kinds.push(['north', 1, 1], ['south', -1, -1]);
      }
      const tr = { svc: v.id, dir: 1, cars: v.def.cars };
      for (const [kind, din, dout] of kinds) {
        const own = v.plats.get(i)?.[kind], all = own ?? sim.plats[i].flatMap((f, p) => kind === 'turn' || f.ways.includes(kind === 'north' ? 0 : 1) ? [p] : []);
        out.push({ v, kind, din, dout, plats: all });
      }
    }
    return out;
  };
  const berthFor = (i, p, turn) => { const st = net.stations[i]; return { st, at: st.at, def: sim.plats[i][p]?.def ?? null, turn }; };

  for (const st of net.stations) {
    const kit = kits[st.kit], F = net.stationFrame(st.id);
    const toKit = (x, z) => [(x - F.x) * F.dx + (z - F.z) * F.dz, (x - F.x) * F.nx + (z - F.z) * F.nz];
    // a track's centreline in this kit's frame, every half metre across the stretch the kit covers
    const lineCache = {};
    const line = id => lineCache[id] ??= (() => {
      const [e0, e1] = net.extent(id), pts = [], s0 = Math.max(e0, st.at - 700);
      let s1 = Math.min(e1, st.at + 700);
      // a track that ends at the end of its corridor runs on to a buffer stop the kit draws on its line
      if (s1 === e1) {
        const p = net.trackAt(id, e1), [eu, ev] = toKit(p.x, p.z);
        for (const r of kit.parts) if (r.type === 'rails' && r.buffer && r.points[0][0] > eu && Math.abs(r.points[0][1] - ev) < 0.5) s1 = Math.max(s1, st.at + r.points[0][0]);
      }
      for (let s = s0; s <= s1; s += 0.5) { const p = net.trackAt(id, s); pts.push(toKit(p.x, p.z)); }
      return pts;
    })();
    /** The track's v at kit u (null off its ends), and how far a kit point is from its centreline. */
    const vAt = (id, u) => { const L = line(id); for (let i = 0; i < L.length - 1; i++) { const [a, av] = L[i], [b, bv] = L[i + 1]; if ((a - u) * (b - u) <= 0 && a !== b) return av + (bv - av) * (u - a) / (b - a); } return null; };
    const off = (id, u, v) => {
      const L = line(id); let best = Infinity;
      for (let i = 0; i < L.length - 1; i++) {
        const [au, av] = L[i], [bu, bv] = L[i + 1], du = bu - au, dv = bv - av, t = Math.max(0, Math.min(1, ((u - au) * du + (v - av) * dv) / (du * du + dv * dv || 1)));
        best = Math.min(best, (au + du * t - u) ** 2 + (av + dv * t - v) ** 2);
      }
      return Math.sqrt(best);
    };
    const bodies = (svc, s, dir, cars, berths) => {
      const n = unitPoses(net, svc, s, dir, cars, berths ?? NO_BERTHS, poses), out = [];
      for (let k = 0; k < n; k++) {
        const p = poses[k], [cu, cv] = toKit(p.x, p.z), au = p.dx * F.dx + p.dz * F.dz, av = p.dx * F.nx + p.dz * F.nz;
        out.push({ cu, cv, au, av, hl: p.len / 2, bogie: p.bogie });
      }
      return out;
    };

    // ---- the solid parts, as boxes in the kit's frame ----
    const solids = [];
    kit.parts.forEach((part, i) => {
      if (part.type === 'rails') return;
      const gp = partGroup(part); gp.updateMatrixWorld(true);
      const box = new THREE.Box3(), m = new THREE.Matrix4(), b = new THREE.Box3();
      gp.traverse(o => {
        if (!o.isMesh) return;
        o.geometry.computeBoundingBox();
        const n = o.isInstancedMesh ? o.count : 1;
        for (let k = 0; k < n; k++) {
          if (o.isInstancedMesh) { o.getMatrixAt(k, m); m.premultiply(o.matrixWorld); } else m.copy(o.matrixWorld);
          b.copy(o.geometry.boundingBox).applyMatrix4(m);
          if (b.max.y > Y0 && b.min.y < Y1) box.union(b);
          if (b.max.y > Y0 && b.min.y < Y1) solids.push({ i, part, u0: b.min.x, u1: b.max.x, v0: b.min.z, v1: b.max.z });
        }
      });
    });
    const name = s => `${s.part.type}${s.part.upgrade ? ' (' + [].concat(s.part.upgrade).join('+') + ')' : ''} #${s.i}`;
    /** How far a body reaches into a box (0 if clear): the least overlap over the four separating axes. */
    const into = (B, S) => {
      const pu = -B.av, pv = B.au;   // across the body
      const reach = (ax, ay, hl, hw) => Math.abs(B.au * ax + B.av * ay) * hl + Math.abs(pu * ax + pv * ay) * hw;
      let least = Infinity;
      for (const [ax, ay, half] of [[1, 0, (S.u1 - S.u0) / 2], [0, 1, (S.v1 - S.v0) / 2]]) {
        const sc = ((S.u0 + S.u1) / 2) * ax + ((S.v0 + S.v1) / 2) * ay, bc = B.cu * ax + B.cv * ay;
        least = Math.min(least, reach(ax, ay, B.hl, HALF) + half - Math.abs(sc - bc));
      }
      for (const [ax, ay] of [[B.au, B.av], [pu, pv]]) {
        const sc = ((S.u0 + S.u1) / 2) * ax + ((S.v0 + S.v1) / 2) * ay, bc = B.cu * ax + B.cv * ay;
        const half = Math.abs(ax) * (S.u1 - S.u0) / 2 + Math.abs(ay) * (S.v1 - S.v0) / 2;
        const own = ax === B.au ? B.hl : HALF;
        least = Math.min(least, own + half - Math.abs(sc - bc));
      }
      return Math.max(0, least);
    };
    const hits = new Map();
    const sweep = (bs, what) => {
      for (const B of bs) for (const S of solids) {
        const r = B.hl + HALF; if (S.u1 < B.cu - r || S.u0 > B.cu + r || S.v1 < B.cv - r || S.v0 > B.cv + r) continue;
        const d = into(B, S); if (d <= 0.02) continue;
        const key = name(S) + ' / ' + what, h = hits.get(key);
        if (!h || d > h.d) hits.set(key, { d, u: B.cu });
      }
    };
    let stray = { d: 0, at: '' };
    const onTrack = (bs, id, what) => {
      for (const B of bs) for (const k of [-B.bogie, B.bogie]) {
        const d = off(id, B.cu + k * B.au, B.cv + k * B.av);
        if (d > stray.d) stray = { d, at: `${what} at u ${B.cu.toFixed(0)}` };
      }
    };
    // where the kit's solids are along the line, and a train's length either side
    let umin = Infinity, umax = -Infinity; for (const S of solids) { umin = Math.min(umin, S.u0); umax = Math.max(umax, S.u1); }
    const reachOut = 120;

    // ---- every track a service runs on, through the station ----
    // (the services whose route runs along this station's corridor here: chainage runs on through the junctions, so
    // a line out shares it with the line it joins, and its trains are elsewhere on the map; not where a service
    // changes track at the station, which its trains always call at, so they're on their platforms there, below)
    for (const svc of services.filter(v => net.route(v).leg(st.at).corridor === st.corridor && !(v.switches ?? []).includes(st.id))) for (const [dir, id] of [1, -1].map(d => [d, net.route(svc).track(st.at, d)])) {
      const [r0, r1] = serviceRange(net, svc);
      for (const cars of lengths(svc)) for (let s = Math.max(r0, st.at + umin - reachOut); s <= Math.min(r1, st.at + umax + reachOut); s += STEP) {
        const bs = bodies(svc, s, dir, cars, null);
        sweep(bs, `${svc.id} on ${id}`);
        if (cars === lengths(svc).at(-1) && Math.round(s) % 5 === 0) onTrack(bs, id, `${svc.id} on ${id}`);
      }
    }
    // ---- running in to and out of every platform each service uses here ----
    const stands = standsAt(st.index);
    for (const { v, kind, din, dout, plats } of stands) for (const p of plats) for (const cars of lengths(v.def)) {
      const b = berthFor(st.index, p, kind === 'turn'), at = sim.stopAt({ svc: v.id, dir: din, cars }, st.index, p);
      for (let rem = 0; rem < 1300; rem += STEP) {
        sweep(bodies(v.def, at - din * rem, din, cars, { ahead: b, behind: null }), `${v.id} running in to ${sim.plats[st.index][p].def.id}`);
        sweep(bodies(v.def, at + dout * rem, dout, cars, { ahead: null, behind: b }), `${v.id} leaving ${sim.plats[st.index][p].def.id}`);
      }
    }
    // ---- between tracks only on a drawn crossover ----
    const lines = [...(st.platforms ?? []).filter(q => q.path).map(q => q.path)];
    const across = x => {
      const out = net.tracks.filter(t => { const [e0, e1] = net.extent(t.id); return t.corridor === st.corridor && x >= e0 && x <= e1; }).map(t => net.offsetAt(t.id, x));
      for (const P of lines) for (let k = 1; k < P.length; k++) { const [a, va] = P[k - 1], [b, vb] = P[k], u = x - st.at; if ((u - a) * (u - b) <= 0 && a !== b) out.push(va + (vb - va) * (u - a) / (b - a)); }
      return out;
    };
    const xs = drawn.filter(c => c.corridor === st.corridor);
    let between = { d: 0, at: "" };
    for (const { v, kind, din, dout, plats } of stands) for (const p of plats) {
      const cars = lengths(v.def).at(-1), b = berthFor(st.index, p, kind === 'turn'), at = sim.stopAt({ svc: v.id, dir: din, cars }, st.index, p);
      for (const [dir, B, sg] of [[din, { ahead: b, behind: null }, -din], [dout, { ahead: null, behind: b }, dout]]) for (let rem = 0; rem < 1300; rem += 5) {
        const x = at + sg * rem, o = offsetOn(net, v.def, dir, cars, B, x);
        const [e0, e1] = net.extent(net.route(v.def).track(x, dir));
        if (net.route(v.def).leg(x).corridor !== st.corridor || x < e0 || x > e1) continue;
        if (across(x).some(a => Math.abs(a - o) <= ON)) continue;
        const d = Math.min(Infinity, ...xs.filter(c => x >= c.s0 - 1e-6 && x <= c.s1 + 1e-6).map(c => Math.abs(c.at(x) - o)));
        if (d > between.d) between = { d, at: `${v.id} ${B.ahead ? 'running in to' : 'leaving'} ${b.def?.id ?? 'its face'} at u ${(x - st.at).toFixed(0)}` };
      }
    }
    ok(`geometry: at ${st.name} a unit between tracks is on a crossover drawn with its rails`, between.d <= ON, between.at ? `${between.d === Infinity ? "none there" : between.d.toFixed(2) + " m off"}, ${between.at}` : "");

    const list = [...hits.entries()].sort((a, b) => b[1].d - a[1].d);
    ok(`geometry: at ${st.name} no solid part stands where a train passes, in and out of every platform included`, !list.length,
      list.slice(0, 6).map(([k, h]) => `${k} ${h.d.toFixed(2)} m in at u ${h.u.toFixed(0)}`).join('; ') + (list.length > 6 ? `; and ${list.length - 6} more` : ''));
    ok(`geometry: at ${st.name} the trains drawn on the line stay on the sim's track`, stray.d <= ON, `${stray.d.toFixed(2)} m off, ${stray.at}`);

    // ---- the platforms trains stand at ----
    const plats = kit.parts.filter(p => p.type === 'platform');
    const edgeBad = [], standBad = [];
    const seen = new Set();
    for (const { v, kind, din, dout, plats: ps } of stands) for (const p of ps) {
      const P = sim.plats[st.index][p], b = berthFor(st.index, p, kind === 'turn'), where = `${v.id} at ${P.def.id}`;
      // where its track runs across the kit, as the drawing has a unit standing there
      const tvAt = u => offsetOn(net, v.def, dout, 2, { ahead: null, behind: b }, st.at + u);
      const face = kit.faces[dout > 0 ? 'north' : 'south'], mid = sim.stopAt({ svc: v.id, dir: din, cars: 2 }, st.index, p) - st.at, tv = tvAt(mid);
      // the platform edge EDGE m from the track there: on the face's side for the station's own one face each way
      const near = plats.filter(q => q.u0 <= mid && mid <= q.u1 && ![].concat(q.upgrade ?? []).includes('extend'));
      const own = P.def.v === undefined
        ? near.find(q => q.v0 <= face.v && face.v <= q.v1)
        : near.find(q => Math.abs(q.v0 - tv - EDGE) < 0.3 || Math.abs(tv - q.v1 - EDGE) < 0.3);
      if (!own) { edgeBad.push(`${where}: no platform ${EDGE} m from the track at v ${tv.toFixed(2)}`); continue; }
      const side = P.def.v === undefined ? Math.sign(face.v - tv) : Math.abs(own.v0 - tv - EDGE) < 0.3 ? 1 : -1;
      const edge = side > 0 ? own.v0 : own.v1;
      // the run of platform along that edge, its parts end to end (a stage's beside the halt's), and its extension
      const along = q => Math.abs((side > 0 ? q.v0 : q.v1) - edge) < 0.05, isExt = q => [].concat(q.upgrade ?? []).includes('extend');
      const run = [own]; for (let grew = true; grew;) { grew = false; for (const q of plats) if (!run.includes(q) && along(q) && !isExt(q) && run.some(r => q.u0 <= r.u1 + 0.5 && q.u1 >= r.u0 - 0.5)) { run.push(q); grew = true; } }
      const r0 = Math.min(...run.map(q => q.u0)), r1 = Math.max(...run.map(q => q.u1));
      const ext = plats.filter(q => along(q) && isExt(q) && (Math.abs(q.u1 - r0) < 0.5 || Math.abs(q.u0 - r1) < 0.5));
      const key = `${edge}|${side}|${P.def.id}|${dout}`;
      if (!seen.has(key)) {
        seen.add(key);
        let worst = { g: EDGE, u: 0 };
        for (const q of [...run, ...ext]) for (let u = q.u0; u <= q.u1; u += 5) {
          const t = tvAt(u), g = (edge - t) * side; if (Math.abs(g - EDGE) > Math.abs(worst.g - EDGE)) worst = { g, u };
        }
        // a bay's rails leave the platform's line beyond its end, so only along the platform it stands at
        if (Math.abs(worst.g - EDGE) > EDGE_TOL) edgeBad.push(`${where}: the edge is ${worst.g.toFixed(2)} m from the track at u ${worst.u.toFixed(0)}`);
      }
      const u0 = Math.min(r0, ...ext.map(q => q.u0)), u1 = Math.max(r1, ...ext.map(q => q.u1));
      const longest = Math.max(...CARS.filter(n => n <= (kit.longest ?? CARS.at(-1))));
      const sizes = v.express ? [[v.def.cars, u0, u1]] : [[CARS[0], r0, r1], [longest, u0, u1]];
      for (const [cars, a, z] of sizes) {
        const at = sim.stopAt({ svc: v.id, dir: din, cars }, st.index, p), bs = bodies(v.def, at, dout, cars, { ahead: null, behind: b });
        let lo = Infinity, hi = -Infinity, wrong = false;
        for (const B of bs) for (const kk of [-1, 1]) for (const w of [-1, 1]) {
          const pu = B.cu + kk * B.au * B.hl + w * -B.av * HALF, pv = B.cv + kk * B.av * B.hl + w * B.au * HALF;
          lo = Math.min(lo, pu); hi = Math.max(hi, pu); if ((edge - pv) * side < 0) wrong = true;
        }
        if (lo < a - 0.5 || hi > z + 0.5) standBad.push(`${where}: a ${cars}-car unit stands from u ${lo.toFixed(0)} to ${hi.toFixed(0)}, the platform${cars === CARS[0] ? '' : ' extended'} runs ${a} to ${z}`);
        if (wrong) standBad.push(`${where}: a ${cars}-car unit stands on the platform's side of its edge`);
        const midU = bs.reduce((m, B) => m + B.cu, 0) / bs.length, want = at - st.at;
        if (Math.abs(midU - want) > 0.5) standBad.push(`${where}: a ${cars}-car unit is centred at u ${midU.toFixed(1)}, the sim stops it at ${want.toFixed(1)}`);
        // its bogies on the platform's track, as the sim's network (or the bay's rails) has it
        for (const B of bs) for (const k of [-B.bogie, B.bogie]) {
          const bu = B.cu + k * B.au, d = Math.abs(B.cv + k * B.av - tvAt(bu)); if (d > stray.d) stray = { d, at: `${where} at u ${bu.toFixed(0)}` };
        }
        for (const r of kit.parts) if (r.type === 'rails' && r.buffer) {
          const [bu, bv] = r.points[0];
          if (Math.abs(tvAt(bu) - bv) < 0.5 && bu > lo - 1 && bu < hi + 1) standBad.push(`${where}: a ${cars}-car unit runs into the buffer stop at u ${bu}`);
        }
      }
      // passengers stand back from the track the renderer was told is there: the station's own face each way
      if (P.def.v === undefined && P.def.track === undefined && kind !== 'turn') {
        const id = net.route(v.def).track(st.s, dout), told = net.offsetAt(id, st.s), t = vAt(id, (face.u0 + face.u1) / 2);
        if (t !== null && Math.abs(told - t) > 0.2) edgeBad.push(`${where}: passengers are told the track is at v ${told.toFixed(2)}, it's at ${t.toFixed(2)}`);
      }
      // the data's v is where the drawing has it
      if (P.def.v !== undefined && Math.abs(P.def.v - tv) > 0.2) edgeBad.push(`${where}: the data says v ${P.def.v}, the track's at ${tv.toFixed(2)}`);
    }
    ok(`geometry: at ${st.name} the trains standing at their platforms stay on the platform's track`, stray.d <= ON, `${stray.d.toFixed(2)} m off, ${stray.at}`);
    ok(`geometry: at ${st.name} each platform edge is ${EDGE} m from its track all the way along`, !edgeBad.length, edgeBad.join('; '));
    ok(`geometry: at ${st.name} a standing unit is wholly alongside every platform its service uses, on the right side, short of the buffers`, !standBad.length, [...new Set(standBad)].join('; '));
  }
}
