// The browser checks on the built page (dist/), run with: npm run check, or node tools/check.mjs <group>, or
// node tools/check.mjs --shard <i>/<n> for the ith of n shards balanced by time (see MINUTES), and --changed <commit> (or a..b) for
// only the groups the changes since that commit can break (see COVERS)
// (npm run check also runs the rules, the sim tests and the build first).
// Each file in tools/checks/ is a group named after it: it exports a default async function that gets the helpers below
// and reports through ok(name, pass, info), and its opening comment says what it covers. Add a group by adding a file.
// A group that needs no browser (rules, bot) just doesn't call open().
// dist/ is served over HTTP from here, since a module script won't load from file://, under the base path the build
// used (/ locally, /the-commute/ in CI, read from dist/index.html). Every page gets the seed in window.__seed, so a
// failure repeats. Exit code 1 if anything fails. Screenshots of failures go to build/check/.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cpus } from 'node:os';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist'), out = join(root, 'build/check');
mkdirSync(out, { recursive: true });
// --shard i/n runs the ith of n shards (CI runs the groups as parallel jobs this way)
const argv = process.argv.slice(2), shardAt = argv.indexOf('--shard'), shard = shardAt < 0 ? null : argv[shardAt + 1].split('/').map(Number);
const changedAt = argv.indexOf('--changed'), since = changedAt < 0 ? null : argv[changedAt + 1];
const flags = new Set([shardAt, changedAt].filter(i => i >= 0).flatMap(i => [i, i + 1]));
const args = argv.filter((_, i) => !flags.has(i));
const except = args[0] === '--except', named = except ? args.slice(1) : args;
const SAVE_KEY = 'the-commute-save-v1', PREFS_KEY = 'the-commute-prefs-v1';
// The groups that measure the look or the cost, or the settings themselves, keep the real settings; every other page a
// group opens draws the cheaper way (open's `real`): the check mode
const REAL = new Set(['perf', 'contrast', 'daylight', 'life']);
let running = '';
const REAL_ALL = process.env.CHECK_REAL === '1';   // CHECK_REAL=1: every page with the real settings, to compare
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.map': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
// the base path the page was built for: its assets are under it, so the server mounts dist/ there
const base = (readFileSync(join(dist, 'index.html'), 'utf8').match(/src="(\/[^"]*?\/)assets\//) || [, '/'])[1];
const server = createServer((req, res) => {
  try {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (!path.startsWith(base)) { res.writeHead(404); res.end(); return; }
    let p = join(dist, normalize(path.slice(base.length).replace(/^\/+/, '') || 'index.html'));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!p.startsWith(dist) || !existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p));
  } catch (e) { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}${base}`;
const exe = process.env.CHROMIUM_PATH;
// one browser, launched on first use (a promise, so two pages opened side by side share it)
let browser = null; const getBrowser = () => browser || (browser = chromium.launch(exe ? { executablePath: exe, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] } : { args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] }));
const results = []; const ok = (name, pass, info) => { results.push([name, !!pass]); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };
const ignorable = m => /fonts\.(googleapis|gstatic)|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|net::|WebGL|GPU stall/.test(m);

// open the built page at a viewport. seed: the game's seed; save: a save's JSON text put in localStorage first; touch: a phone;
// real: the player's real settings rather than the check mode (REAL's groups always);
// steady: the most milliseconds one frame may count for. A software-rendered page under load can take over a second a
// frame, and the view eases by the real time between frames, so one slow frame finishes an ease that a check wants to
// watch. With steady, each frame's time (requestAnimationFrame's argument, also window.__frameT) moves on by at most that
// much, so an ease takes the same number of frames however slow the machine; the page simply runs slower. Wait on what a
// check needs with page.waitForFunction rather than a fixed delay.
async function open(vp = { width: 1280, height: 800 }, { save = null, touch = false, seed = 1, dsf = touch ? 2 : 1, steady = 0, real = REAL_ALL || REAL.has(running) } = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dsf, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript(seed => { window.__seed = seed; }, seed);
  // the check mode: no shadows, and one pixel per CSS pixel (the player's own settings, as Low sets them but for the
  // figures), set once per tab before the page reads them, so a group that changes the settings keeps its change
  if (!real) await ctx.addInitScript(k => {
    if (sessionStorage.getItem('checkMode')) return;
    let p = {}; try { p = JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { /* the defaults */ }
    localStorage.setItem(k, JSON.stringify({ ...p, shadows: false, sharp: false })); sessionStorage.setItem('checkMode', '1');
  }, PREFS_KEY);
  if (steady) await ctx.addInitScript(step => {
    const raf = window.requestAnimationFrame.bind(window); let last = -1;
    window.requestAnimationFrame = cb => raf(now => {
      if (last !== now) { window.__frameT = last < 0 ? now : Math.min(now, window.__frameT + step); last = now; }
      cb(window.__frameT);
    });
  }, steady);
  if (save) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [SAVE_KEY, save]);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', c => { if (c.type() === 'error' && !ignorable(c.text())) errs.push(c.text()); });
  await page.goto(url);
  await page.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
  return { ctx, page, errs };
}

// side(...fns): run a group's independent pages side by side, each fn an async block that opens and closes its own
// page; as many at once as the runner has cores for (two from four cores, CHECK_SIDE to set it), in order otherwise.
// A failure in one still lets the others finish before it's thrown.
const SIDE = Number(process.env.CHECK_SIDE) || (cpus().length >= 4 ? 2 : 1);
async function side(...fns) {
  const queue = fns.slice(), errors = [];
  await Promise.all(Array.from({ length: Math.min(SIDE, fns.length) }, async () => { while (queue.length) { try { await queue.shift()(); } catch (e) { errors.push(e); } } }));
  if (errors.length) throw errors[0];
}
const groups = readdirSync(join(root, 'tools/checks')).filter(f => f.endsWith('.mjs')).sort().map(f => f.slice(0, -4));
const unknown = named.filter(g => !groups.includes(g));
if (unknown.length) { console.log(`no check group "${unknown[0]}"; the groups are ${groups.join(', ')}`); process.exit(1); }
// Shards are balanced by each group's minutes on a CI runner (the "-- group took" lines in its log), heaviest first onto
// the lightest shard; a group not listed counts as one minute. Update these when a shard runs long.
// From the first Check main run (a327002, 14 October 2026, run 38517045818), with the check mode but before pages ran
// side by side. A group under a tenth of a minute counts as 0.1 (its tiles load at import, outside its timer).
const MINUTES = {
  perf: 13.6, contract: 7.8, reach: 6.9, strain: 6.2, line: 6, camera: 5.5, saves: 4.5, life: 4.2, away: 3.8, access: 2.9,
  layout: 2.8, offline: 2.8, preview: 2.8, weather: 2.8, homes: 2.6, fullscreen: 2.5, networkview: 2.4, daylight: 2.1,
  places: 1.4, trouble: 1, contrast: 0.9, terrain: 0.6, geometry: 0.2, world: 0.2, surroundings: 0.1, bot: 0.1, kits: 0.1,
  signals: 0.1, sections: 0.1, landmarks: 0.1, rules: 0.1,
};
const shardOf = new Map(), load = shard ? Array(shard[1]).fill(0) : [];
if (shard) for (const g of [...groups].sort((a, b) => (MINUTES[b] ?? 1) - (MINUTES[a] ?? 1) || a.localeCompare(b))) {
  const i = load.indexOf(Math.min(...load)); shardOf.set(g, i); load[i] += MINUTES[g] ?? 1;
}
// --changed <commit>: only the groups whose opening comment's "Covers:" line matches a file changed since that commit
// (globs, with @page for what every page loads and @sim for the game), plus ALWAYS, plus any group whose own file
// changed. A group with no Covers line always runs, and so does every group when the harness, the packages or the
// workflow changed, or the commit can't be read (then it's a full run).
const ALWAYS = new Set(['perf', 'life', 'saves']);
const SETS = {
  '@page': ['src/main.ts', 'index.html', 'src/ui/**', 'src/app/**', 'src/render/scene.ts', 'src/render/pick.ts', 'src/render/palette.ts', 'vite.config.ts', 'public/**'],
  '@sim': ['src/sim/**', 'src/data/network.json', 'src/data/traffic.json'],
};
const EVERYTHING = ['tools/check.mjs', 'package.json', 'package-lock.json', '.github/workflows/main-check.yml', 'tools/build.mjs'];
const glob = g => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*') + '$');
let selected = null;
if (since) {
  let files = null;
  try { files = execFileSync('git', ['diff', '--name-only', ...(since.includes('..') ? [since] : [since, 'HEAD'])], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean); } catch { console.log(`--changed: can't read ${since}; running every group`); }
  if (files && !files.some(f => EVERYTHING.includes(f))) {
    selected = new Set(groups.filter(g => {
      if (ALWAYS.has(g) || files.includes(`tools/checks/${g}.mjs`)) return true;
      const line = readFileSync(join(root, 'tools/checks', g + '.mjs'), 'utf8').split('\n').find(l => /^\/\/ Covers:/.test(l));
      if (!line) return true;
      const pats = line.replace(/^\/\/ Covers:/, '').trim().split(/\s+/).flatMap(w => SETS[w] ?? [w]).map(glob);
      return files.some(f => pats.some(p => p.test(f)));
    }));
    console.log(`--changed since ${since.slice(0, 7)}: ${files.length} files; ${selected.size} of ${groups.length} groups (${[...selected].join(', ')})`);
  }
}
const wanted = g => (!selected || selected.has(g)) && (!shard || shardOf.get(g) === shard[0] - 1) && (except ? !named.includes(g) : !named.length || named.includes(g));
for (const g of groups) if (wanted(g)) {
  const t0 = Date.now(); running = g;
  try { await (await import(pathToFileURL(join(root, 'tools/checks', g + '.mjs')).href)).default({ open, ok, side, root, out, url, SAVE_KEY, get browser() { return getBrowser(); } }); }
  catch (e) { const msg = String(e && e.message || e).split('\n')[0].slice(0, 200); ok(`${g}: *`, false, 'the group stopped: ' + msg); }
  console.log(`-- ${g} took ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}
if (browser) await (await browser).close();
server.close();
const failed = results.filter(r => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
