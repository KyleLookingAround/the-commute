// Moving around the map (window.__view.camera, .spot and .under). On a desktop page: dragging slides the map with the
// ground grabbed staying under the pointer; right-drag orbits; the wheel zooms towards the cursor; W moves forward, Q
// turns and = zooms in, and keys do nothing while the strip's slider has focus; dragging the slider glides the camera
// down the line; tapping a station's label flies there and opens its panel; tapping a train rides alongside it until
// the map is dragged; holding a key off sideways for seconds keeps the camera within reach of the line. On a phone page
// (touch, 360 px): one finger slides, two fingers pinch in towards themselves, twist to turn and drag up together to
// tilt; a double tap zooms in where it lands; the compass shows while north isn't up and a tap puts it back. With
// reduced motion, Whole line is there at once, with every station on the screen. Gestures land on the open map, beside
// or above the sheet. Throughout, the camera is never below the ground nor far from the line.
export default async function ({ ok, open }) {
  const cam = page => page.evaluate(() => window.__view.camera());
  const settle = page => page.waitForFunction(() => !window.__view.camera().flying, null, { timeout: 20000 }).catch(() => {});
  // a tap on a button at its middle: page.click can wait out its 30 s on "scrolling into view" while software-rendered
  // frames take seconds
  const press = async (page, sel) => { const c = await page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel); await page.mouse.click(c[0], c[1]); };
  const near = (a, b, tol) => !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) < tol;
  const lows = [];
  const watch = async (page, what) => { const c = await cam(page); if (c.above < 3.9 || c.fromLine > Math.max(300, c.r * 0.35) + 1) lows.push(`${what}: ${c.above.toFixed(1)} m up, ${c.fromLine.toFixed(0)} m off the line at r ${c.r.toFixed(0)}`); return c; };

  // ---- desktop ----
  {
    const { ctx, page, errs } = await open({ width: 1280, height: 800 });
    await page.waitForTimeout(500);
    const box = await page.evaluate(() => window.__view.open());
    const at = (fx, fy) => [box.x + box.w * fx, box.y + box.h * fy];
    // slide
    const [ax, ay] = at(0.5, 0.6), [bx, by] = at(0.3, 0.45);
    const g0 = await page.evaluate(([x, y]) => window.__view.under(x, y), [ax, ay]), c0 = await cam(page);
    await page.mouse.move(ax, ay); await page.mouse.down();
    for (let k = 1; k <= 10; k++) await page.mouse.move(ax + (bx - ax) * k / 10, ay + (by - ay) * k / 10);
    await page.mouse.up(); await page.waitForTimeout(100);
    const g1 = await page.evaluate(([x, y]) => window.__view.under(x, y), [bx, by]), c1 = await watch(page, 'slide');
    ok('camera: dragging slides the map, the ground grabbed staying under the pointer and the angle as it was', near(g0, g1, c0.r * 0.04) && Math.hypot(c1.tx - c0.tx, c1.tz - c0.tz) > 20 && c1.th === c0.th && c1.r === c0.r, `grabbed ${g0?.map(Math.round)}, now under ${g1?.map(Math.round)}`);
    // orbit
    await page.mouse.move(ax, ay); await page.mouse.down({ button: 'right' }); await page.mouse.move(ax + 120, ay - 40, { steps: 6 }); await page.mouse.up({ button: 'right' });
    const c2 = await watch(page, 'orbit');
    ok('camera: right-drag orbits round where the camera looks', Math.abs(c2.th - c1.th) > 0.3 && c2.tx === c1.tx && c2.tz === c1.tz, `th ${c1.th.toFixed(2)} → ${c2.th.toFixed(2)}`);
    // wheel towards the cursor
    const [wx, wy] = at(0.75, 0.7), w0 = await page.evaluate(([x, y]) => window.__view.under(x, y), [wx, wy]);
    await page.mouse.move(wx, wy); for (let k = 0; k < 4; k++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(30); }
    const c3 = await watch(page, 'wheel'), w1 = await page.evaluate(([x, y]) => window.__view.under(x, y), [wx, wy]);
    ok('camera: the wheel zooms towards the cursor', c3.r < c2.r * 0.6 && near(w0, w1, c2.r * 0.05), `r ${c2.r.toFixed(0)} → ${c3.r.toFixed(0)}, under the cursor ${w0?.map(Math.round)} → ${w1?.map(Math.round)}`);
    // keys
    const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); await page.waitForTimeout(60); };
    await page.mouse.click(...at(0.5, 0.5)); await page.waitForTimeout(400); await settle(page);
    const k0 = await cam(page); await hold('w', 400); const k1 = await watch(page, 'keys');
    const fwd = (k1.tx - k0.tx) * -Math.sin(k0.th) + (k1.tz - k0.tz) * -Math.cos(k0.th);
    await hold('q', 300); const k2 = await cam(page); await hold('=', 300); const k3 = await cam(page);
    await page.focus('#glide'); await hold('w', 300); const k4 = await cam(page);
    ok('camera: W moves forward, Q turns, = zooms in, and keys do nothing while the slider has focus', fwd > 3 && Math.abs(k2.th - k1.th) > 0.05 && k3.r < k2.r * 0.97 && k4.tx === k3.tx && k4.tz === k3.tz,
      `forward ${fwd.toFixed(0)} m, turned ${(k2.th - k1.th).toFixed(2)}, r ${k2.r.toFixed(0)} → ${k3.r.toFixed(0)}, focused moved ${Math.hypot(k4.tx - k3.tx, k4.tz - k3.tz).toFixed(1)} m`);
    // the strip's slider
    const s = await page.evaluate(() => { const r = document.getElementById('glide').getBoundingClientRect(); return [r.x, r.y + r.height / 2, r.width]; });
    const before = await cam(page);
    await page.mouse.move(s[0] + s[2] * 0.15, s[1]); await page.mouse.down(); await page.mouse.move(s[0] + s[2] * 0.85, s[1], { steps: 12 }); await page.mouse.up();
    await page.waitForTimeout(150); const after = await watch(page, 'slider');
    ok('camera: dragging the strip\'s slider glides the camera down the line', Math.hypot(after.tx - before.tx, after.tz - before.tz) > 3000 && after.fromLine < 50 && after.th === before.th, `moved ${Math.hypot(after.tx - before.tx, after.tz - before.tz).toFixed(0)} m, ${after.fromLine.toFixed(0)} m off the line`);
    // tap a station's label to fly there and open its panel
    await press(page, '#vLine'); await page.waitForTimeout(300); await settle(page); await page.waitForTimeout(200);
    const i = 2, spot = await page.evaluate(i => window.__view.spot('station', i), i);
    if (spot) await page.mouse.click(spot[0], spot[1] - 10);
    await page.waitForTimeout(300); const mid = await cam(page); await settle(page);
    const st = await page.evaluate(i => ({ sel: document.querySelectorAll('#strip .card')[i]?.getAttribute('aria-pressed'), h: document.getElementById('shName')?.textContent || '' }), i);
    const c5 = await watch(page, 'station');
    ok('camera: tapping a station on the map flies there, lifting on the way, and opens its panel', !!spot && mid.flying && st.sel === 'true' && /Levenshulme/.test(st.h) && c5.r < 400, `spot ${spot?.map(Math.round)}, flying ${mid.flying}, selected ${st.sel}, panel "${st.h.slice(0, 30)}", r ${c5.r.toFixed(0)}`);
    // tap a train to ride alongside it
    
    let tr = null;
    for (let k = 0; k < 12 && !tr; k++) tr = await page.evaluate(() => { for (let j = 0; j < 20; j++) { const p = window.__view.spot('train', j); if (p && p[1] > 120) return [j, ...p]; } return null; });
    if (!tr) { await press(page, '#vLine'); await settle(page); tr = await page.evaluate(() => { for (let j = 0; j < 20; j++) { const p = window.__view.spot('train', j); if (p && p[1] > 120) return [j, ...p]; } return null; }); }
    if (tr) await page.mouse.click(tr[1], tr[2]);
    await page.waitForTimeout(1500);
    const r1 = await cam(page), tp = await page.evaluate(j => window.__view.spot('train', j), tr?.[0] ?? 0);
    // the train moves on, and the camera with it (slowly while frames take seconds: the sim steps a tenth of a second a frame)
    await page.waitForFunction(([x, z]) => { const c = window.__view.camera(); return Math.hypot(c.tx - x, c.tz - z) > 5; }, [r1.tx, r1.tz], { timeout: 20000 }).catch(() => {});
    const r2 = await cam(page);
    await page.mouse.move(...at(0.5, 0.5)); await page.mouse.down(); await page.mouse.move(...at(0.45, 0.5), { steps: 3 }); await page.mouse.up();
    const r3 = await watch(page, 'ride');
    ok('camera: tapping a train rides alongside it until the map is dragged', !!tr && r1.riding === tr[0] && r2.riding === tr[0] && Math.hypot(r2.tx - r1.tx, r2.tz - r1.tz) > 5 && r3.riding === -1 && !!tp,
      `train ${tr?.[0]}, riding ${r1.riding} then ${r2.riding} (moved ${Math.hypot(r2.tx - r1.tx, r2.tz - r1.tz).toFixed(0)} m), after a drag ${r3.riding}`);
    // never lost: hold a key off sideways
    await page.mouse.click(...at(0.5, 0.5)); await page.waitForTimeout(400); await settle(page);
    await hold('d', 2500); const far = await watch(page, 'off sideways'); await hold('s', 2500); await watch(page, 'off backwards');
    ok('camera: holding a key away from the line keeps where it looks within reach of the line', far.fromLine <= Math.max(300, far.r * 0.35) + 1, `${far.fromLine.toFixed(0)} m off the line at r ${far.r.toFixed(0)}`);
    ok('camera: on the desktop page nothing went wrong', !errs.length, errs[0]);
    await ctx.close();
  }

  // ---- phone ----
  {
    const { ctx, page, errs } = await open({ width: 360, height: 740 }, { touch: true });
    await page.waitForTimeout(500);
    const cdp = await ctx.newCDPSession(page);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id, radiusX: 2, radiusY: 2, force: 1 })) });
    // fingers: from[k] to to[k], over n steps
    const gesture = async (from, to, n = 12) => {
      await touch('touchStart', from);
      for (let k = 1; k <= n; k++) { await touch('touchMove', from.map((p, j) => [p[0] + (to[j][0] - p[0]) * k / n, p[1] + (to[j][1] - p[1]) * k / n])); await page.waitForTimeout(16); }
      await touch('touchEnd', []); await page.waitForTimeout(80);
    };
    const box = await page.evaluate(() => window.__view.open());
    const at = (fx, fy) => [box.x + box.w * fx, box.y + box.h * fy];
    const under = p => page.evaluate(([x, y]) => window.__view.under(x, y), p);
    // one finger slides
    const a = at(0.5, 0.65), b = at(0.4, 0.4), u0 = await under(a), t0 = await cam(page);
    await gesture([a], [b]); const t1 = await watch(page, 'touch slide'), u1 = await under(b);
    ok('camera: one finger slides the map under it', near(u0, u1, t0.r * 0.05) && t1.th === t0.th, `grabbed ${u0?.map(Math.round)}, now under ${u1?.map(Math.round)}`);
    // two fingers pinch towards themselves
    const m = at(0.7, 0.6), um = await under(m);
    await gesture([[m[0] - 25, m[1]], [m[0] + 25, m[1]]], [[m[0] - 90, m[1]], [m[0] + 90, m[1]]]);
    const t2 = await watch(page, 'pinch'), um2 = await under(m);
    ok('camera: two fingers pinch to zoom in towards the fingers', t2.r < t1.r * 0.55 && near(um, um2, t1.r * 0.06), `r ${t1.r.toFixed(0)} → ${t2.r.toFixed(0)}, under the fingers ${um?.map(Math.round)} → ${um2?.map(Math.round)}`);
    // twist
    const c = at(0.5, 0.55), R = 70, rot = (q) => [[c[0] - R * Math.cos(q), c[1] - R * Math.sin(q)], [c[0] + R * Math.cos(q), c[1] + R * Math.sin(q)]];
    await gesture(rot(0), rot(-0.6)); const t3 = await watch(page, 'twist');
    ok('camera: two fingers twist to turn the map with them', Math.abs(t3.th - t2.th + 0.6) < 0.15 && Math.abs(t3.r / t2.r - 1) < 0.1, `th ${t2.th.toFixed(2)} → ${t3.th.toFixed(2)}`);
    // tilt
    await gesture([[c[0] - 50, c[1] + 40], [c[0] + 50, c[1] + 40]], [[c[0] - 50, c[1] - 60], [c[0] + 50, c[1] - 60]]); const t4 = await watch(page, 'tilt');
    await gesture([[c[0] - 50, c[1] - 60], [c[0] + 50, c[1] - 60]], [[c[0] - 50, c[1] + 80], [c[0] + 50, c[1] + 80]]); const t5 = await watch(page, 'tilt back');
    ok('camera: two fingers dragged up together tilt towards the horizon, and down tilt back', t4.ph > t3.ph + 0.2 && t5.ph < t4.ph - 0.2 && Math.abs(t4.r / t3.r - 1) < 0.05, `ph ${t3.ph.toFixed(2)} → ${t4.ph.toFixed(2)} → ${t5.ph.toFixed(2)}`);
    // double tap
    const d = at(0.3, 0.7), ud = await under(d), r0 = (await cam(page)).r;
    // the four touches sent at once, so a slow page can't stretch the gap between the taps
    await Promise.all([touch('touchStart', [d]), touch('touchEnd', []), touch('touchStart', [d]), touch('touchEnd', [])]); await page.waitForTimeout(150); await settle(page);
    const t6 = await watch(page, 'double tap'), ud2 = await under(d);
    ok('camera: a double tap zooms in where it lands', t6.r < Math.max(r0 * 0.6, 40.5) && near(ud, ud2, r0 * 0.06), `r ${r0.toFixed(0)} → ${t6.r.toFixed(0)}, under the tap ${ud?.map(Math.round)} → ${ud2?.map(Math.round)}`);
    // compass
    const shown = (await cam(page)).compass;
    const n = await page.evaluate(() => { const r = document.getElementById('vNorth').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.touchscreen.tap(...n); await page.waitForTimeout(150); await settle(page); await page.waitForTimeout(100);
    const t7 = await cam(page);
    const th = Math.abs(t7.th - Math.round(t7.th / (2 * Math.PI)) * 2 * Math.PI);
    ok('camera: the compass shows once the map is turned, and a tap puts north back up and hides it', shown && th < 0.01 && !t7.compass, `shown ${shown}, th after ${th.toFixed(3)}, still shown ${t7.compass}`);
    // never below the ground: tilt right down, close in
    await gesture([[c[0] - 50, c[1] + 80], [c[0] + 50, c[1] + 80]], [[c[0] - 50, c[1] - 140], [c[0] + 50, c[1] - 140]]);
    for (let k = 0; k < 3; k++) await gesture([[c[0] - 20, c[1]], [c[0] + 20, c[1]]], [[c[0] - 120, c[1]], [c[0] + 120, c[1]]]);
    await gesture([a], [at(0.5, 0.2)]); await watch(page, 'low and close');
    ok('camera: on the phone page nothing went wrong', !errs.length, errs[0]);
    // reduced motion: Whole line at once
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); await page.waitForSelector('html[data-sim="ready"]');
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById('vLine').click()); await page.waitForTimeout(120);
    const t8 = await cam(page);
    // every station on the screen: the view is fitted to the whole network's extent
    const off = await page.evaluate(() => Array.from(document.querySelectorAll('#lbls .lbl'), (_, i) => window.__view.spot('station', i)).filter(p => !p).length);
    ok('camera: with reduced motion Whole line is there at once, with every station on the screen', !t8.flying && t8.r > 4000 && off === 0, `flying ${t8.flying}, r ${t8.r.toFixed(0)}, ${off} off the screen`);
    await ctx.close();
  }
  ok('camera: never below the ground nor far from the line', !lows.length, lows.slice(0, 3).join('; '));
}
