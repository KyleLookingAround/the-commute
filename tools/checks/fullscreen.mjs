// Full screen and the home screen. Where the browser has full screen, the button in settings (under Screen) shows, puts
// the whole page in full screen and takes it out again, its label saying which; where it hasn't (Safari on iPhone,
// faked here), the button and its section are hidden, not greyed. The page links a valid web app manifest (names, start URL, display, the tokens'
// colours, icons that load at their stated sizes) and the meta tags iOS reads for the home screen.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ ok, open, root, url, browser }) {
  const bg = readFileSync(join(root, 'src/ui/styles/tokens.css'), 'utf8').match(/--bg:(#[0-9a-f]{6})/i)[1].toLowerCase();

  const { ctx, page, errs } = await open({ width: 1280, height: 800 });
  await page.click('#vSet'); await page.waitForTimeout(300);
  const label = () => page.evaluate(() => { const b = document.getElementById('vFull'); return b && b.getClientRects().length ? b.getAttribute('aria-label') : null; });
  const before = await label();
  ok('fullscreen: the button shows in settings, under Screen, where the browser has full screen', before === 'Full screen', `label ${before}`);
  await page.click('#vFull'); await page.waitForTimeout(400);
  const on = await page.evaluate(() => document.fullscreenElement === document.documentElement);
  const onLabel = await label();
  ok('fullscreen: a tap puts the whole page in full screen and the button says how to leave', on && onLabel === 'Leave full screen', `full screen ${on}, label ${onLabel}`);
  await page.click('#vFull'); await page.waitForTimeout(400);
  const off = await page.evaluate(() => !document.fullscreenElement);
  ok('fullscreen: a second tap takes it out again', off && await label() === 'Full screen');
  await page.evaluate(() => document.documentElement.requestFullscreen()); await page.waitForTimeout(300);
  await page.evaluate(() => document.exitFullscreen()); await page.waitForTimeout(300);
  ok('fullscreen: leaving another way (Esc, the system) puts the button back', await label() === 'Full screen');

  // the manifest and the home screen tags
  const head = await page.evaluate(() => ({
    manifest: document.querySelector('link[rel="manifest"]')?.href, touchIcon: document.querySelector('link[rel="apple-touch-icon"]')?.href,
    capable: document.querySelector('meta[name="apple-mobile-web-app-capable"]')?.content, theme: document.querySelector('meta[name="theme-color"]')?.content,
    viewport: document.querySelector('meta[name="viewport"]')?.content }));
  let m = null, why = '';
  if (head.manifest) { const r = await page.request.get(head.manifest); try { m = await r.json(); } catch (e) { why = 'the manifest is not JSON'; } }
  else why = 'no manifest link';
  const icons = [];
  if (m) for (const i of m.icons || []) {
    const src = new URL(i.src, head.manifest).href;
    const size = await page.evaluate(src => new Promise(res => { const im = new Image(); im.onload = () => res(`${im.naturalWidth}x${im.naturalHeight}`); im.onerror = () => res(null); im.src = src; }), src);
    icons.push([i.src, i.sizes, size]);
  }
  const bad = m ? [
    !m.name && 'no name', !m.short_name && 'no short name', !m.start_url && 'no start URL',
    m.display !== 'fullscreen' && `display ${m.display}`, !(m.display_override || []).includes('standalone') && 'no standalone fallback',
    !['any', undefined].includes(m.orientation) && `orientation ${m.orientation}`,
    (m.theme_color || '').toLowerCase() !== bg && `theme colour ${m.theme_color}, not ${bg}`, (m.background_color || '').toLowerCase() !== bg && `background ${m.background_color}, not ${bg}`,
    (head.theme || '').toLowerCase() !== bg && `theme-color meta ${head.theme}`,
    !icons.some(([, s]) => s === '512x512') && 'no 512 px icon', !icons.some(([, s]) => s === '192x192') && 'no 192 px icon',
    ...icons.filter(([, s, got]) => !got || (s !== 'any' && s !== got)).map(([src, s, got]) => `${src} is ${got}, not ${s}`),
  ].filter(Boolean) : [why];
  ok('fullscreen: the page links a valid web app manifest in the tokens\' colours, with icons that load at their sizes', !bad.length, bad.join('; '));
  const touch = head.touchIcon ? (await page.request.get(head.touchIcon)).ok() : false;
  ok('fullscreen: iOS gets a home screen icon, opens without the browser\'s bars, and the page reaches into the safe areas', touch && head.capable === 'yes' && /viewport-fit=cover/.test(head.viewport || ''));
  ok('fullscreen: no errors', !errs.length, errs[0]);
  await ctx.close();

  // a browser with no full screen for a page, as Safari on iPhone: the button is hidden, not greyed
  const ctx3 = await (await browser).newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx3.addInitScript(() => {
    window.__seed = 1;
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false });
    Element.prototype.requestFullscreen = undefined;
  });
  const p3 = await ctx3.newPage(); await p3.goto(url);
  await p3.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
  await p3.evaluate(() => document.getElementById('vSet').click()); await p3.waitForTimeout(300);
  const hidden = await p3.evaluate(() => { const b = document.getElementById('vFull'); return !!b && b.hidden && !b.getClientRects().length && !!b.closest('section')?.hidden; });
  ok('fullscreen: where the browser has no full screen for a page, the button and its section are hidden', hidden);
  await ctx3.close();
}
