// The stages that keep going (step 18, docs/DESIGN.md, Stages that keep going) drawn into every station's kit, from
// the kit's own parts, so each tier shows on the map wherever it's bought:
//   long        8-car platforms: each platform extension carried on 20 m beyond its far end, with its lamps
//   canopyFull  canopies the full length: each canopy carried to within 4 m of both ends of its platform as extended
//   travel      a travel centre: a large unit by the kiosk
//   shops       a row of shops: two small units beyond the bakery
//   cyclehub    a cycle hub: a stand of twelve by the cycle racks (or the car park, or the kiosk where there are none)
// Placed by rule from the kit, not surveyed: each generated part carries "tier": true, and running this again replaces
// them. Plain Node, writes src/data/kits/*.json:  node tools/tiers.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src/data/kits');
const gates = p => p.upgrade === undefined ? [] : [p.upgrade].flat();
const gate = (...ids) => ids.length === 1 ? ids[0] : ids;
const same = (a, b) => Math.abs(a.v0 - b.v0) < 0.5 && Math.abs(a.v1 - b.v1) < 0.5;

for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const path = join(dir, f), kit = JSON.parse(readFileSync(path, 'utf8'));
  const parts = kit.parts.filter(p => !p.tier), add = p => out.push({ ...p, tier: true }), out = [];
  const platforms = parts.filter(p => p.type === 'platform');
  // 8-car platforms: past each extension's far end (the end further from the station's middle)
  for (const p of platforms.filter(p => gates(p).includes('extend'))) {
    const others = gates(p).filter(g => g !== 'extend'), far = (p.u0 + p.u1) / 2 > 0, u0 = far ? p.u1 : p.u0 - 20, u1 = far ? p.u1 + 20 : p.u0;
    add({ type: 'platform', u0, u1, v0: p.v0, v1: p.v1, ...(p.y !== undefined ? { y: p.y } : {}), ...(p.mat ? { mat: p.mat } : {}), upgrade: gate('long', ...others) });
    add({ type: 'lamps', u0: u0 + 3, u1: u1 - 3, v: (p.v0 + p.v1) / 2, every: 15, ...(p.y !== undefined ? { y: p.y } : {}), upgrade: gate('long', ...others) });
  }
  // canopies the full length of their platform as extended
  for (const c of parts.filter(p => p.type === 'canopy' && gates(p).includes('canopy'))) {
    const under = platforms.filter(p => same(p, c) && gates(p).every(g => ['platform2', 'extend'].includes(g)));
    if (!under.length) continue;
    const lo = Math.min(...under.map(p => p.u0)) + 4, hi = Math.max(...under.map(p => p.u1)) - 4, others = gates(c).filter(g => g !== 'canopy');
    for (const [u0, u1] of [[lo, c.u0], [c.u1, hi]]) if (u1 - u0 >= 8) add({ ...c, u0, u1, upgrade: gate('canopyFull', ...others) });
  }
  // a travel centre by the kiosk, and a row of shops beyond the bakery
  const kiosk = parts.find(p => p.type === 'retail' && gates(p).includes('kiosk')), bakery = parts.find(p => p.type === 'retail' && gates(p).includes('retail'));
  const toward = p => (p.u > 0 ? -1 : 1);
  if (kiosk) add({ type: 'retail', u: kiosk.u + toward(kiosk) * 9, v: kiosk.v, ...(kiosk.y !== undefined ? { y: kiosk.y } : {}), label: 'Travel centre', upgrade: 'travel' });
  if (bakery) for (const [k, label] of [[1, 'Coffee'], [2, 'News']]) add({ type: 'retail', u: bakery.u - toward(bakery) * 4.5 * k, v: bakery.v, ...(bakery.y !== undefined ? { y: bakery.y } : {}), label, small: true, upgrade: 'shops' });
  // a cycle hub by the racks, else by the car park, else on the platform by the kiosk
  const racks = parts.find(p => p.type === 'cycles'), park = parts.find(p => p.type === 'carpark');
  if (racks) add({ ...racks, u: racks.u + (racks.u > 0 ? -8 : 8), n: 12, upgrade: 'cyclehub' });
  else if (park) add({ type: 'cycles', u: park.u0 - 6, v: (park.v0 + park.v1) / 2, n: 12, street: true, upgrade: 'cyclehub' });
  else if (kiosk) add({ type: 'cycles', u: kiosk.u - toward(kiosk) * 9, v: kiosk.v, n: 12, ...(kiosk.y !== undefined ? { y: kiosk.y } : {}), upgrade: 'cyclehub' });
  // written as the kits are, a part a line: the lines generated before taken out, the new ones in before the parts' end
  const text = readFileSync(path, 'utf8').split('\n').filter(l => !l.includes('"tier": true'));
  const end = text.lastIndexOf('  ]'), line = p => '    ' + JSON.stringify(p).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/^\{/, '{ ').replace(/\}$/, ' }');
  if (out.length && !text[end - 1].endsWith(',')) text[end - 1] += ',';
  text.splice(end, 0, ...out.map((p, k) => line(p) + (k < out.length - 1 ? ',' : '')));
  writeFileSync(path, text.join('\n'));
  console.log(`${kit.id}: ${out.length} tier parts`);
}
