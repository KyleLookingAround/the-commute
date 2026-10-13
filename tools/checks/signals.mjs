// Signalling (docs/DESIGN.md, Signalling), measured headless with the renderer's own lineside: no colour-light signals
// stand until a section is resignalled; then its signals stand at its sites re-laid closer, each a block boundary as
// the sim has them, with a location case at each end, and a section's card ghosts them first. With the stopper's line
// resignalled and a failed train in an open block, the signal at its entry shows red, the one before yellow and the
// rest of that line green, each lamp in its token's colour; once it clears they all show green again. A train behind
// it stands at the red signal. No browser.
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
  sim.g.cash = 1e7; sim.grant(sim.P.stopper, 'units'); sim.g.trouble.next = sim.g.t + 1e9;
  sim.ensureTrains(); sim.step(1);
  const side = new Lineside(new THREE.Scene(), net);
  side.sync(false, 1, sim);
  ok('signals: none stand before a section is resignalled', side.sigs.length === 0 && side.signals.children.every(m => !m.count), `${side.sigs.length}`);
  const hl = sim.P.all.find(p => p.kind === 'section' && p.name === 'Heaton Chapel – Levenshulme').id;
  const ghost = side.previewSignals(sim, hl);
  ok('signals: a section\'s card ghosts its resignalling and frames it', !!ghost && side.ghosts.visible && side.ghosts.children.some(m => m.count > 0));
  side.previewSignals(null, null);
  sim.grant(hl, 'signals'); side.sync(false, 0.3, sim);
  const x = sim.secs.find(q => q.id === hl), own = net.signals[x.corridor].filter(s => s >= x.s0 && s <= x.s1);
  const sites = [...new Set(side.sigs.map(g => g.spot[0]))];
  ok('signals: a resignalled section\'s signals stand at its sites re-laid closer', sites.length > own.length && sites.every(s => s >= x.s0 && s <= x.s1), `${own.length} sites -> ${sites.length}`);
  ok('signals: and a location case at each end, rising into place', side.signals.children.some(m => m.geometry.type === 'BoxGeometry' && m.count === 2) && side.risingNow);
  for (const k of sim.P.stopperSections) sim.grant(k, 'signals');
  side.sync(false, 1, sim);
  const B = sim.blocks('down-slow'), st = net.station('stockport').s, hc = net.station('heaton-chapel').s;
  const k = B.open.findIndex((o, i) => o && i >= 2 && B.open[i - 1] && B.open[i - 2] && B.at[i] > st);
  ok('signals: every signal stands at a block boundary on the tracks it faces', side.sigs.every(g => g.tracks.every(t => sim.blocks(t).at.some(b => Math.abs(b - g.spot[0]) < 0.5))), `${side.sigs.length} signals`);
  ok('signals: three open blocks in a row north of Stockport', k > 0);
  const [a, b] = sim.g.trains.filter(t => t.svc === 'stopper'), entry = B.at[k];
  Object.assign(a, { state: 'run', dir: 1, s: B.at[k + 1] - sim.half(a) - 2, v: 0, next: 1, bound: -1 });
  Object.assign(b, { state: 'run', dir: 1, s: entry - 1500, v: 20, next: 1, bound: -1, due: sim.g.t + 1e6 });
  sim.g.trouble.fail = { train: a.id, from: sim.g.t, until: sim.g.t + 1e6, a: 0, b: 1, d: 0 };
  for (let t = 0; t < 400; t++) sim.step(1);
  side.sync(false, 1, sim);
  // the signals facing trains towards Manchester: a site's low side, facing back down the line
  const at = s => side.sigs.findIndex(g => g.spot[2] === -1 && Math.abs(g.spot[0] - s) < 0.5), shows = side.showing();
  // the failed train's block, the one the train behind stands in, and the one before that
  const i = at(entry), held = at(B.at[k - 1]), before = at(B.at[k - 2]);
  ok('signals: red at the failed train\'s block and the held train\'s, yellow at the one before', shows[i] === 0 && shows[held] === 0 && shows[before] === 1, `${shows[i]}, ${shows[held]}, ${shows[before]}`);
  const up = side.sigs.map((g, j) => j).filter(j => side.sigs[j].spot[2] === -1 && side.sigs[j].spot[3] === net.spine.id && ![i, held, before].includes(j));
  ok('signals: green elsewhere on that line', up.every(j => shows[j] === 2), `${up.filter(j => shows[j] !== 2).length} not green`);
  const lamp = side.lamps, c = new THREE.Color();
  lamp?.getColorAt(i, c);
  ok('signals: the red lamp is the red token\'s colour', !!lamp && c.getHexString() === PAL['signal-red'].getHexString(), c.getHexString());
  const head = b.s + sim.half(b);
  ok('signals: the train behind stands at the red signal', b.v < 1 && Math.abs(entry - TUNING.signalStand - head) < 2, `${(entry - head).toFixed(1)} m short`);
  sim.g.trouble.fail = null; sim.goTo(a, a.s + 3000); sim.step(1); side.sync(false, 1, sim);
  ok('signals: once the failed train has gone on, its block\'s signal shows green', side.showing()[i] === 2, `${side.showing()[i]}`);
}
