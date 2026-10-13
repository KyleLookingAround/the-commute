// The page at the six sizes the project notes name: 320×568, 568×320, 390×844, 844×390 (phones, touch), 768×1024 and
// 1440×900. At each: the page loads with no errors, the map fills the screen, the sheet is in view at its peek (portrait)
// or docked to the left (from 600 px wide or in landscape) with the strip (a card a station) in view, nothing scrolls
// sideways, every tap target is at least 44 px on touch (40 px otherwise), and the cash and clock show over the map. One page per size; a screenshot of each goes to build/check/ for a human to look at.
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

// a card for every station on the line, bought or not
const STATIONS = JSON.parse(readFileSync(new URL('../../src/data/network.json', import.meta.url), 'utf8')).stations.length;

const SIZES = [[320, 568, true], [568, 320, true], [390, 844, true], [844, 390, true], [768, 1024, true], [1440, 900, false]];

export default async function ({ ok, open, out }) {
  for (const [w, h, touch] of SIZES) {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const box = s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
      const de = document.documentElement;
      return { stage: box('.stage'), strip: box('.strip'), sheet: box('#sheet'), at: document.getElementById('sheet')?.dataset.at, cards1: box('#strip .card'), cash: (document.getElementById('cash') || {}).textContent, clock: (document.getElementById('clock') || {}).textContent,
        sw: de.scrollWidth, cw: de.clientWidth, canvas: !!document.querySelector('canvas'), cards: document.querySelectorAll('.card').length };
    });
    const docked = w >= 600 || w > h, inView = b => !!b && b.x >= -0.5 && b.y >= -0.5 && b.r <= w + 0.5 && b.b <= h + 0.5;
    const bad = [!m.stage && 'no stage', m.stage && (Math.abs(m.stage.x) > 0.5 || Math.abs(m.stage.y) > 0.5 || Math.abs(m.stage.r - w) > 0.5 || Math.abs(m.stage.b - h) > 0.5) && 'the map does not fill the screen',
      m.at !== (docked ? 'docked' : 'peek') && `the sheet is ${m.at}, not ${docked ? 'docked' : 'at its peek'}`, !inView(m.sheet) && 'the sheet is not in view', !inView(m.cards1) && "the strip's first card is not in view",
      !docked && m.sheet && m.sheet.h > h * 0.35 && `the peek covers ${Math.round(m.sheet.h)} px of ${h}`, m.sw > m.cw && `scroll width ${m.sw} > ${m.cw}`, !m.canvas && 'no canvas', m.cards !== STATIONS && `${m.cards} station cards, not ${STATIONS}`, !/£/.test(m.cash || '') && 'no money in the ticker', !/\d\d:\d\d/.test(m.clock || '') && 'no clock', errs[0]].filter(Boolean);
    ok(`layout: at ${w}×${h} the page loads with the map filling the screen, the sheet ${docked ? 'docked' : 'at its peek'} with a card for each station, money and a clock, and no sideways scroll or errors`, !bad.length, bad.join('; '));
    const min = touch ? 44 : 40;
    const small = await page.evaluate(min => [...document.querySelectorAll('button')].filter(b => b.getClientRects().length).map(b => { const r = b.getBoundingClientRect(); return [b.textContent.trim().slice(0, 24) || b.getAttribute('aria-label'), Math.round(r.width), Math.round(r.height)]; }).filter(([, bw, bh]) => bw < min || bh < min), min);
    ok(`layout: at ${w}×${h} every ${touch ? 'tap target' : 'control'} is at least ${min} px`, !small.length, small.slice(0, 4).map(s => `${s[0]} ${s[1]}×${s[2]}`).join(', '));
    await page.screenshot({ path: join(out, `layout-${w}x${h}.png`), fullPage: false }).catch(() => {});
    await ctx.close();
  }
}
