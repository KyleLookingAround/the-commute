// Contrast, type size and tap targets (docs/design/redesign.md). From the tokens in src/ui/styles/tokens.css: text
// (ink, soft, locked, accent, ok) at 4.5:1 or more on the surface, the cards and the page, the accent's ink on the
// accent, and borders (--line) at 3:1 on the surface, the cards and the page. On the page at 320×568 (touch) and
// 1440×900, with settings open too: no text shown under 12 px, and on the phone every control at least 44 px (the
// strip's slider aside: it's dragged along its whole width, never tapped).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lum = hex => {
  const n = hex.replace('#', ''), v = n.length === 3 ? [...n].map(c => parseInt(c + c, 16)) : [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16));
  const [r, g, b] = v.map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

export default async function ({ ok, open, root }) {
  const css = readFileSync(join(root, 'src/ui/styles/tokens.css'), 'utf8'), tok = {};
  for (const m of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)) if (!(m[1] in tok)) tok[m[1]] = m[2];
  const grounds = ['surface', 'card', 'bg'], short = [];
  for (const t of ['ink', 'soft', 'lock', 'accent', 'ok']) for (const g of grounds) { const r = ratio(tok[t], tok[g]); if (!(r >= 4.5)) short.push(`--${t} on --${g} ${r.toFixed(2)}:1`); }
  { const r = ratio(tok['accent-ink'], tok.accent); if (!(r >= 4.5)) short.push(`--accent-ink on --accent ${r.toFixed(2)}:1`); }
  ok('contrast: text tokens are at least 4.5:1 on the surface, the cards and the page', !short.length, short.join(', '));
  const thin = grounds.map(g => [g, ratio(tok.line, tok[g])]).filter(([, r]) => !(r >= 3)).map(([g, r]) => `--line on --${g} ${r.toFixed(2)}:1`);
  ok('contrast: borders (--line) are at least 3:1 on the surface, the cards and the page', !thin.length, thin.join(', '));

  for (const [w, h, touch] of [[320, 568, true], [1440, 900, false]]) {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch });
    await page.waitForTimeout(600);
    const scan = () => page.evaluate(touch => {
      const tiny = [], small = [];
      for (const e of document.querySelectorAll('body *')) {
        if (!e.getClientRects().length || e.closest('[hidden]')) continue;
        const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (own && fs < 12) tiny.push(`${e.tagName.toLowerCase()}.${e.className} ${fs}px "${e.textContent.trim().slice(0, 16)}"`);
        if (touch && e.matches('button, input[type=range], select') && !e.matches('.pick-file, #glide')) {
          const r = e.getBoundingClientRect(); if (r.width < 44 || r.height < 44) small.push(`${e.id || e.textContent.trim().slice(0, 16) || e.getAttribute('aria-label')} ${Math.round(r.width)}×${Math.round(r.height)}`);
        }
      }
      return { tiny, small };
    }, touch);
    const a = await scan();
    await page.evaluate(() => document.getElementById('vSet')?.click()); await page.waitForTimeout(300);
    const b = await scan();
    const tiny = [...new Set([...a.tiny, ...b.tiny])], small = [...new Set([...a.small, ...b.small])];
    ok(`contrast: at ${w}×${h} no text is under 12 px, the settings sheet included`, !tiny.length && !errs.length, tiny.slice(0, 4).join('; ') + (errs[0] ?? ''));
    if (touch) ok(`contrast: at ${w}×${h} every control is at least 44 px, the settings sheet included`, !small.length, small.slice(0, 5).join('; '));
    await ctx.close();
  }
}
