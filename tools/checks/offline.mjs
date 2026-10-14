// Play offline (public/sw.js, registered by src/app/offline.ts, its file list written by the build in vite.config.ts).
// The worker is skipped on every other check's page (window.__seed set), so they always get the build on disk; this
// group opts in with window.__offline. It serves dist/ itself, so it can take the connection away for real by closing
// its server (Playwright's offline mode doesn't reach the worker's own fetches). One visit online, then offline:
// - the reload loads from the device, the game starts and runs, with no errors, and the settings sheet's quiet line
//   says it's ready offline;
// - a fine tile fetched online loads offline; one never seen fails quietly (the terrain keeps its base tiles).
// - nothing under design/ (the redesign's directions page) is in the worker's list.
// - A new build's worker installs while the game is open but waits, not taking over mid-game, and takes over on the
//   next load, its older cache gone. (The new build is faked by serving dist/sw.js with another stamp.)
// Covers: @page
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

export default async function ({ ok, root, url: shared, browser }) {
  const dist = join(root, 'dist'), base = new URL(shared).pathname;
  const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
  let worker = sw, sockets = new Set();
  // dist/ under the base path, as tools/check.mjs serves it, but with the worker's script swappable and a way to go offline
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    let p = path.startsWith(base) ? join(dist, normalize(path.slice(base.length) || 'index.html')) : '';
    if (p && existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!p.startsWith(dist) || !existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(p === join(dist, 'sw.js') ? worker : readFileSync(p));
  });
  server.on('connection', s => { sockets.add(s); s.on('close', () => sockets.delete(s)); });
  const listen = port => new Promise(r => server.listen(port, '127.0.0.1', r));
  const offline = () => new Promise(r => { server.close(r); server.closeIdleConnections?.(); for (const s of sockets) s.destroy(); });
  await listen(0); const port = server.address().port, url = `http://127.0.0.1:${port}${base}`;

  const stamp = (sw.match(/const STAMP = '([^']+)'/) || [])[1];
  const tiles = JSON.parse((sw.match(/const TILES = (\[.*?\]);/) || [, '[]'])[1]);
  ok('offline: the build fills in the worker\'s stamp and lists', stamp && stamp !== 'dev' && /const PRECACHE = \[.*"\.\/".*\]/.test(sw) && tiles.length > 1, `stamp ${stamp}, ${tiles.length} tiles`);
  const pre = JSON.parse((sw.match(/const PRECACHE = (\[.*?\]);/) || [, '[]'])[1]);
  ok('offline: the worker keeps nothing from the redesign\'s directions page (design/)', pre.length > 1 && !pre.some(f => /(^|\/)design\//.test(f)), pre.filter(f => /design\//.test(f)).slice(0, 3).join(', '));

  const ctx = await (await browser).newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => { window.__seed = 1; window.__offline = true; });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', c => { if (c.type() === 'error' && !/fonts\.(googleapis|gstatic)|net::|WebGL|GPU stall/.test(c.text())) errs.push(c.text()); });
  await page.goto(url);
  await page.waitForSelector('html[data-sim="ready"]', { timeout: 20000 }).catch(() => {});
  const seen = new Set(); page.on('requestfinished', r => { if (/\/assets\/[^/]+\.txt$/.test(r.url())) seen.add(r.url()); });
  const state = () => page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { controlled: !!navigator.serviceWorker.controller, waiting: !!r?.waiting, caches: await caches.keys(),
      note: !document.querySelector('#settings .set-offline')?.hidden };
  });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  // a tile seen online: one the terrain fetched, or one fetched now through the worker as the terrain would
  const tile = [...seen][0] || new URL(tiles[0], url).href;
  if (!seen.size) await page.evaluate(u => fetch(u).then(r => r.text()), tile);
  // one the terrain hasn't fetched, by what the worker kept
  const kept = await page.evaluate(() => caches.open('commute-tiles').then(c => c.keys()).then(k => k.map(r => r.url)));
  const unseen = tiles.map(t => new URL(t, url).href).find(t => !kept.includes(t));
  const s1 = await state();
  ok('offline: the first visit is kept on the device, and the settings sheet says so quietly', s1.controlled && s1.caches.includes('commute-' + stamp) && s1.note, JSON.stringify(s1));

  await offline();
  await page.reload();
  await page.waitForSelector('html[data-sim="ready"]', { timeout: 20000 }).catch(() => {});
  const clock = () => page.evaluate(() => document.getElementById('clock')?.textContent);
  const c0 = await clock(); await page.click('#sp10').catch(() => {}); await page.waitForTimeout(3000); const c1 = await clock();
  const ready = await page.evaluate(() => document.documentElement.dataset.sim === 'ready');
  ok('offline: with no connection the game loads from the device, starts and runs', ready && c0 && c1 && c0 !== c1, `clock ${c0} then ${c1}`);
  const got = await page.evaluate(async u => { try { const r = await fetch(u); return r.ok && (await r.text()).length > 0; } catch { return false; } }, tile);
  ok('offline: a fine tile seen online loads offline', got);
  const quiet = unseen ? await page.evaluate(async u => { try { const r = await fetch(u); return `got ${r.status}`; } catch { return true; } }, unseen) : false;
  ok('offline: a fine tile never seen fails offline (the terrain keeps its base tiles)', quiet === true, String(quiet));
  ok('offline: no errors', !errs.length, errs[0]);
  await listen(port);

  // a new build: its worker installs while the game is open and waits; it takes over on the next load
  try {
    worker = sw.replace(`const STAMP = '${stamp}'`, `const STAMP = '${stamp}-next'`);
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r?.update()));
    await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then(r => !!r?.waiting), null, { timeout: 20000, polling: 250 }).catch(() => {});
    await page.waitForTimeout(1500);
    const s2 = await state();
    ok('offline: a new build\'s worker waits while the game is open, not taking over mid-game', s2.waiting && s2.caches.includes('commute-' + stamp), JSON.stringify(s2));
    await page.reload();
    await page.waitForTimeout(500);
    await page.waitForSelector('html[data-sim="ready"]', { timeout: 20000 }).catch(() => {});
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
    const s3 = await state().catch(e => ({ error: String(e) }));
    ok('offline: it takes over on the next load, and the older build\'s cache goes', !s3.waiting && s3.controlled && s3.caches?.includes(`commute-${stamp}-next`) && !s3.caches?.includes('commute-' + stamp), JSON.stringify(s3));
  } finally { await ctx.close(); await offline(); }
}
