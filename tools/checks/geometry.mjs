// The line's geometry, measured from the data and the renderer's own shapes rather than by eye. No browser: the kits'
// parts are built with the renderer's builders (src/render/stations.ts) and the trains posed as the renderer poses them
// (unitPoses in src/render/trains.ts), each in the station's own frame (u along, v across).
// - Platform edges: at every station, on every face a train stands at, the platform edge runs EDGE m (2.1 m, a real
//   gap 1.25 times across like the tracks, for trains drawn 1.3 times real width) from that track's centreline, the
//   same all the way along the platform and its extension.
// - Clearance: no solid part (anything between rail top and roof height but the rails themselves: platforms,
//   buildings, stairs, shelters, columns, piers, walls, lamps, boards) stands in the space a train's bodies sweep on
//   any track a service runs on, expresses included, at any point through a station, crossing over at the end of a
//   run included. The open line has no kit parts; its masts and signals are placed outside the outer track.
// - Stops: every unit standing at a stop is wholly alongside the platform its passengers board from (the shortest
//   unit on the halt's platform, the longest with the extension, or the longest the kit says its real platforms take),
//   on the side the face is, short of any buffer stop and inside its track.
// - The drawing matches the sim: wherever a unit stands or runs, the bogies of each car it draws (its body straight between) lie on its
//   track's centreline as the sim's network gives it (within ON m), and a standing unit is centred on the sim's stop.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
const THREE = await import('three');
const { fromGeo } = await import('../../src/sim/network.ts');
const { partGroup } = await import('../../src/render/stations.ts');
const { unitPoses, serviceRange } = await import('../../src/render/trains.ts');

const EDGE = 2.1, EDGE_TOL = 0.1;   // platform edge from the track's centreline
const HALF = 1.93;                  // a body's half width as drawn, 1.3 times real, with the riders in its windows
const Y0 = 0.65, Y1 = 5.2;          // a body's underframe to its roof, as drawn
const ON = 0.05;                    // how far a car's bogies may stray from its track's centreline
const CARS = [2, 4, 6];             // the unit lengths the line can run
const STEP = 1;                     // metres between sampled positions along the line

export default async function ({ ok, root, kits: given }) {
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def);
  const kits = given ?? Object.fromEntries(net.stations.map(st => [st.kit, JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8'))]));
  const services = def.services ?? [];
  const poses = [];
  const lengths = svc => svc.scenery ? [svc.cars] : CARS;

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
    const bodies = (svc, s, dir, cars, rem) => {
      const n = unitPoses(net, svc, s, dir, cars, rem, poses), out = [];
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
    for (const svc of services) for (const [dir, id] of [[1, svc.tracks.north], [-1, svc.tracks.south]]) {
      const [r0, r1] = serviceRange(net, svc);
      for (const cars of lengths(svc)) for (let s = Math.max(r0, st.at + umin - reachOut); s <= Math.min(r1, st.at + umax + reachOut); s += STEP) {
        const bs = bodies(svc, s, dir, cars, null);
        sweep(bs, `${svc.id} on ${id}`);
        if (cars === lengths(svc).at(-1) && Math.round(s) % 5 === 0) onTrack(bs, id, `${svc.id} on ${id}`);
      }
    }
    // ---- crossing over running in to the end of a run here ----
    const ends = [];
    for (const v of net.services()) {
      const k = v.route.indexOf(st.index); if (k < 0) continue;
      const last = v.route.length - 1, home = v.home === null ? -1 : v.route.indexOf(v.home);
      // the main line turns at both ends of its route; a line with a home turns there and wherever it's been opened to
      if (k === last || (home >= 0 && k !== 0 && k === home)) ends.push([v.def, 1]);
      if (k === 0 || (home >= 0 && k !== home)) ends.push([v.def, -1]);
    }
    for (const [svc, d] of ends) for (const cars of CARS) for (let rem = 0; rem < 400; rem += STEP) {
      const bs = bodies(svc, st.s - d * rem, d, cars, rem);
      sweep(bs, `${svc.id} crossing over`);
    }
    const list = [...hits.entries()].sort((a, b) => b[1].d - a[1].d);
    ok(`geometry: at ${st.name} no solid part stands where a train passes, crossing over included`, !list.length,
      list.slice(0, 6).map(([k, h]) => `${k} ${h.d.toFixed(2)} m in at u ${h.u.toFixed(0)}`).join('; ') + (list.length > 6 ? `; and ${list.length - 6} more` : ''));
    ok(`geometry: at ${st.name} the trains drawn on the line stay on the sim's track`, stray.d <= ON, `${stray.d.toFixed(2)} m off, ${stray.at}`);

    // ---- the platforms trains stand at ----
    const plats = kit.parts.filter(p => p.type === 'platform');
    const edgeBad = [], standBad = [];
    for (const v of net.services()) {
      const k = v.route.indexOf(st.index); if (k < 0) continue;
      for (const [dir, d] of [['north', 1], ['south', -1]]) {
        // a unit stands here this way unless this is the end its route runs out of that way
        if ((d > 0 && k === v.route.length - 1) || (d < 0 && k === 0)) continue;
        if (net.boardingService(st.id, dir)?.id !== v.def.id && !(v.home !== null && v.route[k] !== v.home)) continue;
        const id = v.def.tracks[dir], face = kit.faces[dir], tv = vAt(id, (face.u0 + face.u1) / 2);
        if (tv === null) { edgeBad.push(`${dir}: the ${id} track doesn't pass the face`); continue; }
        // the platform the face stands on, and its edge on the track's side
        const side = Math.sign(face.v - tv);
        const own = plats.find(p => p.v0 <= face.v && face.v <= p.v1 && ![].concat(p.upgrade ?? []).includes('extend'));
        if (!own) { edgeBad.push(`${dir}: no platform under the face at v ${face.v}`); continue; }
        const edge = side > 0 ? own.v0 : own.v1;
        // the run of platform along that edge: the halt's (or the stage's) and the extension's
        const run = plats.filter(p => Math.abs((side > 0 ? p.v0 : p.v1) - edge) < 0.05 && p.u1 >= own.u0 - 0.5 && p.u0 <= own.u1 + 0.5 || p === own);
        const ext = plats.filter(p => Math.abs((side > 0 ? p.v0 : p.v1) - edge) < 0.05 && [].concat(p.upgrade ?? []).includes('extend') && (Math.abs(p.u1 - own.u0) < 0.5 || Math.abs(p.u0 - own.u1) < 0.5));
        let worst = { g: EDGE, u: 0 };
        for (const p of [own, ...ext]) for (let u = p.u0; u <= p.u1; u += 5) {
          const t = vAt(id, u); if (t === null) continue;
          const g = (edge - t) * side; if (Math.abs(g - EDGE) > Math.abs(worst.g - EDGE)) worst = { g, u };
        }
        if (Math.abs(worst.g - EDGE) > EDGE_TOL) edgeBad.push(`${dir} (${id}): the edge is ${worst.g.toFixed(2)} m from the track at u ${worst.u.toFixed(0)}`);
        // units standing at the stop: the shortest on the halt's platform, the longest on the extended one
        const u0 = Math.min(own.u0, ...ext.map(p => p.u0)), u1 = Math.max(own.u1, ...ext.map(p => p.u1));
        // a kit whose real platforms are too short for the longest unit says how many cars they take (`longest`)
        const longest = Math.max(...CARS.filter(n => n <= (kit.longest ?? CARS.at(-1))));
        for (const [cars, a, b] of [[CARS[0], own.u0, own.u1], [longest, u0, u1]]) {
          const bs = bodies(v.def, st.s, d, cars, null);
          let lo = Infinity, hi = -Infinity, wrong = false;
          for (const B of bs) for (const kk of [-1, 1]) for (const w of [-1, 1]) {
            const pu = B.cu + kk * B.au * B.hl + w * -B.av * HALF, pv = B.cv + kk * B.av * B.hl + w * B.au * HALF;
            lo = Math.min(lo, pu); hi = Math.max(hi, pu); if ((edge - pv) * side < 0) wrong = true;
          }
          if (lo < a - 0.5 || hi > b + 0.5) standBad.push(`${dir}: a ${cars}-car unit stands from u ${lo.toFixed(0)} to ${hi.toFixed(0)}, the platform${cars === CARS[0] ? '' : ' extended'} runs ${a} to ${b}`);
          if (wrong) standBad.push(`${dir}: a ${cars}-car unit stands on the platform's side of its edge`);
          // the middle of the unit on the sim's stop
          const mid = bs.reduce((m, B) => m + B.cu, 0) / bs.length, want = st.s - st.at;
          if (Math.abs(mid - want) > 0.5) standBad.push(`${dir}: a ${cars}-car unit is centred at u ${mid.toFixed(1)}, the sim stops it at ${want.toFixed(1)}`);
          // inside its track and short of any buffer stop on its line
          const L = line(id), sLo = Math.min(L[0][0], L.at(-1)[0]), sHi = Math.max(L[0][0], L.at(-1)[0]);
          if (lo < sLo - 0.5 || hi > sHi + 0.5) standBad.push(`${dir}: a ${cars}-car unit runs off the end of ${id}`);
          for (const p of kit.parts) if (p.type === 'rails' && p.buffer) {
            const [bu, bv] = p.points[0], t = vAt(id, bu);
            if (t !== null && Math.abs(t - bv) < 0.5 && bu > lo - 1 && bu < hi + 1) standBad.push(`${dir}: a ${cars}-car unit runs into the buffer stop at u ${bu}`);
          }
        }
        // passengers stand back from the track the renderer was told is there
        const told = net.offsetAt(id, st.s);
        if (Math.abs(told - tv) > 0.2) edgeBad.push(`${dir}: passengers are told the track is at v ${told.toFixed(2)}, it's at ${tv.toFixed(2)}`);
      }
    }
    ok(`geometry: at ${st.name} each platform edge is ${EDGE} m from its track all the way along`, !edgeBad.length, edgeBad.join('; '));
    ok(`geometry: at ${st.name} a standing unit is wholly alongside its platform, on the face's side, short of the buffers`, !standBad.length, [...new Set(standBad)].join('; '));
  }
}
