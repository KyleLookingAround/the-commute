// Performance on a phone (docs/DESIGN.md, Performance): three views at 390 × 844 on a touch screen, under four times CPU
// throttling: the opening (a new game at Stockport), the busy save at Stockport (src/app/busy.ts: five stations owned
// with every upgrade, the line built up, homes grown, the morning peak, rain) and the busy save at the whole line
// (Whole line, the widest view). Each logs what its frame draws (draw calls, triangles, geometries, textures, shader
// programs, meshes and shadow casters, from renderer.info through window.__view.perf), when the first frame was
// drawn, and the script time a frame takes in the sim, the view's sync and the draw over a few frames. The draw calls
// and triangles are only what that frame drew at that view: renderer.info counts each object as it's drawn, after
// the camera's frustum (and, for the shadows, the sun's shadow camera's) has culled what's off it, and every square
// of buildings and trees is loaded first, so it's the most that view draws, not the whole map. The script the page
// loads before its first frame is measured from dist/. It fails only on clear budgets (BUDGET), so it catches a
// regression without flaking on a slow machine: frame times are logged, never judged, since a software-rendered
// container is no guide to a phone's. The budgets are to be set from a real phone's figures (the stats view).
// - What one view loads: a fresh page at the opening, and at the Buxton and Marple lines framed (their stations out
//   beyond today's line in view), counts every file it fetches after its first frame until nothing more comes for
//   a few seconds: the bytes as served here, uncompressed, so a player on a compressing host downloads less. Each view
//   has a budget (BUDGET.view), what a player pays for one look round.
// - The stats view: ?stats shows its overlay with figures, from a file not loaded before the first frame; Copy gives
//   one line of them; ?stats&save=busy opens the busy save without writing over the game on the device.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { register } from 'tsx/esm/api';

const BUDGET = {
  entryKB: 450,            // gzipped script loaded before the first frame (the entry chunk and what it imports at once)
  // draw calls and triangles a frame at each view, shadows included (open and busy as before the stats view; wide set
  // above what it drew when it was added, until a real phone's figures come in)
  calls: { open: 450, busy: 800, wide: 800 },
  triangles: { open: 450000, busy: 550000, wide: 550000 },
  geometries: 400, textures: 16, programs: 40,
  // MB fetched after the first frame at one view, uncompressed (set above what each fetched when it was added)
  view: { open: 0, buxton: 0, marple: 0 },
};
const FRAMES = 6;   // frames to time on each page

export default async function ({ ok, open, root, url, SAVE_KEY, browser }) {
  register();
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim } = await import('../../src/sim/sim.ts');
  const { busySave } = await import('../../src/app/busy.ts');

  // the script the page loads before it can draw: the entry and its static imports, from dist/index.html
  const dist = join(root, 'dist'), html = readFileSync(join(dist, 'index.html'), 'utf8');
  const first = [...html.matchAll(/(?:src|href)="[^"]*?(assets\/[^"]+\.js)"/g)].map(m => m[1]);
  const all = readdirSync(join(dist, 'assets')).filter(f => f.endsWith('.js'));
  const kb = f => gzipSync(readFileSync(join(dist, f))).length / 1024;
  const entryKB = first.reduce((n, f) => n + kb(f), 0), restKB = all.filter(f => !first.includes('assets/' + f)).reduce((n, f) => n + kb('assets/' + f), 0);
  ok('perf: the script before the first frame is inside its budget', entryKB <= BUDGET.entryKB,
    `${entryKB.toFixed(0)} KB gzipped before the first frame (${first.length} file${first.length > 1 ? 's' : ''}), ${restKB.toFixed(0)} KB later; budget ${BUDGET.entryKB} KB`);

  // the busy save, as the stats view opens it
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'))), busy = busySave(net);

  const NAME = { open: 'the opening', busy: 'the busy save', wide: 'the busy save at the whole line' };
  for (const [save, views] of [[null, ['open']], [busy, ['busy', 'wide']]]) {
    const { ctx, page, errs } = await open({ width: 390, height: 844 }, { touch: true, save, steady: 50 });
    // every square of real buildings and trees in first, so the count is the most the page draws at each view, not
    // what has happened to load by now
    await page.evaluate(() => window.__view.loadBuildings?.());
    const cdp = await ctx.newCDPSession(page);
    for (const tag of views) {
      // the whole line: Whole line with reduced motion, so the camera is there at once
      if (tag === 'wide') { await page.emulateMedia({ reducedMotion: 'reduce' }); await page.evaluate(() => document.getElementById('vLine').click()); }
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      // let it settle (the rises, the weather easing in), then time FRAMES frames
      const r = await page.evaluate(async n => {
        const frame = () => new Promise(res => requestAnimationFrame(res));
        for (let k = 0; k < 4; k++) await frame();
        const a = window.__view.perf(), w0 = performance.now();
        for (let k = 0; k < n; k++) await frame();
        const b = window.__view.perf(), f = b.frames - a.frames || 1;
        return { ...b, r: window.__view.camera().r, wall: (performance.now() - w0) / n, sim: (b.sim - a.sim) / f, sync: (b.sync - a.sync) / f, draw: (b.draw - a.draw) / f };
      }, FRAMES);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      const ms = x => x.toFixed(1);
      console.log(`      ${tag} (${r.r.toFixed(0)} m out): ${r.calls} calls, ${r.triangles} triangles, ${r.geometries} geometries, ${r.textures} textures, ${r.programs} programs, ${r.meshes} meshes (${r.casters} cast shadows); first frame at ${ms(r.first)} ms; a frame ${ms(r.wall)} ms (script: sim ${ms(r.sim)}, sync ${ms(r.sync)}, draw ${ms(r.draw)})`);
      const over = [
        tag === 'wide' && r.r < 4000 && `the camera is only ${r.r.toFixed(0)} m out`,
        BUDGET.calls[tag] && r.calls > BUDGET.calls[tag] && `${r.calls} calls, budget ${BUDGET.calls[tag]}`,
        BUDGET.triangles[tag] && r.triangles > BUDGET.triangles[tag] && `${r.triangles} triangles, budget ${BUDGET.triangles[tag]}`,
        BUDGET.geometries && r.geometries > BUDGET.geometries && `${r.geometries} geometries, budget ${BUDGET.geometries}`,
        BUDGET.textures && r.textures > BUDGET.textures && `${r.textures} textures, budget ${BUDGET.textures}`,
        BUDGET.programs && r.programs > BUDGET.programs && `${r.programs} programs, budget ${BUDGET.programs}`,
        errs[0],
      ].filter(Boolean);
      ok(`perf: ${NAME[tag]} at 390×844 draws inside its budgets`, !over.length, over.join('; '));
    }
    await ctx.close();
  }

  // what one view loads after its first frame, each from a fresh page with nothing cached
  {
    const frameOf = ids => {
      const xz = ids.map(id => net.stationFrame(id)), xs = xz.map(f => f.x), zs = xz.map(f => f.z);
      const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
      return { tx: (Math.max(...xs) + Math.min(...xs)) / 2, ty: 2, tz: (Math.max(...zs) + Math.min(...zs)) / 2, r: Math.max(800, span * 1.3), th: 5.5, ph: 0.9 };
    };
    const VIEWS = { open: null, buxton: frameOf(['middlewood', 'disley', 'new-mills-newtown']), marple: frameOf(['brinnington', 'bredbury', 'romiley', 'marple', 'rose-hill']) };
    for (const [tag, orbit] of Object.entries(VIEWS)) {
      const ctx = await (await browser).newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
      await ctx.addInitScript(([o]) => { window.__seed = 1; if (o) window.__orbit = o; }, [orbit]);
      const page = await ctx.newPage(), errs = [];
      page.on('pageerror', e => errs.push(e.message));
      await page.goto(url); await page.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
      // until no new file for 5 s (the camera's squares and tiles come in as frames are drawn), two minutes at most
      const got = await page.evaluate(async () => {
        const n = () => performance.getEntriesByType('resource').length, t0 = performance.now();
        let last = n(), since = performance.now();
        while (performance.now() - since < 5000 && performance.now() - t0 < 120000) { await new Promise(r => setTimeout(r, 500)); if (n() !== last) { last = n(); since = performance.now(); } }
        const first = window.__view.perf().first, after = performance.getEntriesByType('resource').filter(r => r.startTime >= first);
        const kind = r => /\.txt$/.test(r.name) ? 'tiles' : /\.js$/.test(r.name) ? 'script' : /\.json$/.test(r.name) ? 'data' : 'other';
        const by = {}; for (const r of after) by[kind(r)] = (by[kind(r)] ?? 0) + (r.encodedBodySize || r.transferSize || 0);
        return { files: after.length, bytes: after.reduce((a, r) => a + (r.encodedBodySize || r.transferSize || 0), 0), by, first };
      });
      const mb = n => (n / 1048576).toFixed(2), budget = BUDGET.view[tag];
      ok(`perf: ${tag === 'open' ? 'the opening' : `the ${tag === 'buxton' ? 'Buxton' : 'Marple'} line framed`} loads inside its budget after the first frame (${mb(got.bytes)} of ${budget} MB)`,
        got.bytes <= budget * 1048576 && !errs.length, `${got.files} files: ${Object.entries(got.by).map(([k, v]) => `${k} ${mb(v)} MB`).join(', ')}${orbit ? `; camera ${orbit.r.toFixed(0)} m out` : ''}${errs.length ? '; ' + errs[0] : ''}`);
      await ctx.close();
    }
  }

  // the stats view: its own file, not loaded before the first frame; on ?stats&save=busy the overlay's figures, Copy's
  // one line, and the busy save open in place of the device's game without writing over it
  {
    const statsFile = all.find(f => /^stats-.*\.js$/.test(f));
    ok('perf: the stats view is its own file, not loaded before the first frame', statsFile && !first.includes('assets/' + statsFile), statsFile ?? 'no stats-*.js in dist/assets');
    const mine = JSON.stringify({ g: Sim.fresh(net, 1), selected: 0 });
    const { ctx, page, errs } = await open({ width: 320, height: 640 }, { touch: true, save: mine });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(url + '?stats&save=busy'); await page.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
    const shown = await page.waitForFunction(() => /\d+ fps[\s\S]*\d+k? triangles · \d+ calls/.test(document.querySelector('.perf-hud pre')?.textContent ?? ''), null, { timeout: 60000 }).then(() => true, () => false);
    const owned = await page.evaluate(() => window.__view.contract().owned);
    const box = await page.evaluate(() => { const r = document.querySelector('.perf-hud').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, text: document.querySelector('.perf-hud pre').textContent }; });
    const b = await page.evaluate(() => { const r = document.querySelector('.perf-hud button').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.touchscreen.tap(...b);
    const copied = await page.waitForFunction(() => /Copied|Select/.test(document.querySelector('.perf-hud button').textContent), null, { timeout: 10000 }).then(() => true, () => false);
    const line = await page.evaluate(async () => document.querySelector('.perf-hud button').textContent === 'Copied' ? navigator.clipboard.readText() : document.querySelector('.perf-hud pre').textContent);
    // anything the busy game writes to the save is dropped: the device's own game is there on the next plain load
    await page.evaluate(k => localStorage.setItem(k, '{}'), SAVE_KEY);
    await page.goto(url); await page.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
    const after = await page.evaluate(() => ({ owned: window.__view.contract().owned, stats: !!document.querySelector('.perf-hud') }));
    ok('perf: ?stats&save=busy shows the stats view over the busy save, inside a 320 px screen', shown && owned === 5 && box.l >= 0 && box.r <= 320 && box.b <= 640,
      `${shown ? 'figures shown' : 'no figures'}; ${owned} stations owned; overlay ${box.l.toFixed(0)}–${box.r.toFixed(0)} × ${box.t.toFixed(0)}–${box.b.toFixed(0)}: ${JSON.stringify(box.text)}`);
    ok('perf: the stats view\'s Copy gives one line of its figures', copied && /^commute stats · busy · 320×640@2 · \d+ fps · slowest \d+ ms · \d+ triangles · \d+ calls · \d+ geometries · \d+ textures · /.test(line) && !line.includes('\n'), JSON.stringify(line));
    ok('perf: the busy save leaves the game on the device as it was, and a plain load shows no stats view', after.owned === JSON.parse(mine).g.owned.filter(Boolean).length && !after.stats && !errs.length,
      `${after.owned} stations owned after${after.stats ? '; the stats view still shown' : ''}${errs.length ? '; ' + errs[0] : ''}`);
    await ctx.close();
  }
}
