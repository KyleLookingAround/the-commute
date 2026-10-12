// Play offline: registers the service worker (public/sw.js, its file list written by the build in vite.config.ts) once
// the page has loaded, so a second visit loads and plays without a connection, from the home screen too. Only in a
// build: `npm run dev` never registers it. Skipped on a page a check or a screenshot opened (window.__seed set), so they
// always get the build on disk, unless the page also sets window.__offline (the `offline` check group).
declare global {
  interface ImportMeta { env: { PROD: boolean; BASE_URL: string } }
  interface Window {
    /** Set by the `offline` check group with __seed: register the service worker all the same. */
    __offline?: boolean;
  }
}

/** Register the worker; `ready` is called once the game is kept on this device. */
export function playOffline(ready: () => void): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (typeof window.__seed === 'number' && !window.__offline) return;
  const go = () => navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js')
    .then(() => navigator.serviceWorker.ready).then(() => ready()).catch(() => { /* no worker: the game plays online as before */ });
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
}
