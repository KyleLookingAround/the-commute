// The line's upgrades as cards, like a station's. In a new game: each line upgrade on offer is a card with its price
// and how much to go; extra units stay hidden until Stockport's platform 3 is built; tapping a card marks it and frames
// what it's about on the map (window.__view.framed counts framings), and choosing a station's card instead clears it.
// With the money (a save from that game, with cash added and platform 3 built): extra units show as a card, buying one
// frames the new unit, the next one shows as the next card, and the bought one sits on the line's Built line. The faster
// timetable has its own work on the map: its card ghosts the signals and 90 boards (window.__view.preview) and frames
// them, tapping it again clears the ghost; buying it makes them rise into place (window.__view.rising) within about a
// second, and its Built chip frames them with no ghost. One phone page (320 px, touch) and one desktop page.
import { reveal } from '../reveal.mjs';
export default async function ({ ok, open, SAVE_KEY }) {
  for (const [w, h, touch] of [[320, 568, true], [1280, 800, false]]) {
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
    const cards = await page.evaluate(() => [...document.querySelectorAll('#linePanel .ucard')].map(c => ({ id: c.dataset.lcard, price: c.querySelector('.price')?.textContent, togo: c.querySelector('.togo > span')?.textContent })));
    const bad1 = [!cards.length && 'no line cards', cards.some(c => c.id === 'units') && 'extra units show before platform 3', cards.some(c => !/^£/.test(c.price || '')) && 'a card without a price',
      cards.some(c => !/to go$/.test(c.togo || '')) && 'a card out of reach without how much to go'].filter(Boolean);
    ok(`line: at ${w}×${h} the line's upgrades are cards with their price and how much to go, extra units hidden until platform 3`, !bad1.length, bad1.join('; ') + ' ' + JSON.stringify(cards));

    const f0 = await framed();
    await tap('[data-lpick="cars"]'); await page.waitForFunction(f0 => !!document.querySelector('#linePanel .ucard.sel[data-lcard="cars"]') && (window.__view?.framed ?? 0) > f0, f0, { timeout: 60000 }).catch(() => {});
    const on = await page.evaluate(() => !!document.querySelector('#linePanel .ucard.sel[data-lcard="cars"]'));
    const f1 = await framed();
    await tap('[data-pick="crossing"]'); await page.waitForFunction(() => !document.querySelector('#linePanel .ucard.sel'), null, { timeout: 60000 }).catch(() => {});
    const off = await page.evaluate(() => !document.querySelector('#linePanel .ucard.sel') && !!document.querySelector('#panel .ucard.sel'));
    ok(`line: at ${w}×${h} tapping a line card marks it and frames a train, and choosing a station's card clears it`, on && f1 > f0 && off, `marked ${on}, framed ${f0} → ${f1}, cleared ${off}`);

    const t0 = await framed();
    await tap('[data-lpick="timetable"]'); await page.waitForFunction(t0 => (window.__view?.preview ?? 0) > 0 && (window.__view?.framed ?? 0) > t0, t0, { timeout: 60000 }).catch(() => {});
    const tOn = await page.evaluate(() => window.__view?.preview ?? 0), t1 = await framed();
    await tap('[data-lpick="timetable"]'); await page.waitForFunction(() => window.__view?.preview === 0, null, { timeout: 60000 }).catch(() => {});
    const tOff = await page.evaluate(() => window.__view?.preview ?? -1);
    ok(`line: at ${w}×${h} the faster timetable's card ghosts its signals and boards and frames them, and tapping it again clears them`, tOn > 0 && t1 > t0 && tOff === 0, `ghost ${tOn} → ${tOff}, framed ${t0} → ${t1}`);

    // buying the subway saves the game; that save, with money and platform 3, opens the next page
    await tap('[data-pick="crossing"]'); await tap('[data-up="crossing"]'); await page.waitForFunction(k => !!localStorage.getItem(k) && JSON.parse(localStorage.getItem(k)).g.places['station:stockport']?.crossing, SAVE_KEY, { timeout: 60000 }).catch(() => {});
    const raw = await page.evaluate(k => localStorage.getItem(k), SAVE_KEY);
    await ctx.close();
    if (!raw) { ok(`line: at ${w}×${h} buying an extra unit frames it and moves it to the Built line`, false, 'no save to start from'); continue; }
    const s = JSON.parse(raw); s.g.cash = 100000; s.g.places['station:stockport'].platform2 = 1; delete s.at;
    const p2 = await open({ width: w, height: h }, { touch, save: JSON.stringify(s), steady: 50 });
    await p2.page.waitForTimeout(600);
    const tap2 = async sel => {
      sel = await reveal(p2.page, sel);
      const r = await p2.page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
      if (!r) return false;
      if (touch) await p2.page.touchscreen.tap(r[0], r[1]); else await p2.page.mouse.click(r[0], r[1]);
      return true;
    };
    const g0 = await p2.page.evaluate(() => window.__view?.framed ?? 0);
    const bought = await tap2('[data-lup="units"]'); await p2.page.waitForFunction(g0 => (window.__view?.framed ?? 0) > g0, g0, { timeout: 60000 }).catch(() => {});
    const after = await p2.page.evaluate(() => ({ n: window.__view?.framed ?? 0, next: document.querySelector('[data-lcard="units"] .head b')?.textContent || '', built: document.querySelector('#linePanel .built')?.textContent || '' }));
    const bad2 = [!bought && 'no Buy on the extra unit card', after.n <= g0 && 'the camera framed nothing', !/2 of 3/.test(after.next) && `the next card reads "${after.next}"`, !/Extra unit/.test(after.built) && 'not on the Built line', errs[0], p2.errs[0]].filter(Boolean);
    ok(`line: at ${w}×${h} buying an extra unit frames it, the next one shows as the next card, and it moves to the Built line`, !bad2.length, bad2.join('; '));

    await tap2('[data-lpick="timetable"]'); await p2.page.waitForFunction(() => (window.__view?.preview ?? 0) > 0, null, { timeout: 60000 }).catch(() => {});
    const b0 = await p2.page.evaluate(() => window.__view?.framed ?? 0);
    const tb = await tap2('[data-lup="timetable"]');
    // the rise in the page's own time (steady frames, so it takes the same frames however slow the machine): wait for
    // it to start, then to settle, each with a minute of real time to spare, and time the settle by the page's clock
    const riseAt = await p2.page.evaluate(() => window.__frameT);
    const rose = await p2.page.waitForFunction(() => (window.__view?.rising() ?? 0) > 0, null, { timeout: 60000 }).then(() => p2.page.evaluate(() => window.__view.rising()), () => 0);
    const ghost = await p2.page.evaluate(() => window.__view?.preview ?? -1);
    await p2.page.waitForFunction(() => window.__view?.rising() === 0, null, { timeout: 60000 }).catch(() => {});
    const took = (await p2.page.evaluate(() => window.__frameT) - riseAt) / 1000;
    await p2.page.waitForFunction(b0 => (window.__view?.framed ?? 0) > b0, b0, { timeout: 60000 }).catch(() => {});
    const rising = { n: rose, ghost };
    const settled = await p2.page.evaluate(() => ({ n: window.__view?.rising() ?? -1, built: document.querySelector('#linePanel .built')?.textContent || '' }));
    const h0 = await p2.page.evaluate(() => window.__view?.framed ?? 0);
    const chip = await tap2('[data-lbuilt="timetable"]'); await p2.page.waitForFunction(h0 => (window.__view?.framed ?? 0) > h0, h0, { timeout: 60000 }).catch(() => {});
    const h1 = await p2.page.evaluate(() => ({ n: window.__view?.framed ?? 0, ghost: window.__view?.preview ?? -1 }));
    const bad3 = [!tb && 'no Buy on the faster timetable card', rising.n < 1 && 'nothing rose', rising.ghost !== 0 && 'the ghost stayed', settled.n !== 0 && 'still rising after a minute', took > 2.5 && `took ${took.toFixed(1)} s of the page's time to settle, not 2.5`,
      !/Faster timetable/.test(settled.built) && 'not on the Built line', !chip && 'no Built chip', h1.n <= h0 && 'the chip framed nothing', h1.ghost !== 0 && 'the chip ghosted', p2.errs[0]].filter(Boolean);
    ok(`line: at ${w}×${h} buying the faster timetable makes its signals and boards rise into place, and its Built chip frames them`, !bad3.length, bad3.join('; '));
    await p2.ctx.close();
  }
}
