// The stopper's stages as cards on its own card, like a station's (opened from its chip on the strip). In a new game:
// each stage on offer is a card with its price and how much to go; extra units stay hidden until Stockport's platform 3
// is built; tapping a card marks it and frames what it's about on the map (window.__view.framed counts framings), and
// opening Stockport and choosing one of its cards instead clears it. With the money (a save from that game, with cash
// added and platform 3 built): its frequency shows as a card (Second unit), buying it frames the new unit, the next
// step (Off-peak timetable) shows as the next card, and the bought one sits on the stopper's Built line. A section of line (Heaton Norris Junction – Heaton
// Chapel, from Next to on Heaton Chapel's card, owned with it): its line speed card ghosts the renewed track
// (window.__view.sections) and frames it, buying it shows it at 90 mph, and its Built chip frames it. One phone page
// (320 px, touch) and one desktop page.
import { reveal } from '../reveal.mjs';
export default async function ({ ok, open, SAVE_KEY, side }) {
  // each size side by side where the runner can (side, tools/check.mjs)
  await side(...([[320, 568, true], [1280, 800, false]]).map(([w, h, touch]) => async () => {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch });
    await page.waitForTimeout(600);
    const tap = async sel => {
      sel = await reveal(page, sel);
      const r = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
      if (!r) return false;
      if (touch) await page.touchscreen.tap(r[0], r[1]); else await page.mouse.click(r[0], r[1]);
      return true;
    };
    const framed = () => page.evaluate(() => window.__view?.framed ?? 0);
    const stopper = '#strip [data-place="route:stopper"]', stockport = '#strip .card:first-child', on = id => `#panel[data-place="${id}"]`;
    await tap(stopper); await page.waitForSelector(on('route:stopper'), { timeout: 60000 }).catch(() => {});
    const cards = await page.evaluate(() => [...document.querySelectorAll('#panel .ucard')].map(c => ({ id: c.dataset.card, price: c.querySelector('.price')?.textContent, togo: c.querySelector('.togo > span')?.textContent })));
    const bad1 = [!cards.length && 'no line cards', cards.some(c => c.id === 'units') && 'extra units show before platform 3', cards.some(c => !/^£/.test(c.price || '')) && 'a card without a price',
      cards.some(c => !/to go$/.test(c.togo || '')) && 'a card out of reach without how much to go'].filter(Boolean);
    ok(`line: at ${w}×${h} the stopper's stages are cards with their price and how much to go, extra units hidden until platform 3`, !bad1.length, bad1.join('; ') + ' ' + JSON.stringify(cards));

    const f0 = await framed();
    await tap('[data-pick="cars"]'); await page.waitForFunction(f0 => !!document.querySelector('#panel .ucard.sel[data-card="cars"]') && (window.__view?.framed ?? 0) > f0, f0, { timeout: 60000 }).catch(() => {});
    const marked = await page.evaluate(() => !!document.querySelector('#panel .ucard.sel[data-card="cars"]'));
    const f1 = await framed();
    await tap(stockport); await page.waitForSelector(on('station:stockport'), { timeout: 60000 }).catch(() => {});
    await tap('[data-pick="crossing"]'); await page.waitForFunction(() => !!document.querySelector('#panel .ucard.sel[data-card="crossing"]'), null, { timeout: 60000 }).catch(() => {});
    const off = await page.evaluate(() => document.querySelectorAll('#panel .ucard.sel').length === 1 && !!document.querySelector('#panel .ucard.sel[data-card="crossing"]'));
    ok(`line: at ${w}×${h} tapping a stopper's card marks it and frames a train, and choosing a station's card instead clears it`, marked && f1 > f0 && off, `marked ${marked}, framed ${f0} → ${f1}, cleared ${off}`);

    // buying the subway saves the game; that save, with money and platform 3, opens the next page
    await tap(stockport); await page.waitForSelector(on('station:stockport'), { timeout: 60000 }).catch(() => {});
    await tap('[data-pick="crossing"]'); await tap('[data-up="crossing"]'); await page.waitForFunction(k => !!localStorage.getItem(k) && JSON.parse(localStorage.getItem(k)).g.places['station:stockport']?.crossing, SAVE_KEY, { timeout: 60000 }).catch(() => {});
    const raw = await page.evaluate(k => localStorage.getItem(k), SAVE_KEY);
    await ctx.close();
    if (!raw) { ok(`line: at ${w}×${h} buying an extra unit frames it and moves it to the Built line`, false, 'no save to start from'); return; }
    const s = JSON.parse(raw); s.g.cash = 100000; s.g.places['station:stockport'].platform2 = 1; s.g.places['station:heaton-chapel'] = {}; delete s.at;
    const p2 = await open({ width: w, height: h }, { touch, save: JSON.stringify(s), steady: 50 });
    await p2.page.waitForTimeout(600);
    const tap2 = async sel => {
      sel = await reveal(p2.page, sel);
      const r = await p2.page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
      if (!r) return false;
      if (touch) await p2.page.touchscreen.tap(r[0], r[1]); else await p2.page.mouse.click(r[0], r[1]);
      return true;
    };
    await tap2(stopper); await p2.page.waitForSelector(on('route:stopper'), { timeout: 60000 }).catch(() => {});
    const g0 = await p2.page.evaluate(() => window.__view?.framed ?? 0);
    const bought = await tap2('[data-up="units"]'); await p2.page.waitForFunction(g0 => (window.__view?.framed ?? 0) > g0, g0, { timeout: 60000 }).catch(() => {});
    const after = await p2.page.evaluate(() => ({ n: window.__view?.framed ?? 0, next: document.querySelector('[data-card="units"] .head b')?.textContent || '', built: document.querySelector('#panel .built')?.textContent || '' }));
    const bad2 = [!bought && 'no Buy on the extra unit card', after.n <= g0 && 'the camera framed nothing', !/Off-peak timetable/.test(after.next) && `the next card reads "${after.next}"`, !/Second unit/.test(after.built) && 'not on the Built line', errs[0], p2.errs[0]].filter(Boolean);
    ok(`line: at ${w}×${h} buying an extra unit frames it, the next one shows as the next card, and it moves to the Built line`, !bad2.length, bad2.join('; '));

    // a section of line's card, from Next to on Heaton Chapel's: its line speed step ghosts the renewed track and
    // frames it, buying it makes it show, and its Built chip frames it
    const sec = 'section:main:heaton-norris-junction:heaton-chapel';
    await tap2('#strip [data-place="station:heaton-chapel"]'); await p2.page.waitForSelector(on('station:heaton-chapel'), { timeout: 60000 }).catch(() => {});
    await tap2(`[data-next="${sec}"]`); await p2.page.waitForSelector(on(sec), { timeout: 60000 }).catch(() => {});
    const s0 = await p2.page.evaluate(() => ({ n: window.__view?.framed ?? 0, head: document.querySelector('[data-card="speed"] .head b')?.textContent || '' }));
    await tap2('[data-pick="speed"]'); await p2.page.waitForFunction(() => (window.__view?.sections?.().ghosts ?? 0) > 0, null, { timeout: 60000 }).catch(() => {});
    const ghosted = await p2.page.evaluate(() => ({ ...window.__view?.sections?.(), n: window.__view?.framed ?? 0 }));
    const sb = await tap2('[data-up="speed"]'); await p2.page.waitForFunction(() => (window.__view?.sections?.().shown ?? 0) > 0, null, { timeout: 60000 }).catch(() => {});
    const shown = await p2.page.evaluate(() => ({ ...window.__view?.sections?.(), built: document.querySelector('#panel .built')?.textContent || '', speed: document.getElementById('xSpeed')?.textContent || '' }));
    const c0 = await p2.page.evaluate(() => window.__view?.framed ?? 0);
    const sChip = await tap2('[data-built="speed"]'); await p2.page.waitForFunction(c0 => (window.__view?.framed ?? 0) > c0, c0, { timeout: 60000 }).catch(() => {});
    const c1 = await p2.page.evaluate(() => window.__view?.framed ?? 0);
    const bad3 = [!/^Line speed 90 mph$/.test(s0.head) && `the section's card offers "${s0.head}"`, !(ghosted.ghosts > 0) && 'no ghost of the renewed track', !(ghosted.n > s0.n) && 'the camera framed nothing',
      !sb && 'no Buy on the line speed card', !(shown.shown > 0 && shown.ghosts === 0) && `the renewed track doesn't show (${JSON.stringify(shown)})`, shown.speed !== '90 mph' && `the card says ${shown.speed}`,
      !/Line speed 90 mph/.test(shown.built) && 'not on the Built line', !sChip || c1 <= c0 ? 'the Built chip framed nothing' : false, p2.errs[0]].filter(Boolean);
    ok(`line: at ${w}×${h} a section's line speed card ghosts its renewed track and frames it, buying it shows it, and its Built chip frames it`, !bad3.length, bad3.join('; '));
    await p2.ctx.close();
  }));
}
