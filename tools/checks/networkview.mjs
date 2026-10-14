// The network view at wide zoom (src/render/networkview.ts; docs/DESIGN.md, The network view). Without a browser: the
// view reading the sim a few times a second changes nothing in the game (two runs of the bot's first 4 sim hours on one
// seed, one with the view following it, end the same). In the browser, from the bot's game on seed 1 at day 6's morning
// peak, at 320 px (touch) and on a desktop: the view's script is fetched after the first frame; at Whole line it has
// faded in, the clouds have faded out, each running service's line is drawn, the trains show coloured by how full
// (some busy or full at the peak) and the owned stations' rings are sized by who's waiting; a tap on Stockport's ring
// opens its card; with Strain on its glows still show; and close in at a station the view is hidden and the clouds are
// back. Screenshots go to build/shots/networkview-*.png. No errors.
// Covers: @page @sim src/render/networkview.ts src/render/camera.ts
import { register } from 'tsx/esm/api';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/** The bot's game on a seed up to a game day and hour, as a save's JSON text (no time away). */
export async function botSave(root, seed = 1, day = 6, hour = 8.15) {
  register();
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim } = await import('../../src/sim/sim.ts');
  const { simAtHour } = await import('../../src/sim/day.ts');
  const { act } = await import('../bot.mjs');
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')));
  const sim = new Sim(net, Sim.fresh(net, seed)), end = simAtHour(day, hour);
  while (sim.g.t < end) { sim.advance(60); for (let k = 0; k < 5 && act(sim); k++); }
  return { sim, net, save: JSON.stringify({ g: sim.g, selected: 0 }) };
}

export default async function ({ ok, open, root }) {
  register();
  const THREE = await import('three');
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim } = await import('../../src/sim/sim.ts');
  const { NetworkView } = await import('../../src/render/networkview.ts');
  const { act } = await import('../bot.mjs');
  const shots = join(root, 'build/shots'); mkdirSync(shots, { recursive: true });
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')));

  // following the game changes nothing in it
  const canvas = { clientWidth: 390, clientHeight: 844, getBoundingClientRect: () => ({ left: 0, top: 0, width: 390, height: 844 }) };
  const run = drawn => {
    const sim = new Sim(net, Sim.fresh(net, 2)), cam = new THREE.PerspectiveCamera(50, 390 / 844, 1, 1e5);
    cam.position.set(0, 15000, 8000); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const v = drawn ? new NetworkView({ scene: new THREE.Scene(), net, camera: cam, canvas, reduced: false, stations: net.stations.map(st => { const f = net.stationFrame(st.id); return [f.x, f.z, 0]; }) }) : null;
    for (let k = 0; k < 4 * 60; k++) { sim.advance(60); act(sim); if (v) { for (let j = 0; j < 4; j++) v.update(sim, 20000, 0.25); v.stats(sim); v.pick(195, 400); } }
    return createHash('sha256').update(JSON.stringify(sim.g)).digest('hex').slice(0, 12);
  };
  const [plain, viewed] = [run(false), run(true)];
  ok('networkview: following the game changes nothing in it (PLAY stays as it is)', plain === viewed, `${plain} ${viewed}`);

  const { save } = await botSave(root);
  for (const [w, h, touch, tag] of [[320, 568, true, 'phone'], [1280, 800, false, 'desktop']]) {
    const { ctx, page: p, errs } = await open({ width: w, height: h }, { touch, save, steady: 100 });
    // the view's script comes after the first frame: reload, noting when it's asked for
    let asked = 0; p.on('request', q => { if (/networkview-[^/]*\.js/.test(q.url())) asked = Date.now(); });
    await ctx.addInitScript(() => { window.__lockHour = 11; });
    await p.reload(); await p.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
    await p.waitForFunction(() => !!window.__view.network?.(), null, { timeout: 30000 }).catch(() => {});
    const first = await p.evaluate(() => performance.timeOrigin + (window.__view.perf?.().first ?? 0));
    const tap = async at => { if (touch) await p.touchscreen.tap(at[0], at[1]); else await p.mouse.click(at[0], at[1]); };
    await tap(await p.evaluate(() => { const b = document.getElementById('vLine').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }));
    await p.waitForFunction(() => { const n = window.__view.network?.(); return n && n.fade > 0.99 && !window.__view.camera().flying; }, null, { timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(800);
    const n = await p.evaluate(() => ({ ...window.__view.network(), r: window.__view.camera().r, owned: window.__view.contract().owned }));
    await p.screenshot({ path: join(shots, `networkview-${tag}.png`) });
    const ownedRings = n.rings.filter(r => r > 4.5);
    const bad1 = [!asked && "the view's script was never fetched", asked && asked < first - 50 && "the view's script was fetched before the first frame",
      !(n.fade > 0.99) && `at Whole line (r ${Math.round(n.r)}) it's ${n.fade} faded in`, n.clouds > 0.01 && `the clouds still show (${n.clouds})`,
      n.lines.length < 3 && `only ${n.lines.join(', ')} drawn`, !n.lines.includes('stopper') && "the stopper's line isn't drawn",
      n.trains < 3 && `${n.trains} trains`, n.busy + n.full < 1 && 'no train busy or full at the peak',
      ownedRings.length !== n.owned && `${ownedRings.length} rings for ${n.owned} stations owned`, !(Math.max(...n.rings) > 12) && `the biggest ring is ${Math.max(...n.rings)} px`, errs[0]].filter(Boolean);
    ok(`networkview: at ${w}×${h} Whole line shows the services, the trains by how full and the stations by who's waiting, the clouds gone`, !bad1.length, bad1.join('; ') + ` ${JSON.stringify({ lines: n.lines, trains: n.trains, busy: n.busy, full: n.full })}`);

    // a tap on Stockport's ring opens its card
    await p.evaluate(() => document.getElementById('vLine')?.blur());
    const at = n.at[0];
    if (at) await tap(at);
    await p.waitForFunction(() => document.getElementById('panel')?.dataset.place === 'station:stockport', null, { timeout: 15000 }).catch(() => {});
    const place = await p.evaluate(() => document.getElementById('panel')?.dataset.place);
    ok(`networkview: at ${w}×${h} a tap on Stockport's ring opens its card`, place === 'station:stockport', `${JSON.stringify(at)} opened ${place}`);

    // Strain on at wide zoom: its glows still show under the view (the card back down to its peek first, off the buttons)
    await p.evaluate(() => { const s = document.getElementById('sheet'); if (s?.dataset.at !== 'peek' && s?.dataset.at !== 'docked') document.getElementById('sheetHandle')?.click(); });
    await p.waitForFunction(() => ['peek', 'docked'].includes(document.getElementById('sheet')?.dataset.at ?? ''), null, { timeout: 10000 }).catch(() => {});
    await tap(await p.evaluate(() => { const b = document.getElementById('vLine').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }));
    await p.waitForFunction(() => { const n = window.__view.network?.(); return n && n.fade > 0.99 && !window.__view.camera().flying; }, null, { timeout: 60000 }).catch(() => {});
    await tap(await p.evaluate(() => { const b = document.getElementById('vStrain').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }));
    await p.waitForFunction(() => (window.__view.strain?.()?.spots ?? []).length > 0, null, { timeout: 60000 }).catch(() => {});
    const s = await p.evaluate(() => ({ spots: window.__view.strain?.()?.spots ?? [], fade: window.__view.network?.()?.fade }));
    await p.screenshot({ path: join(shots, `networkview-strain-${tag}.png`) });
    ok(`networkview: at ${w}×${h} Strain's glows still show at wide zoom, at least 40 px`, s.spots.length > 0 && s.fade > 0.99 && s.spots.every(g => g.w >= 39.5), `${s.spots.length} glows, fade ${s.fade}`);
    await tap(await p.evaluate(() => { const b = document.getElementById('vStrain').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }));

    // close in at a station: hidden, and the clouds are back
    await p.evaluate(() => window.__view.look({ r: 230, ph: 1.2 }));
    await p.waitForFunction(() => { const n = window.__view.network?.(); return n && !n.shown; }, null, { timeout: 30000 }).catch(() => {});
    const near = await p.evaluate(() => window.__view.network());
    ok(`networkview: at ${w}×${h} close in the view is hidden and the clouds are back`, !near.shown && near.fade === 0 && near.clouds > 0.99, JSON.stringify({ shown: near.shown, fade: near.fade, clouds: near.clouds }));
    ok(`networkview: at ${w}×${h} no errors`, !errs.length, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }
}
