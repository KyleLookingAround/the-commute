// The browser checks on the built page (dist/), run with: npm run check, or node tools/check.mjs <group>
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

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist'), out = join(root, 'build/check');
mkdirSync(out, { recursive: true });
const args = process.argv.slice(2), except = args[0] === '--except', named = except ? args.slice(1) : args;
const SAVE_KEY = 'the-commute-save-v1';
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
let browser = null; const getBrowser = async () => browser || (browser = await chromium.launch(exe ? { executablePath: exe, args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] } : { args: ['--use-gl=swiftshader', '--ignore-gpu-blocklist'] }));
const results = []; const ok = (name, pass, info) => { results.push([name, !!pass]); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`); };
const ignorable = m => /fonts\.(googleapis|gstatic)|ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|net::|WebGL|GPU stall/.test(m);

// open the built page at a viewport. seed: the game's seed; save: a save's JSON text put in localStorage first; touch: a phone
async function open(vp = { width: 1280, height: 800 }, { save = null, touch = false, seed = 1, dsf = touch ? 2 : 1 } = {}) {
  const b = await getBrowser();
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: dsf, hasTouch: touch, isMobile: touch });
  await ctx.addInitScript(seed => { window.__seed = seed; }, seed);
  if (save) await ctx.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [SAVE_KEY, save]);
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', c => { if (c.type() === 'error' && !ignorable(c.text())) errs.push(c.text()); });
  await page.goto(url);
  await page.waitForSelector('html[data-sim="ready"]', { timeout: 15000 }).catch(() => {});
  return { ctx, page, errs };
}

const groups = readdirSync(join(root, 'tools/checks')).filter(f => f.endsWith('.mjs')).sort().map(f => f.slice(0, -4));
const unknown = named.filter(g => !groups.includes(g));
if (unknown.length) { console.log(`no check group "${unknown[0]}"; the groups are ${groups.join(', ')}`); process.exit(1); }
const wanted = g => except ? !named.includes(g) : !named.length || named.includes(g);
for (const g of groups) if (wanted(g))
  try { await (await import(pathToFileURL(join(root, 'tools/checks', g + '.mjs')).href)).default({ open, ok, root, out, url, SAVE_KEY, get browser() { return getBrowser(); } }); }
  catch (e) { const msg = String(e && e.message || e).split('\n')[0].slice(0, 200); ok(`${g}: *`, false, 'the group stopped: ' + msg); }
if (browser) await browser.close();
server.close();
const failed = results.filter(r => !r[1]).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
