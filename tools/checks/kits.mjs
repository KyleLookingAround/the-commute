// Everything bought shows on the map: at every station, each upgrade it offers has a kit part gated on it (alone, or with
// others it needs), and every platform has a departure board (one at least for the halt, one with the second platform
// where it's offered); every station's kit is one the page loads (src/render/kits.ts for the opening's, kitsOut.ts after the first frame for the lines out's); and the hipped roofs on Davenport's, Hazel Grove's and Heaton Chapel's booking offices. No browser.
// Covers: @sim src/data/kits/** src/render/stations.ts src/render/kits.ts src/render/kitsOut.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
const { fromGeo } = await import('../../src/sim/network.ts');
const { Sim, UPGRADES } = await import('../../src/sim/sim.ts');

export default async function ({ ok, root }) {
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'))), sim = new Sim(net);
  for (const st of net.stations) {
    const kit = JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8'));
    const gates = kit.parts.map(p => p.upgrade === undefined ? [] : [].concat(p.upgrade));
    const missing = UPGRADES.filter(u => sim.offered(st.index, u) && !gates.some(g => g.includes(u.id))).map(u => u.id);
    ok(`kits: every upgrade ${st.name} offers shows a part on the map`, !missing.length, missing.length ? 'nothing for ' + missing.join(', ') : '');
    const boards = kit.parts.filter(p => p.type === 'board').map(p => [].concat(p.upgrade ?? []));
    const bad = [!boards.some(g => !g.length) && 'no board on the halt', st.grow?.platform2 && !boards.some(g => g.includes('platform2')) && 'no board on the second platform'].filter(Boolean);
    ok(`kits: ${st.name} has departure boards on its platforms`, !bad.length, bad.join('; '));
  }
  // the page builds the stations from the kits src/render/kits.ts imports (the opening's, the line from Edgeley Junction
  // to Piccadilly) and kitsOut.ts (every line out's, after the first frame): one missing and its station stays empty
  const read = f => readFileSync(join(root, 'src/render', f), 'utf8'), opening = read('kits.ts'), out = read('kitsOut.ts');
  const has = (text, st) => text.includes(`../data/kits/${st.kit}.json`);
  const unlisted = net.stations.filter(st => !has(st.corridor === 'main' ? opening : out, st)).map(st => st.kit);
  ok('kits: the page loads every station\'s kit, the opening\'s with it and the lines out\'s after the first frame', !unlisted.length, unlisted.length ? 'not where they belong: ' + unlisted.join(', ') : '');
  // the hipped roofs the photos show, on the buildings they're over, rather than flat ones
  const flat = [];
  for (const id of ['davenport', 'hazel-grove', 'heaton-chapel']) {
    const kit = JSON.parse(readFileSync(join(root, 'src/data/kits', net.station(id).kit + '.json'), 'utf8'));
    const roofs = kit.parts.filter(p => p.type === 'hipped' && p.rise > 0), over = roofs.filter(r => kit.parts.some(b => b.type === 'footprint' && b.y1 === r.y0));
    if (!over.length) flat.push(id);
  }
  ok('kits: the booking offices at Davenport, Hazel Grove and Heaton Chapel have hipped roofs', !flat.length, flat.join(', '));
}
