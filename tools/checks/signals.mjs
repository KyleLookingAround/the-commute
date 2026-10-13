// Signalling (docs/DESIGN.md, Signalling), measured headless with the renderer's own lineside: the colour-light signals
// stand at the network's block boundaries, and with a failed train in an open block the signal at its entry shows
// red, the one before yellow and the rest of that line green, each lamp in its token's colour; once it clears they all
// show green again. A train behind it stands at the red signal. No browser.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
// the line-speed boards paint their numbers on a canvas: here one that paints nothing
globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
const THREE = await import('three');
const { fromGeo } = await import('../../src/sim/network.ts');
const { Sim, TUNING } = await import('../../src/sim/sim.ts');
const { Lineside } = await import('../../src/render/lineside.ts');
const { PAL } = await import('../../src/render/scene.ts');

export default async function ({ ok, root }) {
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'))), sim = new Sim(net, Sim.fresh(net, 1));
  sim.g.cash = 1e7; for (const k of sim.P.stopperSections) sim.grant(k, 'speed'); sim.grant(sim.P.stopper, 'units'); sim.g.trouble.next = sim.g.t + 1e9;
  sim.ensureTrains(); sim.step(1);
  const side = new Lineside(new THREE.Scene(), net);
  const B = net.blocks('down-slow'), st = net.station('stockport').s, hc = net.station('heaton-chapel').s;
  const k = B.open.findIndex((o, i) => o && i >= 2 && B.open[i - 1] && B.open[i - 2] && B.at[i] > st);
  ok('signals: every signal site on the line is a block boundary on the tracks there', side.sites.every(x => net.tracks.some(t => net.blocks(t.id).at.some(b => Math.abs(b - x.s) < 0.5))), `${side.sites.length} sites`);
  ok('signals: three open blocks in a row north of Stockport', k > 0);
  const [a, b] = sim.g.trains.filter(t => t.svc === 'stopper'), entry = B.at[k];
  Object.assign(a, { state: 'run', dir: 1, s: entry + 400, v: 0, next: 1, bound: -1 });
  Object.assign(b, { state: 'run', dir: 1, s: entry - 1500, v: 20, next: 1, bound: -1, due: sim.g.t + 1e6 });
  sim.g.trouble.fail = { train: a.id, from: sim.g.t, until: sim.g.t + 1e6, a: 0, b: 1, d: 0 };
  for (let t = 0; t < 400; t++) sim.step(1);
  side.sync(true, 1, sim);
  // the signals facing trains towards Manchester are the even ones, a site's low side, in the order the sites stand
  const at = s => side.sites.findIndex(x => Math.abs(x.s - s) < 0.5), shows = side.showing();
  // the failed train's block, the one the train behind stands in, and the one before that
  const i = at(entry), held = at(B.at[k - 1]), before = at(B.at[k - 2]);
  ok('signals: red at the failed train\'s block and the held train\'s, yellow at the one before', shows[2 * i] === 0 && shows[2 * held] === 0 && shows[2 * before] === 1, `${shows[2 * i]}, ${shows[2 * held]}, ${shows[2 * before]}`);
  const others = shows.filter((v, j) => j % 2 === 0 && ![i, held, before].includes(j / 2));
  ok('signals: green elsewhere on that line', others.every(v => v === 2), `${others.filter(v => v !== 2).length} not green`);
  const lamp = side.fresh.children.find(m => m.isInstancedMesh && m.geometry.type === 'SphereGeometry'), c = new THREE.Color();
  lamp?.getColorAt(2 * i, c);
  ok('signals: the red lamp is the red token\'s colour', !!lamp && c.getHexString() === PAL['signal-red'].getHexString(), c.getHexString());
  const head = b.s + sim.half(b);
  ok('signals: the train behind stands at the red signal', b.v < 1 && Math.abs(entry - TUNING.signalStand - head) < 2, `${(entry - head).toFixed(1)} m short`);
  sim.g.trouble.fail = null; sim.goTo(a, a.s + 3000); sim.step(1); side.sync(true, 1, sim);
  ok('signals: once the failed train has gone on, its block\'s signal shows green', side.showing()[2 * i] === 2, `${side.showing()[2 * i]}`);
}
