// The service worker that lets the game load and play without a connection (src/app/offline.ts registers it).
// The build (vite.config.ts) fills in the three lines marked `build:` with its stamp and the list of what it made, so
// this file as it stands in public/ is only the template; it's never registered in `npm run dev`.
// - At install it caches the page, its scripts and styles, the icons and the manifest under a cache named for the
//   build, and the terrain's fine tiles go in their own cache as they're fetched, so places already seen stay sharp.
// - A new build waits, and takes over on the next load of the game when no other tab of it is open, never mid-game:
//   that load gets the new build's page straight from its cache, and the new worker claims it once this one is quiet.
// - Saves aren't here: they stay in the page's local storage.
const STAMP = 'dev';                // build: the build's stamp
const PRECACHE = [];                // build: the files to cache at install, relative to this file
const TILES = [];                   // build: the fine tiles this build has, relative to this file
const BUILD = 'commute-' + STAMP, TILE_CACHE = 'commute-tiles';
const at = p => new URL(p, self.registration.scope).href;
const isTile = url => /\/assets\/[^/]+\.txt$/.test(new URL(url).pathname);
const isFont = url => /^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(BUILD).then(c => c.addAll(PRECACHE.map(at))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // older builds' caches go; tiles this build no longer has go too
    for (const k of await caches.keys()) if (k.startsWith('commute-') && k !== BUILD && k !== TILE_CACHE && k !== 'commute-fonts') await caches.delete(k);
    const keep = new Set(TILES.map(at)), tiles = await caches.open(TILE_CACHE);
    for (const r of await tiles.keys()) if (!keep.has(r.url)) await tiles.delete(r);
    // the first visit's page is looked after from the start, so the tiles it fetches are kept
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'take-over') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') { e.respondWith(page(req)); return; }
  if (isFont(req.url)) { e.respondWith(kept('commute-fonts', req)); return; }
  if (new URL(req.url).origin !== self.location.origin) return;
  if (isTile(req.url)) { e.respondWith(kept(TILE_CACHE, req)); return; }
  e.respondWith(file(req));
});

// a file of the build: from this build's cache, else a newer build's (a page this worker handed over to a waiting build
// asks it for that build's files until the new worker claims it), else the network
async function file(req) {
  const hit = await (await caches.open(BUILD)).match(req, { ignoreSearch: true });
  return hit || (await caches.match(req, { ignoreSearch: true })) || fetch(req);
}

// the page: a new build waiting takes over now if this load is the only tab of the game (a reload or a new visit), and
// this load is already the new build's page, from its own cache. Nothing here waits for the switch: the browser won't
// let the new worker take over while this one is still answering a request, so waiting for it here would hold up the
// very load it's waiting on. The new worker takes over once this one goes quiet and claims the page. Otherwise the
// cached page, or the network if it isn't cached.
async function page(req) {
  const next = self.registration.waiting;
  if (next && (await self.clients.matchAll({ type: 'window' })).length < 2) {
    // the newest build's cache: caches are listed in the order they were made, and the waiting build's is made last
    const built = (await caches.keys()).filter(k => k.startsWith('commute-') && k !== BUILD && k !== TILE_CACHE && k !== 'commute-fonts');
    const fresh = built.length ? await (await caches.open(built[built.length - 1])).match(at('./')) : undefined;
    if (fresh) { next.postMessage('take-over'); return fresh; }
  }
  const c = await caches.open(BUILD);
  return (await c.match(at('./'))) || fetch(req);
}

// a file kept as it's first fetched (fine tiles, the fonts): from the cache if it's there, else the network, kept
async function kept(name, req) {
  const c = await caches.open(name), hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') c.put(req, res.clone());
  return res;
}
