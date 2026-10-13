// The sheet's contents: its header (the open place), the strip of chips, one card for whatever place is open (a
// station, a train service, the sidings, a bus stop, or the whole network), the Buy bar, and the cash, clock and toasts
// over the map (docs/design/buying.md, One card for every place). Plain DOM, rebuilt on actions and lightly refreshed
// on a timer. Picking a card in portrait sinks the sheet to its peek, where the Buy bar holds it, so its ghost stands
// in open map.
import { UPGRADES, LINE_UPGRADES } from '../sim/sim.ts';
import type { LineUpgrade, Upgrade } from '../sim/places.ts';
import { pace } from '../sim/day.ts';
import { renewable, reputation } from '../sim/contract.ts';
import type { Sim } from '../sim/sim.ts';
import type { GameState } from '../sim/types.ts';
import type { At } from './sheet.ts';

/** What the UI needs of the sheet (src/ui/sheet.ts). */
export interface SheetLike { at: At; docked: boolean; to: (at: At) => void; fit: () => void }

export const fmt = (n: number): string => '£' + Math.floor(n).toLocaleString('en-GB');
// a sum short enough for a stats cell at 320 px, whatever the game has earned: £9,840, £83.3k, £176k, £1.25m
export const fmtShort = (n: number): string => {
  const a = Math.floor(n);
  if (a < 10_000) return fmt(a);
  const [d, u] = a < 1e6 ? [a / 1e3, 'k'] : [a / 1e6, 'm'];
  const t = d < 100 ? (Math.floor(d * (d < 10 ? 100 : 10)) / (d < 10 ? 100 : 10)).toString() : Math.floor(d).toString();
  return '£' + t + u;
};
const num = (n: number): string => Math.floor(n).toLocaleString('en-GB');

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
/** The name a place goes by on its chip, where its own is long. */
const SHORT: Record<string, string | undefined> = { 'route:stopper': 'Stopper', 'depot:stockport-sidings': 'Sidings' };
/** The Network card's id: not a place, but opened the same way (from the cash pill). */
export const NETWORK = 'network';

/** The page's elements the UI writes to, by id. */
export interface Els {
  /** The sheet's header: the open place's name, and its kind and one figure. */
  shName: HTMLElement; shSub: HTMLElement;
  /** The Buy bar: the picked card's name, what it adds, put it back, and Buy. */
  buybar: HTMLElement; barName: HTMLElement; barAdds: HTMLElement; barClose: HTMLButtonElement; barBuy: HTMLButtonElement;
  cash: HTMLButtonElement; clock: HTMLElement; sp1: HTMLButtonElement; sp3: HTMLButtonElement; sp10: HTMLButtonElement; vLine: HTMLButtonElement;
  toast: HTMLElement; strip: HTMLElement; panel: HTMLElement; reset: HTMLButtonElement;
  hour: HTMLInputElement; hourLbl: HTMLElement; hourLive: HTMLButtonElement;
}
/** What the page does when the player acts: the UI never touches the sim's surroundings itself. */
export interface Handlers {
  speed: (s: number) => void; viewLine: () => void; focusStation: (i: number) => void; changed: () => void; reset: () => void;
  /** Put the camera on a place that isn't a station (a train service's unit, the sidings, a stop's station). */
  focusPlace: (id: string) => void;
  /** Preview what an upgrade at a station adds on the map (its parts as a ghost, the camera on them), or null to stop. */
  preview: (i: number, id: string | null) => void;
  /** An upgrade was just bought: show it rising into place. */
  built: (i: number, id: string) => void;
  /** Put the camera on what an upgrade bought at a station built (a Built chip), with no ghost. */
  showBuilt: (i: number, id: string) => void;
  /** Show what a stage of the stopper or the sidings is about on the map (a unit for units and cars, the whole line for
   * its speed, the spare in the sidings), or null to stop previewing; bought: it was just bought (or its Built chip
   * tapped), so show the new train once it's out. */
  showLine: (id: string | null, bought?: boolean) => void;
  /** Lock the light to an hour of the day, or null to follow the clock again. The sim's clock never changes. */
  lockHour: (hour: number | null) => void;
  /** What buying an upgrade (at station i, or on the stopper or sidings when i is null) saves in minutes, or null. */
  saves: (i: number | null, id: string) => string | null;
  /** Open the renewal sheet (once the whole line is owned). */
  renew: () => void;
}

/** A stage on the open card, as its card, the Buy bar and the timer read it. */
interface Stage { name: string; adds: string; price: number; can: () => boolean; buy: () => boolean; pick: (on: boolean) => void }

export class UI {
  sim: Sim;
  els: Els;
  on: Handlers;
  /** The station last opened (kept in the save; the camera starts there). */
  selected: number;
  /** The place whose card is open, if not the selected station: a route, the sidings, a stop, or the Network card. */
  open: string | null = null;
  /** The stage card chosen on the open card, previewed on the map, or null. */
  picked: string | null;
  toastTimer: ReturnType<typeof setTimeout> | undefined;
  readonly sheet: SheetLike;
  /** A station card's More stats are open (kept as stations change). */
  more = false;
  /** The open card's stages, by id. */
  private stages = new Map<string, Stage>();
  constructor(sim: Sim, els: Els, on: Handlers, sheet: SheetLike) {
    this.sim = sim; this.els = els; this.on = on; this.selected = 0; this.picked = null; this.toastTimer = undefined; this.sheet = sheet;
    els.barClose.addEventListener('click', () => this.pick(null));
    // the bar's Buy is the picked card's own
    els.barBuy.addEventListener('click', () => { if (this.picked !== null) document.querySelector<HTMLButtonElement>(`[data-up="${this.picked}"]`)?.click(); });
    els.cash.addEventListener('click', () => this.show(NETWORK));
    els.sp1.addEventListener('click', () => on.speed(1)); els.sp3.addEventListener('click', () => on.speed(3)); els.sp10.addEventListener('click', () => on.speed(10));
    els.vLine.addEventListener('click', () => on.viewLine());
    els.hour.addEventListener('input', () => on.lockHour(+els.hour.value));
    els.hourLive.addEventListener('click', () => on.lockHour(null));
    els.reset.addEventListener('click', () => {
      const b = els.reset;
      if (b.dataset['arm']) { delete b.dataset['arm']; b.textContent = 'Start over'; on.reset(); }
      else { b.dataset['arm'] = '1'; b.textContent = 'Tap again to start over'; setTimeout(() => { delete b.dataset['arm']; b.textContent = 'Start over'; }, 3000); }
    });
  }
  get g(): GameState { return this.sim.g; }
  /** The id of the place whose card is open (or NETWORK). */
  get at(): string { return this.open ?? this.sim.P.station[this.selected]!; }
  toast(msg: string): void { const t = this.els.toast; t.textContent = msg; t.hidden = false; clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { t.hidden = true; }, 4000); }
  /** Show the light's hour: the slider tracks the clock unless it's locked, and the release button shows while it is. */
  setLight(hour: number, locked: boolean): void {
    const h = ((hour % 24) + 24) % 24, txt = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    if (!locked) { const v = (Math.round(h * 4) / 4).toString(); if (this.els.hour.value !== v) this.els.hour.value = v; }
    if (this.els.hourLbl.textContent !== txt) this.els.hourLbl.textContent = txt;
    this.els.hourLive.hidden = !locked;
  }
  setSpeed(s: number): void { this.els.sp1.setAttribute('aria-pressed', String(s === 1)); this.els.sp3.setAttribute('aria-pressed', String(s === 3)); this.els.sp10.setAttribute('aria-pressed', String(s === 10)); }
  /** Open station i's card and fly to it. */
  select(i: number): void { this.pick(null); this.selected = i; this.open = null; this.raise(); this.buildStrip(); this.buildPanel(); this.on.focusStation(i); }
  /** Open any place's card (a station's opens as select does), or the Network card, raising the sheet to show it and
   * flying to the place; fly false (a train tapped to ride with): the card opens in the sheet as it stands. */
  show(id: string, fly = true): void {
    const p = id === NETWORK ? null : this.sim.P.byId.get(id);
    if (p?.kind === 'station') { this.select(p.station!); return; }
    if (id !== NETWORK && !p) return;
    this.pick(null); this.open = id; if (fly) this.raise();
    this.buildStrip(); this.buildPanel(); this.tick();
    if (fly && p) this.on.focusPlace(id);
  }
  /** Raise the sheet from its peek to show the card. */
  private raise(): void { if (this.sheet.at === 'peek') this.sheet.to('half'); }
  /** The Buy bar shows the picked card while the sheet is sunk to its peek (portrait only: docked, the card shows). */
  updateBar(): void {
    const { buybar, barName, barAdds, barBuy } = this.els, g = this.g, s = this.picked !== null ? this.stages.get(this.picked) : undefined;
    const show = !!s && !this.sheet.docked && this.sheet.at === 'peek';
    if (buybar.hidden === show) { buybar.hidden = !show; this.els.buybar.parentElement?.classList.toggle('buying', show); this.sheet.fit(); }
    if (!show || !s) return;
    if (barName.textContent !== s.name) barName.textContent = s.name;
    if (barAdds.textContent !== s.adds) barAdds.textContent = s.adds;
    const can = s.can(), txt = can ? `Buy · ${s.price ? fmt(s.price) : 'Free'}` : `${fmt(s.price - g.cash)} to go`;
    if (barBuy.textContent !== txt) barBuy.textContent = txt;
    barBuy.disabled = !can; barBuy.dataset['for'] = this.picked ?? '';
  }

  buildAll(): void { this.buildStrip(); this.buildPanel(); }
  /** The strip: a chip for each station, then one for each train service running and the sidings (until the Places row,
   * part 13c). */
  buildStrip(): void {
    const { strip } = this.els, g = this.g, sim = this.sim, at = this.at; strip.innerHTML = '';
    sim.S.forEach((s, i) => {
      // a chip: the name and the waiting count, or fogged with the price; the next station to buy fills a meter
      const next = sim.offerable(i) && !sim.stationNeeds(i);
      const b = document.createElement('button'); b.className = 'card' + (g.owned[i] ? '' : ' lock'); b.setAttribute('aria-pressed', String(sim.P.station[i] === at));
      b.innerHTML = `<span class="nm">${s.name.replace('Manchester ', '')}</span><span class="st" data-st="${i}"></span>${next ? `<meter min="0" max="${sim.stationPrice(i)}" value="0" data-sm="${i}"></meter>` : ''}`;
      b.setAttribute('aria-label', `${s.name}, ${milesFrom(s.miles)}`);
      b.addEventListener('click', () => this.select(i)); strip.appendChild(b);
    });
    for (const p of sim.P.all) {
      if ((p.kind !== 'route' && p.kind !== 'depot') || !sim.owns(p.id)) continue;
      const b = document.createElement('button'); b.className = 'card'; b.dataset['place'] = p.id; b.setAttribute('aria-pressed', String(p.id === at));
      b.innerHTML = `<span class="nm">${SHORT[p.id] ?? p.name}</span><span class="st" data-pst="${p.id}"></span>`;
      b.setAttribute('aria-label', p.name);
      b.addEventListener('click', () => this.show(p.id)); strip.appendChild(b);
    }
    this.updateStrip();
  }
  updateStrip(): void {
    const g = this.g;
    this.els.strip.querySelectorAll<HTMLElement>('[data-st]').forEach(el => {
      const i = +(el.dataset['st'] ?? -1), S = g.st[i], s = this.sim.S[i]; if (!S || !s) return;
      const txt = g.owned[i] ? `${S.waiting} waiting` : fmt(this.sim.stationPrice(i)); if (el.textContent !== txt) el.textContent = txt;
    });
    this.els.strip.querySelectorAll<HTMLElement>('[data-pst]').forEach(el => { const txt = this.figure(el.dataset['pst'] ?? ''); if (el.textContent !== txt) el.textContent = txt; });
    this.els.strip.querySelectorAll<HTMLMeterElement>('[data-sm]').forEach(m => { const v = String(Math.max(0, Math.floor(g.cash))); if (m.getAttribute('value') !== v) m.setAttribute('value', v); });
  }
  /** A route's or depot's one figure, for its chip and its header. */
  figure(id: string): string {
    const p = this.sim.P.byId.get(id); if (!p) return '';
    if (p.kind === 'route') { const n = this.sim.unitsFor(this.sim.svc(p.svc!)); return `${n} unit${n === 1 ? '' : 's'}`; }
    if (p.kind === 'depot') return this.g.line.spare ? 'spare ready' : 'no spare';
    return '';
  }
  /** The header's line under the name: the place's kind and one figure. */
  private sub(): string {
    const g = this.g, sim = this.sim, id = this.at;
    if (id === NETWORK) { const n = g.owned.filter(Boolean).length; return `Network · ${n} station${n === 1 ? '' : 's'}`; }
    const p = sim.P.get(id);
    if (p.kind === 'station') {
      const i = p.station!, halt = g.owned[i] && !Object.keys(g.places[id] ?? {}).length;
      return `${halt ? 'Halt' : 'Station'} · ${milesFrom(sim.station(i).miles)} · ${g.owned[i] ? `${g.st[i]?.waiting ?? 0} waiting` : fmt(sim.stationPrice(i))}`;
    }
    if (p.kind === 'stop') { const kind = p.stop?.kind === 'bus-station' ? 'Bus station' : 'Bus stop'; return `${kind} · ${sim.owns(id) ? `${num(g.st[p.station!]?.bus ?? 0)} by bus` : fmt(sim.price(id) ?? 0)}`; }
    if (p.kind === 'route') return `Train service · ${this.figure(id)}`;
    if (p.kind === 'depot') return `Depot · ${this.figure(id)}`;
    return p.kind === 'section' ? 'Line' : 'Junction';
  }
  buildPanel(): void {
    const id = this.at, panel = this.els.panel, name = id === NETWORK ? 'The network' : this.sim.P.get(id).name;
    if (this.els.shName.textContent !== name) this.els.shName.textContent = name;
    this.stages.clear(); panel.innerHTML = '';
    panel.dataset['place'] = id;
    if (id === NETWORK) this.networkCard();
    else {
      const p = this.sim.P.get(id);
      if (p.kind === 'station') this.stationCard(p.station!);
      else if (p.kind === 'stop') this.stopCard(id);
      else this.lineCard(id);
    }
    this.markPicked();
    this.updatePanel();
  }
  /** Four figures in a row, by id and label, and the rest behind More (if any). */
  private stats(four: [string, string][], more: [string, string][] = []): string {
    const cells = (l: [string, string][]) => l.map(([k, label]) => `<div><small>${label}</small><b id="${k}"></b></div>`).join('');
    return `<div class="stats four">${cells(four)}</div>` + (more.length ? `<details class="more"${this.more ? ' open' : ''}><summary>More</summary><div class="stats">${cells(more)}</div></details>` : '');
  }
  /** Lay out the open card's stages, a card each, and what's built as chips; the rest stays hidden until it's reachable. */
  private stageCards(list: { id: string; stage: Stage | null; grow?: boolean; saves: string | null; opens: string[]; built: string | null }[], built: (id: string) => void): void {
    const panel = this.els.panel, ups = document.createElement('div'); ups.className = 'ups'; ups.id = 'ups'; panel.appendChild(ups);
    const done: [string, string][] = [];
    for (const { id, stage: s, grow, saves, opens, built: b } of list) {
      if (b !== null) done.push([id, b]);
      if (!s) continue;
      this.stages.set(id, s);
      const d = document.createElement('article'); d.className = 'ucard' + (grow ? ' grow' : ''); d.dataset['card'] = id;
      // the tags row is where a badge goes (a stage now; a manager's pick later)
      d.innerHTML = `<button class="pick" aria-pressed="false" data-pick="${id}">
          <span class="head"><b>${s.name}</b><span class="price">${s.price ? fmt(s.price) : 'Free'}</span></span>
          ${grow ? '<span class="tags"><span class="tag">Next stage</span></span>' : ''}
          <span class="adds">${s.adds}</span>
          ${saved(saves)}
          ${opens.length ? `<span class="opens"><span>Then</span> ${opens.map(o => `<i>${o}</i>`).join('')}</span>` : ''}
        </button>
        <div class="act"><span class="togo"><meter min="0" max="${s.price}" value="0"></meter><span></span></span><button class="buyup" data-up="${id}">Buy</button></div>`;
      d.querySelector('.pick')?.addEventListener('click', () => this.pick(this.picked === id ? null : id));
      d.querySelector('.buyup')?.addEventListener('click', () => { if (s.buy()) this.changed(); });
      ups.appendChild(d);
    }
    if (!ups.children.length) ups.insertAdjacentHTML('beforeend', '<p class="hint">Nothing more to build here yet.</p>');
    else ups.insertAdjacentHTML('afterbegin', '<p class="hint">Tap a card to see it on the map.</p>');
    // each Built chip puts the camera on what it built
    if (done.length) {
      panel.insertAdjacentHTML('beforeend', `<p class="built"><span>Built</span> ${done.map(([k, n]) => `<button class="chip" data-built="${k}">${n}</button>`).join('')}</p>`);
      panel.querySelectorAll<HTMLElement>('[data-built]').forEach(b => b.addEventListener('click', () => { this.pick(null); built(b.dataset['built'] ?? ''); }));
    }
  }
  /** After a buy: the picked card is put back, and the strip, the card and the bar are rebuilt. */
  private changed(): void { this.picked = null; this.buildStrip(); this.buildPanel(); this.updateBar(); this.on.changed(); }
  /** A place not yet owned: what it is, and Buy with its price, or what it waits on. */
  private buyCard(blurb: string, label: string, can: boolean, buy: () => void): void {
    this.els.panel.innerHTML = `<p class="blurb">${blurb}</p><button class="buy" id="buyPlace" ${can ? '' : 'disabled'}>${label}</button>`;
    this.els.panel.querySelector('#buyPlace')?.addEventListener('click', buy);
  }
  private stationCard(i: number): void {
    const sim = this.sim, s = sim.station(i), g = this.g, panel = this.els.panel;
    if (!g.owned[i]) {
      const blocked = !sim.offerable(i), needs = sim.stationNeeds(i);
      const label = blocked ? 'Buy a station next to it first' : needs ? `Needs ${needs.station.name}'s ${needs.name}` : `Buy as a halt · ${fmt(sim.stationPrice(i))}`;
      this.buyCard(BLURB[s.id] || '', label, sim.canBuyStation(i), () => { if (sim.buyStation(i)) { this.toast(`${s.name} is yours. Trains now call here.`); this.changed(); } });
      return;
    }
    // homes are the census homes, grown (homes that grow); By cab only where there's a rank, By car and By bus where
    // there's a car park or bus link
    const b = sim.ups(i), more: [string, string][] = [['pHomes', 'Homes'], ['pOff', 'Arrived'], ['pChg', 'Changed']];
    if (sim.state(i).cabs.length) more.push(['pCab', 'By cab']);
    if (b.carpark) more.push(['pCar', 'By car']);
    if (b.bus) more.push(['pBus', 'By bus']);
    panel.innerHTML = this.stats([['pWait', 'Waiting'], ['pBoard', 'Boarded'], ['pRev', 'Revenue'], ['pLost', 'Gave up']], more);
    panel.querySelector('details')?.addEventListener('toggle', e => { this.more = (e.target as HTMLDetailsElement).open; });
    const bought = sim.ups(i);
    this.stageCards(sim.visibleUpgrades(i).map((u: Upgrade) => {
      const name = sim.upgradeName(i, u);
      const stage: Stage = {
        name, adds: sim.upgradeDesc(i, u), price: sim.upgradePrice(i, u), can: () => sim.canBuyUpgrade(i, u.id),
        buy: () => { if (!sim.buyUpgrade(i, u.id)) return false; this.toast(`${name} built at ${s.name}`); this.on.built(i, u.id); return true; },
        pick: on => this.on.preview(i, on ? u.id : null),
      };
      return bought[u.id] ? { id: u.id, stage: null, saves: null, opens: [], built: name }
        : { id: u.id, stage, grow: !!u.stage, saves: this.on.saves(i, u.id), opens: sim.opens(i, u.id), built: null };
    }), k => { const stop = sim.P.stopOf[i]; if (k === 'bus' && stop) this.show(stop); else this.on.showBuilt(i, k); });
  }
  /** A train service or the sidings: its figures, and its stages as cards like a station's. */
  private lineCard(id: string): void {
    const sim = this.sim, g = this.g, p = sim.P.get(id), panel = this.els.panel;
    if (p.kind === 'route') panel.innerHTML = this.stats([['rUnits', 'Units'], ['rCars', 'Cars'], ['rEvery', 'Every'], ['rAboard', 'Aboard']], id === sim.P.stopper ? [['rSpeed', 'Line speed'], ['rBus', 'By bus']] : []);
    else if (p.kind === 'depot') panel.innerHTML = this.stats([['dSpare', 'Spare unit'], ['dFails', 'Failures'], ['dBus', 'By bus']]);
    else { panel.innerHTML = '<p class="blurb">Comes with the stations at its ends.</p>'; return; }
    const step = (u: LineUpgrade, lvl: number) => u.max > 1 ? `${u.name} ${lvl + 1} of ${u.max}` : u.name;
    this.stageCards(sim.P.stagesFor(sim.net, id).filter(u => sim.lineReady(u.id)).map(x => {
      const u = x as LineUpgrade, lvl = g.line[u.id], price = sim.linePrice(u.id), name = step(u, lvl);
      const built = lvl ? (u.max > 1 ? `${u.name} ×${lvl}` : u.name) : null;
      if (lvl >= u.max || price === undefined) return { id: u.id, stage: null, saves: null, opens: [], built };
      const stage: Stage = {
        name, adds: price ? u.desc : 'The unit waiting in Stockport’s sidings goes into service', price, can: () => g.cash >= price,
        buy: () => { if (!sim.buyLine(u.id)) return false; this.toast(`${name}: done`); this.on.showLine(u.id, true); return true; },
        pick: on => this.on.showLine(on ? u.id : null),
      };
      return { id: u.id, stage, saves: this.on.saves(null, u.id), opens: lvl + 1 < u.max ? [step(u, lvl + 1)] : [], built };
    }), k => this.on.showLine(k, true));
  }
  /** A bus stop or bus station: what it does, and its figures once it's the player's. */
  private stopCard(id: string): void {
    const sim = this.sim, p = sim.P.get(id), i = p.station!, st = sim.station(i);
    if (!sim.owns(id)) {
      const price = sim.price(id) ?? 0, label = !sim.g.owned[i] ? `Buy ${st.name} first` : `Buy · ${fmt(price)}`;
      this.buyCard(p.stop?.desc ?? '', label, sim.canBuy(id), () => { if (sim.buy(id)) { this.toast(`${p.name} is yours`); this.on.built(i, 'bus'); this.changed(); } });
      return;
    }
    this.els.panel.innerHTML = this.stats([['sBus', 'By bus'], ['sWait', `At ${st.name.replace('Manchester ', '')}`]]) + `<p class="blurb">${p.stop?.desc ?? ''}</p>`;
    this.stageCards([], () => {});
  }
  /** The whole network: its figures, and once Piccadilly is owned, Renew the contract. */
  private networkCard(): void {
    const g = this.g, sim = this.sim, panel = this.els.panel;
    panel.innerHTML = this.stats([['nStations', 'Stations'], ['nBoard', 'Boarded'], ['nEarned', 'Earned'], ['nRep', 'Reputation']], [['nLost', 'Gave up'], ['nLate', 'Late'], ['nBus', 'By bus']]);
    panel.querySelector('details')?.addEventListener('toggle', e => { this.more = (e.target as HTMLDetailsElement).open; });
    // once the whole line is owned, the contract can be renewed, whenever the player likes; hidden until then
    if (renewable(g, sim.net.station('piccadilly').index)) {
      const d = document.createElement('article'); d.className = 'ucard can renew'; d.dataset['renew'] = '';
      d.innerHTML = `<button class="pick" id="renew"><span class="head"><b>Renew the contract</b><span class="price">★ <span id="lRep"></span></span></span>
        <span class="adds">Bank your reputation for perks and start again from Stockport, stronger. Play on as long as you like: it keeps counting.</span></button>`;
      d.querySelector('button')?.addEventListener('click', () => this.on.renew());
      const ups = document.createElement('div'); ups.className = 'ups'; ups.appendChild(d); panel.appendChild(ups);
    }
  }
  /** Choose a stage card on the open card (or none): the map previews it. */
  pick(id: string | null): void {
    if (this.picked === id) return;
    if (this.picked !== null) this.stages.get(this.picked)?.pick(false);
    this.picked = id; this.markPicked();
    if (id !== null) this.stages.get(id)?.pick(true);
    // a card picked in portrait sinks the sheet to its peek, where the Buy bar holds it, so its ghost is in open map
    if (id !== null && !this.sheet.docked) this.sheet.to('peek');
    this.updateBar();
  }
  markPicked(): void { mark(this.els.panel, 'pick', this.picked); }
  updatePanel(): void {
    const g = this.g, sim = this.sim, id = this.at, panel = this.els.panel;
    const set = (k: string, v: string) => { const el = panel.querySelector('#' + k); if (el && el.textContent !== v) el.textContent = v; };
    const p = id === NETWORK ? null : sim.P.get(id);
    if (p?.kind === 'station' && !g.owned[p.station!]) { const b = panel.querySelector<HTMLButtonElement>('#buyPlace'); if (b) b.disabled = !sim.canBuyStation(p.station!); return; }
    if (p?.kind === 'stop' && !sim.owns(id)) { const b = panel.querySelector<HTMLButtonElement>('#buyPlace'); if (b) b.disabled = !sim.canBuy(id); return; }
    if (p?.kind === 'station') {
      const i = p.station!, S = sim.state(i);
      set('pWait', String(S.waiting)); set('pBoard', num(S.boarded)); set('pOff', num(S.alighted)); set('pRev', fmtShort(S.revenue)); set('pLost', num(S.lost)); set('pChg', num(S.changed));
      set('pHomes', num(Math.round(sim.homes(i)))); set('pCab', num(S.cab)); set('pCar', num(S.car)); set('pBus', num(S.bus));
    } else if (p?.kind === 'route') {
      const v = sim.svc(p.svc!), mine = g.trains.filter(t => t.svc === v.id), every = sim.headway(v.id);
      set('rUnits', String(sim.unitsFor(v))); set('rCars', String(mine[0]?.cars ?? sim.carsPerUnit())); set('rEvery', every ? `${Math.round(every / 60)} min` : '–');
      set('rAboard', num(mine.reduce((n, t) => n + t.onboard, 0))); set('rSpeed', `${g.line.timetable ? 90 : 75} mph`); set('rBus', num(g.trouble.bused));
    } else if (p?.kind === 'depot') {
      set('dSpare', g.line.spare ? 'Ready' : 'None'); set('dFails', num(g.trouble.fails)); set('dBus', num(g.trouble.bused));
    } else if (p?.kind === 'stop') {
      const S = sim.state(p.station!); set('sBus', num(S.bus)); set('sWait', `${S.waiting} waiting`);
    } else if (!p) {
      set('nStations', String(g.owned.filter(Boolean).length)); set('nBoard', fmtCount(g.stats.boarded)); set('nEarned', fmtShort(g.earned)); set('nRep', `★ ${reputation(g)}`);
      set('nLost', fmtCount(g.stats.lost)); set('nLate', fmtCount(g.stats.late)); set('nBus', fmtCount(g.trouble.bused)); set('lRep', String(reputation(g)));
    }
    // each card's Buy shows once the money is there; until then, how far there is to go
    panel.querySelectorAll<HTMLElement>('[data-card]').forEach(card => {
      const s = this.stages.get(card.dataset['card'] ?? ''); if (!s) return;
      const can = s.can(), short = s.price - g.cash;
      card.classList.toggle('can', can);
      const m = card.querySelector('meter'), t = card.querySelector('.togo > span'), v = String(Math.max(0, Math.min(s.price, Math.floor(g.cash))));
      if (m && m.getAttribute('value') !== v) m.setAttribute('value', v);
      const txt = short > 0 ? `${fmt(short)} to go` : ''; if (t && t.textContent !== txt) t.textContent = txt;
    });
  }
  tick(): void {
    const g = this.g, c = fmt(g.cash); if (this.els.cash.textContent !== c) this.els.cash.textContent = c;
    // a fast-forward mark while the night races by, so the player knows why the time leapt
    const fast = pace(g.t) >= 3, ck = `Day ${g.day} · ${this.sim.clock()}${fast ? ' »' : ''}`;
    if (this.els.clock.textContent !== ck) { this.els.clock.textContent = ck; this.els.clock.title = fast ? 'The night passes quickly' : ''; }
    const sub = this.sub(); if (this.els.shSub.textContent !== sub) this.els.shSub.textContent = sub;
    this.updateStrip(); this.updatePanel(); this.updateBar();
  }
}
/** A count short enough for a stats cell at 320 px: 9,840, 83.3k, 1.25m. */
const fmtCount = (n: number): string => fmtShort(n).slice(1);
/** A card's line saying what it saves in minutes, from the reach, or nothing. */
const saved = (txt: string | null): string => txt ? `<span class="saves" data-saves>${txt}</span>` : '';
/** Mark the chosen card in a panel (by its data-<key> button), or none. */
function mark(root: HTMLElement, key: string, id: string | null): void {
  root.querySelectorAll<HTMLElement>(`[data-${key}]`).forEach(b => { const on = b.dataset[key] === id; b.setAttribute('aria-pressed', String(on)); b.parentElement?.classList.toggle('sel', on); });
}
