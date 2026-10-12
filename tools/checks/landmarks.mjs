// The landmarks (src/render/landmarks.ts) as the data places them: every one drawn has a note saying where its position
// and look came from; the town's buildings (the Pyramid, the Plaza, St Mary's, the Market Hall) stand clear of the
// railway's land, the river, the M60 (along their real courses) and the roads the buses drive, and Merseyway clear of all
// but the river it's built over; the viaduct's span lies on the main corridor, and the river and the M60 run under it;
// the arches into Piccadilly; the skyline's towers have heights. No browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
const { fromGeo, projectLatLon } = await import('../../src/sim/network.ts');
const { onCourses } = await import('../../src/render/landmarks.ts');

const RADIUS = { building: 42, cinema: 26, church: 28, market: 24, depot: 40 };   // each kind's footprint, as drawn

export default async function ({ ok, root }) {
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def), c = net.corridor('main');
  const marks = def.landmarks ?? [], byId = id => marks.find(m => m.id === id);
  const sOf = ll => { const p = projectLatLon(ll.lat, ll.lon, def.origin); return c.nearest(p.x, p.z); };
  const river = byId('mersey')?.at ? sOf(byId('mersey').at) : null;
  const unnoted = marks.filter(m => (m.lat !== undefined || m.kind === 'viaduct') && !m.note).map(m => m.id);
  ok('landmarks: every one drawn has a note saying where it came from', !unnoted.length, unnoted.join(', '));
  const roads = (net.def.roads ?? []).flatMap(r => r.points.slice(1).map((b, i) => [r.points[i], b]));
  const roadGap = (x, z) => Math.min(...roads.map(([[ax, az], [bx, bz]]) => {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  }));
  const bad = [], onCourse = onCourses(def);
  for (const m of marks) {
    if (m.lat === undefined || m.kind === 'tower' || m.kind === 'town') continue;
    const p = projectLatLon(m.lat, m.lon, def.origin), a = c.at(c.nearest(p.x, p.z)), off = Math.abs((p.x - a.x) * a.nx + (p.z - a.z) * a.nz);
    // Merseyway is drawn on the river as the map draws it, whatever its own along the line
    const s = m.kind === 'precinct' && river !== null ? river : c.nearest(p.x, p.z);
    const r = m.kind === 'precinct' ? 25 : RADIUS[m.kind] ?? 30, len = m.kind === 'precinct' ? (m.w ?? 220) / 2 : 0;
    if (off - len < 34 + r) bad.push(`${m.id} on the railway's land (${Math.round(off)} m off the line)`);
    if (m.kind !== 'precinct' && onCourse(p.x, p.z, r - 8)) bad.push(`${m.id} in the river or on the M60`);
    if (m.kind !== 'precinct' && m.kind !== 'depot' && roads.length && roadGap(p.x, p.z) < r + 8) bad.push(`${m.id} on a road`);
  }
  ok('landmarks: the town stands clear of the line, the river, the M60 and the roads', !bad.length, bad.join('; '));
  const via = byId('viaduct'), span = via && via.from && via.to ? Math.abs(sOf(via.to) - sOf(via.from)) : 0;
  ok('landmarks: the viaduct spans the main line with its arches and height', span > 300 && via.arches > 0 && via.height > 0, `span ${Math.round(span)} m`);
  // the river's and the M60's real courses: each passes under the viaduct, near where the data puts it on the line
  const crossing = id => { const m = byId(id), at = m?.at && projectLatLon(m.at.lat, m.at.lon, def.origin); if (!m?.course || !at) return Infinity;
    return Math.min(...m.course.map(([lat, lon]) => { const q = projectLatLon(lat, lon, def.origin); return Math.hypot(q.x - at.x, q.z - at.z); })); };
  ok('landmarks: the Mersey and the M60 run along their courses through the valley, under the viaduct', crossing('mersey') < 60 && crossing('m60') < 60 && byId('mersey').course.length > 10 && byId('m60').course.length > 10,
    `${crossing('mersey').toFixed(0)} m, ${crossing('m60').toFixed(0)} m`);
  const arches = marks.filter(m => m.kind === 'arches' && m.from && m.to).map(m => Math.abs(sOf(m.to) - sOf(m.from)));
  ok('landmarks: the line runs on arches from Ardwick into Piccadilly', arches.some(a => a > 300), arches.map(Math.round).join(', '));
  const flat = marks.filter(m => m.kind === 'tower' && !(m.height > 0 && m.lat !== undefined)).map(m => m.id);
  ok('landmarks: every skyline tower has a place and a height', !flat.length, flat.join(', '));
}
