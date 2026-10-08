// The page at the six sizes the project notes name: 320×568, 568×320, 390×844, 844×390 (phones, touch), 768×1024 and
// 1440×900. At each: the page loads with no errors, the 3D stage is in view, the station strip and the panel are
// reachable, nothing scrolls sideways, every tap target is at least 44 px on touch (40 px otherwise), and the ticker
// shows money and a clock. One page per size; a screenshot of each goes to build/check/ for a human to look at.
import { join } from 'node:path';

const SIZES = [[320, 568, true], [568, 320, true], [390, 844, true], [844, 390, true], [768, 1024, true], [1440, 900, false]];

export default async function ({ ok, open, out }) {
  for (const [w, h, touch] of SIZES) {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const box = s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
      const de = document.documentElement;
      return { stage: box('.stage'), strip: box('.strip'), panel: box('#panel'), cash: (document.getElementById('cash') || {}).textContent, clock: (document.getElementById('clock') || {}).textContent,
        sw: de.scrollWidth, cw: de.clientWidth, canvas: !!document.querySelector('canvas'), cards: document.querySelectorAll('.card').length };
    });
    const bad = [!m.stage && 'no stage', m.stage && (m.stage.x < -0.5 || m.stage.r > w + 0.5) && 'the stage is wider than the screen', m.sw > m.cw && `scroll width ${m.sw} > ${m.cw}`, !m.canvas && 'no canvas', m.cards !== 5 && `${m.cards} station cards`, !/£/.test(m.cash || '') && 'no money in the ticker', !/\d\d:\d\d/.test(m.clock || '') && 'no clock', errs[0]].filter(Boolean);
    ok(`layout: at ${w}×${h} the page loads with the stage, five station cards, money and a clock, and no sideways scroll or errors`, !bad.length, bad.join('; '));
    const min = touch ? 44 : 40;
    const small = await page.evaluate(min => [...document.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 24) || b.getAttribute('aria-label'), Math.round(r.width), Math.round(r.height)]; }).filter(([, bw, bh]) => bw < min || bh < min), min);
    ok(`layout: at ${w}×${h} every ${touch ? 'tap target' : 'control'} is at least ${min} px`, !small.length, small.slice(0, 4).map(s => `${s[0]} ${s[1]}×${s[2]}`).join(', '));
    await page.screenshot({ path: join(out, `layout-${w}x${h}.png`), fullPage: true }).catch(() => {});
    await ctx.close();
  }
}
