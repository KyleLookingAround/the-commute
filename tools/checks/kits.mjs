// Everything bought shows on the map: at every station, each upgrade it offers has a kit part gated on it (alone, or with
// others it needs), and every platform has a departure board (one at least for the halt, one with the second platform
// where it's offered). No browser.
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
}
