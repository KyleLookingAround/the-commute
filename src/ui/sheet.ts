// The platform sheet: the one panel over the map. In portrait it rises from the bottom at three heights: peek (the open
// station's name, the speed and the strip), half (the station's or the line's cards) and full. Only its handle and
// header drag it, so the map keeps every other gesture; it snaps to the nearest height, Esc lowers it a step, and the
// handle is a button (Raise, Lower). From 600 px wide, or in landscape, it docks to the left as a side panel with
// everything in it. It tells the page how much of the screen it covers (onCover), so the camera frames into the open
// map rather than behind it. With reduced motion it jumps between heights.

export type At = 'peek' | 'half' | 'full';
const ORDER: At[] = ['peek', 'half', 'full'];
/** Room left above the sheet at full height, for the cash and clock. */
const TOP = 60;

export class Sheet {
  readonly el: HTMLElement;
  at: At = 'peek';
  docked = false;
  /** How much of the screen it covers: the width at the left (docked) or the height at the bottom (portrait). */
  onCover: (left: number, bottom: number) => void = () => {};
  /** It moved to another height (or docked or undocked). */
  onMove: (at: At) => void = () => {};
  private readonly handle: HTMLButtonElement;
  private readonly wide = matchMedia('(min-width: 600px), (orientation: landscape)');
  private drag: { y: number; h: number; id: number; moved: boolean; t: number; v: number } | null = null;
  private noClick = false;

  constructor(el: HTMLElement, handle: HTMLButtonElement, grip: HTMLElement) {
    this.el = el; this.handle = handle;
    handle.addEventListener('click', () => {
      if (this.noClick) { this.noClick = false; return; }
      this.to(this.at === 'peek' ? 'half' : this.at === 'full' ? 'half' : 'peek');
    });
    // only the handle and the header drag; a press on the speed buttons is theirs
    grip.addEventListener('pointerdown', e => {
      if (this.docked || (e.target as HTMLElement).closest('button:not(.sh-handle)')) return;
      this.drag = { y: e.clientY, h: el.offsetHeight, id: e.pointerId, moved: false, t: e.timeStamp, v: 0 };
    });
    addEventListener('pointermove', e => {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      const dy = e.clientY - d.y;
      if (!d.moved && Math.abs(dy) < 8) return;
      if (!d.moved) { d.moved = true; grip.setPointerCapture?.(e.pointerId); el.classList.add('dragging'); }
      const dt = Math.max(1, e.timeStamp - d.t); d.v = (d.h - dy - el.offsetHeight) / dt; d.t = e.timeStamp;
      el.style.height = `${Math.max(this.height('peek') * 0.6, Math.min(this.height('full'), d.h - dy))}px`;
    });
    const end = (e: PointerEvent) => {
      const d = this.drag; if (!d || e.pointerId !== d.id) return;
      this.drag = null; if (!d.moved) return;
      this.noClick = true; setTimeout(() => { this.noClick = false; }, 0);
      el.classList.remove('dragging');
      // the nearest height, nudged on by a flick
      const h = el.offsetHeight + d.v * 160;
      let best: At = 'peek';
      for (const a of ORDER) if (Math.abs(this.height(a) - h) < Math.abs(this.height(best) - h)) best = a;
      this.to(best, true);
    };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    addEventListener('keydown', e => {
      if (e.key !== 'Escape' || this.docked || this.at === 'peek' || document.querySelector('dialog[open]')) return;
      this.lower();
    });
    this.wide.addEventListener('change', () => this.fit());
    addEventListener('resize', () => this.fit());
    new ResizeObserver(() => this.cover()).observe(el);
    this.fit();
  }

  raise(): void { const i = ORDER.indexOf(this.at); this.to(ORDER[Math.min(2, i + 1)]!); }
  lower(): void { const i = ORDER.indexOf(this.at); this.to(ORDER[Math.max(0, i - 1)]!); }

  /** Move to a height (in portrait; docked, the panel shows everything and only remembers it). */
  to(at: At, dragged = false): void {
    const was = this.at; this.at = at;
    this.fit(dragged);
    if (at !== was) this.onMove(at);
  }

  /** Lay the sheet out again: after a move, a resize, or its content changing height at the peek. */
  fit(dragged = false): void {
    const el = this.el, docked = this.wide.matches;
    if (docked !== this.docked) { this.docked = docked; this.onMove(this.at); }
    el.dataset['at'] = docked ? 'docked' : this.at;
    this.handle.setAttribute('aria-expanded', String(!docked && this.at !== 'peek'));
    this.handle.title = docked ? '' : this.at === 'peek' ? 'Raise' : 'Lower';
    if (docked) { el.style.height = ''; this.cover(); return; }
    // from where it stands to its new height, so the change animates (a dragged sheet starts from where it was let go)
    const from = el.offsetHeight, to = this.height(this.at);
    if (!dragged) el.style.height = `${from}px`;
    void el.offsetHeight;
    el.style.height = `${to}px`;
    this.cover();
  }

  /** A height in pixels: the peek fits its content, half and full are shares of the screen. */
  private height(at: At): number {
    const H = innerHeight;
    if (at === 'full') return H - TOP;
    if (at === 'half') return Math.round(H * (H < 600 ? 0.66 : 0.58));
    const grip = this.el.querySelector<HTMLElement>('.sh-grip'), peek = this.el.querySelector<HTMLElement>('.sh-peek');
    const cs = getComputedStyle(this.el), pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.rowGap || '0');
    // the peek's content is hidden at the other heights: measure it as it would be
    const hid = !!peek && getComputedStyle(peek).display === 'none';
    if (hid && peek) peek.style.display = 'flex';
    const h = (grip?.offsetHeight ?? 0) + (peek?.offsetHeight ?? 0) + pad;
    if (hid && peek) peek.style.display = '';
    return Math.min(Math.round(h), Math.round(H * 0.5));
  }

  private cover(): void {
    const el = this.el;
    if (this.docked) this.onCover(el.offsetLeft + el.offsetWidth, 0);
    else this.onCover(0, el.offsetHeight);
  }
}
