// The settings sheet: sound on or off and its volume, and graphics for older phones (High, Low, or shadows, fewer
// figures and sharpness one by one). Opened from the stage's settings button; it changes nothing in the game, and the
// settings are kept on this device apart from the save (src/app/prefs.ts, through main.ts).
import './styles/settings.css';
import { DEFAULT_PREFS, LOW, type Prefs } from '../app/prefs.ts';

type Toggle = 'sound' | 'shadows' | 'fewer' | 'sharp';

export class Settings {
  readonly sheet: HTMLDialogElement;
  private prefs: Prefs;
  private readonly changed: (p: Prefs) => void;
  private readonly toggles = new Map<Toggle, HTMLButtonElement>();
  private readonly volume: HTMLInputElement;
  private readonly high: HTMLButtonElement;
  private readonly low: HTMLButtonElement;

  constructor(button: HTMLButtonElement, prefs: Prefs, changed: (p: Prefs) => void) {
    this.prefs = { ...prefs }; this.changed = changed;
    const d = this.sheet = document.createElement('dialog'); d.className = 'settings'; d.id = 'settings'; d.setAttribute('aria-labelledby', 'setTitle');
    d.innerHTML = `<div class="set-head"><h2 id="setTitle">Settings</h2><button class="set-close" aria-label="Close">✕</button></div>
      <section><h3>Sound</h3><div class="set-row"><button data-t="sound" aria-pressed="false">Sound</button>
      <label class="set-vol">Volume<input type="range" min="0" max="1" step="0.05" aria-label="Volume"></label></div></section>
      <section><h3>Graphics</h3><div class="set-row set-seg"><button data-q="high" aria-pressed="false">High</button><button data-q="low" aria-pressed="false">Low</button></div>
      <div class="set-row"><button data-t="shadows" aria-pressed="false">Shadows</button><button data-t="fewer" aria-pressed="false">Fewer people</button><button data-t="sharp" aria-pressed="false">Sharp</button></div>
      <p class="set-note">Low is lighter on older phones. Settings stay on this device.</p></section>`;
    document.body.appendChild(d);
    const q = <T extends Element>(sel: string) => d.querySelector<T & Element>(sel)!;
    for (const b of d.querySelectorAll<HTMLButtonElement>('[data-t]')) {
      const t = b.dataset['t'] as Toggle; this.toggles.set(t, b);
      b.addEventListener('click', () => this.set({ [t]: !this.prefs[t] }));
    }
    this.volume = q<HTMLInputElement>('input');
    this.volume.addEventListener('input', () => this.set({ volume: Number(this.volume.value), sound: Number(this.volume.value) > 0 || this.prefs.sound }));
    this.high = q<HTMLButtonElement>('[data-q="high"]'); this.low = q<HTMLButtonElement>('[data-q="low"]');
    this.high.addEventListener('click', () => this.set({ shadows: DEFAULT_PREFS.shadows, fewer: DEFAULT_PREFS.fewer, sharp: DEFAULT_PREFS.sharp }));
    this.low.addEventListener('click', () => this.set({ ...LOW }));
    q<HTMLButtonElement>('.set-close').addEventListener('click', () => d.close());
    // a tap on the backdrop (outside the sheet's box) closes it too
    d.addEventListener('click', e => { if (e.target === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); } });
    d.addEventListener('close', () => button.setAttribute('aria-expanded', 'false'));
    button.setAttribute('aria-haspopup', 'dialog'); button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => { d.showModal(); button.setAttribute('aria-expanded', 'true'); });
    this.show();
  }

  private set(p: Partial<Prefs>): void { this.prefs = { ...this.prefs, ...p }; this.show(); this.changed({ ...this.prefs }); }

  private show(): void {
    const p = this.prefs;
    for (const [t, b] of this.toggles) b.setAttribute('aria-pressed', String(p[t]));
    const sb = this.toggles.get('sound'); if (sb) sb.textContent = p.sound ? 'Sound on' : 'Sound off';
    this.volume.value = String(p.volume); this.volume.disabled = !p.sound;
    const isLow = p.shadows === LOW.shadows && p.fewer === LOW.fewer && p.sharp === LOW.sharp;
    const isHigh = p.shadows === DEFAULT_PREFS.shadows && p.fewer === DEFAULT_PREFS.fewer && p.sharp === DEFAULT_PREFS.sharp;
    this.high.setAttribute('aria-pressed', String(isHigh)); this.low.setAttribute('aria-pressed', String(isLow));
  }
}
