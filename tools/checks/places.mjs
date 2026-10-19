// One card for every place, and finding places (docs/design/buying.md, sections 3 and 7), on a 320 px phone (touch).
// From a save with Stockport (subway, booking hall, Stockport Interchange), Heaton Chapel and Levenshulme owned: the
// Places row lists what's owned or offered and nothing else (Ardwick and Davenport offered, Piccadilly not, no stop at a
// station not owned), in network order with Stockport first. Each kind's card opens the way a player gets to it (from
// its chip on the row; Stockport Interchange from Next to on Stockport's card; the Network card from the cash pill),
// names the place and its kind in the header, fits the screen with nothing scrolling sideways and every tap target
// 44 px, lists only stages that can be built now (a station's cards are the sim's visible ones, its bus stop no longer
// among them; the stopper offers no extra unit before platform 3 (but newer units) and the sidings no spare before a train has failed (but the shed); the
// Network card no renewal before Piccadilly), and has Next to chips for what touches it. The offered bus stop at
// Levenshulme opens with Buy, and Ardwick (Shut) with Reopen. The full list of places by kind is under each card. And a
// new game: Stockport alone on the row, Shut, with Reopen · £1,000, which leaves a halt and about £3,000. And tapping a road's traffic opens its card, the Network card leading with the cars off. No errors.
// Covers: @page @sim src/render/stations.ts src/render/traffic.ts
import { reveal } from '../reveal.mjs';
import { register } from 'tsx/esm/api';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ ok, open, root }) {
  register();
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim } = await import('../../src/sim/sim.ts');
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def), sim = new Sim(net, Sim.halt(net, 2));
  sim.g.cash = 1e6;
  for (const id of ['crossing', 'building', 'bus']) sim.buyUpgrade(0, id);
  for (const id of ['heaton-chapel', 'levenshulme']) sim.buyStation(net.station(id).index);
  sim.advance(600); sim.g.cash = 4000;
  const save = JSON.stringify({ g: sim.g, selected: 0 });
  const visible = i => sim.visibleUpgrades(i).filter(u => !sim.ups(i)[u.id] && !u.stop).map(u => u.id).sort().join(',');
  const CARDS = [
    ["Stockport's", '#strip [data-place="station:stockport"]', 'station:stockport', /^(Halt|Station) · /, visible(0), ['station:heaton-chapel', 'station:davenport', 'route:stopper', 'stop:stockport-interchange', 'depot:stockport-sidings', 'section:main:stockport:heaton-norris-junction']],
    ["Levenshulme's", '#strip [data-place="station:levenshulme"]', 'station:levenshulme', /^(Halt|Station) · /, visible(net.station('levenshulme').index), ['station:heaton-chapel', 'station:ardwick', 'route:stopper', 'stop:levenshulme-station-view', 'section:main:heaton-chapel:levenshulme']],
    ["Ardwick's (not owned)", '#strip [data-place="station:ardwick"]', 'station:ardwick', /^Shut · .*£/, null, ['station:levenshulme', 'route:stopper']],
    ["Levenshulme's bus stop (not owned)", '#strip [data-place="stop:levenshulme-station-view"]', 'stop:levenshulme-station-view', /^Bus stop · £/, null, ['station:levenshulme']],
    ["the stopper's", '#strip [data-place="route:stopper"]', 'route:stopper', /^Train service · 1 unit$/, 'cars,stock', ['station:stockport', 'station:heaton-chapel', 'station:levenshulme', 'station:ardwick']],
    ["the sidings'", '#strip [data-place="depot:stockport-sidings"]', 'depot:stockport-sidings', /^Depot · /, sim.g.trouble.fails ? 'spare,maint' : 'maint', ['station:stockport']],
    ["Stockport Interchange's", ['#strip [data-place="station:stockport"]', '[data-next="stop:stockport-interchange"]'], 'stop:stockport-interchange', /^Bus station · /, 'feeder', ['station:stockport']],
    ['the Network', '#cash', 'network', /^Network · 3 stations$/, 'bee', []],
  ];
  const { ctx, page, errs } = await open({ width: 320, height: 568 }, { touch: true, save });
  const tap = async sel => {
    sel = await reveal(page, sel);
    const r = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
    if (r) await page.touchscreen.tap(r[0], r[1]);
    return !!r;
  };
  // the row: what's owned or offered, in network order, and nothing else
  const row = await page.evaluate(() => [...document.querySelectorAll('#strip [data-place]')].map(b => b.dataset.place));
  const want = ['station:stockport', 'stop:stockport-interchange', 'depot:stockport-sidings', 'bus:192', 'station:heaton-chapel', 'station:levenshulme', 'stop:levenshulme-station-view', 'station:ardwick', 'route:stopper', 'station:davenport'];
  const badRow = [row[0] !== 'station:stockport' && `starts with ${row[0]}`, ...want.filter(k => !row.includes(k)).map(k => `no ${k}`), ...row.filter(k => !want.includes(k)).map(k => `${k} listed`),
    row.indexOf('station:levenshulme') < row.indexOf('station:heaton-chapel') && 'Levenshulme before Heaton Chapel'].filter(Boolean);
  ok('places: at 320×568 the Places row lists what is owned or offered, in network order, and nothing locked', !badRow.length, badRow.join('; ') || row.join(', '));
  for (const [name, how, id, sub, stages, next] of CARDS) {
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
        small, cards: [...panel.querySelectorAll('[data-card]')].map(c => c.dataset.card).sort().join(','), renew: !!document.getElementById('renew'),
        next: [...panel.querySelectorAll('[data-next]')].map(c => c.dataset.next).sort().join(','), buy: document.getElementById('buyPlace')?.textContent ?? '',
        list: [...panel.querySelectorAll('.plist h3')].map(h => h.textContent).join(',') };
    });
    const bad = [!reached && 'could not reach it', m.at !== id && `the card open is ${m.at}`, !m.name && 'no name', !sub.test(m.sub || '') && `the header reads "${m.sub}"`, m.wide && 'it scrolls sideways',
      m.small.length && `small targets: ${m.small.map(s => `${s[0]} ${s[1]}×${s[2]}`).join(', ')}`, stages !== null && m.cards !== stages && `stages ${m.cards || 'none'}, not ${stages || 'none'}`, m.renew && 'offers renewal',
      m.next !== [...next].sort().join(',') && `next to ${m.next || 'nothing'}, not ${[...next].sort().join(',') || 'nothing'}`, id.startsWith('stop:levenshulme') && !/^Buy · £/.test(m.buy) && `its button reads "${m.buy}"`,
      id === 'station:ardwick' && !/^Reopen · £/.test(m.buy) && `its button reads "${m.buy}"`,
      !/^Stations,Bus stops,Train services,Depots$/.test(m.list) && `the full list's heads are "${m.list}"`, errs[0]].filter(Boolean);
    ok(`places: at 320×568 ${name} card opens, fits, shows only what can be built now, and what's next to it`, !bad.length, bad.join('; ') || `${m.name} · ${m.sub}`);
  }
  await ctx.close();

  // a new game (docs/design/gridlock.md, sections 1 and 4): the row lists Stockport alone, its card is Shut with one
  // button, Reopen · £1,000, and tapping it reopens Stockport as a halt with £3,000 left
  {
    const { ctx, page, errs } = await open({ width: 320, height: 568 }, { touch: true });
    const tap = async sel => { sel = await reveal(page, sel); const r = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel); if (r) await page.touchscreen.tap(r[0], r[1]); return !!r; };
    await page.waitForSelector('#panel[data-place="station:stockport"]', { timeout: 30000 }).catch(() => {});
    const look = () => page.evaluate(() => ({ row: [...document.querySelectorAll('#strip [data-place]')].map(b => b.dataset.place).join(','), sub: document.getElementById('shSub')?.textContent ?? '',
      buy: document.getElementById('buyPlace')?.textContent ?? '', cash: document.getElementById('cash')?.textContent ?? '' }));
    const a = await look();
    const tapped = await tap('#buyPlace');
    await page.waitForFunction(() => /^Halt/.test(document.getElementById('shSub')?.textContent ?? ''), null, { timeout: 30000 }).catch(() => {});
    const b = await look();
    const bad = [a.row !== 'station:stockport' && `the row lists ${a.row}`, !/^Shut · /.test(a.sub) && `the header reads "${a.sub}"`, a.buy !== 'Reopen · £1,000' && `its button reads "${a.buy}"`,
      !tapped && 'no button to tap', !/^Halt · /.test(b.sub) && `after Reopen the header reads "${b.sub}"`, !(+b.cash.replace(/[^\d]/g, '') >= 3000 && +b.cash.replace(/[^\d]/g, '') < 4000) && `after Reopen the cash reads "${b.cash}"`, errs[0]].filter(Boolean);
    ok('places: at 320×568 a new game offers only Reopen Stockport at £1,000, and reopening it leaves a halt and about £3,000', !bad.length, bad.join('; ') || `${a.sub} → ${b.sub}, ${b.cash}`);
    await ctx.close();
  }

  // a road (docs/design/gridlock.md, The road card): tap the traffic on Wellington Road over Mersey Square and its card
  // opens with its four figures and the drive now against clear; the Network card leads with the cars off the roads
  {
    const { ctx, page, errs } = await open({ width: 320, height: 568 }, { touch: true });
    await page.waitForFunction(() => (window.__view.traffic?.()?.laid?.length ?? 0) > 0, null, { timeout: 120000 }).catch(() => {});
    const pt = await page.evaluate(() => window.__view.roadPoint?.('a6-mersey-square') ?? null);
    if (pt) await page.touchscreen.tap(pt[0], pt[1]);
    await page.waitForFunction(() => document.getElementById('panel')?.dataset.place === 'road:a6-mersey-square', null, { timeout: 15000 }).catch(() => {});
    const card = await page.evaluate(() => ({ name: document.getElementById('shName')?.textContent ?? '', sub: document.getElementById('shSub')?.textContent ?? '',
      figs: ['oCars', 'oLoad', 'oSpeed', 'oQueue', 'oDrive', 'oFree'].map(k => document.getElementById(k)?.textContent ?? ''), wide: document.documentElement.scrollWidth > innerWidth }));
    await page.evaluate(() => document.getElementById('cash')?.click());
    await page.waitForFunction(() => /\d/.test(document.getElementById('nOff')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    const off = await page.evaluate(() => document.getElementById('nOff')?.textContent ?? '');
    const bad = [!pt && 'Mersey Square\'s stretch is not on screen', !/Wellington Road/.test(card.name) && `the card is "${card.name}"`, !/^Road · \d+% full$/.test(card.sub) && `its header reads "${card.sub}"`,
      card.figs.some(f => !/\d|none/.test(f)) && `its figures read ${card.figs.join(', ')}`, card.wide && 'it scrolls sideways', !/\d/.test(off) && `the Network card's score reads "${off}"`, errs[0]].filter(Boolean);
    ok('places: at 320×568 tapping a road\'s traffic opens its card with its figures, and the Network card leads with the cars off the roads', !bad.length, bad.join('; ') || `${card.name} · ${card.sub} · ${card.figs.join(', ')} · ${off} off`);
    await ctx.close();
  }
}
