// The line's upgrades as cards, like a station's. In a new game: each line upgrade on offer is a card with its price
// and how much to go; extra units stay hidden until Stockport's platform 3 is built; tapping a card marks it and frames
// what it's about on the map (window.__view.framed counts framings), and choosing a station's card instead clears it.
// With the money (a save from that game, with cash added and platform 3 built): extra units show as a card, buying one
// frames the new unit, the next one shows as the next card, and the bought one sits on the line's Built line. One phone
// page (320 px, touch) and one desktop page.
export default async function ({ ok, open, SAVE_KEY }) {
  for (const [w, h, touch] of [[320, 568, true], [1280, 800, false]]) {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch });
    await page.waitForTimeout(600);
    const tap = async sel => {
      const r = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
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
    await tap('[data-lpick="cars"]'); await page.waitForTimeout(200);
    const on = await page.evaluate(() => !!document.querySelector('#linePanel .ucard.sel[data-lcard="cars"]'));
    const f1 = await framed();
    await tap('[data-pick="crossing"]'); await page.waitForTimeout(200);
    const off = await page.evaluate(() => !document.querySelector('#linePanel .ucard.sel') && !!document.querySelector('#panel .ucard.sel'));
    ok(`line: at ${w}×${h} tapping a line card marks it and frames a train, and choosing a station's card clears it`, on && f1 > f0 && off, `marked ${on}, framed ${f0} → ${f1}, cleared ${off}`);

    // buying the subway saves the game; that save, with money and platform 3, opens the next page
    await tap('[data-pick="crossing"]'); await tap('[data-up="crossing"]'); await page.waitForTimeout(200);
    const raw = await page.evaluate(k => localStorage.getItem(k), SAVE_KEY);
    await ctx.close();
    if (!raw) { ok(`line: at ${w}×${h} buying an extra unit frames it and moves it to the Built line`, false, 'no save to start from'); continue; }
    const s = JSON.parse(raw); s.g.cash = 100000; s.g.ups[0].platform2 = true; delete s.at;
    const p2 = await open({ width: w, height: h }, { touch, save: JSON.stringify(s) });
    await p2.page.waitForTimeout(600);
    const tap2 = async sel => {
      const r = await p2.page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
      if (!r) return false;
      if (touch) await p2.page.touchscreen.tap(r[0], r[1]); else await p2.page.mouse.click(r[0], r[1]);
      return true;
    };
    const g0 = await p2.page.evaluate(() => window.__view?.framed ?? 0);
    const bought = await tap2('[data-lup="units"]'); await p2.page.waitForFunction(g0 => (window.__view?.framed ?? 0) > g0, g0, { timeout: 3000 }).catch(() => {});
    const after = await p2.page.evaluate(() => ({ n: window.__view?.framed ?? 0, next: document.querySelector('[data-lcard="units"] .head b')?.textContent || '', built: document.querySelector('#linePanel .built')?.textContent || '' }));
    const bad2 = [!bought && 'no Buy on the extra unit card', after.n <= g0 && 'the camera framed nothing', !/2 of 3/.test(after.next) && `the next card reads "${after.next}"`, !/Extra unit/.test(after.built) && 'not on the Built line', errs[0], p2.errs[0]].filter(Boolean);
    ok(`line: at ${w}×${h} buying an extra unit frames it, the next one shows as the next card, and it moves to the Built line`, !bad2.length, bad2.join('; '));
    await p2.ctx.close();
  }
}
