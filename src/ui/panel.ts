// Station strip, station panel, line panel, ticker and toasts. Plain DOM, rebuilt on actions and lightly refreshed on a timer.
import { UPGRADES, LINE_UPGRADES } from '../sim/sim.ts';
import type { Sim } from '../sim/sim.ts';
import type { GameState } from '../sim/types.ts';

export const fmt = (n: number): string => '£' + Math.floor(n).toLocaleString('en-GB');

const BLURB: Record<string, string | undefined> = {
  'heaton-chapel': 'Two platforms on the slow lines, 1,200 commuters a morning, and a footbridge that needs lifts.',
  'levenshulme': 'Up on the embankment over the A6. Busy both ways all day.',
  'ardwick': 'Two bare platforms by the depot. Almost nobody uses it. It is very cheap.',
  'piccadilly': 'The end of the line. Platforms 13 and 14 alone would pay for Stockport ten times over.',
  'davenport': 'First stop down the Hazel Grove line. Its own trains turn round in Stockport platform 1; Manchester means changing.',
  'woodsmoor': 'Two short platforms under Moorland Road. Quiet, leafy and full of commuters at eight.',
  'hazel-grove': 'The end of the branch, and a big car park full of people driving in to catch a train.',
};
/** How far a station is from Stockport, which way: the branch runs south. */
const milesFrom = (miles: number): string => `${Math.abs(miles)} mi${miles < 0 ? ' south' : ''}`;

/** The page's elements the UI writes to, by id. */
export interface Els {
  cash: HTMLElement; clock: HTMLElement; sp1: HTMLButtonElement; sp3: HTMLButtonElement; sp10: HTMLButtonElement; vLine: HTMLButtonElement;
  toast: HTMLElement; strip: HTMLElement; panel: HTMLElement; linePanel: HTMLElement; reset: HTMLButtonElement;
  hour: HTMLInputElement; hourLbl: HTMLElement; hourLive: HTMLButtonElement;
}
/** What the page does when the player acts: the UI never touches the sim's surroundings itself. */
export interface Handlers {
  speed: (s: number) => void; viewLine: () => void; focusStation: (i: number) => void; changed: () => void; reset: () => void;
  /** Preview what an upgrade at a station adds on the map (its parts as a ghost, the camera on them), or null to stop. */
  preview: (i: number, id: string | null) => void;
  /** An upgrade was just bought: show it rising into place. */
  built: (i: number, id: string) => void;
  /** Lock the light to an hour of the day, or null to follow the clock again. The sim's clock never changes. */
  lockHour: (hour: number | null) => void;
}

export class UI {
  sim: Sim;
  els: Els;
  on: Handlers;
  selected: number;
  /** The upgrade card chosen at the selected station, previewed on the map, or null. */
  picked: string | null;
  toastTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(sim: Sim, els: Els, on: Handlers) {
    this.sim = sim; this.els = els; this.on = on; this.selected = 0; this.picked = null; this.toastTimer = undefined;
    els.sp1.addEventListener('click', () => on.speed(1)); els.sp3.addEventListener('click', () => on.speed(3)); els.sp10.addEventListener('click', () => on.speed(10));
    els.vLine.addEventListener('click', () => on.viewLine());
    els.hour.addEventListener('input', () => on.lockHour(+els.hour.value));
    els.hourLive.addEventListener('click', () => on.lockHour(null));
    els.reset.addEventListener('click', () => {
      const b = els.reset;
      if (b.dataset['arm']) { delete b.dataset['arm']; b.textContent = 'Start over'; on.reset(); }
      else { b.dataset['arm'] = '1'; b.textContent = 'Tap again to wipe progress'; setTimeout(() => { delete b.dataset['arm']; b.textContent = 'Start over'; }, 3000); }
    });
  }
  get g(): GameState { return this.sim.g; }
  toast(msg: string): void { const t = this.els.toast; t.textContent = msg; t.hidden = false; clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { t.hidden = true; }, 4000); }
  /** Show the light's hour: the slider tracks the clock unless it's locked, and the release button shows while it is. */
  setLight(hour: number, locked: boolean): void {
    const h = ((hour % 24) + 24) % 24, txt = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    if (!locked) { const v = (Math.round(h * 4) / 4).toString(); if (this.els.hour.value !== v) this.els.hour.value = v; }
    if (this.els.hourLbl.textContent !== txt) this.els.hourLbl.textContent = txt;
    this.els.hourLive.hidden = !locked;
  }
  setSpeed(s: number): void { this.els.sp1.setAttribute('aria-pressed', String(s === 1)); this.els.sp3.setAttribute('aria-pressed', String(s === 3)); this.els.sp10.setAttribute('aria-pressed', String(s === 10)); }
  select(i: number): void { this.pick(null); this.selected = i; this.buildStrip(); this.buildPanel(); this.on.focusStation(i); }

  buildAll(): void { this.buildStrip(); this.buildPanel(); this.buildLinePanel(); }
  buildStrip(): void {
    const { strip } = this.els, g = this.g; strip.innerHTML = '';
    this.sim.S.forEach((s, i) => {
      const b = document.createElement('button'); b.className = 'card' + (g.owned[i] ? '' : ' lock'); b.setAttribute('aria-pressed', String(i === this.selected));
      b.innerHTML = `<div class="mi">${milesFrom(s.miles)}</div><div class="nm">${s.name}</div><div class="st" data-st="${i}"></div>`;
      b.addEventListener('click', () => this.select(i)); strip.appendChild(b);
    });
    this.updateStrip();
  }
  updateStrip(): void {
    const g = this.g;
    this.els.strip.querySelectorAll<HTMLElement>('[data-st]').forEach(el => {
      const i = +(el.dataset['st'] ?? -1), S = g.st[i], s = this.sim.S[i]; if (!S || !s) return;
      const txt = g.owned[i] ? `${S.waiting} waiting` : fmt(s.price); if (el.textContent !== txt) el.textContent = txt;
    });
  }
  buildPanel(): void {
    const i = this.selected, s = this.sim.station(i), g = this.g, panel = this.els.panel;
    if (!g.owned[i]) {
      const blocked = i > 0 && !g.owned[i - 1], needs = this.sim.stationNeeds(i);
      const label = blocked ? 'Buy the stations before it first' : needs ? `Needs ${needs.station.name}'s ${needs.name}` : `Buy as a halt · ${fmt(s.price)}`;
      panel.innerHTML = `<h2>${s.name} <small>${milesFrom(s.miles)} from Stockport · locked</small></h2>
        <p class="blurb">${BLURB[s.id] || ''}</p>
        <button class="buy" id="buyStation" ${this.sim.canBuyStation(i) ? '' : 'disabled'}>${label}</button>`;
      panel.querySelector('#buyStation')?.addEventListener('click', () => { if (this.sim.buyStation(i)) { this.toast(`${s.name} is yours. Trains now call here.`); this.buildStrip(); this.buildPanel(); this.buildLinePanel(); this.on.changed(); } });
      return;
    }
    panel.innerHTML = `<h2>${s.name} <small>${milesFrom(s.miles)} · catchment ${s.catchment.toLocaleString('en-GB')}/h at peak</small></h2>
      <div class="stats"><div><small>Waiting</small><b id="pWait"></b></div><div><small>Boarded</small><b id="pBoard"></b></div><div><small>Arrived</small><b id="pOff"></b></div><div><small>Revenue</small><b id="pRev"></b></div><div><small>Gave up</small><b id="pLost"></b></div><div><small>Changed</small><b id="pChg"></b></div></div>
      <div class="ups" id="ups"></div>`;
    // what can be built next, a card each, and what's built, in one line; the rest stays hidden until it's reachable
    const ups = panel.querySelector('#ups'), bought = this.sim.ups(i), sim = this.sim, done: string[] = [];
    for (const u of sim.visibleUpgrades(i)) {
      const name = sim.upgradeName(i, u);
      if (bought[u.id]) { done.push(name); continue; }
      const price = sim.upgradePrice(i, u), opens = sim.opens(i, u.id);
      const d = document.createElement('article'); d.className = 'ucard' + (u.stage ? ' grow' : ''); d.dataset['card'] = u.id;
      // the tags row is where a badge goes (a stage now; a manager's pick later)
      d.innerHTML = `<button class="pick" aria-pressed="false" data-pick="${u.id}">
          <span class="head"><b>${name}</b><span class="price">${fmt(price)}</span></span>
          ${u.stage ? '<span class="tags"><span class="tag">Next stage</span></span>' : ''}
          <span class="adds">${sim.upgradeDesc(i, u)}</span>
          ${opens.length ? `<span class="opens"><span>Then</span> ${opens.map(o => `<i>${o}</i>`).join('')}</span>` : ''}
        </button>
        <div class="act"><span class="togo" data-togo="${u.id}"><meter min="0" max="${price}" value="0"></meter><span></span></span><button class="buyup" data-up="${u.id}">Buy</button></div>`;
      d.querySelector('.pick')?.addEventListener('click', () => this.pick(this.picked === u.id ? null : u.id));
      d.querySelector('.buyup')?.addEventListener('click', () => {
        if (!sim.buyUpgrade(i, u.id)) return;
        this.picked = null; this.toast(`${name} built at ${s.name}`); this.buildPanel(); this.buildLinePanel(); this.on.built(i, u.id); this.on.changed();
      });
      ups?.appendChild(d);
    }
    if (!ups?.children.length) ups?.insertAdjacentHTML('beforeend', '<p class="hint">Nothing more to build here yet.</p>');
    else ups.insertAdjacentHTML('afterbegin', '<p class="hint">Tap a card to see it on the map.</p>');
    if (done.length) panel.insertAdjacentHTML('beforeend', `<p class="built"><span>Built</span> ${done.map(n => `<i>${n}</i>`).join('')}</p>`);
    this.markPicked();
    this.updatePanel();
  }
  /** Choose an upgrade card (or none): the map previews it. */
  pick(id: string | null): void {
    if (this.picked === id) return;
    this.picked = id; this.markPicked(); this.on.preview(this.selected, id);
  }
  markPicked(): void { this.els.panel.querySelectorAll<HTMLElement>('[data-pick]').forEach(b => { const on = b.dataset['pick'] === this.picked; b.setAttribute('aria-pressed', String(on)); b.parentElement?.classList.toggle('sel', on); }); }
  updatePanel(): void {
    const i = this.selected, g = this.g, S = this.sim.state(i), panel = this.els.panel;
    if (!g.owned[i]) { const b = panel.querySelector<HTMLButtonElement>('#buyStation'); if (b) b.disabled = !this.sim.canBuyStation(i); return; }
    const set = (id: string, v: string) => { const el = panel.querySelector('#' + id); if (el && el.textContent !== v) el.textContent = v; };
    set('pWait', String(S.waiting)); set('pBoard', S.boarded.toLocaleString('en-GB')); set('pOff', S.alighted.toLocaleString('en-GB')); set('pRev', fmt(S.revenue)); set('pLost', S.lost.toLocaleString('en-GB')); set('pChg', S.changed.toLocaleString('en-GB'));
    // each card's Buy shows once the money is there; until then, how far there is to go
    panel.querySelectorAll<HTMLElement>('[data-card]').forEach(card => {
      const u = UPGRADES.find(u => u.id === card.dataset['card']); if (!u) return;
      const price = this.sim.upgradePrice(i, u), can = this.sim.canBuyUpgrade(i, u.id), short = price - g.cash;
      card.classList.toggle('can', can);
      const m = card.querySelector('meter'), t = card.querySelector('.togo > span'), v = String(Math.max(0, Math.min(price, Math.floor(g.cash))));
      if (m && m.getAttribute('value') !== v) m.setAttribute('value', v);
      const txt = short > 0 ? `${fmt(short)} to go` : ''; if (t && t.textContent !== txt) t.textContent = txt;
    });
  }
  buildLinePanel(): void {
    const g = this.g, lp = this.els.linePanel, sim = this.sim;
    const branch = sim.svcs.slice(1).filter(v => sim.unitsFor(v) > 0).length ? ' · Hazel Grove line open' : '';
    lp.innerHTML = `<h2>The line <small>${sim.unitsInService()} unit${sim.unitsInService() === 1 ? '' : 's'} · ${sim.carsPerUnit()}-car · ${g.line.timetable ? '90' : '75'} mph${branch}</small></h2><div class="ups" id="lups"></div>`;
    const holder = lp.querySelector('#lups');
    for (const u of LINE_UPGRADES) {
      if (!sim.lineReady(u.id)) continue;   // extra units wait for room to turn at Stockport
      const lvl = g.line[u.id], done = lvl >= u.max, price = done ? 0 : (u.prices[lvl] ?? 0);
      const d = document.createElement('div'); d.className = 'up' + (done ? ' done' : '');
      d.innerHTML = `<div class="t"><b>${u.name} ${u.max > 1 ? `(${lvl}/${u.max})` : ''}</b><span>${u.desc}</span></div><button ${done || g.cash < price ? 'disabled' : ''} data-lu="${u.id}">${done ? 'Done' : fmt(price)}</button>`;
      if (!done) d.querySelector('button')?.addEventListener('click', () => { if (sim.buyLine(u.id)) { this.toast(`${u.name}: done`); this.buildLinePanel(); this.on.changed(); } });
      holder?.appendChild(d);
    }
  }
  updateLinePanel(): void {
    this.els.linePanel.querySelectorAll<HTMLButtonElement>('[data-lu]').forEach(b => {
      const u = LINE_UPGRADES.find(u => u.id === b.dataset['lu']); if (!u) return;
      const lvl = this.g.line[u.id], price = u.prices[lvl]; if (lvl < u.max && price !== undefined) b.disabled = this.g.cash < price;
    });
  }
  tick(): void {
    const g = this.g, c = fmt(g.cash); if (this.els.cash.textContent !== c) this.els.cash.textContent = c;
    const ck = `Day ${g.day} · ${this.sim.clock()}`; if (this.els.clock.textContent !== ck) this.els.clock.textContent = ck;
    this.updateStrip(); this.updatePanel(); this.updateLinePanel();
  }
}
