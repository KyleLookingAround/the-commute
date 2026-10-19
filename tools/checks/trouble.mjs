// Things going wrong show on the map. A save from seed 1 caught just after a train failed and the replacement buses
// began, with a signal failure added: the failed unit flashes its hazard lights, the stretch at caution has its lamp
// posts, a bus stands or runs between the stations either side (window.__view.trouble counts what's drawn), and the page
// has no errors; a screenshot of the bus goes to build/shots/trouble-bus.png. Then the same save with the line clear
// and the spare unit bought: it stands in Stockport's sidings. With no browser, the departure boards on the failing
// save: Bus replacement from the station behind it, Cancelled for the failed unit, and calling points in order; and
// the spare unit's run out of the sidings to buffer up to the failed unit and back; and the buses driving in from the
// depot and back. One phone page (390 px, touch) and one desktop page.
// Covers: @page @sim src/render/trains.ts src/render/buses.ts src/render/lineside.ts
import { register } from 'tsx/esm/api';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export default async function ({ ok, open, root }) {
  register();
  // the parts that paint a canvas get one that paints nothing here: only where things are is measured
  globalThis.document ??= { createElement: () => ({ getContext: () => null }) };
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim, TUNING } = await import('../../src/sim/sim.ts');
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'))), sim = new Sim(net, Sim.halt(net, 1));
  sim.g.cash = 1e6;
  for (const id of ['crossing', 'platform2', 'building', 'platforms']) sim.buyUpgrade(0, id);
  sim.buyStation(1); sim.buyStation(2); sim.buyLine('units');
  for (let k = 0; k < 40 * 360 && !sim.g.trouble.fail; k++) sim.advance(10);
  const f = sim.g.trouble.fail;
  if (!f) { ok('trouble: a train fails on seed 1', false, 'none in 40 sim hours'); return; }
  sim.advance(TUNING.busAfter + 20);
  // the boards, on a line where every station so far is open both ways: from the station behind the failure its way,
  // Bus replacement; the failed unit's own trains Cancelled; and every departure lists where it calls, in order along
  // its way, ending at its destination; no express on a board where it doesn't call
  {
    const { departures } = await import('../../src/render/life.ts');
    const b = new Sim(net, Sim.halt(net, 2)); b.g.cash = 1e6;
    for (const id of ['crossing', 'platform2', 'building', 'platforms']) b.buyUpgrade(0, id);
    for (const i of [1, 2]) { b.buyStation(i); b.buyUpgrade(i, 'crossing'); b.buyUpgrade(i, 'platform2'); }
    b.buyLine('units');
    for (let k = 0; k < 40 * 360 && !b.g.trouble.fail; k++) b.advance(10);
    const bf = b.g.trouble.fail; b.advance(TUNING.busAfter + 20);
    const deps = departures(b, bf.a, []), mine = deps.filter(d => d.train === bf.train && d.t < bf.until), way = deps.filter(d => d.d === bf.d && d.train !== bf.train && d.t < bf.until);
    const all = net.stations.map((_, i) => departures(b, i, []));
    const ordered = all.flat().every(d => d.via.every((j, k) => k === 0 || (net.stations[j].s - net.stations[d.via[k - 1]].s) * (d.d === 0 ? 1 : -1) > 0));
    const calls = all[0].some(d => d.d === 0 && d.via.length > 0), expresses = all[1].filter(d => b.svc(b.g.trains.find(t => t.id === d.train).svc).express).length;
    ok('trouble: the boards say Bus replacement from the station behind a failed train, Cancelled for its own trains, and list each train\'s calling points in order',
      way.length > 0 && way.every(d => d.note === 'Bus replacement') && mine.every(d => d.note === 'Cancelled') && ordered && calls && !expresses,
      JSON.stringify({ fail: bf && [bf.a, bf.b, bf.d], way: way.map(d => d.note), mine: mine.map(d => d.note), ordered, calls, expresses }));
    // the spare unit's run: from the sidings, out along the line beside the blocked one, buffered up to the failed unit's
    // Stockport end by the time it's rescued (its end 0.6 m from the failed unit's), and back in the sidings after
    const { rescueFor, rescueAt, rescueOffset } = await import('../../src/render/trains.ts');
    const r = rescueFor(net, JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')).services, b.g), ft = b.g.trains.find(t => t.id === bf.train);
    const gap = Math.abs(rescueAt(r, r.until) - ft.s) - (ft.cars * 23.6 - 0.6) / 2 - (2 * 23.6 - 0.6) / 2;
    // on the line beside the blocked one once clear of the sidings' 520 m ease (a failure nearer Stockport than that is
    // crossed onto directly, the ease and the crossing overlapping)
    const out = net.stations[0].at + Math.sign(r.s1 - r.s0) * 520, mid = (out - r.s1) * Math.sign(r.s1 - r.s0) < -150 ? out : null;
    const onLine = r.along !== r.onto && (mid === null || Math.abs(rescueOffset(net, r, mid) - net.offsetAt(r.along, mid)) < 0.05);
    const there = Math.abs(rescueOffset(net, r, r.s1) - net.offsetAt(r.onto, r.s1)) < 0.05;
    const run = rescueAt(r, r.from) === r.s0 && Math.abs(gap - 0.6) < 0.05 && rescueAt(r, r.until + r.back + 1) === null;
    ok('trouble: the spare unit drives out of the sidings beside the blocked line, buffers up to the failed unit by the time it\'s rescued, and goes back',
      run && onLine && there, JSON.stringify({ gap, onLine, there, along: r.along, onto: r.onto }));
    // the buses: one is on its way from the depot before the sim starts the first, and they drive off after it's done
    const THREE = await import('three');
    const { buildStations } = await import('../../src/render/stations.ts');
    const { BusLayer } = await import('../../src/render/buses.ts');
    const kits = Object.fromEntries(net.stations.map(st => [st.kit, JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8'))]));
    const scene = new THREE.Scene(), layer = new BusLayer(scene, net, buildStations(scene, net, kits));
    const c = new Sim(net, Sim.halt(net, 2)); c.g.cash = 1e6;
    for (const id of ['crossing', 'platform2', 'building', 'platforms']) c.buyUpgrade(0, id);
    for (const i of [1, 2]) { c.buyStation(i); c.buyUpgrade(i, 'crossing'); c.buyUpgrade(i, 'platform2'); }
    c.buyLine('units');
    for (let k = 0; k < 40 * 360 && !c.g.trouble.fail; k++) c.advance(10);
    let before = 0, after = 0, had = false;
    for (let k = 0; k < 900; k++) {
      c.advance(5); layer.sync(c);
      const n = c.g.trouble.buses.length; had ||= n > 0;
      if (!had) before = Math.max(before, layer.count); else if (!n) after = Math.max(after, layer.count);
    }
    ok('trouble: the replacement buses drive in from the depot before they start, and back to it after', before > 0 && after > 0 && had, JSON.stringify({ before, after, had }));
  }
  const c = net.stations[1].s, d = net.stations[2].s;
  sim.g.trouble.caution = { s0: c + 300, s1: d - 300, from: sim.g.t, until: sim.g.t + 3600 };
  const save = g => JSON.stringify({ g, selected: f.a });
  const failing = JSON.parse(JSON.stringify(sim.g));
  const clear = JSON.parse(JSON.stringify(sim.g)); clear.trouble.fail = null; clear.trouble.caution = null; clear.trouble.buses = []; clear.trouble.next = clear.t + 1e6; clear.places[sim.P.sidings] = { spare: 1 };
  mkdirSync(join(root, 'build/shots'), { recursive: true });
  for (const [w, h, touch] of [[390, 844, true], [1280, 800, false]]) {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch, save: save(failing) });
    await page.waitForTimeout(400);
    // the lamps flash, and a software-rendered frame can take seconds: watch until all three have shown (or 30 s)
    await page.waitForFunction(() => {
      const t = window.__view?.trouble?.(), m = window.__most ??= { hazards: 0, cautions: 0, buses: 0, spare: false };
      if (t) Object.assign(m, { hazards: Math.max(m.hazards, t.hazards), cautions: Math.max(m.cautions, t.cautions), buses: Math.max(m.buses, t.buses), spare: m.spare || t.spare });
      return m.hazards >= 4 && m.cautions >= 4 && m.buses >= 1;
    }, null, { timeout: 30000, polling: 100 }).catch(() => {});
    const most = await page.evaluate(() => window.__most ?? { hazards: 0, cautions: 0, buses: 0, spare: false });
    const bad = [most.hazards < 4 && 'no hazard lights on the failed unit', most.cautions < 4 && 'no caution lamps', most.buses < 1 && 'no bus', most.spare && 'a spare unit nobody bought', errs[0]].filter(Boolean);
    ok(`trouble: at ${w}×${h} a failed train flashes its hazards, a signal failure has its caution lamps, and a replacement bus runs`, !bad.length, bad.join('; ') || JSON.stringify(most));
    if (!touch) await page.screenshot({ path: join(root, 'build/shots/trouble-bus.png') });
    await ctx.close();
    const p2 = await open({ width: w, height: h }, { touch, save: save(clear) });
    await p2.page.waitForTimeout(400);
    const t2 = await p2.page.evaluate(() => window.__view?.trouble?.() ?? null);
    const bad2 = [!t2?.spare && 'no spare unit in the sidings', t2?.buses && 'buses with the line clear', t2?.cautions && 'caution lamps with the line clear', p2.errs[0]].filter(Boolean);
    ok(`trouble: at ${w}×${h} with the line clear the spare unit stands in Stockport's sidings, and nothing else is wrong`, !bad2.length, bad2.join('; '));
    await p2.ctx.close();
  }
}
