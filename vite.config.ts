import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// After the build, fills in the service worker (public/sw.js, copied to dist/) with what it should keep: the page, its
// scripts and styles, the icons and the manifest at install, and the fine tiles' names, so the worker can drop tiles a
// newer build no longer has. Its stamp is a hash of those files, so a build that changes nothing changes no worker.
function offline(): Plugin {
  let out = 'dist';
  return {
    name: 'commute-offline', apply: 'build',
    configResolved(c) { out = c.build.outDir; },
    closeBundle() {
      const files = (dir: string): string[] => readdirSync(dir).flatMap(f => statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]);
      const all = files(out).map(p => relative(out, p).split('\\').join('/')).sort();
      const tiles = all.filter(f => /^assets\/.*\.txt$/.test(f));
      // the redesign's directions page (public/design/) is for looking at online, not part of the game
      const keep = all.filter(f => f !== 'sw.js' && !tiles.includes(f) && !f.startsWith('design/'));
      const hash = createHash('sha256'); for (const f of [...keep, ...tiles]) hash.update(f).update(readFileSync(join(out, f)));
      const list = (a: string[]) => JSON.stringify(a.map(f => f === 'index.html' ? './' : f));
      const sw = join(out, 'sw.js');
      writeFileSync(sw, readFileSync(sw, 'utf8')
        .replace(/const STAMP = .*?;/, `const STAMP = '${hash.digest('hex').slice(0, 12)}';`)
        .replace(/const PRECACHE = .*?;/, `const PRECACHE = ${list(keep)};`)
        .replace(/const TILES = .*?;/, `const TILES = ${list(tiles)};`));
    },
  };
}

// GitHub Pages serves the site under /the-commute/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/the-commute/' : '/',
  build: {
    target: 'es2020', sourcemap: false, chunkSizeWarningLimit: 600,
    // the fine terrain tiles are fetched as the camera comes near: never inline the small ones into the script
    assetsInlineLimit: file => (file.endsWith('.txt') ? false : undefined),
    // three and the terrain base change least, so they're their own files: fetched alongside the game's own script
    // (the page preloads them), and still cached when only the game changes
    // the tiles named by their hash alone: their list is in the script before the first frame, so each name kept short
    rollupOptions: { output: { assetFileNames: a => ((a.names?.[0] ?? a.name ?? '').endsWith('.txt') ? 'assets/[hash][extname]' : 'assets/[name]-[hash][extname]'), manualChunks: id => (id.includes('/node_modules/three/') ? 'three' : id.includes('/src/data/terrain/') ? 'terrain' : undefined) } },
  },
  plugins: [offline()],
});
