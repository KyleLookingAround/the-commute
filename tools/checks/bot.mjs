// The sensible bot (tools/bot.mjs) plays 8 sim hours (about three and a half game days) on seeds 1-3 with no error, and
// the same seed gives the same PLAY twice. It also plays two whole contracts on seed 1 (renewing at Piccadilly, buying
// perks, playing again) twice over with the same runs, reputation and perks, and the second contract holds the perks.
// Its numbers against tools/baseline.json are reported by the Balance workflow, not judged here. No browser.
import { play, career } from '../bot.mjs';

export default async function ({ ok }) {
  for (const seed of [1, 2, 3]) {
    let a, b, err = null;
    try { a = play(seed, 8); b = play(seed, 8); } catch (e) { err = e; }
    ok(`bot: seed ${seed} plays 8 sim hours without an error`, !err, err && String(err.message));
    if (!err) ok(`bot: seed ${seed} gives the same game twice`, a.play === b.play, `${a.play} vs ${b.play}`);
  }
  let a, b, err = null;
  try { a = career(1, 2, 8); b = career(1, 2, 8); } catch (e) { err = e; }
  const key = runs => runs.map(r => `${r.play} ★${r.rep} ${r.perks.join('+')}`).join(' | ');
  ok('bot: seed 1 plays two contracts the same twice, the second with the perks the first bought', !err && key(a) === key(b) && a[1].perks.length > 0 && a[0].banked > 0, err ? String(err.message) : key(a));
}
