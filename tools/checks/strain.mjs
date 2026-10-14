// Strain, where the network hurts (docs/design/buying.md, section 6; src/ui/strain.ts reads it, src/render/strain.ts
// draws it). Without a browser: reading Strain changes nothing in the game (two runs of 4 sim hours on one seed, one
// read a few times a second the way the page does, end the same), and from a troubled save the read finds a crowded
// platform, people giving up, late departures by the stretch behind them and a full car park, with the card's line in
// plain figures. In the browser, at 320 px (touch) and on a desktop, from that save: the Strain button is off at the
// start and its drawing isn't fetched; Stockport's card says what's wrong with the view off; turned on, the glows show
// (a crowded platform and a full car park at once, and then a late stretch and the walk home), the reach steps back,
// they breathe, every glow is at least 40 px across on screen, and a tap on Stockport's opens its card at half height
// with the line at its top; with reduced motion they stand still; the view is remembered on reload, and turned off it
// fades out and stops drawing. Screenshots go to build/shots/strain-*.png. No errors.
// Covers: @page @sim src/render/strain.ts
import { reveal } from '../reveal.mjs';
import { register } from 'tsx/esm/api';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

export default async function ({ ok, open, root, side }) {
  register();
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim } = await import('../../src/sim/sim.ts');
  const { spaces } = await import('../../src/sim/access.ts');
  const { StrainRead } = await import('../../src/ui/strain.ts');
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def);
  const shots = join(root, 'build/shots'); mkdirSync(shots, { recursive: true });

  // reading changes nothing: the same seed, the same buys, one run read as the page reads it
  const run = read => {
    const sim = new Sim(net, Sim.fresh(net, 3)); sim.g.cash = 1e6;
    for (const id of ['crossing', 'building', 'carpark', 'platform2']) sim.buyUpgrade(0, id);
    sim.buyStation(net.station('heaton-chapel').index); sim.buyStation(net.station('levenshulme').index);
    const r = read ? new StrainRead(sim) : null;
    for (let k = 0; k < 4 * 3600 / 0.75; k++) { sim.advance(0.75); if (r && k % 4 === 0) { r.tick(sim); for (const p of sim.P.all) r.line(p.id); } }
    return createHash('sha256').update(JSON.stringify(sim.g)).digest('hex').slice(0, 12);
  };
  const [plain, read] = [run(false), run(true)];
  ok('strain: reading Strain changes nothing in the game', plain === read, `${plain} ${read}`);

  // a troubled save: Stockport with a car park, its platforms nearly full and some about to give up, its car park full,
  // and a signal failure between Stockport and Heaton Chapel for two hours that has had trains running late a while
  const sim = new Sim(net, Sim.fresh(net, 1)); sim.g.cash = 1e6;
  for (const id of ['crossing', 'building', 'carpark']) sim.buyUpgrade(0, id);
  const hc = net.station('heaton-chapel').index; sim.buyStation(hc);
  const a = net.station('stockport').s, b = net.station('heaton-chapel').s;
  sim.advance(600); sim.g.trouble.caution = { s0: Math.min(a, b), s1: Math.max(a, b), from: sim.g.t, until: sim.g.t + 7200 }; sim.advance(1500);
  // on until the stopper stands at Heaton Chapel more than five minutes behind, so its next departure is late
  for (let k = 0; k < 7200; k++) { if (sim.g.trains.some(tr => tr.svc === 'stopper' && tr.state === 'dwell' && tr.calling === hc && sim.g.t - tr.due > 300)) break; sim.advance(1); }
  const S = sim.state(0), t = sim.g.t, room = Math.max(0, 142 - S.waiting);
  S.q[0].push({ t, dest: hc, n: room - 30, give: t + 6000 }, { t, dest: hc, n: 30, give: t + 25 }); S.waiting += room;
  S.parked = new Array(24).fill(0); S.parked[(Math.floor(sim.hour()) + 6) % 24] = spaces(sim, 0);
  sim.g.cash = 2000;
  const save = JSON.stringify({ g: sim.g, selected: 0 });
  // the read, in Node: what it finds in the save as it is, then a while on
  {
    const s2 = new Sim(net, JSON.parse(save).g), r = new StrainRead(s2);
    const now = r.line('station:stockport') ?? '';
    let later = '', late5 = false, route = '';
    for (let k = 0; k < 2400; k++) {
      s2.advance(1); if (k % 3) continue;
      r.tick(s2); if (k === 90) later = r.line('station:stockport') ?? ''; if (!late5 && [...r.late.values()].some(L => L.min >= 5)) { late5 = true; route = r.line('route:stopper') ?? ''; }
    }
    const bad = [!/^Platforms?: 14\d waiting of 150 at \d\d:\d\d · Car park full: \d+ of \d+$/.test(now) && `Stockport's line first says "${now}"`,
      !/\d+ gave up this hour/.test(later) && `nobody gave up ("${later}")`, !late5 && 'no departure five minutes late',
      !/^\d+ late departures? this hour, worst \d+ min leaving .+ at \d\d:\d\d$/.test(route) && `the stopper's line says "${route}"`].filter(Boolean);
    ok('strain: from a troubled save the read finds the crowd, the walk home, late departures and the full car park, in plain figures', !bad.length, bad.join('; ') || `"${now}" / "${later}" / "${route}"`);
  }

  // each size side by side where the runner can (side, tools/check.mjs)
  await side(...([[320, 568, true, 'phone'], [1280, 800, false, 'desktop']]).map(([w, h, touch, tag]) => async () => {
    const { ctx, page: p, errs } = await open({ width: w, height: h }, { touch, save, steady: 50 });
    const f = net.stationFrame('stockport');
    await ctx.addInitScript(([x, z]) => { window.__orbit = { tx: x, ty: 0, tz: z, r: 420, th: 5.5, ph: 0.9 }; window.__lockHour = 13; }, [f.x, f.z]);
    const loaded = [];
    p.on('request', q => { if (/strain-[^/]*\.js/.test(q.url())) loaded.push(q.url()); });
    await p.reload(); await p.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
    const tap = async (sel, at) => {
      if (sel) { sel = await reveal(p, sel); at = await p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel); }
      if (!at) return false;
      if (touch) await p.touchscreen.tap(at[0], at[1]); else await p.mouse.click(at[0], at[1]);
      return true;
    };
    const st = () => p.evaluate(() => window.__view.strain?.() ?? null);
    // off at the start, its drawing not fetched, and Stockport's card already says what's wrong
    await p.waitForFunction(() => !document.getElementById('wrong')?.hidden, null, { timeout: 20000 }).catch(() => {});
    const off0 = await p.evaluate(() => ({ pressed: document.getElementById('vStrain')?.getAttribute('aria-pressed'), wrong: document.getElementById('wrong')?.hidden ? '' : document.getElementById('wrong')?.textContent, drawn: !!window.__view.strain }));
    const drawnBefore = loaded.length;
    const bad0 = [off0.pressed !== 'false' && 'the Strain button is not off', off0.drawn && 'the glows were made before the view was on',
      !/waiting of 150/.test(off0.wrong || '') && `Stockport's card says "${off0.wrong}" with the view off`].filter(Boolean);
    ok(`strain: at ${w}×${h} the view is off at the start, and Stockport's card says what's wrong anyway`, !bad0.length, bad0.join('; '));

    // on: the glows come, the reach steps back, they breathe and stand at least 40 px across
    await tap('#vStrain');
    await p.waitForFunction(() => { const s = window.__view.strain?.(); return s && s.kinds.crowd > 0 && s.kinds.park > 0 && s.back > 0.95; }, null, { timeout: 60000 }).catch(() => {});
    const s1 = await st();
    await p.waitForTimeout(1500);
    const s2 = await st();
    // the late stretch and the walk home come as trains leave late and people give up: each kind seen at some point, at 10×
    await tap('#sp10');
    const seen = await p.evaluate(async () => {
      const out = { crowd: 0, walk: 0, late: 0, park: 0, walkers: 0 }, t0 = performance.now();
      while (performance.now() - t0 < 150000 && !(out.crowd && out.walk && out.late && out.park)) {
        const s = window.__view.strain?.(); if (s) { for (const k in s.kinds) out[k] = Math.max(out[k], s.kinds[k]); out.walkers = Math.max(out.walkers, s.walkers); }
        await new Promise(r => setTimeout(r, 500));
      }
      return out;
    });
    await tap('#sp1');
    await p.screenshot({ path: join(shots, `strain-${tag}.png`) });
    const bad1 = [!s1 && 'no Strain on window.__view', s1 && !s1.pressed && 'the button is not pressed', !seen.crowd && 'no crowded platform', !seen.park && 'no full car park',
      !seen.late && 'no late stretch', !(seen.walk && seen.walkers) && 'no walk home', s1 && !(s1.back > 0.95) && `the reach didn't step back (${s1?.back})`,
      s1 && s2 && s1.breath === s2.breath && 'the glows are not breathing', s2 && s2.spots.some(g => g.w < 39.5) && `a glow is under 40 px (${s2.spots.map(g => g.w.toFixed(0)).join(', ')})`,
      drawnBefore === 0 && loaded.length < 1 && 'the drawing was never fetched', errs[0]].filter(Boolean);
    ok(`strain: at ${w}×${h} turned on, the glows show for each kind of problem, at least 40 px, breathing, with the reach stepped back`, !bad1.length, bad1.join('; ') + ` ${JSON.stringify(seen)}`);

    // a tap on Stockport's platform glow opens its card at half height, the line at its top
    // (from the Network card, which leaves the camera over Stockport, with the sheet at its peek)
    await tap('#cash'); await p.waitForTimeout(1200);
    await p.evaluate(() => { const s = document.getElementById('sheet'); if (s?.dataset.at !== 'peek' && s?.dataset.at !== 'docked') document.getElementById('sheetHandle')?.click(); });
    await p.evaluate(([x, z]) => window.__view.look({ tx: x, tz: z, r: 420, ph: 0.9 }), [f.x, f.z]);
    await p.waitForTimeout(2000);
    const where = await p.evaluate(() => ({ open: window.__view.open(), spots: window.__view.strain?.()?.spots ?? [] }));
    const o = where.open, spot = where.spots.find(g => g.place === 'station:stockport' && g.x > o.x + 20 && g.x < o.x + o.w - 70 && g.y > o.y + 70 && g.y < o.y + o.h - 20);
    await tap(null, spot ? [spot.x, spot.y] : null);
    await p.waitForFunction(() => document.getElementById('panel')?.dataset.place === 'station:stockport', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(600);
    const card = await p.evaluate(() => ({ place: document.getElementById('panel')?.dataset.place, at: document.getElementById('sheet')?.dataset.at, first: document.getElementById('panel')?.firstElementChild?.id, wrong: document.getElementById('wrong')?.textContent }));
    const bad2 = [!spot && `no glow at Stockport on the open map (${JSON.stringify(where).slice(0, 300)})`, card.place !== 'station:stockport' && `the tap opened ${card.place}`,
      !touch ? false : card.at !== 'half' && `the sheet is at ${card.at}`, card.first !== 'wrong' && "the line isn't at the card's top", !/waiting of 150|gave up|Car park full/.test(card.wrong || '') && `the card says "${card.wrong}"`].filter(Boolean);
    ok(`strain: at ${w}×${h} a tap on a glow opens its place's card${touch ? ' at half height' : ''}, what's wrong at the top`, !bad2.length, bad2.join('; '));

    // remembered on reload; with reduced motion the glows stand still; turned off they fade and stop drawing
    await p.emulateMedia({ reducedMotion: 'reduce' });
    await p.reload(); await p.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
    await p.waitForFunction(() => { const s = window.__view.strain?.(); return s && s.on > 0; }, null, { timeout: 30000 }).catch(() => {});
    const r1 = await st(); await p.waitForTimeout(1200); const r2 = await st();
    await tap('#vStrain');
    await p.waitForFunction(() => { const s = window.__view.strain?.(); return s && !s.running; }, null, { timeout: 20000 }).catch(() => {});
    const r3 = await st();
    const pressed = await p.evaluate(() => document.getElementById('vStrain')?.getAttribute('aria-pressed'));
    const bad3 = [!(r1?.on > 0) && 'the view was not remembered on reload', r1 && r2 && r1.breath !== r2.breath && 'the glows breathe with reduced motion',
      r3 && (r3.running || r3.back > 0 || r3.on) && 'turned off, it kept drawing', pressed !== 'false' && 'the button is still pressed', errs[0]].filter(Boolean);
    ok(`strain: at ${w}×${h} the view is remembered, still with reduced motion, and turns off`, !bad3.length, bad3.join('; '));
    await ctx.close();
  }));
}
