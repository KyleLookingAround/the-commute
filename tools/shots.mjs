// Screenshots of the built page for a human to look at: node tools/shots.mjs [hour ...]. Builds nothing; run
// npm run build first. Writes build/shots/<size>-<hour>.png at phone, landscape phone, tablet and desktop sizes, with the
// lighting locked to each hour given (default 08:00, 13:00, 18:30 and 23:00) once the time-of-day control exists;
// until then every shot is at the game's own clock.
// node tools/shots.mjs --stations [id ...]: every station bought and grown, six-car units, and a unit standing at the
// station shot; for each, from above and at platform level along the line, at phone and desktop sizes, at 13:00:
// build/shots/station-<id>-<above|platform>-<phone|desktop>.png, to hold against each kit's note and the real place.
// A view given as name=du,dv,r,turn,tilt after the ids (instead of the usual two) takes a desktop shot looking at (du, dv) in the station's
// frame from r m away, turned that many radians from looking along the line and tilted from straight down:
// node tools/shots.mjs --stations heaton-chapel bridge=-77,0,45,1.6,1.3 writes station-heaton-chapel-bridge-desktop.png.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist'), out = join(root, 'build/shots');
mkdirSync(out, { recursive: true });
const argv = process.argv.slice(2), stations = argv[0] === '--stations';
const hours = stations ? [] : argv.map(Number).filter(n => !Number.isNaN(n));
if (!hours.length && !stations) hours.push(8, 13, 18.5, 23);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
// dist/ is served under the base path it was built for (/ locally, /the-commute/ in CI), as tools/check.mjs does
const base = (readFileSync(join(dist, 'index.html'), 'utf8').match(/src="(\/[^"]*?\/)assets\//) || [, '/'])[1];
const server = createServer((req, res) => { try { const path = decodeURIComponent(req.url.split('?')[0]); if (!path.startsWith(base)) { res.writeHead(404); res.end(); return; } let p = join(dist, normalize(path.slice(base.length).replace(/^\/+/, '') || 'index.html')); if (!existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p)); } catch (e) { res.writeHead(404); res.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}${base}`;
const exe = process.env.CHROMIUM_PATH;
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] });
const SIZES = [['phone', 390, 844, true], ['phone-landscape', 844, 390, true], ['tablet', 768, 1024, true], ['desktop', 1440, 900, false]];
for (const [name, w, h, touch] of SIZES) for (const hour of hours) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript(hr => { window.__seed = 1; window.__lockHour = hr; }, hour);
  const page = await ctx.newPage(); await page.goto(url);
  await page.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, `${name}-${String(hour).replace('.', '-')}.png`) });
  await ctx.close();
}
if (stations) await stationShots(argv.slice(1).filter(a => !a.includes('=')), argv.slice(1).filter(a => a.includes('=')).map(a => a.split('=')));
await browser.close(); server.close();

async function stationShots(only, extra) {
  const { register } = await import('tsx/esm/api'); register();
  const { fromGeo } = await import('../src/sim/network.ts');
  const { Sim, UPGRADES } = await import('../src/sim/sim.ts');
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')));
  const grown = () => {
    const sim = new Sim(net, Sim.fresh(net, 1)), g = sim.g;
    g.owned = g.owned.map(() => true);
    g.ups = net.stations.map((st, i) => Object.fromEntries(UPGRADES.filter(u => sim.offered(i, u)).map(u => [u.id, true])));
    g.line = { units: 3, cars: 2, timetable: 1, spare: 0 };
    // a while into the morning, so the units and the expresses stand at their platforms round the line
    sim.ensureTrains(); sim.advance(+(process.env.SHOT_RUN ?? 5));
    return sim;
  };
  for (const st of net.stations) {
    if (only.length && !only.includes(st.id)) continue;
    // a unit of the service that calls here standing at the stop, due away long after the shot
    const sim = grown(), g = sim.g, svc = net.boardingService(st.id, 'north') ?? net.boardingService(st.id, 'south');
    const tr = g.trains.find(t => t.svc === svc?.id), dir = st.index === net.services().find(v => v.def.id === svc?.id)?.route.at(-1) ? -1 : 1;
    if (tr) {
      Object.assign(tr, { s: st.s, v: 0, dir, state: 'dwell', dwell: 9999, calling: st.index, next: st.index, due: g.t + 9999, bound: -1 });
      // at the first platform it would use there
      Object.assign(tr, { pfAt: st.index, pf: sim.platsFor(tr, st.index, sim.kindAt(tr, st.index))[0] ?? 0 });
      tr.s = sim.stopAt(tr, st.index, tr.pf);
    }
    const save = JSON.stringify({ g, selected: st.index });
    const F = net.stationFrame(st.id), u = st.s - st.at, aim = (du, dv) => [F.x + F.dx * (u + du) + F.nx * dv, F.z + F.dz * (u + du) + F.nz * dv];
    const [tx, tz] = aim(0, 0), along = Math.atan2(-F.dx, -F.dz);
    const views = extra.length ? {} : { above: { tx, tz, ty: 2, r: 150, th: along + 1.2, ph: 0.55 }, platform: { tx, tz, ty: 3, r: 60, th: along + Math.PI - 0.3, ph: 1.5 } };
    for (const [name, spec] of extra) { const [du, dv, r, turn, tilt] = spec.split(',').map(Number), [x, z] = aim(du, dv); views[name] = { tx: x, tz: z, ty: 3, r, th: along + turn, ph: tilt }; }
    for (const [size, w, h, touch] of [['phone', 390, 844, true], ['desktop', 1440, 900, false]]) for (const [view, orbit] of Object.entries(views)) {
      if (extra.length && size === 'phone') continue;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
      await ctx.addInitScript(([o, sv]) => { window.__seed = 1; window.__lockHour = 13; window.__orbit = o; localStorage.setItem('the-commute-save-v1', sv); }, [orbit, save]);
      const page = await ctx.newPage(); await page.goto(url);
      await page.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(out, `station-${st.id}-${view}-${size}.png`) });
      await ctx.close();
    }
  }
}
console.log(`shots in ${out}`);
