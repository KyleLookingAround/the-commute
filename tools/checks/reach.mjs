// The reach on the map. In a new game only Stockport glows (window.__view.reach gives each station's glow) and the
// minutes view is off. With money to spend, at Stockport: the subway's card says how many minutes it saves and for how
// many homes, and tapping it draws a ghost ring where the reach would be; buying it widens the glow, easing out over
// about a second; the extra unit's card, on the stopper's, says it cuts the wait. The Minutes control shades the ground by minutes to
// Manchester and shows its key, and turns it off again. Screenshots of the glow before and after, and of the minutes
// view, go to build/shots/reach-*.png. One phone page (320 px, touch) and one desktop page.
import { reveal } from '../reveal.mjs';
import { register } from 'tsx/esm/api';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ ok, open, root, side }) {
  register();
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim } = await import('../../src/sim/sim.ts');
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'))), sim = new Sim(net, Sim.fresh(net, 1));
  sim.g.cash = 1e6;
  const rich = JSON.stringify({ g: sim.g, selected: 0 }), f = net.stationFrame('stockport');
  const shots = join(root, 'build/shots'); mkdirSync(shots, { recursive: true });
  // each size side by side where the runner can (side, tools/check.mjs)
  await side(...([[320, 568, true, 'phone'], [1280, 800, false, 'desktop']]).map(([w, h, touch, tag]) => async () => {
    const fresh = await open({ width: w, height: h }, { touch });
    await fresh.page.waitForTimeout(500);
    const r0 = await fresh.page.evaluate(() => ({ ...window.__view?.reach?.(), pressed: document.getElementById('vMins')?.getAttribute('aria-pressed') }));
    const bad0 = [!r0.target && 'no reach on window.__view', r0.target && !(r0.target[0] > 0) && 'Stockport has no glow', r0.target && r0.target.slice(1).some(r => r > 0) && 'a locked station glows',
      r0.minutes && 'the minutes view is on', r0.pressed !== 'false' && 'the Minutes control is not off', fresh.errs[0]].filter(Boolean);
    ok(`reach: at ${w}×${h} a new game glows round Stockport alone, with the minutes view off`, !bad0.length, bad0.join('; ') + ` ${JSON.stringify(r0.target)}`);
    await fresh.ctx.close();

    // the rich save, then the camera high over Stockport and the light at midday for the screenshots
    const { ctx, page: p, errs } = await open({ width: w, height: h }, { touch, save: rich, steady: 50 });
    await ctx.addInitScript(([x, z]) => { window.__orbit = { tx: x, ty: 0, tz: z, r: 2600, th: 5.5, ph: 0.55 }; window.__lockHour = 13; }, [f.x, f.z]);
    await p.reload(); await p.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1500);
    const tap = async sel => {
      sel = await reveal(p, sel);
      const r = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel);
      if (!r) return false;
      if (touch) await p.touchscreen.tap(r[0], r[1]); else await p.mouse.click(r[0], r[1]);
      return true;
    };
    const keep = () => p.evaluate(() => window.scrollTo(0, 0));
    await tap('#vLine'); await p.waitForTimeout(1200); await keep(); await p.screenshot({ path: join(shots, `reach-before-${tag}.png`) });
    const card = await p.evaluate(() => ({ subway: document.querySelector('[data-card="crossing"] [data-saves]')?.textContent || '' }));
    const r1 = await p.evaluate(() => window.__view.reach());
    await tap('[data-pick="crossing"]');
    await p.waitForFunction(() => window.__view.reach().ghosts > 0, null, { timeout: 15000 }).catch(() => {});
    const g1 = await p.evaluate(() => window.__view.reach().ghosts);
    await tap('#vLine'); await p.waitForTimeout(1200); await keep(); await p.screenshot({ path: join(shots, `reach-ghost-${tag}.png`) });
    // buy it, then watch Stockport's glow frame by frame (each frame at most 50 ms of the page's time, so the ease takes
    // the same frames on a slow machine): until it settles, or 60 s of real time
    await tap('[data-up="crossing"]');
    const ease = await p.evaluate(async () => {
      const t0 = window.__frameT, out = { from: window.__view.reach().now[0], seen: [], took: null };
      const frame = () => new Promise(r => requestAnimationFrame(r)), real = performance.now();
      while (performance.now() - real < 60000) {
        await frame(); const r = window.__view.reach(); out.target = r.target[0]; out.seen.push(r.now[0]);
        if (r.target[0] > out.from + 20 && Math.abs(r.now[0] - r.target[0]) <= 2) { out.took = (window.__frameT - t0) / 1000; break; }
      }
      return out;
    });
    const between = ease.seen.filter(v => v > ease.from + 5 && v < ease.target - 5).length;
    const steady = ease.seen.every((v, i) => i === 0 || v >= ease.seen[i - 1] - 0.5);
    await tap('#vLine'); await keep(); await p.waitForTimeout(600);
    const end = await p.evaluate(() => window.__view.reach());
    await p.screenshot({ path: join(shots, `reach-after-${tag}.png`) });
    const bad1 = [!/^\d+ min less walk for about [\d,]+ homes$/.test(card.subway) && `the subway's card says "${card.subway}"`, g1 < 1 && 'no ghost ring',
      !(ease.target > r1.target[0] + 20) && `the reach didn't widen (${r1.target[0]} → ${ease.target})`,
      between < 3 && `the glow jumped rather than easing (${between} frames on the way)`, !steady && 'the glow went back on its way out',
      ease.took === null ? 'the glow never settled' : !(ease.took > 0.4 && ease.took <= 2) && `the glow took ${ease.took.toFixed(2)} s to settle, not about a second`,
      end.ghosts !== 0 && 'the ghost ring stayed', errs[0]].filter(Boolean);
    ok(`reach: at ${w}×${h} the subway's card says what it saves, its preview draws a ghost ring, and buying it widens the glow over about a second`, !bad1.length, bad1.join('; '));
    // the extra unit waits on platform 3; its card is there once that's built
    await tap('[data-pick="platform2"]'); await tap('[data-up="platform2"]');
    await tap('#strip [data-place="route:stopper"]');
    await p.waitForFunction(() => /\d/.test(document.querySelector('[data-card="units"] [data-saves]')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
    const unit = await p.evaluate(() => document.querySelector('[data-card="units"] [data-saves]')?.textContent || '');
    ok(`reach: at ${w}×${h} the extra unit's card says it cuts the wait`, /^\d+ min less waiting for about [\d,]+ homes$/.test(unit), `"${unit}"`);

    await tap('#vLine'); await keep(); await tap('#vMins');
    await p.waitForFunction(() => window.__view.reach().minutes, null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(600);
    const on = await p.evaluate(() => ({ m: window.__view.reach().minutes, key: !document.getElementById('minsKey')?.hidden, pressed: document.getElementById('vMins')?.getAttribute('aria-pressed') }));
    await keep(); await p.screenshot({ path: join(shots, `reach-minutes-${tag}.png`) });
    await tap('#vMins');
    await p.waitForFunction(() => !window.__view.reach().minutes, null, { timeout: 15000 }).catch(() => {});
    const off = await p.evaluate(() => ({ m: window.__view.reach().minutes, key: !document.getElementById('minsKey')?.hidden }));
    ok(`reach: at ${w}×${h} the Minutes control shades the ground with its key, and turns off again`, on.m && on.key && on.pressed === 'true' && !off.m && !off.key && !errs[0], `${JSON.stringify(on)} ${JSON.stringify(off)} ${errs[0] || ''}`);
    await ctx.close();
  }));
}
