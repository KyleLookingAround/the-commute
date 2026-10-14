// Car parks and bus links on the map (docs/DESIGN.md, Car parks and bus links). In a new game no car park shows a car
// and no town bus runs. A save played on to mid-morning with every station's car park and bus link built (the sim in
// Node first): each car park stands as full as the sim's (its drawn bays times the share of spaces taken), the town's
// buses pull in at Stockport Interchange and the stops, and the reach has its outer ring where they bring people from.
// The station panel shows By car and By bus. Screenshots of the Interchange, Stockport's and Levenshulme's car parks
// and the outer ring go to build/shots/access-*.png. One desktop page and one phone page (320 px, touch).
// Covers: @page @sim src/render/links.ts src/render/taxis.ts src/render/stations.ts src/data/kits/**
import { register } from 'tsx/esm/api';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ ok, open, root }) {
  register();
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim } = await import('../../src/sim/sim.ts');
  const { spaces, parked } = await import('../../src/sim/access.ts');
  const { simAtHour } = await import('../../src/sim/day.ts');
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'))), sim = new Sim(net, Sim.halt(net, 1));
  sim.g.cash = 1e7;
  sim.buyUpgrade(0, 'crossing'); sim.buyUpgrade(0, 'platform2'); sim.buyLine('units');
  for (let i = 1; i < sim.S.length; i++) sim.buyStation(i);
  for (let i = 0; i < sim.S.length; i++) for (const id of ['crossing', 'platform2', 'building', 'carpark', 'carpark2', 'bus']) sim.buyUpgrade(i, id);
  sim.advance(simAtHour(1, 10) - sim.g.t);   // 06:30 to 10:00 by the clock
  const want = sim.S.map((_, i) => spaces(sim, i) ? parked(sim.g.st[i]) / spaces(sim, i) : 0);
  const rich = JSON.stringify({ g: sim.g, selected: 0 });
  const shots = join(root, 'build/shots'); mkdirSync(shots, { recursive: true });
  const at = (id, u, v) => { const f = net.stationFrame(id); return [f.x + f.dx * u + f.nx * v, f.z + f.dz * u + f.nz * v]; };

  const fresh = await open({ width: 1280, height: 800 });
  await fresh.page.waitForTimeout(800);
  const a0 = await fresh.page.evaluate(() => window.__view?.access?.());
  ok('access: in a new game no car park shows a car and no town bus runs', a0 && a0.cars.every(n => n === 0) && a0.buses === 0 && !fresh.errs.length, JSON.stringify(a0) + (fresh.errs[0] ?? ''));
  await fresh.ctx.close();

  for (const [w, h, touch, tag] of [[1280, 800, false, 'desktop'], [320, 568, true, 'phone']]) {
    const { ctx, page: p, errs } = await open({ width: w, height: h }, { touch, save: rich });
    const views = [['interchange', at('stockport', 370, 70), 260, 0.75], ['stockport-park', at('stockport', -68, 150), 200, 0.8], ['levenshulme', at('levenshulme', -50, 50), 200, 0.8], ['ring', at('stockport', 0, 0), 16000, 0.3]];
    await ctx.addInitScript(([x, z]) => { window.__orbit = { tx: x, ty: 0, tz: z, r: 260, th: 2.2, ph: 0.75 }; window.__lockHour = 10; }, views[0][1]);
    await p.reload(); await p.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const a = await p.evaluate(() => ({ ...window.__view.access(), outer: window.__view.reach().outer, panel: ['pCar', 'pBus'].map(id => document.getElementById(id)?.textContent ?? null) }));
    const cap = await p.evaluate(() => window.__view.access().cars);
    const bad = [
      ...want.map((f, i) => f > 0.5 && !(cap[i] > 0) ? `${sim.S[i].name}'s car park is ${Math.round(f * 100)}% full but draws no cars` : null),
      a.cars.some((n, i) => n > 0 && !want[i]) && 'cars drawn where the sim parks none',
      !(a.buses > 0) && 'no town buses at the links',
      !(a.outer?.[0] > 1000) && `Stockport's outer ring is ${a.outer?.[0]}`,
      a.panel.some(t => t === null || !/^\d[\d,]*$/.test(t)) && `the panel's By car and By bus: ${a.panel}`,
      errs[0]].filter(Boolean);
    ok(`access: at ${w}×${h} the car parks stand as full as the sim's, buses come and go at the links, the reach has its outer ring, and the panel counts By car and By bus`, !bad.length, bad.join('; ') + ` ${JSON.stringify(a)}`);
    for (const [name, [x, z], r, ph] of views) {
      await p.evaluate(([x, z, r, ph]) => window.__view.look?.({ tx: x, ty: 0, tz: z, r, th: 2.2, ph }), [x, z, r, ph]);
      if (!(await p.evaluate(() => !!window.__view.look))) break;
      await p.waitForTimeout(900);
      await p.screenshot({ path: join(shots, `access-${name}-${tag}.png`) });
    }
    await ctx.close();
  }
}
