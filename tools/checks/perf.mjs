// Performance on a phone (docs/DESIGN.md, Performance): the opening and a busy save (five stations owned with every
// upgrade, the line's units, cars, timetable and spare bought, homes grown, the morning peak, rain) at 390 × 844 on a
// touch screen, under four times CPU throttling. Each page logs what it draws (draw calls, triangles, geometries,
// textures, shader programs, meshes and shadow casters, from renderer.info through window.__view.perf), when the first
// frame was drawn, and the script time a frame takes in the sim, the view's sync and the draw over a few frames. The
// script the page loads before its first frame is measured from dist/. It fails only on clear budgets (BUDGET, set
// well above what the game drew when the group was added), so it catches a regression without flaking on a slow
// machine: frame times are logged, never judged, since a software-rendered container is no guide to a phone's.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { register } from 'tsx/esm/api';

const BUDGET = {
  entryKB: 600,            // gzipped script loaded before the first frame (the entry chunk and what it imports at once)
  calls: { open: 600, busy: 1400 },              // draw calls a frame, shadows included
  triangles: { open: 950000, busy: 1050000 },   // triangles a frame, shadows included
  geometries: 800, textures: 16, programs: 40,
};
const FRAMES = 6;   // frames to time on each page

export default async function ({ ok, open, root }) {
  register();
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { Sim, UPGRADES } = await import('../../src/sim/sim.ts');
  const { simAtHour } = await import('../../src/sim/day.ts');
  const { LINE_UPGRADES } = await import('../../src/sim/sim.ts');

  // the script the page loads before it can draw: the entry and its static imports, from dist/index.html
  const dist = join(root, 'dist'), html = readFileSync(join(dist, 'index.html'), 'utf8');
  const first = [...html.matchAll(/(?:src|href)="[^"]*?(assets\/[^"]+\.js)"/g)].map(m => m[1]);
  const all = readdirSync(join(dist, 'assets')).filter(f => f.endsWith('.js'));
  const kb = f => gzipSync(readFileSync(join(dist, f))).length / 1024;
  const entryKB = first.reduce((n, f) => n + kb(f), 0), restKB = all.filter(f => !first.includes('assets/' + f)).reduce((n, f) => n + kb('assets/' + f), 0);
  ok('perf: the script before the first frame is inside its budget', entryKB <= BUDGET.entryKB,
    `${entryKB.toFixed(0)} KB gzipped before the first frame (${first.length} file${first.length > 1 ? 's' : ''}), ${restKB.toFixed(0)} KB later; budget ${BUDGET.entryKB} KB`);

  // the busy save: five stations owned with everything bought, the line built up, homes grown, the morning peak, rain
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8'))), sim = new Sim(net, Sim.fresh(net, 1));
  for (let i = 0; i < Math.min(5, net.stations.length); i++) {
    sim.g.owned[i] = true; sim.g.ups[i] = Object.fromEntries(UPGRADES.filter(u => sim.offered(i, u)).map(u => [u.id, true])); sim.g.homes[i] = sim.ceiling(i);
  }
  for (const u of LINE_UPGRADES) sim.g.line[u.id] = u.max;
  sim.advance(1200);
  const t = simAtHour(2, 8);
  sim.g.t = t; sim.g.day = 2;
  sim.g.weather = { ...sim.g.weather, now: 'rain', was: 'rain', since: t - 2000, until: t + 6000 };
  const busy = JSON.stringify({ g: sim.g, selected: 0 });

  for (const [tag, save] of [['open', null], ['busy', busy]]) {
    const { ctx, page, errs } = await open({ width: 390, height: 844 }, { touch: true, save, steady: 50 });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    // let it settle (the rises, the weather easing in), then time FRAMES frames
    const r = await page.evaluate(async n => {
      const frame = () => new Promise(res => requestAnimationFrame(res));
      for (let k = 0; k < 4; k++) await frame();
      const a = window.__view.perf(), w0 = performance.now();
      for (let k = 0; k < n; k++) await frame();
      const b = window.__view.perf(), f = b.frames - a.frames || 1;
      return { ...b, wall: (performance.now() - w0) / n, sim: (b.sim - a.sim) / f, sync: (b.sync - a.sync) / f, draw: (b.draw - a.draw) / f };
    }, FRAMES);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const ms = x => x.toFixed(1);
    console.log(`      ${tag}: ${r.calls} calls, ${r.triangles} triangles, ${r.geometries} geometries, ${r.textures} textures, ${r.programs} programs, ${r.meshes} meshes (${r.casters} cast shadows); first frame at ${ms(r.first)} ms; a frame ${ms(r.wall)} ms (script: sim ${ms(r.sim)}, sync ${ms(r.sync)}, draw ${ms(r.draw)})`);
    const over = [
      BUDGET.calls[tag] && r.calls > BUDGET.calls[tag] && `${r.calls} calls, budget ${BUDGET.calls[tag]}`,
      BUDGET.triangles[tag] && r.triangles > BUDGET.triangles[tag] && `${r.triangles} triangles, budget ${BUDGET.triangles[tag]}`,
      BUDGET.geometries && r.geometries > BUDGET.geometries && `${r.geometries} geometries, budget ${BUDGET.geometries}`,
      BUDGET.textures && r.textures > BUDGET.textures && `${r.textures} textures, budget ${BUDGET.textures}`,
      BUDGET.programs && r.programs > BUDGET.programs && `${r.programs} programs, budget ${BUDGET.programs}`,
      errs[0],
    ].filter(Boolean);
    ok(`perf: the ${tag === 'open' ? 'opening' : 'busy save'} at 390×844 draws inside its budgets`, !over.length, over.join('; '));
    await ctx.close();
  }
}
