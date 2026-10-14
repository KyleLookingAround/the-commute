// The stats view (?stats, src/app/stats.ts loads it after the first frame): a small overlay of what the page costs on
// this device, for setting the budgets from a real phone (docs/DESIGN.md, Performance). Frames a second and the
// slowest frame in the last 10 seconds, timed by its own frame callback, which only counts and compares; the
// triangles and draw calls the last frame drew, the geometries and textures held and the JS heap where the browser
// gives it, read on a timer. Copy puts one line of it all on the clipboard.
import './styles/stats.css';

const SECONDS = 10;   // how far back the slowest frame looks

/** Show the overlay; `save` says which game is open ('busy' for ?save=busy). */
export function showStats(save: 'busy' | 'game'): void {
  const box = document.createElement('div'); box.className = 'perf-hud'; box.setAttribute('role', 'status');
  const text = document.createElement('pre'), copy = document.createElement('button');
  copy.type = 'button'; copy.textContent = 'Copy';
  box.append(text, copy); document.querySelector('.app')?.append(box) ?? document.body.append(box);

  // a second's frames and its slowest, and the slowest of each of the last SECONDS seconds (a ring)
  const slow = new Float64Array(SECONDS);
  let last = -1, start = -1, frames = 0, worst = 0, fps = 0, at = 0;
  const tick = (now: number) => {
    if (last >= 0) { const dt = now - last; if (dt > worst) worst = dt; frames++; } else start = now;
    last = now;
    if (now - start >= 1000) { fps = frames * 1000 / (now - start); slow[at] = worst; at = (at + 1) % SECONDS; frames = 0; worst = 0; start = now; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const line = () => {
    const p = window.__view?.perf?.(), life = window.__view?.life?.();
    let slowest = worst; for (let k = 0; k < SECONDS; k++) if (slow[k]! > slowest) slowest = slow[k]!;
    const heap = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize;
    const k = (n: number) => n >= 10000 ? `${Math.round(n / 1000)}k` : String(n);
    return {
      lines: [
        `${fps.toFixed(0)} fps · slowest ${slowest.toFixed(0)} ms`,
        p ? `${k(p.triangles)} triangles · ${p.calls} calls` : 'no figures yet',
        p ? `${p.geometries} geometries · ${p.textures} textures` : '',
        heap ? `heap ${(heap / 1048576).toFixed(0)} MB` : 'heap not given',
      ].filter(Boolean),
      copy: [`commute stats`, save, `${innerWidth}×${innerHeight}@${devicePixelRatio}`, `${fps.toFixed(0)} fps`, `slowest ${slowest.toFixed(0)} ms`,
        p ? `${p.triangles} triangles` : '', p ? `${p.calls} calls` : '', p ? `${p.geometries} geometries` : '', p ? `${p.textures} textures` : '',
        heap ? `heap ${(heap / 1048576).toFixed(0)} MB` : 'heap n/a', life ? `shadows ${life.shadows ? 'on' : 'off'}` : '', life ? `ratio ${life.ratio}` : '',
        navigator.userAgent.replace(/^Mozilla\/5\.0 /, '')].filter(Boolean).join(' · '),
    };
  };
  const show = () => { text.textContent = line().lines.join('\n'); };
  show(); setInterval(show, 500);

  copy.addEventListener('click', () => {
    const one = line().copy, done = (ok: boolean) => { copy.textContent = ok ? 'Copied' : 'Select and copy'; setTimeout(() => { copy.textContent = 'Copy'; }, 2000); };
    const fallback = () => { text.textContent = one; getSelection()?.selectAllChildren(text); done(false); };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(one).then(() => done(true), fallback); else fallback();
  });
}
