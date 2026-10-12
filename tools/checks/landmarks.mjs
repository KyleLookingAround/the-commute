// The landmarks (src/render/landmarks.ts) as the data places them: every one drawn has a note saying where its position
// and look came from; the town's buildings (the Pyramid, the Plaza, St Mary's, the Market Hall) stand clear of the
// railway's land, the river, the M60 and the roads the buses drive, and Merseyway clear of all but the river it's built
// over; the viaduct's span lies on the main corridor; the skyline's towers have heights. No browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
const { fromGeo, projectLatLon } = await import('../../src/sim/network.ts');

const RADIUS = { building: 42, cinema: 26, church: 28, market: 24 };   // each kind's footprint, as drawn

export default async function ({ ok, root }) {
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def), c = net.corridor('main');
  const marks = def.landmarks ?? [], byId = id => marks.find(m => m.id === id);
  const sOf = ll => { const p = projectLatLon(ll.lat, ll.lon, def.origin); return c.nearest(p.x, p.z); };
  const river = byId('mersey')?.at ? sOf(byId('mersey').at) : null, m60 = byId('m60')?.at ? sOf(byId('m60').at) : null;
  const unnoted = marks.filter(m => (m.lat !== undefined || m.kind === 'viaduct') && !m.note).map(m => m.id);
  ok('landmarks: every one drawn has a note saying where it came from', !unnoted.length, unnoted.join(', '));
  const roads = (net.def.roads ?? []).flatMap(r => r.points.slice(1).map((b, i) => [r.points[i], b]));
  const roadGap = (x, z) => Math.min(...roads.map(([[ax, az], [bx, bz]]) => {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    return Math.hypot(x - ax - dx * t, z - az - dz * t);
  }));
  const bad = [];
  for (const m of marks) {
    if (m.lat === undefined || m.kind === 'tower' || m.kind === 'town') continue;
    const p = projectLatLon(m.lat, m.lon, def.origin), s = c.nearest(p.x, p.z), a = c.at(s), off = Math.abs((p.x - a.x) * a.nx + (p.z - a.z) * a.nz);
    const r = m.kind === 'precinct' ? 25 : RADIUS[m.kind] ?? 30, len = m.kind === 'precinct' ? (m.w ?? 220) / 2 : 0;
    if (off - len < 34 + r) bad.push(`${m.id} on the railway's land (${Math.round(off)} m off the line)`);
    if (m.kind !== 'precinct' && river !== null && Math.abs(s - river) < 14 + r) bad.push(`${m.id} in the river`);
    if (m60 !== null && Math.abs(s - m60) < 18 + r) bad.push(`${m.id} on the M60`);
    if (m.kind !== 'precinct' && roads.length && roadGap(p.x, p.z) < r + 8) bad.push(`${m.id} on a road`);
  }
  ok('landmarks: the town stands clear of the line, the river, the M60 and the roads', !bad.length, bad.join('; '));
  const via = byId('viaduct'), span = via && via.from && via.to ? Math.abs(sOf(via.to) - sOf(via.from)) : 0;
  ok('landmarks: the viaduct spans the main line with its arches and height', span > 300 && via.arches > 0 && via.height > 0, `span ${Math.round(span)} m`);
  const flat = marks.filter(m => m.kind === 'tower' && !(m.height > 0 && m.lat !== undefined)).map(m => m.id);
  ok('landmarks: every skyline tower has a place and a height', !flat.length, flat.join(', '));
}
