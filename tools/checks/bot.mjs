// The sensible bot (tools/bot.mjs) plays 48 game hours on seeds 1-3 with no error, and the same seed gives the same
// PLAY twice. Its numbers against tools/baseline.json are reported by the Balance workflow, not judged here. No browser.
import { play } from '../bot.mjs';

export default async function ({ ok }) {
  for (const seed of [1, 2, 3]) {
    let a, b, err = null;
    try { a = play(seed, 48); b = play(seed, 48); } catch (e) { err = e; }
    ok(`bot: seed ${seed} plays 48 game hours without an error`, !err, err && String(err.message));
    if (!err) ok(`bot: seed ${seed} gives the same game twice`, a.play === b.play, `${a.play} vs ${b.play}`);
  }
}
