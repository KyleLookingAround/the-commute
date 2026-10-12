// Weather and seasons (docs/DESIGN.md, Weather and seasons), each from a save moved to a spell, a day and an hour: a
// new game opens in spring sunshine with trees along the line and nothing falling; rain falls round the camera, the fog
// draws in, umbrellas go up on the platforms and the rain patters once sound is on; Fair weather in the settings takes
// the rain, the umbrellas and the murk off the map while the game's own weather is still rain; snow in winter falls and
// settles; fog closes the view in to a few hundred metres; and the year moves dusk: lamp-lit at 17:30 in winter,
// daylight at 17:30 in summer.
import { register } from 'tsx/esm/api';

export default async function ({ ok, open, SAVE_KEY }) {
  register();
  const { simAtHour } = await import('../../src/sim/day.ts');
  const first = await open({ width: 1280, height: 800 });
  await first.page.waitForTimeout(600);
  const fresh = await first.page.evaluate(() => window.__view.weather());
  ok('weather: a new game opens in spring sunshine, trees along the line and nothing falling', fresh.now === 'sun' && fresh.season === 0 && !fresh.falling && fresh.trees > 100 && !first.errs.length,
    JSON.stringify({ now: fresh.now, season: fresh.season, falling: fresh.falling, trees: fresh.trees, err: first.errs[0] }));
  // the page saves when it's hidden: say it is, rather than wait for its timer
  await first.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const save = await first.page.evaluate(k => localStorage.getItem(k), SAVE_KEY);
  await first.ctx.close();
  if (!save) { ok('weather: a save to move to each spell', false, 'no save written'); return; }
  /** Open this game moved to a spell on a day at an hour (the spell long in, and going on a while yet). */
  const at = async (now, day, hour, vp = { width: 1280, height: 800 }, touch = false) => {
    const s = JSON.parse(save), t = simAtHour(day, hour);
    s.g.t = t; s.g.day = day; s.at = Date.now();
    s.g.weather = { ...s.g.weather, now, was: now, since: t - 2000, until: t + 6000 };
    return open(vp, { save: JSON.stringify(s), touch });
  };
  const look = p => p.evaluate(() => window.__view.weather());

  // rain on the second morning: it falls, the view draws in, umbrellas go up, and it patters once sound is on
  const wet = await at('rain', 2, 8, { width: 390, height: 844 }, true);
  const { page } = wet;
  await page.evaluate(() => { const r = document.querySelector('#sp10').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }).then(([x, y]) => page.touchscreen.tap(x, y));
  let r = await look(page);
  for (let k = 0; k < 20 && !(r.brollies > 0 && r.patter > 0); k++) { await page.waitForTimeout(800); r = await look(page); }
  ok('weather: in the rain it falls round the camera, the view draws in, umbrellas go up and it patters', r.rain > 0.99 && r.falling && r.fogFar < fresh.fogFar && r.brollies > 0 && r.patter > 0 && !wet.errs.length,
    JSON.stringify({ rain: r.rain, falling: r.falling, fogFar: [fresh.fogFar, r.fogFar], brollies: r.brollies, patter: r.patter, err: wet.errs[0] }));
  // Fair weather: only the look changes
  const tap = async sel => { const [x, y] = await page.evaluate(s => { const q = document.querySelector(s).getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; }, sel); await page.touchscreen.tap(x, y); await page.waitForTimeout(300); };
  await tap('#vSet'); await tap('[data-t="weather"]'); await tap('.set-close');
  await page.waitForTimeout(600);
  const fair = await look(page), label = await page.evaluate(() => document.querySelector('[data-t="weather"]').textContent);
  ok('weather: Fair weather takes the rain, the umbrellas and the murk off the map, and the game\'s weather is still rain', fair.now === 'rain' && fair.rain === 0 && !fair.falling && fair.brollies === 0 && fair.fogFar >= fresh.fogFar * 0.99 && label === 'Fair weather' && !wet.errs.length,
    JSON.stringify({ now: fair.now, rain: fair.rain, falling: fair.falling, brollies: fair.brollies, fogFar: fair.fogFar, label, err: wet.errs[0] }));
  await wet.ctx.close();

  // snow in winter: it falls and settles
  const snow = await at('snow', 7, 12);
  await snow.page.click('#sp10');
  let s = await look(snow.page);
  // settling goes by game time a frame, so a slow machine settles less in the same wait: look for it lying and deepening
  for (let k = 0; k < 15 && s.settle < 0.03; k++) { await snow.page.waitForTimeout(800); s = await look(snow.page); }
  const lay = s.settle; await snow.page.waitForTimeout(2000); s = await look(snow.page);
  ok('weather: snow in winter falls and settles', s.season === 3 && s.snow > 0.99 && s.falling && lay >= 0.03 && s.settle > lay && !snow.errs.length, JSON.stringify({ season: s.season, snow: s.snow, falling: s.falling, settle: [lay, s.settle], err: snow.errs[0] }));
  await snow.ctx.close();

  // fog closes the view
  const fog = await at('fog', 2, 7);
  await fog.page.waitForTimeout(600);
  const f = await look(fog.page);
  ok('weather: fog closes the view to a few hundred metres', f.fog > 0.99 && f.fogFar < fresh.fogFar * 0.5 && !f.falling && !fog.errs.length, JSON.stringify({ fog: f.fog, fogFar: [fresh.fogFar, f.fogFar], err: fog.errs[0] }));
  await fog.ctx.close();

  // the year moves dusk: half past five is lamp-lit in winter and daylight in summer
  const lamps = [];
  for (const day of [7, 3]) {
    const p = await at('sun', day, 17.5);
    await p.page.waitForTimeout(600);
    lamps.push(await p.page.evaluate(() => ({ lamplight: window.__view.life().lamplight, season: window.__view.weather().season })));
    await p.ctx.close();
  }
  ok('weather: dusk comes early in winter: lamp-lit at 17:30 in winter, daylight at 17:30 in summer', lamps[0].season === 3 && lamps[0].lamplight > 0.5 && lamps[1].season === 1 && lamps[1].lamplight < 0.05, JSON.stringify(lamps));
}
