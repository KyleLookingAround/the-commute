// Contract renewal. On a 320 px phone (touch) and a desktop page: a new game's Network card (the cash pill) offers no
// renewal; a save with Piccadilly owned offers "Renew the contract" with the reputation it would bank (as the sim reckons it), and its
// sheet fits the page with tap-sized buttons, shows the next perk in each branch but none beyond it, and buys perks
// with the reputation to spend. Beginning the next contract keeps the career on the device, folds what was bought back
// down on the map, and starts the run again from the start, Stockport shut, with the perks in effect: the starting cash,
// a discounted price for reopening Stockport on the strip, the unit stabled in the sidings, and the plaque by Stockport's entrance with a line
// for the contract renewed. Start over then offers the career too, and its default (tap again) starts only the run
// again: the career, the perks and the plaque stay. No errors. A screenshot of the plaque goes to build/shots/plaque.png.
// Covers: @page @sim src/render/stations.ts src/render/trains.ts
import { reveal } from '../reveal.mjs';
import { register } from 'tsx/esm/api';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ ok, open, root }) {
  register();
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim } = await import('../../src/sim/sim.ts');
  const { reputation } = await import('../../src/sim/contract.ts');
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def), sim = new Sim(net, Sim.halt(net, 3));
  sim.g.cash = 1e7;
  for (const id of ['crossing', 'platform2', 'building']) sim.buyUpgrade(0, id);
  for (const id of ['heaton-chapel', 'levenshulme', 'ardwick', 'piccadilly']) sim.buyStation(net.station(id).index);
  sim.buyUpgrade(1, 'crossing'); sim.advance(1800);
  sim.g.stats.boarded += 9000; sim.g.cash = 5000;
  const rep = reputation(sim.g), save = JSON.stringify({ g: sim.g, selected: 0 });
  const perk = id => def.contract.perks.find(p => p.id === id);
  mkdirSync(join(root, 'build/shots'), { recursive: true });
  // one size at a time: side by side, the panels' scrolling waits outran their time on a software-rendered page
  for (const [w, h, touch] of [[320, 640, true], [1280, 800, false]]) {
    const tap = async (page, sel) => { sel = await reveal(page, sel); return touch ? page.locator(sel).tap({ timeout: 60000 }) : page.locator(sel).click({ timeout: 60000 }); };
    const look = page => page.evaluate(() => window.__view?.contract?.() ?? null);
    // a new game: nothing to renew
    {
      const { ctx, page, errs } = await open({ width: w, height: h }, { touch });
      await tap(page, '#cash'); await page.waitForSelector('#panel[data-place="network"]', { timeout: 30000 }).catch(() => {});
      const hidden = await page.evaluate(() => !document.getElementById('renew') && !document.getElementById('contract')?.open);
      const c = await look(page);
      ok(`contract: at ${w}×${h} a new game offers no renewal, and no plaque stands`, hidden && c?.plaque === -1 && !c?.stabled && !errs.length, errs[0] ?? JSON.stringify(c));
      await ctx.close();
    }
    // a steady frame clock, so the second-long fold takes the same frames however slow the machine
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch, save, steady: 50 });
    // offered on the Network card, with the reputation it would bank
    await tap(page, '#cash');
    await page.waitForSelector('#renew', { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => /\d/.test(document.getElementById('lRep')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});
    const shown = Number(await page.locator('#lRep').textContent().catch(() => 'NaN'));
    ok(`contract: at ${w}×${h} owning Piccadilly offers "Renew the contract" with the reputation it would bank`, shown >= rep && shown < rep + 20, `★ ${shown} (the save's ${rep})`);
    await tap(page, '#renew');
    await page.waitForFunction(() => document.getElementById('contract')?.open, null, { timeout: 30000 }).catch(() => {});
    const sheet = await page.evaluate(() => {
      const d = document.getElementById('contract'), r = d.getBoundingClientRect();
      const small = [...d.querySelectorAll('button')].filter(b => { const q = b.getBoundingClientRect(); return q.width < 44 || q.height < 44; }).map(b => b.textContent);
      return { open: d.open, fits: r.left >= 0 && r.right <= innerWidth + 0.5, small, perks: [...d.querySelectorAll('[data-perk]')].map(b => b.dataset.perk) };
    });
    ok(`contract: at ${w}×${h} the sheet opens, fits, and its buttons are tap-sized`, sheet.open && sheet.fits && !sheet.small.length, JSON.stringify(sheet));
    ok(`contract: at ${w}×${h} the sheet shows the first perk of each branch and hides the rest`, ['capital1', 'works1', 'reach1', 'stock1'].every(p => sheet.perks.includes(p)) && sheet.perks.length === def.contract.branches.length, sheet.perks.join(', '));
    for (const id of ['works1', 'stock1', 'capital1']) await tap(page, `[data-perk="${id}"]`);
    const after = await page.evaluate(() => [...document.querySelectorAll('#contract [data-perk]')].map(b => b.dataset.perk));
    ok(`contract: at ${w}×${h} buying a perk shows the next in its branch`, after.includes('works2') && after.includes('stock2') && !after.includes('works1') && !after.includes('works3'), after.join(', '));
    await page.locator('#contract .con-begin').scrollIntoViewIfNeeded();
    await tap(page, '#contract .con-begin');
    // the map folds what was bought back down, and the next run starts from Stockport with the perks in effect
    let folded = 0;
    for (let k = 0; k < 40 && !folded; k++) { folded = await page.evaluate(() => window.__view?.folding?.() ?? 0); if (!folded) await page.waitForTimeout(50); }
    const c = await look(page), kept = await page.evaluate(() => JSON.parse(localStorage.getItem('the-commute-career-v1') || 'null'));
    const strip = await page.evaluate(() => Number((document.querySelector('[data-st="0"]')?.textContent ?? '').replace(/[^0-9]/g, '')));
    const reopen = Math.round(def.starts[0].prices['station:stockport'] * (1 - perk('works1').build) / 10) * 10;
    const bad = [
      !folded && 'nothing folded down',
      c?.owned !== 0 && `owns ${c?.owned} stations`,
      c?.cash !== def.starts[0].cash + perk('capital1').cash && `cash £${c?.cash}`,
      JSON.stringify(c?.run) !== JSON.stringify(['works1', 'stock1', 'capital1']) && `run perks ${c?.run}`,
      !c?.stabled && 'no unit stabled in the sidings',
      c?.plaque !== 1 && `the plaque reads ${c?.plaque} lines`,
      kept?.renewals !== 1 && 'the career was not kept',
      kept && kept.rep !== shown - perk('works1').price - perk('stock1').price - perk('capital1').price && kept.rep < 0 && `reputation left ${kept?.rep}`,
      strip !== reopen && `Reopen Stockport costs £${strip}, not £${reopen}`,
      await page.evaluate(() => !!document.getElementById('renew')) && 'still offers renewal',
    ].filter(Boolean);
    ok(`contract: at ${w}×${h} beginning the next contract folds the line back, keeps the career and starts from Stockport with the perks`, !bad.length, bad.join('; ') || JSON.stringify(c));
    if (!touch) {
      await page.waitForFunction(() => (window.__view?.folding?.() ?? 1) === 0 && window.__view.rising() === 0, null, { timeout: 30000 }).catch(() => {});
      const f = net.stationFrame('stockport'), u = 50, v = 117;
      await page.evaluate(o => window.__view.look(o), { tx: f.x + f.dx * u + f.nx * v, ty: 2, tz: f.z + f.dz * u + f.nz * v, r: 16, ph: 1.25, th: Math.atan2(f.nx, f.nz) });
      await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(600);
      await page.screenshot({ path: join(root, 'build/shots/plaque.png') });
    }
    // Start over: offers the career too; tapping again starts only the run again
    await reveal(page, '#reset');
    // both taps in the page: Start over stays armed three seconds, which an emulated tap on a slow page can outlast
    const offered = await page.evaluate(() => { document.getElementById('reset').click(); return !document.getElementById('resetAll').hidden; });
    await page.evaluate(() => document.getElementById('reset').click());
    await page.waitForTimeout(200);
    const c2 = await look(page), kept2 = await page.evaluate(() => JSON.parse(localStorage.getItem('the-commute-career-v1') || 'null'));
    ok(`contract: at ${w}×${h} Start over offers the career too, and by default starts only the run again`, offered && kept2?.renewals === 1 && c2?.plaque === 1 && c2?.cash === def.starts[0].cash + perk('capital1').cash && c2?.stabled, JSON.stringify({ offered, kept: kept2?.renewals, ...c2 }));
    ok(`contract: at ${w}×${h} no errors`, !errs.length, errs[0]);
    await ctx.close();
  }
}
