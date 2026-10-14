// Life (docs/DESIGN.md, Who's travelling, Sound and Settings): the settings sheet opens from the stage, every control
// in it is a 44 px tap target on a phone (320 px wide too) and it fits the screen; Low turns shadows off, thins the
// figures and draws at one pixel per CSS pixel, High brings them back; the settings are remembered on the device after a
// reload and never go in the save; sound stays off until the first tap, starts on it, and a mute is remembered (a muted
// page makes no sound when tapped). Then the figures: after a while at 10x some carry a suitcase or wheel a bike. And
// the night: a save moved to 02:00 on a night the fast lines close (seed 1's second) has the engineering train out with
// its beacons, no expresses, and the bought platforms' lamps throwing their light; at 13:00 the next day none of that.
// Boarding, with no browser: people waiting for the stopper at Stockport's platform 4 walk by the subway to platform 3
// when the stopper stands there, and board from its edge; at Piccadilly they walk along the concourse to the bay it
// turns in; and those getting off a train at platform 3 step out onto platform 3.
// Covers: ** (and it runs on every push to main: ALWAYS in tools/check.mjs)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { register } from 'tsx/esm/api';

const SET_KEY = 'the-commute-prefs-v1';

export default async function ({ ok, open, root, SAVE_KEY }) {
  register();
  const { simAtHour } = await import('../../src/sim/day.ts');
  await boarding(ok, root, simAtHour);
  for (const [w, h] of [[320, 568], [390, 844]]) {
    const { ctx, page, errs } = await open({ width: w, height: h }, { touch: true });
    await page.waitForTimeout(500);
    const life = () => page.evaluate(() => window.__view.life());
    const tap = async sel => { const [x, y] = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel); await page.touchscreen.tap(x, y); await page.waitForTimeout(250); };
    const before = await life();
    await tap('#vSet');
    const sheet = await page.evaluate(min => {
      const d = document.getElementById('settings'), r = d.getBoundingClientRect();
      const small = [...d.querySelectorAll('button, input')].filter(b => b.getClientRects().length && !b.matches('.pick-file')).map(b => { const q = b.getBoundingClientRect(); return [b.textContent.trim() || b.getAttribute('aria-label'), Math.round(q.width), Math.round(q.height)]; }).filter(([, bw, bh]) => bw < min || bh < min);
      return { open: d.open, fits: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, small, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
    }, 44);
    ok(`life: at ${w}×${h} the settings sheet opens from the stage, fits the screen, and every control in it is 44 px`, sheet.open && sheet.fits && !sheet.small.length && sheet.sw <= sheet.cw,
      [!sheet.open && 'not open', !sheet.fits && 'off the screen', ...sheet.small.map(s => `${s[0]} ${s[1]}×${s[2]}`)].filter(Boolean).join(', '));
    // the tap that opened the sheet was the first: sound has started
    const started = await life();
    await tap('[data-q="low"]');
    const low = await life();
    await tap('[data-t="sound"]');
    await tap('.set-close');
    const closed = await page.evaluate(() => !document.getElementById('settings').open);
    ok(`life: at ${w}×${h} sound is off until the first tap and starts on it`, !before.heard.running && started.heard.running, JSON.stringify([before.heard.running, started.heard.running]));
    ok(`life: at ${w}×${h} Low turns shadows off, thins the figures and draws at one pixel per CSS pixel; the sheet closes`, before.shadows && before.ratio === 2 && !low.shadows && low.ratio === 1 && closed, JSON.stringify({ before: [before.shadows, before.ratio], low: [low.shadows, low.ratio], closed }));
    // reload: the settings come back from the device, apart from the save; muted, a tap makes no sound
    await page.reload(); await page.waitForSelector('html[data-sim="ready"]'); await page.waitForTimeout(400);
    const kept = await page.evaluate(([k, s]) => ({ prefs: JSON.parse(localStorage.getItem(k) || 'null'), inSave: (localStorage.getItem(s) || '').includes('"shadows"') }), [SET_KEY, SAVE_KEY]);
    await page.touchscreen.tap(w / 2, 150); await page.waitForTimeout(300);
    const after = await life();
    ok(`life: at ${w}×${h} the settings are remembered on the device, never in the save, and a muted page stays silent when tapped`,
      kept.prefs && kept.prefs.sound === false && kept.prefs.shadows === false && !kept.inSave && !after.shadows && after.ratio === 1 && !after.heard.running, JSON.stringify({ kept, after: [after.shadows, after.ratio, after.heard.running] }));
    // High brings everything back
    await tap('#vSet'); await tap('[data-q="high"]');
    const high = await life();
    ok(`life: at ${w}×${h} High brings shadows and full sharpness back`, high.shadows && high.ratio === 2 && !errs.length, JSON.stringify([high.shadows, high.ratio, errs[0]]));
    await ctx.close();
  }
  // the figures: after a while at 10x some carry a suitcase or wheel a bike
  const { ctx, page, errs } = await open({ width: 1280, height: 800 });
  await page.click('#sp10');
  let seen = { cases: 0, bikes: 0, figures: 0 };
  for (let k = 0; k < 20 && seen.cases + seen.bikes === 0; k++) { await page.waitForTimeout(1000); seen = await page.evaluate(() => window.__view.life()); }
  ok('life: at 10x some of the figures on the platforms carry a suitcase or wheel a bike', seen.cases + seen.bikes > 0 && !errs.length, JSON.stringify({ cases: seen.cases, bikes: seen.bikes, figures: seen.figures, err: errs[0] }));
  // the night: take this game's save and move it to the small hours of its second night, then to the next afternoon
  // the page saves when it's hidden: say it is, rather than wait for its timer on a slow machine
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const save = await page.evaluate(k => localStorage.getItem(k), SAVE_KEY);
  await ctx.close();
  for (const [hour, night] of [[26, true], [37, false]]) {
    const s = JSON.parse(save || '{}'); if (!s.g) { ok('life: a save to move to the night', false, 'no save written'); break; }
    s.g.day = Math.floor(hour / 24) + 1; s.g.t = simAtHour(s.g.day, hour % 24); s.at = Date.now();
    const p = await open({ width: 1280, height: 800 }, { save: JSON.stringify(s) });
    await p.page.waitForTimeout(800);
    const n = await p.page.evaluate(() => window.__view.life());
    const want = night ? n.works && n.beacons > 0 && n.expresses === 0 && n.pools > 0 && n.lamplight > 0.99 : !n.works && n.beacons === 0 && n.lamplight < 0.01;
    ok(`life: at ${String(hour % 24).padStart(2, '0')}:00 ${night ? 'on a works night the engineering train is out with its beacons, the expresses are off and the platforms are lamp-lit' : 'the next afternoon there is no engineering train and no lamplight'}`,
      want && !p.errs.length, JSON.stringify({ works: n.works, beacons: n.beacons, expresses: n.expresses, pools: n.pools, lamplight: n.lamplight, err: p.errs[0] }));
    await p.ctx.close();
  }
}

/** People walk to the platform their train stands at (src/render/passengers.ts), driven headless with a made-up state. */
async function boarding(ok, root, simAtHour) {
  const THREE = await import('three');
  const { fromGeo } = await import('../../src/sim/network.ts');
  const { PassengerLayer } = await import('../../src/render/passengers.ts');
  const net = fromGeo(JSON.parse(readFileSync(join(root, 'src/data/network.json'), 'utf8')));
  for (const [id, pid, svc] of [['stockport', '3', 'stopper'], ['piccadilly', '11', 'stopper']]) {
    const st = net.station(id), i = st.index, pf = st.platforms.findIndex(p => p.id === pid);
    const kit = JSON.parse(readFileSync(join(root, 'src/data/kits', st.kit + '.json'), 'utf8'));
    const built = net.stations.map(() => ({ group: new THREE.Group(), label: new THREE.Object3D(), kit }));
    const layer = new PassengerLayer(built, net.stations, net.stations.map(() => ({ north: 0, south: 0 })));
    const L = layer.layers[i], want = L.stands[pf];
    const S = { q: [[{ t: 0, dest: 0, n: 8 }], []], alighted: 0, changed: 0, lost: 0, revenue: 0 };
    const g = { t: simAtHour(1, 12), seed: 1, owned: net.stations.map((_, k) => k === i), ups: net.stations.map(() => ({})), st: net.stations.map((_, k) => k === i ? S : null), trains: [] };
    layer.sync(g, 0.1);
    const waited = L.faces[0].agents.map(a => a.v);
    // the stopper stands at the platform, those for it board, and two get off
    g.trains = [{ id: 0, svc, dir: 1, s: st.s, state: 'dwell', dwell: 30, pf, pfAt: i, cars: 4 }];
    S.q[0] = []; S.alighted = 2;
    let most = 0, off = [];
    for (let k = 0; k < 1200; k++) {
      layer.sync(g, 0.25);
      if (k === 0) off = L.faces[0].agents.filter(a => a.mode === 'leave').map(a => a.v);
      most = Math.max(most, L.faces[0].agents.filter(a => a.mode === 'board' && Math.abs(a.v - want) < 0.01).length);
    }
    ok(`life: at ${st.name} people waiting on the face walk to platform ${pid}, where the stopper stands, and board from its edge; those getting off step onto it`,
      want !== null && waited.length === 8 && waited.every(v => Math.abs(v - want) > 3) && most > 0 && L.faces[0].agents.length === 0 && off.length === 2 && off.every(v => Math.abs(v - want) < 0.01),
      JSON.stringify({ want, waited: waited.length, most, left: L.faces[0].agents.length, off }));
  }
}
