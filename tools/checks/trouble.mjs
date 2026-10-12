// Things going wrong show on the map. A save from seed 1 caught just after a train failed and the replacement buses
// began, with a signal failure added: the failed unit flashes its hazard lights, the stretch at caution has its lamp
// posts, a bus stands or runs between the stations either side (window.__view.trouble counts what's drawn), and the page
// has no errors; a screenshot of the bus goes to build/shots/trouble-bus.png. Then the same save with the line clear
// and the spare unit bought: it stands in Stockport's sidings. One phone page (390 px, touch) and one desktop page.
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
