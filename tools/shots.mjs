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
// --weather <sun|cloud|rain|fog|snow> (with either kind) settles that spell over the map first (window.__weather), and
// --world waits for the real buildings round the camera to come in first, and
// --day <n> starts a new game on that game day (window.__day: snow wants a winter one, day 60 or so); each file's name
// then ends -<spell>: node tools/shots.mjs 13 --weather rain writes build/shots/phone-13-rain.png and the rest.
// node tools/shots.mjs --audit [prefix ...]: the end-of-phase visual audit (docs/briefs/visual-audit.md), a complete
// named set in build/shots/audit/ to hold view for view against the last phase's. The game fully upgraded, bought
// through the sim from the data (every station and stage, every line upgrade, every perk and a renewed contract), the
// car parks filled, and at each station a unit of every service that calls there standing at its platform. Every
// station from its platform, above, along the line from the north and the south, and its street side; the line every
// 400 m along each corridor; the junctions and landmarks, the viaduct from the valley and the deck, the skyline; a
// sample of views at dusk, at night (the engineering train out), in rain, snow (a winter day) and fog; all at phone
// (390 px) and desktop sizes; and the page's own surfaces at 320 px. Files: <set>-<place>-<view>-<size>[-<light>].png,
// and contact sheets of each set in build/shots/audit/sheets/. Prefixes reshoot only the shots whose names start so
// (station-, line- place- and ui- can run side by side), and --audit sheets rebuilds only the contact sheets.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist'), out = join(root, 'build/shots');
mkdirSync(out, { recursive: true });
// --weather and --day take a value each, and come out of the rest
const all = process.argv.slice(2), opt = name => { const k = all.indexOf(name); if (k < 0) return null; const v = all[k + 1]; all.splice(k, 2); return v ?? null; };
const SKIES = ['sun', 'cloud', 'rain', 'fog', 'snow'], weather = opt('--weather'), day = opt('--day');
// --world (a flag, with --stations) waits for the real surroundings round the camera before each shot
const world = all.includes('--world') && (all.splice(all.indexOf('--world'), 1), true);
if (weather !== null && !SKIES.includes(weather)) { console.log(`--weather is one of ${SKIES.join(', ')}`); process.exit(1); }
const tag = weather ? `-${weather}` : '';
/** What every page gets before it loads: the seed, and the weather and day asked for. */
const setUp = ctx => ctx.addInitScript(([w, d]) => { if (w) window.__weather = w; if (d) window.__day = d; }, [weather, day === null ? null : Number(day)]);
const argv = all, stations = argv[0] === '--stations', audit = argv[0] === '--audit';
const hours = stations || audit ? [] : argv.map(Number).filter(n => !Number.isNaN(n));
if (!hours.length && !stations && !audit) hours.push(8, 13, 18.5, 23);
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
  await ctx.addInitScript(hr => { window.__seed = 1; window.__lockHour = hr; }, hour); await setUp(ctx);
  const page = await ctx.newPage(); await page.goto(url);
  await page.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(out, `${name}-${String(hour).replace('.', '-')}${tag}.png`) });
  await ctx.close();
}
if (audit) await auditShots(argv.slice(1));
if (stations) await stationShots(argv.slice(1).filter(a => !a.includes('=')), argv.slice(1).filter(a => a.includes('=')).map(a => a.split('=')));
await browser.close(); server.close();

async function stationShots(only, extra) {
  const { register } = await import('tsx/esm/api'); register();
  const { fromGeo } = await import('../src/sim/network.ts');
  const { Sim, UPGRADES } = await import('../src/sim/sim.ts');
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')));
  const grown = () => {
    const sim = new Sim(net, Sim.fresh(net, 1)), g = sim.g;
    net.stations.forEach((st, i) => { sim.grant(sim.P.station[i]); for (const u of UPGRADES.filter(u => sim.offered(i, u))) sim.grant(...sim.upgradePlace(i, u.id)); });
    for (const [id, n] of [['units', 3], ['cars', 2]]) for (let k = 0; k < n; k++) sim.grant(sim.P.stopper, id);
    for (const k of sim.P.stopperSections) { sim.grant(k, 'speed'); sim.grant(k, 'signals'); }
    // the Bee Network, all three steps
    for (let k = 0; k < 3; k++) sim.grant(sim.P.bee, 'bee');
    // every bus stop's feeder route, to its bigger buses
    for (const p of sim.P.all) if (p.kind === 'stop' && p.stop?.feeder && sim.owns(p.id)) for (let k = 0; k < 3; k++) sim.grant(p.id, 'feeder');
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
      await ctx.addInitScript(([o, sv]) => { window.__seed = 1; window.__lockHour = 13; window.__orbit = o; localStorage.setItem('the-commute-save-v1', sv); }, [orbit, save]); await setUp(ctx);
      const page = await ctx.newPage(); await page.goto(url);
      await page.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      // (until the buildings placed stop growing for 4 s, or two minutes)
      if (world) for (let last = -1, k = 0; k < 60; k++) { const n = await page.evaluate(() => window.__view.buildings().then(s => s.buildings)); if (n > 0 && n === last) break; last = n; await page.waitForTimeout(4000); }
      await page.screenshot({ path: join(out, `station-${st.id}-${view}-${size}${tag}.png`) });
      await ctx.close();
    }
  }
}

async function auditShots(only) {
  const { register } = await import('tsx/esm/api'); register();
  const { execFileSync } = await import('node:child_process'), { readdirSync, rmSync } = await import('node:fs');
  const { fromGeo, projectLatLon } = await import('../src/sim/network.ts');
  const { Sim, UPGRADES, LINE_UPGRADES, TUNING } = await import('../src/sim/sim.ts');
  const { spaces, parked } = await import('../src/sim/access.ts');
  const { simAtHour } = await import('../src/sim/day.ts');
  const { engineering } = await import('../src/render/trains.ts');
  const def = JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')), net = fromGeo(def);
  const dir = join(out, 'audit'), want = name => !only.length || only.some(p => name.startsWith(p));
  // a whole audit starts from nothing; one for some prefixes replaces only their shots, so a few can run side by side
  if (!only.length) rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'sheets'), { recursive: true });
  if (only.length) for (const f of readdirSync(dir)) if (f.endsWith('.png') && want(f)) rmSync(join(dir, f));
  const calm = g => Object.assign(g.trouble, { next: 1e12, fail: null, caution: null, buses: [] });
  // everything the game offers, bought through the sim: buy round the line until nothing more can be (a failure seen,
  // so the spare unit is offered), with every perk in the run; then on to the clock hour asked
  const full = (day, hour) => {
    const sim = new Sim(net, Sim.fresh(net, 1, (def.contract?.perks ?? []).map(p => p.id))), g = sim.g;
    calm(g); g.trouble.fails = 1;
    for (let more = true; more;) {
      more = false; g.cash = 1e9;
      net.stations.forEach((_, i) => { if (sim.buyStation(i)) more = true; for (const u of UPGRADES) if (sim.buyUpgrade(i, u.id)) more = true; });
      for (const u of LINE_UPGRADES) while (sim.buyLine(u.id)) more = true;
    }
    const left = [...net.stations.flatMap((st, i) => [!g.owned[i] && st.id, ...UPGRADES.filter(u => sim.offered(i, u) && !g.ups[i]?.[u.id]).map(u => `${st.id} ${u.id}`)]), ...LINE_UPGRADES.filter(u => g.line[u.id] < u.max).map(u => u.id)].filter(Boolean);
    if (left.length) console.log(`not bought: ${left.join(', ')}`);
    g.trouble.fails = 0; sim.ensureTrains();
    for (let d = 1; d < day; d++) { sim.advance(simAtHour(d + 1, 0) - g.t); calm(g); }
    sim.advance(simAtHour(day, hour) - g.t); calm(g); g.cash = 250000;
    // the car parks full
    net.stations.forEach((_, i) => { const S = g.st[i], free = spaces(sim, i) - parked(S); if (free > 0 && S.parked.length) S.parked[(Math.floor(sim.hour()) + TUNING.parkStay) % S.parked.length] += free; });
    return sim;
  };
  // a unit of every service that calls at station st standing at its platform, due away long after the shots
  const standAt = (sim, st) => {
    for (const v of sim.svcs) {
      if (!v.route.includes(st.index)) continue;
      const tr = sim.g.trains.find(t => t.svc === v.id); if (!tr) continue;
      const dir = st.index === v.route.at(-1) ? -1 : 1;
      Object.assign(tr, { s: st.s, v: 0, dir, state: 'dwell', dwell: 9999, calling: st.index, next: st.index, due: sim.g.t + 9999, bound: -1, leg: v.path.legAt(st.s) });
      Object.assign(tr, { pfAt: st.index, pf: sim.platsFor(tr, st.index, sim.kindAt(tr, st.index))[0] ?? 0 });
      tr.s = sim.stopAt(tr, st.index, tr.pf);
    }
  };
  const career = JSON.stringify({ v: 1, rep: 40, perks: (def.contract?.perks ?? []).map(p => p.id), renewals: 1, milestones: [], contracts: [{ n: 1, day: 30, rep: 120 }] });
  const day = full(1, 8.5);
  // a night the engineering train is out, at 01:30
  let nd = 2; while (!engineering(1, simAtHour(nd, 1.5)) && nd < 30) nd++;
  const night = full(nd, 1.5), winter = full(60, 8.5);

  // the views: where the camera looks (x, z, y), from how far, from which way across the ground (ex, ez) and tilted how far from straight down
  const look = (x, z, y, r, ex, ez, ph) => ({ tx: x, tz: z, ty: y, r, th: Math.atan2(ex, ez), ph });
  const turn = (ex, ez, a) => [ex * Math.cos(a) + ez * Math.sin(a), -ex * Math.sin(a) + ez * Math.cos(a)];
  const P = (lat, lon) => projectLatLon(lat, lon, def.origin);
  const stationViews = st => {
    const F = net.stationFrame(st.id), at = (u, v) => [F.x + F.dx * u + F.nx * v, F.z + F.dz * u + F.nz * v];
    const kit = JSON.parse(readFileSync(join(root, 'src/data/kits', `${st.kit}.json`), 'utf8'));
    const stop = st.s - st.at, bus = (kit.parts ?? []).find(p => p.type === 'busstop') ?? { u: stop, v: 30 }, side = Math.sign(bus.v ?? 1) || 1;
    const [x, z] = at(stop, 0), [bx, bz] = at(((bus.u ?? 0) + stop) / 2, (bus.v ?? 30) * 0.6);
    return {
      platform: look(x, z, 3, 60, ...turn(F.dx, F.dz, -0.3), 1.5),
      above: look(x, z, 2, 150, ...turn(-F.dx, -F.dz, 1.2), 0.55),
      north: look(x, z, 3, 220, F.dx, F.dz, 1.3),
      south: look(x, z, 3, 220, -F.dx, -F.dz, 1.3),
      street: look(bx, bz, 2, 170, ...turn(F.nx * side, F.nz * side, 0.35 * side), 1.05),
    };
  };
  const lineViews = () => {
    const v = {};
    for (const c of Object.values(net.corridors)) for (let s = c.start + 200, k = 0; s < c.end - 100; s += 400, k++) {
      const F = net.place(c.id, s, 0), side = k % 2 ? 1 : -1;
      v[`line-${c.id}-${String(Math.round((s - c.start) / 100)).padStart(3, '0')}`] = look(F.x, F.z, 0, 260, ...turn(F.nx * side, F.nz * side, 0.6), 1.0);
    }
    for (const j of net.junctions) { const F = net.place(j.corridor, j.s, 0); v[`place-junction-${j.id}`] = look(F.x, F.z, 0, 300, ...turn(-F.dx, -F.dz, 0.9), 0.8); }
    for (const l of def.landmarks ?? []) {
      if (l.kind === 'tower') continue;
      const a = l.at ?? l.from ?? { lat: l.lat, lon: l.lon }, b = l.to ?? a, p = P((a.lat + b.lat) / 2, (a.lon + b.lon) / 2);
      if (l.id === 'viaduct') {
        const F = net.place('main', net.corridor('main').nearest(p.x, p.z), 0);
        v['place-viaduct-valley'] = look(p.x, p.z, -18, 280, F.nx, F.nz, 1.5);
        v['place-viaduct-valley-far'] = look(p.x, p.z, -10, 600, ...turn(F.nx, F.nz, 0.5), 1.4);
        v['place-viaduct-deck'] = look(p.x, p.z, 3, 60, -F.dx, -F.dz, 1.42);
      } else {
        // the camera looks no further than 300 m from the line, as a player's does: from the line's side, out towards it
        const c = net.corridor(l.corridor ?? 'main'), F = net.place(c.id, c.nearest(p.x, p.z), 0), dx = p.x - F.x, dz = p.z - F.z, d = Math.hypot(dx, dz) || 1, k = Math.min(d, 280) / d;
        v[`place-${l.id}`] = d < 280 ? look(p.x, p.z, 4, l.kind === 'arches' ? 220 : 320, ...turn(0.6, 0.8, 0), 1.05) : look(F.x + dx * k, F.z + dz * k, 10, 260, -dx / d, -dz / d, 1.3);
      }
    }
    const pic = net.station('piccadilly'), F = net.stationFrame(pic.id);
    v['place-skyline'] = look(F.x - F.dx * 300, F.z - F.dz * 300, 40, 700, ...turn(F.dx, F.dz, Math.PI + 0.5), 1.42);
    v['place-skyline-ardwick'] = look(F.x, F.z, 20, 900, -F.dx, -F.dz, 1.3);
    return v;
  };
  const SIZES = [['phone', 390, 844, true], ['desktop', 1440, 900, false]];
  // a page per save and light: loaded, then waited on until what's bought has risen; then the camera moved to each
  // view and given frames to draw it and fetch the fine ground near it
  const shoot = async (file, { save, selected = 0, hour = 13, weather: w = null, views, ui = null, size }) => {
    const names = Object.keys(views ?? {}).filter(n => want(`${n}-${size[0]}${file}`));
    if (views && !names.length) return;
    if (ui && !want(`ui-`)) return;
    const [sz, wd, ht, touch] = size;
    const ctx = await browser.newContext({ viewport: { width: wd, height: ht }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
    await ctx.addInitScript(([hr, sv, cr, w]) => {
      window.__seed = 1; window.__lockHour = hr; if (w) window.__weather = w;
      if (!sessionStorage.getItem('seeded')) { if (sv) localStorage.setItem('the-commute-save-v1', sv); if (cr) localStorage.setItem('the-commute-career-v1', cr); sessionStorage.setItem('seeded', '1'); }
      window.__frames = 0; const raf = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = cb => raf(t => { window.__frames++; cb(t); });
      window.__pending = 0; const f = window.fetch.bind(window); window.fetch = (...a) => { window.__pending++; return f(...a).finally(() => window.__pending--); };
    // the save stamped ahead of now, so no time away passes on loading and the selected station is kept
    }, [hour, save ? JSON.stringify({ g: save.g, selected, at: Date.now() + 3600e3 }) : null, save ? career : null, w]);
    const page = await ctx.newPage(); await page.goto(url);
    await page.waitForSelector('html[data-sim="ready"]', { timeout: 60000 }).catch(() => {});
    await page.waitForFunction(() => window.__view && window.__view.rising() === 0 && window.__view.homes().rising === 0, null, { timeout: 120000 }).catch(() => console.log('still rising'));
    const settle = async n => { const f0 = await page.evaluate(() => window.__frames); await page.waitForFunction(([f0, n]) => window.__frames >= f0 + n && window.__pending === 0, [f0, n], { timeout: 60000 }).catch(() => {}); };
    if (ui) await ui(page, sz);
    else for (const n of names) {
      // a view given as a function finds its place in the page (the engineering train, wherever it is by now)
      const o = typeof views[n] === 'function' ? await views[n](page) : views[n];
      if (!o) { console.log(`${n}: nothing to look at`); continue; }
      await page.evaluate(o => window.__view.look(o), o); await settle(3); await settle(2);
      const path = join(dir, `${n}-${sz}${file}.png`);
      await page.screenshot({ path, timeout: 120000 }).catch(() => page.screenshot({ path, timeout: 240000 })).catch(e => console.log(`${n}: ${e.message.split('\n')[0]}`));
    }
    await ctx.close();
  };
  const t0 = Date.now(), done = () => readdirSync(dir).filter(f => f.endsWith('.png')).length;
  const said = what => console.log(`${what}: ${done()} shots, ${Math.round((Date.now() - t0) / 1000)} s`);
  for (const st of net.stations) {
    const sim = full(1, 8.5); standAt(sim, st);
    const views = Object.fromEntries(Object.entries(stationViews(st)).map(([k, o]) => [`station-${st.id}-${k}`, o]));
    for (const size of SIZES) await shoot('', { save: sim, selected: st.index, views, size });
    said(st.id);
  }
  const lv = lineViews();
  for (const size of SIZES) await shoot('', { save: day, views: lv, size });
  said('line');
  // the sample for light and weather
  const so = stationViews(net.station('stockport')), po = stationViews(net.station('piccadilly'));
  const sample = { 'station-stockport-above': so.above, 'station-stockport-platform': so.platform, 'station-piccadilly-above': po.above, 'place-viaduct-valley': lv['place-viaduct-valley'], 'place-town': lv['place-town'], 'line-main-040': lv['line-main-040'] };
  const works = async page => { const w = await page.evaluate(() => window.__view.life().works); return w && look(w[0], w[1], 2, 90, 0.7, 0.7, 1.2); };
  for (const [light, o] of Object.entries({ dusk: { save: day, hour: 20.25 }, night: { save: night, hour: 1.5 }, rain: { save: day, weather: 'rain' }, snow: { save: winter, weather: 'snow' }, fog: { save: day, weather: 'fog' } }))
    for (const size of SIZES) await shoot(`-${light}`, { ...o, views: light === 'night' ? { ...sample, 'line-engineering': works } : sample, size });
  said('light and weather');
  // the page's own surfaces at 320 px: a new game (the sheet at its peek with the next station's edge marker, a
  // picked card's Buy bar, the sheet at half and full, settings) and the full game (the line panel, the contract sheet)
  const { reveal } = await import('./reveal.mjs');
  const small = ['phone-320', 320, 568, true], snap = (page, n) => page.screenshot({ path: join(dir, `ui-${n}-320.png`) });
  // a click from inside the page: a software-drawn page is too slow for the driver's taps to settle
  const tap = async (page, sel) => { sel = await reveal(page, sel); if (!await page.evaluate(s => { const e = document.querySelector(s); e?.click(); return !!e; }, sel)) console.log(`ui: no ${sel}`); await page.waitForTimeout(1500); };
  const drag = async (page, to) => { const b = await page.locator('#sheetHandle').boundingBox(); if (!b) return; await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); for (let k = 1; k <= 6; k++) await page.mouse.move(b.x + b.width / 2, b.y + (to - b.y) * k / 6); await page.mouse.up(); await page.waitForTimeout(1500); };
  await shoot('', { size: small, ui: async page => {
    await page.waitForTimeout(3000); await snap(page, 'peek');
    await tap(page, '[data-pick="building"]'); await page.waitForFunction(() => !window.__view.camera().flying, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(1500); await snap(page, 'buybar');
    await page.evaluate(() => document.getElementById('barClose')?.click()); await page.waitForTimeout(800);
    await tap(page, '#sheetHandle'); await snap(page, 'half');
    await drag(page, 10); await snap(page, 'full');
    await page.evaluate(() => document.getElementById('vSet')?.click()); await page.waitForTimeout(1500); await snap(page, 'settings');
  } });
  await shoot('', { save: day, size: small, ui: async page => {
    await page.waitForTimeout(3000); await snap(page, 'full-game-peek');
    await tap(page, '#sheetHandle'); await snap(page, 'full-game-half');
    await page.evaluate(() => document.querySelector('#strip [data-place="route:stopper"]')?.click()); await page.waitForTimeout(1000); await snap(page, 'full-game-line');
    await page.evaluate(() => document.getElementById('cash')?.click()); await page.waitForTimeout(1000); await snap(page, 'full-game-network');
    await tap(page, '#renew'); await snap(page, 'contract');
  } });
  said('ui');
  // contact sheets: a sheet per set (a station, a corridor, the places, the page), size and light, every shot named;
  // --audit sheets (a prefix no shot has) builds only these
  const groups = {};
  rmSync(join(dir, 'sheets'), { recursive: true, force: true }); mkdirSync(join(dir, 'sheets'));
  for (const f of readdirSync(dir).filter(f => f.endsWith('.png')).sort()) {
    const [, name, size, light] = f.match(/^(.*?)-(phone|desktop|320)(-[a-z]+)?\.png$/) ?? [];
    if (!name) continue;
    const set = /^(station|line)-/.test(name) ? name.replace(/-[^-]+$/, '') : name.split('-')[0];
    (groups[`${set}-${size}${light ?? ''}`] ??= []).push(f);
  }
  for (const [k, fs] of Object.entries(groups)) {
    try { execFileSync('montage', ['-label', '%t', '-pointsize', '14', ...fs.map(f => join(dir, f)), '-tile', '5x', '-geometry', k.includes('phone') ? '260x+4+4' : '480x+4+4', join(dir, 'sheets', `${k}.jpg`)]); } catch { console.log('no montage: the contact sheets need ImageMagick'); break; }
  }
  said('all');
}
console.log(`shots in ${out}`);
