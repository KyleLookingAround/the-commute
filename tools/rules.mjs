// The rules every source file keeps, checked from the files themselves (plain Node, no dependencies).
// `npm run build` refuses to build on a broken one; the `rules` check group reports each.
//   node tools/rules.mjs      lists the problems, exit code 1 if any
// The rules:
//   randomness  Math.random() only in src/sim/random.ts, or on a line ending with `// cosmetic` (drawing, sound).
//   layers      src/sim/ and src/data/ import nothing from src/render/, src/ui/, src/app/ or three, and never name
//               window, document, localStorage, sessionStorage, requestAnimationFrame or performance: the sim runs the
//               same in Node, in a test, in the bot and on the page. src/data/ imports nothing from src/sim/ either.
//   headers     every .ts file under src/ opens with a `//` comment saying what's in it.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = /\.(ts|mjs|js)$/;   // the code files the rules read; src/ is TypeScript, and a stray .js still counts
export function walk(dir) {
  const out = [], abs = join(root, dir); if (!existsSync(abs)) return out;
  for (const f of readdirSync(abs).sort()) { const p = join(abs, f); if (statSync(p).isDirectory()) out.push(...walk(join(dir, f))); else if (/\.(ts|js|mjs|css)$/.test(f)) out.push(relative(root, p)); }
  return out;
}
const rd = p => readFileSync(join(root, p), 'utf8');
// a line with its comments taken out
const code = l => /^\s*\*/.test(l) ? '' : l.replace(/\/\*.*?\*\//g, '').replace(/(^|\s)\/\/.*$/, '');

export function randomSlips(files = walk('src')) {
  const out = [];
  for (const f of files) {
    if (f === 'src/sim/random.ts' || !SOURCE.test(f)) continue;
    rd(f).split('\n').forEach((l, i) => { if (/Math\.random\(/.test(code(l)) && !/\/\/ cosmetic\s*$/.test(l)) out.push(`${f}:${i + 1} uses Math.random(); draw from the game's rng (src/sim/random.ts), or end the line with // cosmetic if it only affects drawing or sound`); });
  }
  return out;
}
export function layerSlips(files = walk('src')) {
  const out = [];
  for (const f of files) {
    if (!/^src\/(sim|data)\//.test(f) || !SOURCE.test(f)) continue;
    const data = f.startsWith('src/data/');
    rd(f).split('\n').forEach((l, i) => {
      const c = code(l);
      const from = (c.match(/^\s*(?:import|export)\b[^'"]*['"]([^'"]+)['"]/) || [])[1];
      if (from && (/(^|\/)(render|ui|app)(\/|$)/.test(from) || /^three/.test(from))) out.push(`${f}:${i + 1} imports the renderer, the UI or the app; the sim and its data stay pure`);
      if (data && from && /(^|\/)sim(\/|$)/.test(from)) out.push(`${f}:${i + 1} imports the sim; data is plain values the sim reads`);
      const m = c.match(/\b(window|document|localStorage|sessionStorage|requestAnimationFrame|performance)\b/);
      if (m) out.push(`${f}:${i + 1} names ${m[1]}; the sim runs the same in Node, in a test, in the bot and on the page`);
    });
  }
  return out;
}
export function headerSlips(files = walk('src')) {
  const out = [];
  for (const f of files) { if (!SOURCE.test(f)) continue; const first = rd(f).split('\n').find(l => l.trim()) || ''; if (!/^\s*\/\//.test(first)) out.push(`${f} doesn't open with a // comment saying what's in it`); }
  return out;
}
export const problems = () => [...randomSlips(), ...layerSlips(), ...headerSlips()];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bad = problems(); for (const b of bad) console.log('FAIL  ' + b);
  console.log(bad.length ? `${bad.length} broken` : 'rules: every source file keeps them'); process.exit(bad.length ? 1 : 0);
}
