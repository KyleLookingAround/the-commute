// The stats view's switch (docs/DESIGN.md, Performance): opening the page with ?stats loads the overlay
// (src/ui/stats.ts) after the first frame, so none of it is in the script before it; ?stats&save=busy also opens the
// busy save (src/app/busy.ts) in place of the game on the device, without touching it: while the busy game is open the
// save's key reads as the busy save and nothing is written to it, so the player's own game is there next time.
import { busySave } from './busy.ts';
import { SAVE_KEY } from './storage.ts';
import type { Network } from '../sim/network.ts';

/** Call before the save is loaded: does nothing unless the page was opened with ?stats. */
export function statsView(net: Network): void {
  const q = new URLSearchParams(location.search);
  if (!q.has('stats')) return;
  const busy = q.get('save') === 'busy';
  if (busy) {
    const text = busySave(net), S = Storage.prototype, get = S.getItem, set = S.setItem, remove = S.removeItem;
    const ours = (s: Storage, k: string) => s === window.localStorage && k === SAVE_KEY;
    S.getItem = function (this: Storage, k: string) { return ours(this, k) ? text : get.call(this, k); };
    S.setItem = function (this: Storage, k: string, v: string) { if (!ours(this, k)) set.call(this, k, v); };
    S.removeItem = function (this: Storage, k: string) { if (!ours(this, k)) remove.call(this, k); };
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { void import('../ui/stats.ts').then(m => m.showStats(busy ? 'busy' : 'game')); }));
}
