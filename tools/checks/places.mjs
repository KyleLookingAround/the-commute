// One card for every place (docs/design/buying.md, One card for every place), on a 320 px phone (touch). From a save
// with Stockport (subway, booking hall, Stockport Interchange), Heaton Chapel and Levenshulme owned: each kind's card
// opens the way a player gets to it (a station from its chip, an unowned station from its chip, the stopper and
// the sidings from theirs, Stockport Interchange from its Built chip on Stockport's card, the Network card from the
// cash pill), names the place and its kind in the header, fits the screen with nothing scrolling sideways and every
// tap target 44 px, and lists only stages that can be built now: a station's cards are the sim's visible ones; the
// stopper offers no extra unit before platform 3 and the sidings no spare before a train has failed; the Network card
// offers no renewal before Piccadilly. No errors.
import { reveal } from '../reveal.mjs';
import { register } from 'tsx/esm/api';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ ok, open, root }) {
  register();
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim } = await import('../../src/sim/sim.ts');
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def), sim = new Sim(net, Sim.fresh(net, 2));
  sim.g.cash = 1e6;
  for (const id of ['crossing', 'building', 'bus']) sim.buyUpgrade(0, id);
  for (const id of ['heaton-chapel', 'levenshulme']) sim.buyStation(net.station(id).index);
  sim.advance(600); sim.g.cash = 4000;
  const save = JSON.stringify({ g: sim.g, selected: 0 });
  const visible = i => sim.visibleUpgrades(i).filter(u => !sim.ups(i)[u.id]).map(u => u.id).sort().join(',');
  const ardwick = net.station('ardwick').index;
  const CARDS = [
    ["Stockport's", '#strip .card:nth-child(1)', 'station:stockport', /^(Halt|Station) · /, visible(0)],
    ["Levenshulme's", `#strip .card:nth-child(${net.station('levenshulme').index + 1})`, 'station:levenshulme', /^(Halt|Station) · /, visible(net.station('levenshulme').index)],
    ["Ardwick's (not owned)", `#strip .card:nth-child(${ardwick + 1})`, 'station:ardwick', /£/, null],
    ["the stopper's", '#strip [data-place="route:stopper"]', 'route:stopper', /^Train service · 1 unit$/, 'cars,timetable'],
    ["the sidings'", '#strip [data-place="depot:stockport-sidings"]', 'depot:stockport-sidings', /^Depot · /, sim.g.trouble.fails ? 'spare' : ''],
    ["Stockport Interchange's", ['#strip .card:nth-child(1)', '[data-built="bus"]'], 'stop:stockport-interchange', /^Bus station · /, ''],
    ['the Network', '#cash', 'network', /^Network · 3 stations$/, ''],
  ];
  const { ctx, page, errs } = await open({ width: 320, height: 568 }, { touch: true, save });
  const tap = async sel => {
    sel = await reveal(page, sel);
    const r = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
    if (r) await page.touchscreen.tap(r[0], r[1]);
    return !!r;
  };
  for (const [name, how, id, sub, stages] of CARDS) {
    let reached = true;
    for (const sel of [how].flat()) reached = await tap(sel) && reached;
    await page.waitForSelector(`#panel[data-place="${id}"]`, { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(re => new RegExp(re).test(document.getElementById('shSub')?.textContent ?? ''), sub.source, { timeout: 15000 }).catch(() => {});
    // raised to show the card, as a player reads it
    await reveal(page, '#panel');
    const m = await page.evaluate(() => {
      const panel = document.getElementById('panel'), de = document.documentElement;
      const small = [...panel.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 20), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => w < 44 || h < 44);
      return { at: panel.dataset.place, name: document.getElementById('shName')?.textContent, sub: document.getElementById('shSub')?.textContent, wide: panel.scrollWidth > panel.clientWidth + 1 || de.scrollWidth > de.clientWidth,
        small, cards: [...panel.querySelectorAll('[data-card]')].map(c => c.dataset.card).sort().join(','), renew: !!document.getElementById('renew') };
    });
    const bad = [!reached && 'could not reach it', m.at !== id && `the card open is ${m.at}`, !m.name && 'no name', !sub.test(m.sub || '') && `the header reads "${m.sub}"`, m.wide && 'it scrolls sideways',
      m.small.length && `small targets: ${m.small.map(s => `${s[0]} ${s[1]}×${s[2]}`).join(', ')}`, stages !== null && m.cards !== stages && `stages ${m.cards || 'none'}, not ${stages || 'none'}`, m.renew && 'offers renewal', errs[0]].filter(Boolean);
    ok(`places: at 320×568 ${name} card opens, fits, and shows only what can be built now`, !bad.length, bad.join('; ') || `${m.name} · ${m.sub}`);
  }
  await ctx.close();
}
