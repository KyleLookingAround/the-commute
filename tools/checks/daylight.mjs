// The time-of-day control: the slider tracks the game's clock, sliding it locks the light to that hour and shows the
// "Live" button, pressing the button releases the lock, and none of it touches the sim's own clock (the
// ticker keeps the game's time). One desktop page, one phone page.
export default async function ({ ok, open }) {
  for (const [w, h, touch] of [[1280, 800, false], [390, 844, true]]) {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch });
    await page.waitForTimeout(600);
    const before = await page.evaluate(() => ({ lbl: document.getElementById('hourLbl').textContent, live: document.getElementById('hourLive').hidden, clock: document.getElementById('clock').textContent }));
    await page.evaluate(() => { const s = document.getElementById('hour'); s.value = '23'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(400);
    const locked = await page.evaluate(() => ({ lbl: document.getElementById('hourLbl').textContent, live: document.getElementById('hourLive').hidden, clock: document.getElementById('clock').textContent }));
    if (touch) await page.touchscreen.tap(...await page.evaluate(() => { const r = document.getElementById('hourLive').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
    else await page.click('#hourLive');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ lbl: document.getElementById('hourLbl').textContent, live: document.getElementById('hourLive').hidden }));
    const bad = [before.live !== true && 'the release button shows before any lock', !/^06:3\d$/.test(before.lbl) && `the slider starts at ${before.lbl}, not the game's 06:30`,
      locked.lbl !== '23:00' && `locked label ${locked.lbl}`, locked.live !== false && 'no release button while locked', !locked.clock.includes('06:3') && `the game's clock moved to ${locked.clock}`,
      after.live !== true && 'the release button stays after release', after.lbl === '23:00' && 'the light stays locked after release', errs[0]].filter(Boolean);
    ok(`daylight: at ${w}×${h} the slider tracks the clock, locks the light and releases it without touching the game's time`, !bad.length, bad.join('; '));
    await ctx.close();
  }
}
