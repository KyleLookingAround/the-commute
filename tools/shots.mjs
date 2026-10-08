// Screenshots of the built page for a human to look at: node tools/shots.mjs [hour ...]. Builds nothing; run
// npm run build first. Writes build/shots/<size>-<hour>.png at phone, landscape phone, tablet and desktop sizes, with the
// lighting locked to each hour given (default 08:00, 13:00, 18:30 and 23:00) once the time-of-day control exists;
// until then every shot is at the game's own clock.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), dist = join(root, 'dist'), out = join(root, 'build/shots');
mkdirSync(out, { recursive: true });
const hours = process.argv.slice(2).map(Number).filter(n => !Number.isNaN(n));
if (!hours.length) hours.push(8, 13, 18.5, 23);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = createServer((req, res) => { try { let p = join(dist, normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^\/+/, '') || 'index.html'); if (!existsSync(p) || !statSync(p).isFile()) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(readFileSync(p)); } catch (e) { res.writeHead(404); res.end(); } });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
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
await browser.close(); server.close();
console.log(`shots in ${out}`);
