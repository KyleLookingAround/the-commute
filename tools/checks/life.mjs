// Life (docs/DESIGN.md, Who's travelling, Sound and Settings): the settings sheet opens from the stage, every control
// in it is a 44 px tap target on a phone (320 px wide too) and it fits the screen; Low turns shadows off, thins the
// figures and draws at one pixel per CSS pixel, High brings them back; the settings are remembered on the device after a
// reload and never go in the save; sound stays off until the first tap, starts on it, and a mute is remembered (a muted
// page makes no sound when tapped). Then the figures: after a while at 10x some carry a suitcase or wheel a bike.
const SET_KEY = 'the-commute-prefs-v1';

export default async function ({ ok, open, SAVE_KEY }) {
  for (const [w, h] of [[320, 568], [390, 844]]) {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch: true });
    await page.waitForTimeout(500);
    const life = () => page.evaluate(() => window.__view.life());
    const tap = async sel => { const [x, y] = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel); await page.touchscreen.tap(x, y); await page.waitForTimeout(250); };
    const before = await life();
    await tap('#vSet');
    const sheet = await page.evaluate(min => {
      const d = document.getElementById('settings'), r = d.getBoundingClientRect();
      const small = [...d.querySelectorAll('button, input')].filter(b => b.getClientRects().length).map(b => { const q = b.getBoundingClientRect(); return [b.textContent.trim() || b.getAttribute('aria-label'), Math.round(q.width), Math.round(q.height)]; }).filter(([, bw, bh]) => bw < min || bh < min);
      return { open: d.open, fits: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, small, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    }, 44);
    ok(`life: at ${w}×${h} the settings sheet opens from the stage, fits the screen, and every control in it is 44 px`, sheet.open && sheet.fits && !sheet.small.length && sheet.sw <= sheet.cw,
      [!sheet.open && 'not open', !sheet.fits && 'off the screen', ...sheet.small.map(s => `${s[0]} ${s[1]}×${s[2]}`)].filter(Boolean).join(', '));
    // the tap that opened the sheet was the first: sound has started
    const started = await life();
    await tap('[data-q="low"]');
    const low = await life();
    await tap('[data-t="sound"]');
    await tap('.set-close');
    const closed = await page.evaluate(() => !document.getElementById('settings').open);
    ok(`life: at ${w}×${h} sound is off until the first tap and starts on it`, !before.heard.running && started.heard.running, JSON.stringify([before.heard.running, started.heard.running]));
    ok(`life: at ${w}×${h} Low turns shadows off, thins the figures and draws at one pixel per CSS pixel; the sheet closes`, before.shadows && before.ratio === 2 && !low.shadows && low.ratio === 1 && closed, JSON.stringify({ before: [before.shadows, before.ratio], low: [low.shadows, low.ratio], closed }));
    // reload: the settings come back from the device, apart from the save; muted, a tap makes no sound
    await page.reload(); await page.waitForSelector('html[data-sim="ready"]'); await page.waitForTimeout(400);
    const kept = await page.evaluate(([k, s]) => ({ prefs: JSON.parse(localStorage.getItem(k) || 'null'), inSave: (localStorage.getItem(s) || '').includes('"shadows"') }), [SET_KEY, SAVE_KEY]);
    await page.touchscreen.tap(w / 2, 150); await page.waitForTimeout(300);
    const after = await life();
    ok(`life: at ${w}×${h} the settings are remembered on the device, never in the save, and a muted page stays silent when tapped`,
      kept.prefs && kept.prefs.sound === false && kept.prefs.shadows === false && !kept.inSave && !after.shadows && after.ratio === 1 && !after.heard.running, JSON.stringify({ kept, after: [after.shadows, after.ratio, after.heard.running] }));
    // High brings everything back
    await tap('#vSet'); await tap('[data-q="high"]');
    const high = await life();
    ok(`life: at ${w}×${h} High brings shadows and full sharpness back`, high.shadows && high.ratio === 2 && !errs.length, JSON.stringify([high.shadows, high.ratio, errs[0]]));
    await ctx.close();
  }
  // the figures: after a while at 10x some carry a suitcase or wheel a bike
  const { ctx, page, errs } = await open({ width: 1280, height: 800 });
  await page.click('#sp10');
  let seen = { cases: 0, bikes: 0, figures: 0 };
  for (let k = 0; k < 20 && seen.cases + seen.bikes === 0; k++) { await page.waitForTimeout(1000); seen = await page.evaluate(() => window.__view.life()); }
  ok('life: at 10x some of the figures on the platforms carry a suitcase or wheel a bike', seen.cases + seen.bikes > 0 && !errs.length, JSON.stringify({ cases: seen.cases, bikes: seen.bikes, figures: seen.figures, err: errs[0] }));
  await ctx.close();
}
