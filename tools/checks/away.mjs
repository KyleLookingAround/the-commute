// Coming back to a changed map (src/render/away.ts; docs/DESIGN.md, Coming back). Without a browser: the time away
// is still capped at half a game day (MAX_AWAY). In the browser, from the bot's game on seed 1 at 05:30 on day 6 (the page seeded
// through window.__seed) saved half an hour ago, on a phone (touch) and a desktop: the camera starts wide (Whole line)
// while a column of coins rises over each station that earned, more coins for more; the toast waits until the coins
// have played, about three seconds in; meanwhile the homes and car parks are held as they stood and then let go, the
// homes that grew rising and the car parks filling; and the camera settles back on the station the player left. With
// reduced motion the coins stand still from the start and the camera moves at once. Screenshots go to
// build/shots/away-*.png. No errors.
// Covers: @page @sim src/render/away.ts src/render/camera.ts
import { register } from 'tsx/esm/api';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { botSave } from './networkview.mjs';

export default async function ({ ok, open, root }) {
  register();
  const { MAX_AWAY } = await import('../../src/app/clock.ts');
  const { DAY } = await import('../../src/sim/day.ts');
  ok('away: the time away is still capped at half a game day', MAX_AWAY === DAY / 2, `${MAX_AWAY} of ${DAY}`);
  const shots = join(root, 'build/shots'); mkdirSync(shots, { recursive: true });
  // left at 05:30 on day 6, so the morning comes while away and the car parks fill
  const { save } = await botSave(root, 1, 6, 5.5);
  const saveAt = () => { const s = JSON.parse(save); s.at = Date.now() - 30 * 60 * 1000; return JSON.stringify(s); };

  for (const [w, h, touch, tag, reduced] of [[390, 844, true, 'phone', false], [1280, 800, false, 'desktop', false], [390, 844, true, 'phone-reduced', true]]) {
    const { ctx, page: p, errs } = await open({ width: w, height: h }, { touch, save: saveAt(), steady: 100 });
    // the page as opened by open() has played already: start again from the save, reduced motion as asked
    await p.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    // every load from here starts from the save, left half an hour before it (the page saves itself as it goes)
    await ctx.addInitScript(s => { const g = JSON.parse(s); g.at = Date.now() - 30 * 60 * 1000; localStorage.setItem('the-commute-save-v1', JSON.stringify(g)); }, save);
    await p.reload(); await p.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
    const look = () => p.evaluate(() => ({ a: window.__view.away?.() ?? null, cam: window.__view.camera(), toast: document.getElementById('toast')?.textContent ?? '', shown: !document.getElementById('toast')?.hidden && getComputedStyle(document.getElementById('toast')).opacity !== '0' }));
    await p.waitForFunction(() => !!window.__view.away?.(), null, { timeout: 60000 }).catch(() => {});
    const a0 = await look();
    await p.waitForFunction(() => (window.__view.away?.()?.t ?? 0) >= 0.5, null, { timeout: 60000 }).catch(() => {});
    const a1 = await look();
    await p.screenshot({ path: join(shots, `away-${tag}-coins.png`) });
    await p.waitForFunction(() => window.__view.away?.()?.done, null, { timeout: 120000 }).catch(() => {});
    await p.waitForFunction(() => !window.__view.camera().flying, null, { timeout: 60000 }).catch(() => {});
    const a2 = await look();
    await p.screenshot({ path: join(shots, `away-${tag}-settled.png`) });
    const cols = a1.a?.cols ?? [], owned = await p.evaluate(() => window.__view.contract().owned);
    const more = cols.length > 1 && Math.max(...cols.map(c => c.coins)) > Math.min(...cols.map(c => c.coins));
    const bad = [!a0.a && 'the welcome back never played', a0.a && !(a0.cam.r > 4000) && `the camera didn't start wide (r ${Math.round(a0.cam.r)})`,
      cols.length < Math.min(3, owned) && `coins over ${cols.length} stations of ${owned} owned`, !more && 'every column the same height',
      a0.a?.toasted && 'the toast came before the coins played', a1.a?.toasted && 'the toast came within half a second',
      !a2.a?.toasted && 'no toast', !/While you were away: £[\d,]+ from [\d,]+ passengers/.test(a2.toast) && `the toast says "${a2.toast}"`,
      !a2.a?.released && 'the homes and car parks were never let go', a2.a?.held && 'the homes are still held',
      !(a2.cam.r < 400) && `the camera didn't settle on the station (r ${Math.round(a2.cam.r)})`,
      reduced && a1.a && a1.a.cols.some(c => c.shown < c.coins || c.y !== 0) && 'the coins moved with reduced motion',
      !reduced && a0.a && a0.a.t < 0.3 && !a0.a.cols.some(c => c.shown < c.coins) && 'the coins were all up from the start',
      !reduced && a2.a && !(a2.a.t > 2.5 && a2.a.t < 4.5) && `it played for ${a2.a.t.toFixed(1)} s`, errs[0]].filter(Boolean);
    ok(`away: at ${w}×${h}${reduced ? ' with reduced motion' : ''} the map plays what happened while away, then the toast, then settles on the station`, !bad.length, bad.join('; ') + ` ${JSON.stringify({ cols: cols.map(c => c.coins).join(','), t: a2.a?.t })}`);
    // the homes and car parks as they stood, then let go: the parks drawn now hold at least what they did while held
    const parks0 = a0.a?.parks.reduce((n, x) => n + x, 0) ?? 0, parks2 = a2.a?.parks.reduce((n, x) => n + x, 0) ?? 0;
    ok(`away: at ${w}×${h}${reduced ? ' with reduced motion' : ''} the car parks fill from where they stood`, a0.a?.held === true && parks2 > parks0, `${parks0} → ${parks2} cars, held at the start ${a0.a?.held}`);
    await ctx.close();
  }
}
