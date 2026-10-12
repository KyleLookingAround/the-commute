// Things going wrong show on the map. A save from seed 1 caught just after a train failed and the replacement buses
// began, with a signal failure added: the failed unit flashes its hazard lights, the stretch at caution has its lamp
// posts, a bus stands or runs between the stations either side (window.__view.trouble counts what's drawn), and the page
// has no errors; a screenshot of the bus goes to build/shots/trouble-bus.png. Then the same save with the line clear
// and the spare unit bought: it stands in Stockport's sidings. With no browser, the departure boards on the failing
// save: Bus replacement from the station behind it, Cancelled for the failed unit, and calling points in order. One
// phone page (390 px, touch) and one desktop page.
import { register } from 'tsx/esm/api';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ ok, open, root }) {
  register();
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim, TUNING } = await import('../../src/sim/sim.ts');
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'))), sim = new Sim(net, Sim.fresh(net, 1));
  sim.g.cash = 1e6;
  for (const id of ['crossing', 'platform2', 'building', 'platforms']) sim.buyUpgrade(0, id);
  sim.buyStation(1); sim.buyStation(2); sim.buyLine('units');
  for (let k = 0; k < 40 * 360 && !sim.g.trouble.fail; k++) sim.advance(10);
  const f = sim.g.trouble.fail;
  if (!f) { ok('trouble: a train fails on seed 1', false, 'none in 40 sim hours'); return; }
  sim.advance(TUNING.busAfter + 20);
  // the boards, on a line where every station so far is open both ways: from the station behind the failure its way,
  // Bus replacement; the failed unit's own trains Cancelled; and every departure lists where it calls, in order along
  // its way, ending at its destination; no express on a board where it doesn't call
  {
    const { departures } = await import('../../src/render/life.ts');
    const b = new Sim(net, Sim.fresh(net, 2)); b.g.cash = 1e6;
    for (const id of ['crossing', 'platform2', 'building', 'platforms']) b.buyUpgrade(0, id);
    for (const i of [1, 2]) { b.buyStation(i); b.buyUpgrade(i, 'crossing'); b.buyUpgrade(i, 'platform2'); }
    b.buyLine('units');
    for (let k = 0; k < 40 * 360 && !b.g.trouble.fail; k++) b.advance(10);
    const bf = b.g.trouble.fail; b.advance(TUNING.busAfter + 20);
    const deps = departures(b, bf.a, []), mine = deps.filter(d => d.train === bf.train && d.t < bf.until), way = deps.filter(d => d.d === bf.d && d.train !== bf.train && d.t < bf.until);
    const all = net.stations.map((_, i) => departures(b, i, []));
    const ordered = all.flat().every(d => d.via.every((j, k) => k === 0 || (net.stations[j].s - net.stations[d.via[k - 1]].s) * (d.d === 0 ? 1 : -1) > 0));
    const calls = all[0].some(d => d.d === 0 && d.via.length > 0), expresses = all[1].filter(d => b.svc(b.g.trains.find(t => t.id === d.train).svc).express).length;
    ok('trouble: the boards say Bus replacement from the station behind a failed train, Cancelled for its own trains, and list each train\'s calling points in order',
      way.length > 0 && way.every(d => d.note === 'Bus replacement') && mine.every(d => d.note === 'Cancelled') && ordered && calls && !expresses,
      JSON.stringify({ fail: bf && [bf.a, bf.b, bf.d], way: way.map(d => d.note), mine: mine.map(d => d.note), ordered, calls, expresses }));
  }
  const c = net.stations[1].s, d = net.stations[2].s;
  sim.g.trouble.caution = { s0: c + 300, s1: d - 300, from: sim.g.t, until: sim.g.t + 3600 };
  const save = g => JSON.stringify({ g, selected: f.a });
  const failing = JSON.parse(JSON.stringify(sim.g));
  const clear = JSON.parse(JSON.stringify(sim.g)); clear.trouble.fail = null; clear.trouble.caution = null; clear.trouble.buses = []; clear.trouble.next = clear.t + 1e6; clear.line.spare = 1;
  mkdirSync(join(root, 'build/shots'), { recursive: true });
  for (const [w, h, touch] of [[390, 844, true], [1280, 800, false]]) {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch, save: save(failing) });
    await page.waitForTimeout(400);
    let most = { hazards: 0, cautions: 0, buses: 0, spare: false };
    for (let k = 0; k < 8; k++) {
      const t = await page.evaluate(() => window.__view?.trouble?.() ?? null);
      if (t) most = { hazards: Math.max(most.hazards, t.hazards), cautions: Math.max(most.cautions, t.cautions), buses: Math.max(most.buses, t.buses), spare: most.spare || t.spare };
      await page.waitForTimeout(160);
    }
    const bad = [most.hazards < 4 && 'no hazard lights on the failed unit', most.cautions < 4 && 'no caution lamps', most.buses < 1 && 'no bus', most.spare && 'a spare unit nobody bought', errs[0]].filter(Boolean);
    ok(`trouble: at ${w}×${h} a failed train flashes its hazards, a signal failure has its caution lamps, and a replacement bus runs`, !bad.length, bad.join('; ') || JSON.stringify(most));
    if (!touch) await page.screenshot({ path: join(root, 'build/shots/trouble-bus.png') });
    await ctx.close();
    const p2 = await open({ width: w, height: h }, { touch, save: save(clear) });
    await p2.page.waitForTimeout(400);
    const t2 = await p2.page.evaluate(() => window.__view?.trouble?.() ?? null);
    const bad2 = [!t2?.spare && 'no spare unit in the sidings', t2?.buses && 'buses with the line clear', t2?.cautions && 'caution lamps with the line clear', p2.errs[0]].filter(Boolean);
    ok(`trouble: at ${w}×${h} with the line clear the spare unit stands in Stockport's sidings, and nothing else is wrong`, !bad2.length, bad2.join('; '));
    await p2.ctx.close();
  }
}
