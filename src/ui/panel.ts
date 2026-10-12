// Station strip, station panel, line panel, ticker and toasts. Plain DOM, rebuilt on actions and lightly refreshed on a timer.
import { UPGRADES, LINE_UPGRADES } from '../sim/sim.ts';
import { pace } from '../sim/day.ts';
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
  /** Put the camera on what an upgrade bought at a station built (a Built chip), with no ghost. */
  showBuilt: (i: number, id: string) => void;
  /** Show what a line upgrade is about on the map (a unit for units and cars, the whole line for its speed), or null to
   * stop previewing; bought: it was just bought (or its Built chip tapped), so show the new train once it's out. */
  showLine: (id: string | null, bought?: boolean) => void;
  /** Lock the light to an hour of the day, or null to follow the clock again. The sim's clock never changes. */
  lockHour: (hour: number | null) => void;
  /** What buying an upgrade (at station i, or on the line when i is null) saves in minutes, in words, or null. */
  saves: (i: number | null, id: string) => string | null;
}

export class UI {
  sim: Sim;
  els: Els;
  on: Handlers;
  selected: number;
  /** The upgrade card chosen at the selected station, previewed on the map, or null. */
  picked: string | null;
  /** The line upgrade card chosen, shown on the map, or null. */
  linePicked: string | null;
  toastTimer: ReturnType<typeof setTimeout> | undefined;
  constructor(sim: Sim, els: Els, on: Handlers) {
    this.sim = sim; this.els = els; this.on = on; this.selected = 0; this.picked = null; this.linePicked = null; this.toastTimer = undefined;
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
  select(i: number): void { this.pick(null); this.pickLine(null); this.selected = i; this.buildStrip(); this.buildPanel(); this.on.focusStation(i); }

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
    // homes are the census homes, grown (homes that grow); By cab only where there's a rank, By car and By bus where
    // there's a car park or bus link
    const b = this.sim.ups(i), cab = (this.sim.state(i).cabs.length ? '<div><small>By cab</small><b id="pCab"></b></div>' : '')
      + (b.carpark ? '<div><small>By car</small><b id="pCar"></b></div>' : '') + (b.bus ? '<div><small>By bus</small><b id="pBus"></b></div>' : '');
    panel.innerHTML = `<h2>${s.name} <small>${milesFrom(s.miles)}</small></h2>
      <div class="stats"><div><small>Homes</small><b id="pHomes"></b></div><div><small>Waiting</small><b id="pWait"></b></div><div><small>Boarded</small><b id="pBoard"></b></div><div><small>Arrived</small><b id="pOff"></b></div><div><small>Revenue</small><b id="pRev"></b></div><div><small>Gave up</small><b id="pLost"></b></div><div><small>Changed</small><b id="pChg"></b></div>${cab}</div>
      <div class="ups" id="ups"></div>`;
    // what can be built next, a card each, and what's built, in one line; the rest stays hidden until it's reachable
    const ups = panel.querySelector('#ups'), bought = this.sim.ups(i), sim = this.sim, done: [string, string][] = [];
    for (const u of sim.visibleUpgrades(i)) {
      const name = sim.upgradeName(i, u);
      if (bought[u.id]) { done.push([u.id, name]); continue; }
      const price = sim.upgradePrice(i, u), opens = sim.opens(i, u.id);
      const d = document.createElement('article'); d.className = 'ucard' + (u.stage ? ' grow' : ''); d.dataset['card'] = u.id;
      // the tags row is where a badge goes (a stage now; a manager's pick later)
      d.innerHTML = `<button class="pick" aria-pressed="false" data-pick="${u.id}">
          <span class="head"><b>${name}</b><span class="price">${fmt(price)}</span></span>
          ${u.stage ? '<span class="tags"><span class="tag">Next stage</span></span>' : ''}
          <span class="adds">${sim.upgradeDesc(i, u)}</span>
          ${saved(this.on.saves(i, u.id))}
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
    // each Built chip puts the camera on what it built
    if (done.length) {
      panel.insertAdjacentHTML('beforeend', `<p class="built"><span>Built</span> ${done.map(([id, n]) => `<button class="chip" data-built="${id}">${n}</button>`).join('')}</p>`);
      panel.querySelectorAll<HTMLElement>('[data-built]').forEach(b => b.addEventListener('click', () => { this.pick(null); this.on.showBuilt(i, b.dataset['built'] ?? ''); }));
    }
    this.markPicked();
    this.updatePanel();
  }
  /** Choose an upgrade card (or none): the map previews it. */
  pick(id: string | null): void {
    if (this.picked === id) return;
    if (id !== null && this.linePicked !== null) { this.linePicked = null; this.markLinePicked(); }
    this.picked = id; this.markPicked(); this.on.preview(this.selected, id);
  }
  /** Choose a line upgrade card (or none): the map shows what it's about. */
  pickLine(id: string | null): void {
    if (this.linePicked === id) return;
    if (id !== null) this.pick(null);
    this.linePicked = id; this.markLinePicked(); this.on.showLine(id);
  }
  markPicked(): void { mark(this.els.panel, 'pick', this.picked); }
  markLinePicked(): void { mark(this.els.linePanel, 'lpick', this.linePicked); }
  updatePanel(): void {
    const i = this.selected, g = this.g, S = this.sim.state(i), panel = this.els.panel;
    if (!g.owned[i]) { const b = panel.querySelector<HTMLButtonElement>('#buyStation'); if (b) b.disabled = !this.sim.canBuyStation(i); return; }
    const set = (id: string, v: string) => { const el = panel.querySelector('#' + id); if (el && el.textContent !== v) el.textContent = v; };
    set('pWait', String(S.waiting)); set('pBoard', S.boarded.toLocaleString('en-GB')); set('pOff', S.alighted.toLocaleString('en-GB')); set('pRev', fmt(S.revenue)); set('pLost', S.lost.toLocaleString('en-GB')); set('pChg', S.changed.toLocaleString('en-GB'));
    set('pHomes', Math.round(this.sim.homes(i)).toLocaleString('en-GB')); set('pCab', S.cab.toLocaleString('en-GB'));
    set('pCar', S.car.toLocaleString('en-GB')); set('pBus', S.bus.toLocaleString('en-GB'));
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
    lp.innerHTML = `<h2>The line <small>${sim.unitsInService()} unit${sim.unitsInService() === 1 ? '' : 's'} · ${sim.carsPerUnit()}-car · ${g.line.timetable ? '90' : '75'} mph${branch}<span id="lBus"></span></small></h2><div class="ups" id="lups"></div>`;
    // the next step of each line upgrade as a card, like a station's; what's bought on one line under them
    const holder = lp.querySelector('#lups'), done: [string, string][] = [];
    const step = (u: (typeof LINE_UPGRADES)[number], lvl: number) => u.max > 1 ? `${u.name} ${lvl + 1} of ${u.max}` : u.name;
    for (const u of LINE_UPGRADES) {
      if (!sim.lineReady(u.id)) continue;   // extra units wait for room to turn at Stockport
      const lvl = g.line[u.id], price = u.prices[lvl];
      if (lvl) done.push([u.id, u.max > 1 ? `${u.name} ×${lvl}` : u.name]);
      if (lvl >= u.max || price === undefined) continue;
      const opens = lvl + 1 < u.max ? [step(u, lvl + 1)] : [];
      const d = document.createElement('article'); d.className = 'ucard'; d.dataset['lcard'] = u.id;
      d.innerHTML = `<button class="pick" aria-pressed="false" data-lpick="${u.id}">
          <span class="head"><b>${step(u, lvl)}</b><span class="price">${fmt(price)}</span></span>
          <span class="adds">${u.desc}</span>
          ${saved(this.on.saves(null, u.id))}
          ${opens.length ? `<span class="opens"><span>Then</span> ${opens.map(o => `<i>${o}</i>`).join('')}</span>` : ''}
        </button>
        <div class="act"><span class="togo"><meter min="0" max="${price}" value="0"></meter><span></span></span><button class="buyup" data-lup="${u.id}">Buy</button></div>`;
      d.querySelector('.pick')?.addEventListener('click', () => this.pickLine(this.linePicked === u.id ? null : u.id));
      d.querySelector('.buyup')?.addEventListener('click', () => {
        if (!sim.buyLine(u.id)) return;
        this.linePicked = null; this.toast(`${step(u, lvl)}: done`); this.buildLinePanel(); this.on.showLine(u.id, true); this.on.changed();
      });
      holder?.appendChild(d);
    }
    if (holder?.children.length) holder.insertAdjacentHTML('afterbegin', '<p class="hint">Tap a card to see it on the map.</p>');
    if (done.length) {
      lp.insertAdjacentHTML('beforeend', `<p class="built"><span>Built</span> ${done.map(([id, n]) => `<button class="chip" data-lbuilt="${id}">${n}</button>`).join('')}</p>`);
      lp.querySelectorAll<HTMLElement>('[data-lbuilt]').forEach(b => b.addEventListener('click', () => { this.pickLine(null); this.on.showLine(b.dataset['lbuilt'] ?? null, true); }));
    }
    this.markLinePicked();
    this.updateLinePanel();
  }
  updateLinePanel(): void {
    const g = this.g;
    // people the replacement buses have carried, once any have run (the buses serve the line, not one station)
    const bus = this.els.linePanel.querySelector('#lBus'), bt = g.trouble.bused ? ` · ${Math.floor(g.trouble.bused).toLocaleString('en-GB')} by bus` : '';
    if (bus && bus.textContent !== bt) bus.textContent = bt;
    this.els.linePanel.querySelectorAll<HTMLElement>('[data-lcard]').forEach(card => {
      const u = LINE_UPGRADES.find(u => u.id === card.dataset['lcard']); if (!u) return;
      const price = u.prices[g.line[u.id]] ?? 0, short = price - g.cash;
      card.classList.toggle('can', short <= 0);
      const m = card.querySelector('meter'), t = card.querySelector('.togo > span'), v = String(Math.max(0, Math.min(price, Math.floor(g.cash))));
      if (m && m.getAttribute('value') !== v) m.setAttribute('value', v);
      const txt = short > 0 ? `${fmt(short)} to go` : ''; if (t && t.textContent !== txt) t.textContent = txt;
    });
  }
  tick(): void {
    const g = this.g, c = fmt(g.cash); if (this.els.cash.textContent !== c) this.els.cash.textContent = c;
    // a fast-forward mark while the night races by, so the player knows why the time leapt
    const fast = pace(g.t) >= 3, ck = `Day ${g.day} · ${this.sim.clock()}${fast ? ' »' : ''}`;
    if (this.els.clock.textContent !== ck) { this.els.clock.textContent = ck; this.els.clock.title = fast ? 'The night passes quickly' : ''; }
    this.updateStrip(); this.updatePanel(); this.updateLinePanel();
  }
}
/** A card's line saying what it saves in minutes, from the reach, or nothing. */
const saved = (txt: string | null): string => txt ? `<span class="saves" data-saves>${txt}</span>` : '';
/** Mark the chosen card in a panel (by its data-<key> button), or none. */
function mark(root: HTMLElement, key: string, id: string | null): void {
  root.querySelectorAll<HTMLElement>(`[data-${key}]`).forEach(b => { const on = b.dataset[key] === id; b.setAttribute('aria-pressed', String(on)); b.parentElement?.classList.toggle('sel', on); });
}
