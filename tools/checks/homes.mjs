// Homes that grow on the map (window.__view.homes gives how many new buildings stand at each station and how many it
// has room for). A new game has none, and every station has room for some. A save whose homes have grown shows them
// at once, as many as the homes make (one for every 3 homes over the census catchment); a station whose homes pass the
// next building's mark while you watch raises it into place, settling within about a second. Screenshots of Heaton
// Chapel and Levenshulme grown, from above at midday, go to build/shots/homes-*.png. One phone page (320 px, touch) and
// one desktop page.
// Covers: @page @sim src/render/homes.ts src/render/world.ts src/render/buildings.ts
import { register } from 'tsx/esm/api';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ ok, open, root }) {
  register();
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim } = await import('../../src/sim/sim.ts');
  const HOMES_PER_PLOT = 3;   // src/render/homes.ts
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'))), sim = new Sim(net, Sim.halt(net, 1));
  const idx = id => net.stations.findIndex(s => s.id === id), [sp, hc, lv] = ['stockport', 'heaton-chapel', 'levenshulme'].map(idx);
  for (const i of [hc, lv]) { sim.grant(sim.P.station[i]); sim.g.homes[i] = sim.ceiling(i); }
  // Stockport a hair short of its tenth new building: it passes the mark in a moment at 1x
  sim.g.homes[sp] = net.stations[sp].catchment + 10 * HOMES_PER_PLOT - 0.002;
  const grown = JSON.stringify({ g: sim.g, selected: 1 }), a = net.stationFrame('heaton-chapel'), b = net.stationFrame('levenshulme');
  const shots = join(root, 'build/shots'); mkdirSync(shots, { recursive: true });
  for (const [w, h, touch, tag] of [[320, 568, true, 'phone'], [1280, 800, false, 'desktop']]) {
    const fresh = await open({ width: w, height: h }, { touch });
    await fresh.page.waitForTimeout(300);
    const h0 = await fresh.page.evaluate(() => window.__view?.homes?.());
    const bad0 = [!h0 && 'no homes on window.__view', h0 && h0.shown.some(n => n > 0) && 'a new game has new homes', h0 && h0.room.some(n => n < 5) && `a station has room for fewer than 5 (${h0.room})`, fresh.errs[0]].filter(Boolean);
    ok(`homes: at ${w}×${h} a new game has no new homes, and every station room for some`, !bad0.length, bad0.join('; ') + (h0 ? ` room ${h0.room}` : ''));
    await fresh.ctx.close();

    const { ctx, page: p, errs } = await open({ width: w, height: h }, { touch, save: grown, steady: 50 });
    // frame by frame (each frame at most 50 ms of the page's time, so a rise takes the same frames on a slow machine):
    // until Stockport's tenth stands, then until it settles, each with 60 s of real time to spare; settled is page time
    const seen = await p.evaluate(async () => {
      const frame = () => new Promise(r => requestAnimationFrame(r)), out = { first: window.__view.homes(), rose: 0 };
      let real = performance.now();
      while (window.__view.homes().shown[0] < 10 && performance.now() - real < 60000) { await frame(); out.rose = Math.max(out.rose, window.__view.homes().rising); }
      const t = window.__frameT; real = performance.now();
      while (window.__view.homes().rising && performance.now() - real < 60000) { out.rose = Math.max(out.rose, window.__view.homes().rising); await frame(); }
      out.end = window.__view.homes(); out.settled = (window.__frameT - t) / 1000; return out;
    });
    const full = i => Math.min(seen.first.room[i], Math.floor((sim.ceiling(i) - net.stations[i].catchment) / HOMES_PER_PLOT));
    const bad1 = [[hc, lv].some(i => seen.first.shown[i] !== full(i)) && `grown stations show ${seen.first.shown[hc]}, ${seen.first.shown[lv]} not ${full(hc)}, ${full(lv)}`,
      seen.first.rising !== 0 && 'a loaded save raised its homes rather than showing them', errs[0]].filter(Boolean);
    ok(`homes: at ${w}×${h} a save with grown homes shows them at once`, !bad1.length, bad1.join('; '));
    const bad2 = [seen.end.shown[sp] !== 10 && `Stockport shows ${seen.end.shown[sp]}, not 10`, !seen.rose && 'nothing rose', seen.end.rising !== 0 && 'still rising after a minute', seen.settled > 3 && `took ${seen.settled.toFixed(1)} s to settle, not under 3`].filter(Boolean);
    ok(`homes: at ${w}×${h} a building whose homes arrive while you watch rises into place`, !bad2.length, bad2.join('; '));
    // the camera over Levenshulme and the light at midday for the screenshot (the reload loads the page's own save)
    await ctx.addInitScript(([x, z]) => { window.__orbit = { tx: x, ty: 0, tz: z, r: 750, th: 5.5, ph: 0.75 }; window.__lockHour = 13; }, [b.x, b.z]);
    await p.reload(); await p.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1500); await p.screenshot({ path: join(shots, `homes-${tag}.png`) });
    await ctx.close();
  }
}
