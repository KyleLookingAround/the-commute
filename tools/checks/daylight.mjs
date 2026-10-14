// The time-of-day control, in the Light popover from the map views: tapping Light opens it, the slider tracks the game's clock, sliding it locks the light to that hour and shows the
// "Live" button, pressing the button releases the lock, and none of it touches the sim's own clock (the
// ticker keeps the game's time). One desktop page, one phone page.
// Covers: @page src/render/sky.ts src/render/weather.ts
// the slider's label and the game's clock (its ticker, "Day 1 · 07:30") within ten minutes of each other
const mins = t => { const m = /(\d\d):(\d\d)/.exec(t ?? ''); return m ? +m[1] * 60 + +m[2] : NaN; };
const sameTime = (a, b) => Math.abs(mins(a) - mins(b)) <= 10;
export default async function ({ ok, open }) {
  for (const [w, h, touch] of [[1280, 800, false], [390, 844, true]]) {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch });
    await page.waitForTimeout(600);
    const shut = await page.evaluate(() => document.getElementById('lightPop').hidden);
    const lb = await page.evaluate(() => { const r = document.getElementById('vLight').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    if (touch) await page.touchscreen.tap(...lb); else await page.mouse.click(...lb);
    await page.waitForTimeout(300);
    const pop = await page.evaluate(() => { const p = document.getElementById('lightPop'), s = document.getElementById('hour').getBoundingClientRect(); return !p.hidden && p.contains(document.getElementById('hour')) && s.width > 40 && s.left >= 0 && s.right <= innerWidth; });
    ok(`daylight: at ${w}×${h} the slider is in the Light popover, shut until Light is tapped`, shut && pop, `shut ${shut}, open and in view ${pop}`);
    const before = await page.evaluate(() => ({ lbl: document.getElementById('hourLbl').textContent, live: document.getElementById('hourLive').hidden, clock: document.getElementById('clock').textContent }));
    await page.evaluate(() => { const s = document.getElementById('hour'); s.value = '23'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForTimeout(400);
    const locked = await page.evaluate(() => ({ lbl: document.getElementById('hourLbl').textContent, live: document.getElementById('hourLive').hidden, clock: document.getElementById('clock').textContent }));
    if (touch) await page.touchscreen.tap(...await page.evaluate(() => { const r = document.getElementById('hourLive').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
    else await page.click('#hourLive');
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ lbl: document.getElementById('hourLbl').textContent, live: document.getElementById('hourLive').hidden }));
    const bad = [before.live !== true && 'the release button shows before any lock', !sameTime(before.lbl, before.clock) && `the slider starts at ${before.lbl}, not the game's ${before.clock}`,
      locked.lbl !== '23:00' && `locked label ${locked.lbl}`, locked.live !== false && 'no release button while locked', !sameTime(locked.clock, before.clock) && `the game's clock moved from ${before.clock} to ${locked.clock}`,
      after.live !== true && 'the release button stays after release', after.lbl === '23:00' && 'the light stays locked after release', errs[0]].filter(Boolean);
    ok(`daylight: at ${w}×${h} the slider tracks the clock, locks the light and releases it without touching the game's time`, !bad.length, bad.join('; '));
    await ctx.close();
  }
}
