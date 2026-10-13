// The line between stations on the map (docs/DESIGN.md, The line between stations), measured headless with the
// renderer's own section layer: a section the real line runs without wires (Romiley – Bredbury) has no masts until
// it's electrified; its card's stage ghosts them; once bought its masts stand outside its outer tracks only where the
// line had no wires, rising into place, and a contact wire runs over its tracks; a section that starts wired offers no
// wires. No browser.
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

export default async function ({ ok, root }) {
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'))), sim = new Sim(net, Sim.fresh(net, 1));
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
}
