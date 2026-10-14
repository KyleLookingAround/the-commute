// Gridlock on the map (docs/design/gridlock.md §3; src/render/traffic.ts draws the sim's roads, src/sim/traffic.ts).
// Without a browser: drawing the roads changes nothing in the game (two runs of 6 sim hours on one seed, one with the
// layer itself reading and placing its cars every step as the page does, end the same), and the script before the
// first frame doesn't carry it (the stretches' data and the layer are in their own chunk). In the browser:
// - At today's opening (06:30, the roads under capacity) the cars move, none queued, no brake lights, and the roads
//   aren't washed.
// - The opening's morning peak (08:00 on day 1): at the M60 under the town and the A6 crossing it, the cars queue nose
//   to tail with their brake lights lit, at most 300 of them, the A6 at Mersey Square past capacity, and the roads
//   washed amber and coral; at 320 px (touch) the same, within the cap.
// - The main line to Piccadilly with everything bought, at the same hour and the same view: the A6's stretches read
//   lower, its wash has fewer coral cells and fewer cars stand queued on it.
// - Reduced motion: the cars stand still and the wash is in at once. On Low (Fewer figures) at most 120 cars.
// - No errors. Screenshots go to build/shots/traffic-*.png.
import { register } from 'tsx/esm/api';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export default async function ({ ok, open, root }) {
  register();
  globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
  const THREE = await import('three');
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim } = await import('../../src/sim/sim.ts');
  const { TrafficLayer } = await import('../../src/render/traffic.ts');
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def);
  const shots = join(root, 'build/shots'); mkdirSync(shots, { recursive: true });

  // drawing changes nothing: the same seed and buys, one run drawn as the page draws it
  const run = draw => {
    const sim = new Sim(net, Sim.halt(net, 2)); sim.g.cash = 1e6;
    sim.buyUpgrade(0, 'crossing'); sim.buy(sim.P.station[net.station('heaton-chapel').index]);
    const L = draw ? new TrafficLayer({ scene: new THREE.Scene(), net, def, sim: () => sim, focus: () => ({ tx: 20, tz: -500, r: 260 }), ground: Promise.resolve(null), reduced: false }) : null;
    let cars = 0;
    for (let k = 0; k < 6 * 3600 / 0.75; k++) { sim.advance(0.75); if (L) { L.sync(0.25, 0.75, 1); cars = Math.max(cars, L.stats().cars); } }
    return { hash: createHash('sha256').update(JSON.stringify(sim.g)).digest('hex').slice(0, 12), cars };
  };
  const plain = run(false), drawn = run(true);
  ok('traffic: drawing the roads changes nothing in the game', plain.hash === drawn.hash && drawn.cars > 0, `${plain.hash} ${drawn.hash}, up to ${drawn.cars} cars drawn`);

  // the script before the first frame doesn't carry it
  const assets = join(root, 'dist/assets'), files = readdirSync(assets).filter(f => f.endsWith('.js'));
  const entry = files.filter(f => f.startsWith('index-')).map(f => readFileSync(join(assets, f), 'utf8')).join('');
  const chunk = files.find(f => f.startsWith('traffic-'));
  ok('traffic: the layer and its data load in their own chunk, after the first frame', !!chunk && readFileSync(join(assets, chunk), 'utf8').includes('m60-j27-j1') && !entry.includes('m60-j27-j1') && !entry.includes('a6-mersey-square'), chunk ?? 'no traffic chunk');

  // saves: the opening at 08:00 on day 1, and the main line to Piccadilly with everything bought at the same hour
  const peak = build => {
    const sim = new Sim(net, Sim.halt(net, 1)); sim.g.cash = 1e7;
    build?.(sim);
    while (sim.hour() < 8 && sim.g.day === 1) sim.advance(5);
    sim.g.cash = 3000;
    return JSON.stringify({ g: sim.g, selected: 0 });
  };
  const main = sim => {
    sim.buyUpgrade(0, 'crossing'); sim.buyUpgrade(0, 'platform2'); sim.buyLine('units');
    for (const id of ['heaton-chapel', 'levenshulme', 'ardwick', 'piccadilly']) sim.buy(sim.P.station[net.station(id).index]);
    for (let i = 0; i < sim.S.length; i++) if (sim.g.owned[i]) for (const u of ['crossing', 'platform2', 'building', 'barriers', 'lifts', 'canopy', 'platforms', 'carpark', 'carpark2']) sim.buyUpgrade(i, u);
    sim.buyLine('units'); sim.buyLine('cars');
  };
  const LOOK = { tx: 20, tz: -500, ty: 40, r: 260, ph: 0.35, th: 0 };
  const A6 = ['a6-mersey-square', 'a6-heaton-chapel', 'a6-levenshulme', 'a6-longsight', 'a6-ardwick'];
  /** The roads as drawn once the layer's in and the wash has faded in. */
  const roads = page => page.waitForFunction(() => { const t = window.__view?.traffic?.(); return t && t.wash >= 1 && Object.keys(t.loads).length ? t : null; }, null, { timeout: 60000 }).then(h => h.jsonValue(), () => null);
  const still = async page => { const a = await page.evaluate(() => window.__view.traffic().sig); await page.waitForTimeout(1200); const b = await page.evaluate(() => window.__view.traffic().sig); return a === b; };

  // today's opening: under capacity at 06:30
  {
    const { ctx, page, errs } = await open({ width: 1280, height: 800 });
    await page.evaluate(o => window.__view.look(o), LOOK);
    const t = await roads(page);
    const moved = t ? !(await still(page)) : false;
    ok('traffic: at today\'s opening the cars move, none queued, no brake lights, the roads not washed', t && t.cars > 0 && t.queued === 0 && t.braking === 0 && moved && t.amber === 0 && t.coral === 0,
      t ? `${t.cars} cars, ${t.queued} queued, ${t.braking} braking, moving: ${moved}, wash ${t.amber}/${t.coral}` : 'no traffic drawn');
    ok('traffic: no errors at the opening', !errs.length, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // the morning peak, and the same with the main line bought
  const opening = peak(null), bought = peak(main);
  let jam = null;
  for (const [tag, save] of [['peak', opening], ['main', bought]]) {
    const { ctx, page, errs } = await open({ width: 1280, height: 800 }, { save });
    await page.evaluate(o => window.__view.look(o), LOOK);
    const t = await roads(page); await page.waitForTimeout(800);
    const now = t ? await page.evaluate(() => window.__view.traffic()) : null;
    await page.screenshot({ path: join(shots, `traffic-${tag}-desktop.png`) });
    if (tag === 'peak') {
      jam = now;
      ok('traffic: the opening\'s morning peak queues nose to tail, brake lights lit, within the 300 cap', now && now.cars > 50 && now.cars <= 300 && now.queued > 30 && now.braking >= now.queued,
        now ? `${now.cars} cars, ${now.queued} queued, ${now.braking} braking` : 'no traffic drawn');
      ok('traffic: the A6 at Mersey Square past capacity, and the roads washed amber and coral', now && now.loads['a6-mersey-square'] > 1 && now.coral > 0,
        now ? `A6 ${now.loads['a6-mersey-square']}, wash ${now.amber} amber, ${now.coral} coral` : '');
    } else {
      const cooler = now && jam && A6.every(id => now.loads[id] < jam.loads[id]);
      const q = t => A6.reduce((n, id) => n + (t.queuedOn[id] ?? 0), 0);
      ok('traffic: with the main line bought the A6 reads lower, its wash less coral and fewer cars queue on it', cooler && now.coral < jam.coral && q(now) < q(jam),
        now && jam ? `A6 ${A6.map(id => `${now.loads[id]} < ${jam.loads[id]}`).join(', ')}; coral ${now.coral} < ${jam.coral}; queued on the A6 ${q(now)} < ${q(jam)}` : 'no traffic drawn');
    }
    ok(`traffic: no errors (${tag})`, !errs.length, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // at 320 px on a phone; and Low's cap
  {
    const { ctx, page, errs } = await open({ width: 320, height: 640 }, { save: opening, touch: true });
    await page.evaluate(o => window.__view.look(o), LOOK);
    const t = await roads(page); await page.waitForTimeout(500);
    await page.screenshot({ path: join(shots, 'traffic-peak-320.png') });
    ok('traffic: at 320 px the peak\'s queues drawn within the cap', t && t.cars > 0 && t.cars <= 300 && t.queued > 0, t ? `${t.cars} cars` : 'no traffic drawn');
    await page.evaluate(() => { const k = 'the-commute-prefs-v1', p = JSON.parse(localStorage.getItem(k) || '{}'); localStorage.setItem(k, JSON.stringify({ ...p, fewer: true })); });
    await page.reload(); await page.waitForSelector('html[data-sim="ready"]');
    await page.evaluate(o => window.__view.look(o), LOOK);
    const low = await roads(page);
    ok('traffic: on Low at most 120 cars', low && low.cap === 120 && low.cars > 0 && low.cars <= 120, low ? `${low.cars} of ${low.cap}` : 'no traffic drawn');
    ok('traffic: no errors at 320 px', !errs.length, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // reduced motion: the cars stand still, the wash in at once
  {
    const { ctx, page, errs } = await open({ width: 1280, height: 800 });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); await page.waitForSelector('html[data-sim="ready"]');
    await page.evaluate(o => window.__view.look(o), LOOK);
    const first = await page.waitForFunction(() => { const t = window.__view?.traffic?.(); return t && t.cars > 0 ? t : null; }, null, { timeout: 60000 }).then(h => h.jsonValue(), () => null);
    const stood = first ? await still(page) : false;
    ok('traffic: with reduced motion the cars stand still and the wash is in at once', first && stood && first.wash === 1, first ? `still: ${stood}, wash ${first.wash}` : 'no traffic drawn');
    ok('traffic: no errors with reduced motion', !errs.length, errs.slice(0, 3).join(' | '));
    await ctx.close();
  }
}
