// Coming back to a changed map (docs/DESIGN.md, Coming back): after time away the map shows what happened in about
// three seconds before the toast. The camera starts wide (Whole line, where the network view shows the crowds); a
// column of coins rises over each station by what it earned while away, the biggest earners' sums on top; then the camera settles
// on the station the player left while the homes that grew rise there and its car park fills from where it stood. With
// reduced motion the coins stand still and the camera cuts back rather than flying. Fetched only when there was time away, after the
// first frame; only the view: the sim has already caught up (src/main.ts) and nothing here changes the game.

/** When each part plays, in real seconds from the start: the coins rise one after another, COIN_GAP apart, each taking
 * COIN_RISE; at SETTLE the camera goes back to the station and the homes and car parks are let go; at TOAST the toast
 * shows and the coins fade over FADE. With reduced motion the coins stand from the start, the camera moves at SETTLE at once, and they go at STILL. */
export const COIN_GAP = 0.12, COIN_RISE = 0.35, SETTLE = 1.5, TOAST = 3, FADE = 0.4, STILL = 2.2;
/** The most coins in a column, and what each step up stands for: a column of n coins for earnings from 500 × 2^(n-1). */
const MOST = 6, BASE = 500;
/** Only the biggest earners carry their sum, so the columns along the main line don't crowd each other. */
const SUMS = 3;
/** Pixels: a coin's height in the column, and how far above its station's point the column starts (clear of its name). */
const COIN_STEP = 7, LIFT = 34;

/** The map before the sim caught up: each station's takings, how many new homes stood, and how full its car park was. */
export interface Before { revenue: number[]; homes: number[]; parks: number[] }
export interface AwayMap {
  camera: { position: { x: number; y: number; z: number } } & import('three').Camera; canvas: HTMLCanvasElement; layer: HTMLElement;
  /** Each station's point (x, z, ground height). */
  stations: [number, number, number][];
  reduced: boolean;
  /** Put the camera wide at once (Whole line); settle it back on the player's station (a flight, unless reduced). */
  wide: () => void; settle: () => void;
  /** The player's own moves so far: once they move, the camera is theirs. */
  moves: () => number;
  /** Let the homes and the car parks go (they rise and fill from what stood before), and show the toast. */
  release: () => void; toast: () => void;
}

/** How many coins a station's earnings make (0 for none). */
export function coinsFor(earned: number): number { return earned < 1 ? 0 : Math.max(1, Math.min(MOST, 1 + Math.floor(Math.log2(Math.max(1, earned / BASE))))); }

export class WelcomeBack {
  t = 0; done = false; released = false; toasted = false; settled = false;
  /** Each station's column: its element, its coins and how many. */
  readonly cols: { i: number; el: HTMLElement; coins: HTMLElement[]; sum: HTMLElement }[] = [];
  private moves0: number;
  private v: import('three').Vector3;
  constructor(private o: AwayMap, earned: number[], V: new () => import('three').Vector3) {
    this.v = new V();
    const top = earned.map((e, i) => [e, i] as const).sort((a, b) => b[0] - a[0]).slice(0, SUMS).filter(([e]) => e >= 1).map(([, i]) => i);
    earned.forEach((e, i) => {
      const n = coinsFor(e); if (!n || !o.stations[i]) return;
      const el = document.createElement('div'); el.className = 'away-col'; el.dataset['station'] = String(i);
      const sum = document.createElement('span'); sum.className = 'away-sum'; sum.textContent = '+£' + Math.round(e).toLocaleString('en-GB');
      const coins: HTMLElement[] = [];
      for (let k = 0; k < n; k++) { const c = document.createElement('i'); c.className = 'away-coin'; c.style.bottom = `${k * COIN_STEP}px`; el.appendChild(c); coins.push(c); }
      sum.style.bottom = `${n * COIN_STEP + 14}px`; if (top.includes(i)) el.appendChild(sum);
      o.layer.appendChild(el); this.cols.push({ i, el, coins, sum });
    });
    o.wide(); this.moves0 = o.moves();
    this.place();
  }
  /** One frame: realDt the frame's real seconds. */
  update(realDt: number): void {
    if (this.done) return;
    this.t += Math.min(0.5, realDt);
    const t = this.t, o = this.o;
    for (const c of this.cols) c.coins.forEach((el, k) => {
      const u = o.reduced ? 1 : Math.max(0, Math.min(1, (t - k * COIN_GAP) / COIN_RISE));
      el.style.opacity = String(u); el.style.transform = `translateY(${(1 - u) * 24}px)`;
    });
    for (const c of this.cols) c.sum.style.opacity = String(o.reduced ? 1 : Math.max(0, Math.min(1, (t - c.coins.length * COIN_GAP) / COIN_RISE)));
    if (!this.released && t >= SETTLE) {
      this.released = true; o.release();
      if (o.moves() === this.moves0) { this.settled = true; o.settle(); }
    }
    const end = o.reduced ? STILL : TOAST;
    if (!this.toasted && t >= end) { this.toasted = true; o.toast(); }
    if (t >= end) {
      const f = o.reduced ? 0 : 1 - (t - end) / FADE;
      for (const c of this.cols) c.el.style.opacity = String(Math.max(0, f));
      if (f <= 0) { for (const c of this.cols) c.el.remove(); this.done = true; return; }
    }
    this.place();
  }
  /** Stand each column over its station as the camera sees it now. */
  private place(): void {
    const r = this.o.canvas.getBoundingClientRect(), lr = this.o.layer.getBoundingClientRect();
    for (const c of this.cols) {
      const [x, z, y] = this.o.stations[c.i]!, p = this.v.set(x, y, z).project(this.o.camera);
      const on = p.z < 1 && Math.abs(p.x) < 1.05 && Math.abs(p.y) < 1.05;
      c.el.style.display = on ? '' : 'none'; if (!on) continue;
      c.el.style.left = `${(p.x + 1) / 2 * r.width + r.left - lr.left}px`; c.el.style.top = `${(1 - p.y) / 2 * r.height + r.top - lr.top - LIFT}px`;
    }
  }
  /** For the checks: where the play is and what it shows. */
  stats(): { t: number; done: boolean; released: boolean; toasted: boolean; settled: boolean; cols: { i: number; coins: number; shown: number; y: number }[] } {
    return { t: this.t, done: this.done, released: this.released, toasted: this.toasted, settled: this.settled,
      cols: this.cols.map(c => ({ i: c.i, coins: c.coins.length, shown: c.coins.filter(e => +(e.style.opacity || 0) > 0.99).length, y: c.coins[0] ? +(/translateY\(([-\d.]+)px\)/.exec(c.coins[0].style.transform)?.[1] ?? 0) : 0 })) };
  }
}
