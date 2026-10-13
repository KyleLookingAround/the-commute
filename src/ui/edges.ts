// Edge markers: the next station to buy, when it's off the open map, stands at the open map's edge (beside or above the
// sheet) with its name and price and an arrow pointing to it, so the line ahead is never lost. A tap opens the station
// and flies there. The map keeps every gesture that starts on a marker (pointer events pass through to it): the map's
// own tap asks hit() whether it landed on one. Keyboard users get a button each. Placed every frame from where the
// station's label projects; nothing is made in the loop.

export class EdgeMarkers {
  private readonly els: HTMLButtonElement[];
  private readonly arrows: HTMLElement[];
  private readonly texts: HTMLElement[];
  private readonly at: number[];
  constructor(box: HTMLElement, count: number, tap: (i: number) => void) {
    this.els = []; this.arrows = []; this.texts = []; this.at = new Array<number>(count * 2).fill(0);
    for (let i = 0; i < count; i++) {
      const b = document.createElement('button'); b.className = 'edge'; b.hidden = true;
      b.innerHTML = '<i aria-hidden="true">▲</i><span></span>';
      b.addEventListener('click', () => tap(i));
      box.appendChild(b); this.els.push(b); this.arrows.push(b.querySelector('i')!); this.texts.push(b.querySelector('span')!);
    }
  }
  /** The station whose marker is under (x, y) on the stage, or -1. */
  hit(x: number, y: number): number {
    for (let i = 0; i < this.els.length; i++) {
      const el = this.els[i]; if (!el || el.hidden) continue;
      if (Math.abs(x - this.at[i * 2]!) <= el.offsetWidth / 2 && Math.abs(y - this.at[i * 2 + 1]!) <= el.offsetHeight / 2) return i;
    }
    return -1;
  }
  hide(i: number): void { const b = this.els[i]; if (b && !b.hidden) b.hidden = true; }
  /** Station i's label is at (sx, sy) on the stage (behind: behind the camera); the open map is (l, t) to (r, b). It
   * shows at the edge, pointing at it, when it's outside the open map, and hides when it's in view. */
  place(i: number, html: string, label: string, sx: number, sy: number, behind: boolean, l: number, t: number, r: number, b: number): void {
    const el = this.els[i], arrow = this.arrows[i], text = this.texts[i]; if (!el || !arrow || !text) return;
    const mx = Math.min(el.offsetWidth / 2 + 8 || 64, (r - l) / 2), my = Math.min(el.offsetHeight / 2 + 8 || 30, (b - t) / 2);
    const inside = !behind && sx > l + 8 && sx < r - 8 && sy > t + 8 && sy < b - 8;
    if (inside || r - l < 120 || b - t < 80) { this.hide(i); return; }
    const cx = (l + r) / 2, cy = (t + b) / 2;
    let dx = sx - cx, dy = sy - cy; if (behind) { dx = -dx; dy = -dy; }
    if (!dx && !dy) dy = -1;
    const k = Math.min(dx ? (r - l) / 2 / Math.abs(dx) : Infinity, dy ? (b - t) / 2 / Math.abs(dy) : Infinity);
    const px = Math.max(l + mx, Math.min(r - mx, cx + dx * k)), py = Math.max(t + my, Math.min(b - my, cy + dy * k));
    if (el.hidden) el.hidden = false;
    this.at[i * 2] = px; this.at[i * 2 + 1] = py;
    if (text.innerHTML !== html) { text.innerHTML = html; el.setAttribute('aria-label', label); }
    el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-50%)`;
    arrow.style.transform = `rotate(${(Math.atan2(dy, dx) + Math.PI / 2).toFixed(3)}rad)`;
  }
}
