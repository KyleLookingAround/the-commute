// The upgrade cards and what they show on the map. At Stockport in a new game: each reachable upgrade is a card with
// its price; one the money doesn't reach shows how much to go instead of a Buy button; tapping a card marks it and
// draws its parts on the map as a ghost (window.__view.preview counts them), tapping it again clears the ghost; buying
// it makes its parts rise into place (window.__view.rising) and settle within about a second, and its name moves to
// the Built line, where tapping its chip frames what it built (window.__view.framed counts framings) with no ghost.
// One phone page (320 px, touch) and one desktop page.
export default async function ({ ok, open }) {
  for (const [w, h, touch] of [[320, 568, true], [1280, 800, false]]) {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch });
    await page.waitForTimeout(600);
    const tap = async sel => {
      const r = await page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
      if (!r) return false;
      if (touch) await page.touchscreen.tap(r[0], r[1]); else await page.mouse.click(r[0], r[1]);
      return true;
    };
    const cards = await page.evaluate(() => [...document.querySelectorAll('.ucard')].map(c => ({ id: c.dataset.card, can: c.classList.contains('can'), price: c.querySelector('.price')?.textContent, togo: c.querySelector('.togo > span')?.textContent })));
    const subway = cards.find(c => c.id === 'crossing'), dear = cards.find(c => !c.can);
    const bad1 = [!cards.length && 'no upgrade cards', !subway && 'no card for the subway', subway && !subway.can && 'the subway is not buyable with £3,000',
      cards.some(c => !/^£/.test(c.price || '')) && 'a card without a price', dear && !/to go$/.test(dear.togo || '') && `${dear.id} shows "${dear.togo}", not how much to go`].filter(Boolean);
    ok(`preview: at ${w}×${h} each reachable upgrade is a card with its price, and one out of reach says how much to go`, !bad1.length, bad1.join('; '));

    await tap('[data-pick="crossing"]'); await page.waitForTimeout(400);
    const on = await page.evaluate(() => ({ n: window.__view?.preview ?? 0, sel: !!document.querySelector('.ucard.sel[data-card="crossing"]') }));
    await tap('[data-pick="crossing"]'); await page.waitForTimeout(200);
    const off = await page.evaluate(() => ({ n: window.__view?.preview ?? -1, sel: !!document.querySelector('.ucard.sel') }));
    ok(`preview: at ${w}×${h} tapping a card draws its parts as a ghost on the map, and tapping it again clears it`, on.n > 0 && on.sel && off.n === 0 && !off.sel, `on ${JSON.stringify(on)}, off ${JSON.stringify(off)}`);

    await tap('[data-pick="crossing"]'); await page.waitForTimeout(200);
    await tap('[data-up="crossing"]'); await page.waitForTimeout(150);
    const rising = await page.evaluate(() => ({ n: window.__view?.rising() ?? 0, ghost: window.__view?.preview ?? -1 }));
    await page.waitForFunction(() => window.__view?.rising() === 0, null, { timeout: 2500 }).catch(() => {});
    const after = await page.evaluate(() => ({ n: window.__view?.rising() ?? -1, built: document.querySelector('.built')?.textContent || '', card: !!document.querySelector('[data-card="crossing"]') }));
    const bad2 = [rising.n < 1 && 'nothing rose', rising.ghost !== 0 && 'the ghost stayed', after.n !== 0 && 'still rising after 2.5 s', !/Subway/.test(after.built) && 'Subway is not on the Built line', after.card && 'the card stayed', errs[0]].filter(Boolean);
    ok(`preview: at ${w}×${h} buying a card makes its parts rise into place within about a second, and it moves to the Built line`, !bad2.length, bad2.join('; '));

    const f0 = await page.evaluate(() => window.__view?.framed ?? 0);
    const chip = await tap('[data-built="crossing"]'); await page.waitForTimeout(200);
    const f1 = await page.evaluate(() => ({ n: window.__view?.framed ?? 0, ghost: window.__view?.preview ?? -1 }));
    ok(`preview: at ${w}×${h} tapping a Built chip frames what it built, with no ghost`, chip && f1.n > f0 && f1.ghost === 0, `chip ${chip}, framed ${f0} → ${f1.n}, ghost ${f1.ghost}`);
    await ctx.close();
  }
}
