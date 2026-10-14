// The line between stations on the map (docs/DESIGN.md, The line between stations), measured headless with the
// renderer's own section layer: a section the real line runs without wires (Romiley – Bredbury) has no masts until
// it's electrified; its card's stage ghosts them; once bought its masts stand outside its outer tracks only where the
// line had no wires, rising into place, and a contact wire runs over its tracks; a section that starts wired offers no
// wires. A flying junction (Ardwick's) ghosts on its card and, once bought, stands as a flyover climbing over the
// tracks there on piers. Strain reads a section where a train stands behind a failed one as slow (minutes lost
// against its line speed this hour) and a junction where trains stand held, each with its line on the card. No browser.
// Covers: @sim src/render/sections.ts src/render/lineside.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

register();
// the line-speed boards paint their numbers on a canvas (here one that paints nothing); the layer looks at the sim on
// a timer and rises its masts frame by frame (here a frame that never comes, so they stay part way up)
globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
globalThis.requestAnimationFrame ??= () => 0;
const THREE = await import('three');
const { fromGeo } = await import('../../src/sim/network.ts');
const { Sim } = await import('../../src/sim/sim.ts');
const { SectionLayer } = await import('../../src/render/sections.ts');
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const { StrainRead } = await import('../../src/ui/strain.ts');

export default async function ({ ok, root }) {
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'))), sim = new Sim(net, Sim.halt(net, 1));
  sim.g.cash = 1e7;
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const scene = new THREE.Scene(), L = new SectionLayer(scene, net, () => sim, new THREE.PerspectiveCamera(), canvas);
  L.stop();
  const id = sim.P.all.find(p => p.kind === 'section' && p.name === 'Romiley – Bredbury').id, x = sim.secs.find(q => q.id === id);
  const hc = sim.P.all.find(p => p.kind === 'section' && p.name === 'Heaton Chapel – Levenshulme').id;
  ok('sections: a section the real line runs without wires starts diesel, one under wires offers none', !sim.sectionAt(id).wired && sim.sectionAt(hc).wired && sim.sectionAt(hc).wiresPrice === undefined);
  ok('sections: no masts on it before it\'s electrified', L.wired() === 0);
  const box = L.previewWires(id);
  ok('sections: its card\'s stage ghosts its masts and frames them', !!box && !box.isEmpty());
  L.previewWires(null);
  for (const st of ['romiley', 'bredbury']) sim.grant(sim.P.station[net.station(st).index]);
  ok('sections: bought once its stations are owned', sim.buy(id, 'wires') && sim.sectionAt(id).wiresBought);
  L.previewWires(null);
  const group = scene.getObjectByName('sections').children.find(g => g.visible !== false && g.children.some(m => m.isInstancedMesh) && g.scale.y < 1);
  const poles = group?.children.find(m => m.isInstancedMesh && m.geometry.type === 'CylinderGeometry'), wire = group?.children.find(m => m.isLineSegments);
  ok('sections: its masts stand and rise into place, with a contact wire over its tracks', L.wired() === 1 && poles?.count > 2 * Math.floor((x.s1 - x.s0) / 55) - 4 && wire?.geometry.getAttribute('position').count > 0, `${poles?.count} masts`);
  // every mast beside the section and off the line that already had wires
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), line = net.lineOf(x.corridor);
  let off = 0;
  for (let i = 0; i < (poles?.count ?? 0); i++) { poles.getMatrixAt(i, m4); p.setFromMatrixPosition(m4); const at = line.nearest(p.x, p.z); if (at < x.s0 - 1 || at > x.s1 + 1 || net.wired(x.corridor, at)) off++; }
  ok('sections: only along the section, where the line had no wires', poles?.count > 0 && off === 0, `${off} astray`);
  // a flying junction: ghosted, then bought (granted: no game holds trains long enough there to offer it yet)
  const fb = L.previewFlyover('junction:ardwick');
  ok('sections: a flying junction\'s card ghosts its flyover and frames it', !!fb && !fb.isEmpty() && fb.max.y > 7);
  L.previewFlyover(null);
  sim.grant('junction:ardwick', 'flyover'); L.previewFlyover(null);
  const j = net.junctions.find(q => q.id === 'ardwick'), fly = L.flyoverBox('junction:ardwick');
  ok('sections: once bought it stands over the tracks at the junction, rising into place', L.flyovers() === 1 && !!fly && fly.min.x <= j.x && fly.max.x >= j.x && fly.min.z <= j.z && fly.max.z >= j.z, JSON.stringify(fly));

  // Strain: a train failed between Heaton Chapel and Levenshulme, the next one held behind it
  const s2 = new Sim(net, Sim.halt(net, 1)); s2.g.cash = 1e7; s2.g.trouble.next = s2.g.t + 1e9;
  for (const st of ['heaton-chapel', 'levenshulme']) s2.grant(s2.P.station[net.station(st).index]);
  s2.grant(s2.P.stopper, 'units'); s2.ensureTrains(); s2.step(1);
  const read = new StrainRead(s2), hl = s2.P.all.find(p => p.kind === 'section' && p.name === 'Heaton Chapel – Levenshulme').id, hx = s2.secs.find(q => q.id === hl);
  const [a, b] = s2.g.trains.filter(t => t.svc === 'stopper'), mid = (hx.s0 + hx.s1) / 2;
  Object.assign(a, { state: 'run', dir: 1, s: mid + 300, v: 0, next: net.station('levenshulme').index, bound: -1, pfAt: net.station('heaton-chapel').index });
  Object.assign(b, { state: 'run', dir: 1, s: hx.s0 + 200, v: 15, next: net.station('levenshulme').index, bound: -1, pfAt: net.station('heaton-chapel').index, due: s2.g.t + 1e6 });
  s2.g.trouble.fail = { train: a.id, from: s2.g.t, until: s2.g.t + 1e6, a: 0, b: 1, d: 0 };
  for (let t = 0; t < 300; t++) { s2.step(1); if (t % 5 === 0) read.tick(s2); }
  ok('sections: Strain reads the section a train stands held in as slow, with its line on the card', read.slowOn(hl) >= 1 && /lost \d+ min/.test(read.line(hl) ?? ''), `${read.line(hl)}`);
  for (const st of ['ardwick', 'piccadilly']) s2.grant(s2.P.station[net.station(st).index]);
  s2.g.held['ardwick'] = (s2.g.held['ardwick'] ?? 0) + 90; read.tick(s2);
  ok('sections: and a junction where trains stood held', read.heldAt('junction:ardwick') >= 1.4 && /held 2 min/.test(read.line('junction:ardwick') ?? ''), `${read.line('junction:ardwick')}`);
}
