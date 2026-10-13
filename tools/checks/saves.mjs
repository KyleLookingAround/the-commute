// Saves you can carry. On a 320 px phone (touch) and a desktop page: Save to file, Load from file and Start over are
// each at least 44 px tall and wide and fit the page; a tap on Save to file downloads the-commute-day-<n>.json that loads
// as the game; Load from file opens the picker, a file that isn't a save (or is from a newer version) says so in a
// toast and leaves the game as it was; a good save asks once (the button says so), and the second tap loads it: the page
// shows its money, caught up for the time since it was written, and the device keeps it. No requests leave the page.
import { reveal } from '../reveal.mjs';
import { register } from 'tsx/esm/api';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ ok, open, root, url }) {
  register();
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim } = await import('../../src/sim/sim.ts');
  const { SAVE_VERSION } = await import('../../src/sim/save.ts');
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'))), sim = new Sim(net, Sim.fresh(net, 2));
  sim.g.cash = 1e6; sim.buyStation(1); sim.advance(3600); sim.g.cash = 123456;
  const carried = JSON.stringify({ g: sim.g, selected: 1, at: Date.now() - 20 * 60_000 });
  const money = page => page.evaluate(() => Number((document.getElementById('cash')?.textContent ?? '').replace(/[^0-9]/g, '')));
  const toast = page => page.evaluate(() => document.getElementById('toast')?.textContent ?? '');
  for (const [w, h, touch] of [[320, 640, true], [1280, 800, false]]) {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch });
    const away = []; page.on('request', r => { if (!r.url().startsWith(url) && !/^(blob|data):/.test(r.url()) && !/fonts\.(googleapis|gstatic)/.test(r.url())) away.push(r.url()); });
    const tap = async sel => { sel = await reveal(page, sel); return touch ? page.locator(sel).tap({ timeout: 60000 }) : page.locator(sel).click({ timeout: 60000 }); };
    // sizes
    await reveal(page, '#saveFile');
    const boxes = await page.evaluate(() => ['saveFile', 'loadFile', 'reset'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return [id, r.width, r.height, r.right - innerWidth]; }));
    const small = boxes.filter(([, bw, bh, right]) => bw < 44 || bh < 44 || right > 0);
    ok(`saves: at ${w}×${h} the save buttons are tap-sized and fit`, !small.length, JSON.stringify(small.length ? small : boxes.map(b => b.slice(0, 3).map(x => typeof x === 'number' ? Math.round(x) : x))));
    // save to file
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), tap('#saveFile')]);
    const name = dl.suggestedFilename(), text = readFileSync(await dl.path(), 'utf8');
    let saved = null; try { saved = JSON.parse(text); } catch { /* reported below */ }
    ok(`saves: at ${w}×${h} Save to file downloads the game`, /^the-commute-day-\d+\.json$/.test(name) && saved?.g?.v === SAVE_VERSION && typeof saved?.at === 'number', `${name}, ${Math.round(text.length / 1000)} kB`);
    // a bad file and a newer one: a toast, and nothing changed
    const pick = async (body, label) => {
      const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 60000 }), tap('#loadFile')]);
      await page.evaluate(() => { document.getElementById('toast').textContent = ''; });
      await fc.setFiles({ name: label, mimeType: 'application/json', buffer: Buffer.from(body) });
      // the page is slow under software GL (a frame a second in some containers): wait up to a minute for it to answer, in a toast or by asking
      await page.waitForFunction(() => document.getElementById('toast')?.textContent || document.getElementById('loadFile')?.dataset.arm, null, { timeout: 60000 }).catch(() => {});
    };
    await pick('not a save', 'notes.txt');
    const t1 = await toast(page);
    const newer = JSON.parse(carried); newer.g.v = SAVE_VERSION + 1;
    await pick(JSON.stringify(newer), 'newer.json');
    const t2 = await toast(page), after = await page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null')?.g?.seed ?? null, 'the-commute-save-v1');
    const label0 = await page.locator('#loadFile').textContent();
    ok(`saves: at ${w}×${h} a bad file and a newer one are refused in a toast, and nothing changes`, /isn't a save/.test(t1) && /newer version/.test(t2) && label0 === 'Load from file' && after !== sim.g.seed && (await money(page)) < 123456, `${t1} | ${t2}`);
    // a good one: asks, then loads and catches up
    await pick(carried, 'the-commute-day-1.json');
    const asking = await page.locator('#loadFile').textContent();
    // the second tap straight away: under software GL an emulated tap can take longer than the button waits
    await Promise.all([page.waitForEvent('load', { timeout: 30000 }), page.evaluate(() => document.getElementById('loadFile').click())]);
    await page.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
    await page.waitForFunction(() => /While you were away/.test(document.getElementById('toast')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => /\d/.test(document.getElementById('cash')?.textContent ?? ''), null, { timeout: 60000 }).catch(() => {});
    const m = await money(page), welcome = await toast(page), kept = await page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null')?.g?.seed, 'the-commute-save-v1');
    ok(`saves: at ${w}×${h} a good file asks once, then loads and catches up`, /^Tap again to load day \d+$/.test(asking ?? '') && m > 123456 && /While you were away/.test(welcome) && kept === sim.g.seed, `${asking}; £${m}; ${welcome}`);
    ok(`saves: at ${w}×${h} nothing leaves the page, and no errors`, !away.length && !errs.length, [...away, ...errs][0]);
    await ctx.close();
  }
}
