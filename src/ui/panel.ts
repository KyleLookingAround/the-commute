// The sheet's contents: its header (the open place), the Places row, one card for whatever place is open (a station, a
// train service, the sidings, a bus stop, or the whole network) with Next to under it, the full list of places by kind,
// the Buy bar, and the cash, clock and toasts over the map (docs/design/buying.md, One card for every place). Plain DOM, rebuilt on actions and lightly refreshed
// on a timer. Picking a card in portrait sinks the sheet to its peek, where the Buy bar holds it, so its ghost stands
// in open map.
import { UPGRADES, LINE_UPGRADES, TUNING } from '../sim/sim.ts';
import type { LineUpgrade, Upgrade } from '../sim/places.ts';
import { pace } from '../sim/day.ts';
import { parked } from '../sim/access.ts';
import { TARGETS, punctuality, renewable, reputation, targetsMet } from '../sim/contract.ts';
import type { Sim } from '../sim/sim.ts';
import type { GameState } from '../sim/types.ts';
import type { Road, StretchDef } from '../sim/traffic.ts';
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

/** The roads as the map reads them (src/render/traffic.ts, once it's in): a stretch by id as it stands now, its data,
 * and the score: cars off the roads at the morning peak, against the start's. A road's card's id is `road:` and its
 * stretch's id; a road is never bought. */
export interface RoadsRead { road(id: string): Road | undefined; def(id: string): StretchDef | undefined; score(): { off: number; start: number } | null }
export const ROAD = 'road:';

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
  /** Show a section of line on the map with a stage (its next line speed step, its resignalling or its wires) as a ghost, or
   * what it built (bought); null stops. */
  showSection: (id: string | null, bought?: boolean, stage?: 'speed' | 'signals' | 'wires' | 'flyover') => void;
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
  /** What's wrong now at a place, for the top of its card (Strain, src/ui/strain.ts, once it's read), or null. */
  wrong: ((id: string) => string | null) | null = null;
  /** The places behind it, each a chip that opens its card (src/ui/cause.ts), or none. */
  causes: ((id: string) => { text: string; place: string }[]) | null = null;
  /** The roads (null until the traffic is in). */
  roads: RoadsRead | null = null;
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
    const p = id === NETWORK ? null : this.sim.P.byId.get(id), road = id.startsWith(ROAD) && !!this.roads?.def(id.slice(ROAD.length));
    if (p?.kind === 'station') { this.select(p.station!); return; }
    if (id !== NETWORK && !p && !road) return;
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
  /** Whether the row lists a place: a station owned or next to one owned (even if it waits on something elsewhere), a
   * stop owned or offered (its station owned), a service running, a depot owned. */
  listed(id: string): boolean {
    const sim = this.sim, p = sim.P.byId.get(id); if (!p) return false;
    if (p.kind === 'station') return !!this.g.owned[p.station!] || sim.offerable(p.station!);
    if (p.kind === 'stop') return sim.owns(id) || !!this.g.owned[p.station!];
    if (p.kind === 'bus') return sim.owns(id) || !!this.g.owned[sim.busNeeds(id)];
    return (p.kind === 'route' || p.kind === 'depot') && sim.owns(id);
  }
  /** The places the row lists, in network order: each line out from Stockport in turn, a station's stop and depot after
   * it, a service after the last station it serves that's listed. */
  order(): string[] {
    const P = this.sim.P, seen = new Set<string>(), stations: string[] = [];
    const walk = (k: string) => { seen.add(k); stations.push(k); for (const n of P.near.get(k) ?? []) if (!seen.has(n)) walk(n); };
    walk(P.station[0]!);
    for (const k of P.station) if (!seen.has(k)) walk(k);
    const after = new Map<string, string[]>(), put = (k: string, id: string) => { const l = after.get(k) ?? []; l.push(id); after.set(k, l); };
    for (const p of P.all) {
      if (!this.listed(p.id)) continue;
      if (p.kind === 'stop' || p.kind === 'depot') put(P.station[p.station!]!, p.id);
      else if (p.kind === 'bus') put(P.station[this.sim.busNeeds(p.id)]!, p.id);
      else if (p.kind === 'route') {
        const calls = new Set(P.touching(p.id)), last = [...stations].reverse().find(k => calls.has(k) && this.listed(k));
        put(last ?? P.station[0]!, p.id);
      }
    }
    return stations.filter(k => this.listed(k)).flatMap(k => [k, ...(after.get(k) ?? [])]);
  }
  /** A chip for a place: its name and figure, or fogged with its price and a meter of how near the cash is. */
  private chip(id: string, key: 'place' | 'next' | 'list'): HTMLButtonElement {
    const sim = this.sim, p = sim.P.get(id), owned = p.kind === 'station' ? !!this.g.owned[p.station!] : sim.owns(id);
    const near = !owned && (p.kind === 'stop' ? !!this.g.owned[p.station!] : p.kind === 'bus' ? true : p.kind === 'station' && !sim.stationNeeds(p.station!));
    const b = document.createElement('button'); b.className = 'card' + (owned ? '' : ' lock'); b.dataset[key] = id;
    b.setAttribute('aria-pressed', String(id === this.at));
    const name = SHORT[id] ?? p.name.replace('Manchester ', '');
    b.innerHTML = `<span class="nm">${name}</span><span class="st" data-pst="${id}"${p.kind === 'station' ? ` data-st="${p.station}"` : ''}></span>${near ? `<meter min="0" max="${sim.price(id) ?? 0}" value="0" data-sm></meter>` : ''}`;
    b.setAttribute('aria-label', p.kind === 'station' ? `${p.name}, ${milesFrom(sim.station(p.station!).miles)}` : p.name);
    b.addEventListener('click', () => this.show(id));
    return b;
  }
  /** The Places row: a chip for each place owned or offered, in network order (docs/design/buying.md, Finding places). */
  buildStrip(): void {
    const { strip } = this.els; strip.innerHTML = '';
    for (const id of this.order()) strip.appendChild(this.chip(id, 'place'));
    this.updateStrip();
  }
  /** Each chip's figure, or price and meter, in the row, the full list and Next to. */
  updateStrip(): void {
    const g = this.g, cash = String(Math.max(0, Math.floor(g.cash)));
    for (const root of [this.els.strip, this.els.panel]) {
      root.querySelectorAll<HTMLElement>('[data-pst]').forEach(el => { const txt = this.chipText(el.dataset['pst'] ?? ''); if (el.textContent !== txt) el.textContent = txt; });
      root.querySelectorAll<HTMLMeterElement>('[data-sm]').forEach(m => { if (m.getAttribute('value') !== cash) m.setAttribute('value', cash); });
      // a dot on a place the player has that can build a stage with the cash in hand
      root.querySelectorAll<HTMLElement>('.card[data-place],.card[data-next],.card[data-list]').forEach(c => {
        const id = c.dataset['place'] ?? c.dataset['next'] ?? c.dataset['list'] ?? '', can = this.sim.canGrow(id);
        if (c.classList.contains('can') !== can) { c.classList.toggle('can', can); c.title = can ? 'Ready to build' : ''; }
      });
    }
  }
  /** What a place's chip says under its name: its figure if it's the player's, its price if not. */
  private chipText(id: string): string {
    const sim = this.sim, g = this.g, p = sim.P.byId.get(id); if (!p) return '';
    if (p.kind === 'station') { const i = p.station!; return g.owned[i] ? `${g.st[i]?.waiting ?? 0} waiting` : fmt(sim.stationPrice(i)); }
    if (p.kind === 'stop') return sim.owns(id) ? `${num(g.st[p.station!]?.bus ?? 0)} by bus` : fmt(sim.price(id) ?? 0);
    if (p.kind === 'bus') return sim.owns(id) ? this.figure(id) : fmt(sim.price(id) ?? 0);
    return this.figure(id);
  }
  /** Next to: a chip for each place touching this one that's owned or offered; a tap flies there and opens it. */
  private nextTo(id: string): void {
    // what the row lists, and the sections of line the player has (they're found on the map or here, not on the row)
    const near = this.sim.P.touching(id).filter(k => this.listed(k) || (k.startsWith('section:') && this.sim.owns(k)));
    if (!near.length) return;
    const p = document.createElement('div'); p.className = 'next'; p.innerHTML = '<span>Next to</span>';
    for (const k of near) p.appendChild(this.chip(k, 'next'));
    this.els.panel.appendChild(p);
  }
  /** Raised to full (or docked), the sheet lists every place owned or offered by kind, under the open card. */
  private list(): void {
    const by = new Map<string, string[]>(), order = this.order();
    for (const id of order) { const k = this.sim.P.get(id).kind; by.set(k, [...(by.get(k) ?? []), id]); }
    const box = document.createElement('section'); box.className = 'plist'; box.setAttribute('aria-label', 'Places');
    for (const [kind, head] of [['station', 'Stations'], ['stop', 'Bus stops'], ['route', 'Train services'], ['depot', 'Depots']] as const) {
      const l = by.get(kind); if (!l?.length) continue;
      const h = document.createElement('h3'); h.textContent = head; box.appendChild(h);
      const row = document.createElement('div'); row.className = 'prow'; for (const id of l) row.appendChild(this.chip(id, 'list')); box.appendChild(row);
    }
    this.els.panel.appendChild(box);
  }
  /** A route's or depot's one figure, for its chip and its header. */
  figure(id: string): string {
    const p = this.sim.P.byId.get(id); if (!p) return '';
    if (p.kind === 'route') { const n = this.sim.unitsFor(this.sim.svc(p.svc!)); return `${n} unit${n === 1 ? '' : 's'}`; }
    if (p.kind === 'depot') return this.g.line.spare ? 'spare ready' : 'no spare';
    if (p.kind === 'bus') return `every ${this.sim.busEvery(id)} min`;
    return '';
  }
  /** The header's line under the name: the place's kind and one figure. */
  private sub(): string {
    const g = this.g, sim = this.sim, id = this.at;
    if (id.startsWith(ROAD)) { const r = this.roads?.road(id.slice(ROAD.length)); return `Road · ${r ? `${Math.round(100 * r.load)}% full` : 'clear'}`; }
    if (id === NETWORK) { const n = g.owned.filter(Boolean).length; return `Network · ${n} station${n === 1 ? '' : 's'}`; }
    const p = sim.P.get(id);
    if (p.kind === 'station') {
      const i = p.station!, halt = g.owned[i] && !Object.keys(g.places[id] ?? {}).length;
      return `${!g.owned[i] ? 'Shut' : halt ? 'Halt' : 'Station'} · ${milesFrom(sim.station(i).miles)} · ${g.owned[i] ? `${g.st[i]?.waiting ?? 0} waiting` : fmt(sim.stationPrice(i))}`;
    }
    if (p.kind === 'stop') { const kind = p.stop?.kind === 'bus-station' ? 'Bus station' : 'Bus stop'; return `${kind} · ${sim.owns(id) ? `${num(g.st[p.station!]?.bus ?? 0)} by bus` : fmt(sim.price(id) ?? 0)}`; }
    if (p.kind === 'route') return `Train service · ${this.figure(id)}`;
    if (p.kind === 'depot') return `Depot · ${this.figure(id)}`;
    if (p.kind === 'bus') return `Bus route · ${sim.owns(id) ? this.figure(id) : fmt(sim.price(id) ?? 0)}`;
    return p.kind === 'section' ? 'Line' : 'Junction';
  }
  buildPanel(): void {
    const id = this.at, panel = this.els.panel, road = id.startsWith(ROAD) ? this.roads?.def(id.slice(ROAD.length)) : undefined;
    const name = id === NETWORK ? 'The network' : road ? road.name : this.sim.P.get(id).name;
    if (this.els.shName.textContent !== name) this.els.shName.textContent = name;
    this.stages.clear(); panel.innerHTML = '';
    panel.dataset['place'] = id;
    if (id === NETWORK) this.networkCard();
    else if (road) this.roadCard(road);
    else {
      const p = this.sim.P.get(id);
      if (p.kind === 'station') this.stationCard(p.station!);
      else if (p.kind === 'stop') this.stopCard(id);
      else if (p.kind === 'bus') this.busCard(id);
      else this.lineCard(id);
      this.nextTo(id);
    }
    panel.insertAdjacentHTML('afterbegin', '<p class="wrong" id="wrong" hidden></p><p class="causes" id="causes" hidden></p>');
    panel.querySelector('#causes')?.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-cause]'); if (b?.dataset['cause']) this.show(b.dataset['cause'], false); });
    this.list();
    this.markPicked();
    this.updateStrip(); this.updatePanel();
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
      // every station on the map is a real one with no trains calling: buying it reopens it (docs/design/gridlock.md, section 4)
      const label = blocked ? 'Reopen a station next to it first' : needs ? `Needs ${needs.station.name}'s ${needs.name}` : `Reopen · ${fmt(sim.stationPrice(i))}`;
      this.buyCard(BLURB[s.id] || '', label, sim.canBuyStation(i), () => { if (sim.buyStation(i)) { this.toast(`${s.name} reopens. Trains call here again.`); this.changed(); } });
      return;
    }
    // homes are the census homes, grown (homes that grow); By cab only where there's a rank, By car and By bus where
    // there's a car park or bus link
    const b = sim.ups(i), more: [string, string][] = [['pHomes', 'Homes'], ['pOff', 'Arrived'], ['pChg', 'Changed']];
    if (sim.state(i).cabs.length) more.push(['pCab', 'By cab']);
    // a car park's cars: each one parked is a car off the roads beyond the station (docs/design/gridlock.md, G4)
    if (b.carpark) more.push(['pCar', 'By car'], ['pPark', 'Cars off the road']);
    if (b.bus) more.push(['pBus', 'By bus']);
    panel.innerHTML = this.stats([['pWait', 'Waiting'], ['pBoard', 'Boarded'], ['pRev', 'Revenue'], ['pLost', 'Gave up']], more);
    panel.querySelector('details')?.addEventListener('toggle', e => { this.more = (e.target as HTMLDetailsElement).open; });
    const bought = sim.ups(i);
    this.stageCards(sim.visibleUpgrades(i).filter(u => !u.stop).map((u: Upgrade) => {
      const name = sim.upgradeName(i, u);
      const stage: Stage = {
        name, adds: sim.upgradeDesc(i, u), price: sim.upgradePrice(i, u), can: () => sim.canBuyUpgrade(i, u.id),
        buy: () => { if (!sim.buyUpgrade(i, u.id)) return false; this.toast(`${name} built at ${s.name}`); this.on.built(i, u.id); return true; },
        pick: on => this.on.preview(i, on ? u.id : null),
      };
      return bought[u.id] ? { id: u.id, stage: null, saves: null, opens: [], built: name }
        : { id: u.id, stage, grow: !!u.stage, saves: this.on.saves(i, u.id), opens: sim.opens(i, u.id), built: null };
    }), k => this.on.showBuilt(i, k));
  }
  /** A train service or the sidings: its figures, and its stages as cards like a station's. */
  private lineCard(id: string): void {
    const sim = this.sim, g = this.g, p = sim.P.get(id), panel = this.els.panel;
    if (p.kind === 'route') panel.innerHTML = this.stats([['rUnits', 'Units'], ['rCars', 'Cars'], ['rEvery', 'Every'], ['rAboard', 'Aboard']], id === sim.P.stopper ? [['rSpeed', 'Line speed'], ['rBus', 'By bus']] : []);
    else if (p.kind === 'depot') panel.innerHTML = this.stats([['dSpare', 'Spare unit'], ['dFails', 'Failures'], ['dBus', 'By bus']]);
    else if (p.kind === 'section') { this.sectionCard(id); return; }
    else if (p.kind === 'junction') { this.junctionCard(id); return; }
    else { panel.innerHTML = '<p class="blurb">Comes with the stations at its ends.</p>'; return; }
    // a service's frequency names each step (Second unit, Off-peak timetable, Peak timetable); other stages count up
    const step = (u: LineUpgrade, lvl: number) => u.steps?.[lvl]?.name ?? (u.max > 1 ? `${u.name} ${lvl + 1} of ${u.max}` : u.name);
    // the stopper's and the sidings' stages show on the map as the line's (a stopper unit, the spare); a branch's units as its own
    const show = (k: string | null, bought?: boolean) => { if (p.kind === 'route' && id !== sim.P.stopper) { if (k !== null) this.on.focusPlace(id); } else this.on.showLine(k, bought); };
    this.stageCards(sim.P.stagesFor(sim.net, id).filter(u => sim.stageReady(id, u.id)).map(x => {
      const u = x as LineUpgrade, lvl = sim.stageLevel(id, u.id), price = sim.price(id, u.id), name = step(u, lvl);
      const built = lvl ? (u.steps ? u.steps[lvl - 1]!.name : u.max > 1 ? `${u.name} ×${lvl}` : u.name) : null;
      if (lvl >= u.max || price === undefined) return { id: u.id, stage: null, saves: null, opens: [], built };
      const stage: Stage = {
        name, adds: price ? u.steps?.[lvl]?.desc ?? u.desc : 'The unit waiting in Stockport’s sidings goes into service', price, can: () => g.cash >= price,
        buy: () => { if (!sim.buy(id, u.id)) return false; this.toast(`${name}: done`); show(u.id, true); return true; },
        pick: on => show(on ? u.id : null),
      };
      return { id: u.id, stage, saves: id === sim.P.stopper || p.kind === 'depot' ? this.on.saves(null, u.id) : null, opens: lvl + 1 < u.max ? [step(u, lvl + 1)] : [], built };
    }), k => show(k, true));
  }
  /** A section of line: its line speed, length and wires, and once it's the player's (both ends owned) its next line
   * speed step, 15 mph faster, its resignalling and, where it has no wires, its electrification (the line between
   * stations). */
  private sectionCard(id: string): void {
    const sim = this.sim, x = sim.sectionAt(id), panel = this.els.panel;
    panel.innerHTML = this.stats([['xSpeed', 'Line speed'], ['xLen', 'Length'], ['xWires', 'Wires']]) + `<p class="blurb">Comes with the stations at its ends.</p>`;
    if (!x || !sim.owns(id)) return;
    const price = x.price, name = 'Line speed', next = Math.min(90, x.mph + 15);
    const stage: Stage | null = price === undefined ? null : {
      name: `${name} ${next} mph`, adds: `Track renewed: ${x.mph} → ${next} mph through it`, price, can: () => sim.canBuy(id, 'speed'),
      buy: () => { if (!sim.buy(id, 'speed')) return false; this.toast(`${sim.P.get(id).name}: ${next} mph`); this.on.showSection(id, true); return true; },
      pick: on => this.on.showSection(on ? id : null),
    };
    const sp = x.signalsPrice, signals: Stage | null = sp === undefined ? null : {
      name: 'Resignalling', adds: 'New signals closer together: trains follow closer, and signals fail less often', price: sp, can: () => sim.canBuy(id, 'signals'),
      buy: () => { if (!sim.buy(id, 'signals')) return false; this.toast(`${sim.P.get(id).name}: resignalled`); this.on.showSection(id, true, 'signals'); return true; },
      pick: on => this.on.showSection(on ? id : null, false, 'signals'),
    };
    const wp = x.wiresPrice, wires: Stage | null = wp === undefined ? null : {
      name: 'Electrification', adds: 'Masts and wires: trains accelerate harder through it', price: wp, can: () => sim.canBuy(id, 'wires'),
      buy: () => { if (!sim.buy(id, 'wires')) return false; this.toast(`${sim.P.get(id).name}: wired`); this.on.showSection(id, true, 'wires'); return true; },
      pick: on => this.on.showSection(on ? id : null, false, 'wires'),
    };
    this.stageCards([
      { id: 'speed', stage, saves: null, opens: [], built: x.level ? `${name} ${x.mph} mph` : null },
      { id: 'signals', stage: signals, saves: null, opens: [], built: x.signals ? 'Resignalled' : null },
      { id: 'wires', stage: wires, saves: null, opens: [], built: x.wiresBought ? 'Wired' : null },
    ], k => this.on.showSection(id, true, k === 'signals' || k === 'wires' ? k : 'speed'));
  }
  /** A junction: how long trains have stood at its signals held for one another, and once that's long enough its
   * flying junction (the line between stations). */
  private junctionCard(id: string): void {
    const sim = this.sim, panel = this.els.panel;
    panel.innerHTML = this.stats([['jHeld', 'Trains held'], ['jKind', 'Junction']]) + `<p class="blurb">Comes with the line through it.</p>`;
    if (!sim.owns(id)) return;
    const price = sim.price(id, 'flyover'), flown = sim.flown(id.slice('junction:'.length));
    const stage: Stage | null = price === undefined ? null : {
      name: 'Flying junction', adds: 'One line over the other on a bridge: trains crossing here stop waiting for each other', price, can: () => sim.canBuy(id, 'flyover'),
      buy: () => { if (!sim.buy(id, 'flyover')) return false; this.toast(`${sim.P.get(id).name}: flying junction`); this.on.showSection(id, true, 'flyover'); return true; },
      pick: on => this.on.showSection(on ? id : null, false, 'flyover'),
    };
    this.stageCards([{ id: 'flyover', stage, saves: null, opens: [], built: flown ? 'Flying junction' : null }], () => this.on.showSection(id, true, 'flyover'));
  }
  /** A bus stop or bus station: what it does, and its figures once it's the player's. */
  private stopCard(id: string): void {
    const sim = this.sim, p = sim.P.get(id), i = p.station!, st = sim.station(i);
    if (!sim.owns(id)) {
      const price = sim.price(id) ?? 0, label = !sim.g.owned[i] ? `Buy ${st.name} first` : `Buy · ${fmt(price)}`;
      this.buyCard(p.stop?.desc ?? '', label, sim.canBuy(id), () => { if (sim.buy(id)) { this.toast(`${p.name} is yours`); this.on.built(i, 'bus'); this.changed(); } });
      return;
    }
    const f = p.stop?.feeder, g = this.g;
    this.els.panel.innerHTML = this.stats([['sBus', 'By bus'], ['sWait', `At ${st.name.replace('Manchester ', '')}`]]) + `<p class="blurb">${p.stop?.desc ?? ''}${f ? ` Its feeder: the ${f.ref}.` : ''}</p>`;
    // its shelter and live times (step 12), drawn at the stop, and its feeder route's steps (step 21), each shown on the
    // map as the route's buses
    const show = (k: string | null) => { if (k !== null) this.on.focusPlace(id); };
    this.stageCards(sim.P.stagesFor(sim.net, id).map(x => {
      const u = x as LineUpgrade, lvl = sim.stageLevel(id, u.id), price = sim.price(id, u.id), name = u.steps?.[lvl]?.name ?? u.name;
      const built = lvl ? u.steps![lvl - 1]!.name : null;
      if (lvl >= u.max || price === undefined) return { id: u.id, stage: null, saves: null, opens: [], built };
      const stage: Stage = {
        name, adds: u.steps?.[lvl]?.desc ?? u.desc, price, can: () => g.cash >= price,
        buy: () => { if (!sim.buy(id, u.id)) return false; this.toast((u.id as string) === 'feeder' ? `${name}: the ${f?.ref ?? 'bus'} runs` : `${p.name}: ${name.toLowerCase()}`); this.changed(); return true; },
        pick: on => show(on ? u.id : null),
      };
      return { id: u.id, stage, saves: null, opens: lvl + 1 < u.max ? [u.steps![lvl + 1]!.name] : [], built };
    }), k => show(k));
  }
  /** A bus route (step 8): Buy to start it, then how many ride it and how often it comes, and its stages. */
  private busCard(id: string): void {
    const sim = this.sim, p = sim.P.get(id), b = p.bus!, g = this.g;
    if (!sim.owns(id)) { this.buyCard(b.desc, `Buy · ${fmt(sim.price(id) ?? 0)}`, sim.canBuy(id), () => { if (sim.buy(id)) { this.toast(`${b.name} runs`); this.changed(); } }); return; }
    this.els.panel.innerHTML = this.stats([['bRiders', 'Riders'], ['bEvery', 'Every'], ['bShare', 'Takes'], ['bFare', 'Fare']]) + `<p class="blurb">${b.desc}</p>`;
    this.stageCards(sim.P.stagesFor(sim.net, id).map(x => {
      const u = x as LineUpgrade, lvl = sim.stageLevel(id, u.id), price = sim.price(id, u.id), name = u.steps?.[lvl]?.name ?? u.name;
      const built = lvl ? (u.steps ? u.steps[lvl - 1]!.name : u.name) : null;
      if (lvl >= u.max || price === undefined) return { id: u.id, stage: null, saves: null, opens: [], built };
      const stage: Stage = { name, adds: u.steps?.[lvl]?.desc ?? u.desc, price, can: () => g.cash >= price, buy: () => { if (!sim.buy(id, u.id)) return false; this.toast(`${b.name}: ${name.toLowerCase()}`); this.changed(); return true; }, pick: () => {} };
      return { id: u.id, stage, saves: null, opens: u.steps && lvl + 1 < u.max ? [u.steps[lvl + 1]!.name] : [], built };
    }), () => {});
  }
  /** The whole network: its figures, and once Piccadilly is owned, Renew the contract. */
  /** A road stretch's card: the cars an hour along it now, how full it is, its speed and queue, and the drive now
   * against when it's clear; Next to, the stations it serves (neutral, as any card's: never a recommended buy). */
  private roadCard(d: StretchDef): void {
    const panel = this.els.panel;
    panel.innerHTML = this.stats([['oCars', 'Cars an hour'], ['oLoad', 'Load'], ['oSpeed', 'Speed'], ['oQueue', 'Queue']], [['oDrive', 'Drive now'], ['oFree', 'When clear']]);
    panel.querySelector('details')?.addEventListener('toggle', e => { this.more = (e.target as HTMLDetailsElement).open; });
    const ids = new Set(this.sim.S.map(st => st.id)), near = [...new Set(d.serves.flatMap(v => [...v.a, ...v.b]))].filter(st => ids.has(st)).map(st => this.sim.P.station[this.sim.net.station(st).index]).filter((k): k is string => !!k && this.listed(k));
    if (near.length) { const n = document.createElement('div'); n.className = 'next'; n.innerHTML = '<span>Next to</span>'; for (const k of near) n.appendChild(this.chip(k, 'next')); panel.appendChild(n); }
  }
  private networkCard(): void {
    const g = this.g, sim = this.sim, panel = this.els.panel;
    // led by the score (docs/design/gridlock.md, The road card): cars off the roads at 08:00, a figure that only rises
    panel.innerHTML = this.stats([['nOff', 'Cars off'], ['nStations', 'Stations'], ['nBoard', 'Boarded'], ['nRep', 'Reputation']], [['nEarned', 'Earned'], ['nLost', 'Gave up'], ['nLate', 'On time'], ['nBus', 'By bus'], ['nStart', 'Cars at 08:00 at the start']]);
    panel.querySelector('details')?.addEventListener('toggle', e => { this.more = (e.target as HTMLDetailsElement).open; });
    // the score by game day, a sparkline under the figures (shown from the second day)
    panel.querySelector('.stats')?.insertAdjacentHTML('afterend', '<svg class="spark" viewBox="0 0 100 20" preserveAspectRatio="none" role="img" aria-label="Cars off by game day" hidden><polyline vector-effect="non-scaling-stroke"/></svg>');
    // the franchise's targets, each ticked once it's met (banked with the reputation when the contract is renewed)
    panel.insertAdjacentHTML('beforeend', `<ul class="targets" aria-label="The franchise's targets">${TARGETS.map(t => `<li data-target="${t.id}"><span class="tick" aria-hidden="true"></span>${t.name} <small>★ ${t.rep}</small></li>`).join('')}</ul>`);
    // joining the Bee Network (step 22), a step at a time, each seen across the map
    const bee = sim.P.bee;
    this.stageCards(sim.P.stagesFor(sim.net, bee).filter(u => sim.stageReady(bee, u.id)).map(x => {
      const u = x as LineUpgrade, lvl = sim.stageLevel(bee, u.id), price = sim.price(bee, u.id), name = u.steps?.[lvl]?.name ?? u.name;
      const built = lvl ? u.steps![lvl - 1]!.name : null;
      if (lvl >= u.max || price === undefined) return { id: u.id, stage: null, saves: null, opens: [], built };
      const stage: Stage = {
        name, adds: u.steps?.[lvl]?.desc ?? u.desc, price, can: () => g.cash >= price,
        buy: () => { if (!sim.buy(bee, u.id)) return false; this.toast(`The Bee Network: ${name.toLowerCase()}`); this.changed(); return true; },
        pick: () => {},
      };
      return { id: u.id, stage, saves: null, opens: lvl + 1 < u.max ? [u.steps![lvl + 1]!.name] : [], built };
    }), () => {});
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
    if (id.startsWith(ROAD)) {
      const r = this.roads?.road(id.slice(ROAD.length)), mins = (m: number) => `${m < 10 ? m.toFixed(1) : Math.round(m)} min`;
      if (r) { set('oCars', num(Math.round(r.cars))); set('oLoad', `${Math.round(100 * r.load)}%`); set('oSpeed', `${Math.round(r.speed * 0.621)} mph`); set('oQueue', r.queue >= 1 ? `${num(Math.round(r.queue))} cars` : 'none'); set('oDrive', mins(r.drive)); set('oFree', mins(r.free)); }
      return;
    }
    const p = id === NETWORK ? null : sim.P.get(id), w = this.wrong?.(id) ?? null, wl = panel.querySelector<HTMLElement>('#wrong');
    if (wl) { if (wl.hidden !== !w) wl.hidden = !w; if (w && wl.textContent !== w) wl.textContent = w; }
    const cl = panel.querySelector<HTMLElement>('#causes'), cs = w && this.causes ? this.causes(id) : [], ck = cs.map(c => c.place + c.text).join('|');
    if (cl && cl.dataset['k'] !== ck) { cl.dataset['k'] = ck; cl.hidden = !cs.length; cl.innerHTML = cs.map(c => `<button class="chip" data-cause="${c.place}">${c.text}</button>`).join(''); }
    if (p?.kind === 'station' && !g.owned[p.station!]) { const b = panel.querySelector<HTMLButtonElement>('#buyPlace'); if (b) b.disabled = !sim.canBuyStation(p.station!); return; }
    if (p?.kind === 'stop' && !sim.owns(id)) { const b = panel.querySelector<HTMLButtonElement>('#buyPlace'); if (b) b.disabled = !sim.canBuy(id); return; }
    if (p?.kind === 'bus') {
      if (!sim.owns(id)) { const b = panel.querySelector<HTMLButtonElement>('#buyPlace'); if (b) b.disabled = !sim.canBuy(id); return; }
      set('bRiders', num(Math.round(g.stats.ridersBy?.[id] ?? g.stats.riders ?? 0))); set('bEvery', `${sim.busEvery(id)} min`); set('bShare', `${Math.round(100 * sim.busShare(id))}%`); set('bFare', fmt(p.bus!.fare * TUNING.fareMult));
      return;
    }
    if (p?.kind === 'station') {
      const i = p.station!, S = sim.state(i);
      set('pWait', String(S.waiting)); set('pBoard', num(S.boarded)); set('pOff', num(S.alighted)); set('pRev', fmtShort(S.revenue)); set('pLost', num(S.lost)); set('pChg', num(S.changed));
      set('pHomes', num(Math.round(sim.homes(i)))); set('pCab', num(S.cab)); set('pCar', num(S.car)); set('pPark', num(parked(S))); set('pBus', num(S.bus));
    } else if (p?.kind === 'route') {
      const v = sim.svc(p.svc!), mine = g.trains.filter(t => t.svc === v.id), every = sim.headway(v.id);
      set('rUnits', String(sim.unitsFor(v))); set('rCars', String(mine[0]?.cars ?? sim.carsPerUnit())); set('rEvery', every ? `${Math.round(every / 60)} min` : '–');
      set('rAboard', num(mine.reduce((n, t) => n + t.onboard, 0))); set('rSpeed', `${g.line.timetable ? 90 : 75} mph`); set('rBus', num(g.trouble.bused));
    } else if (p?.kind === 'depot') {
      set('dSpare', g.line.spare ? 'Ready' : 'None'); set('dFails', num(g.trouble.fails)); set('dBus', num(g.trouble.bused));
    } else if (p?.kind === 'section') {
      const x = sim.sectionAt(id); set('xSpeed', x ? `${x.mph} mph` : '–'); set('xLen', x ? `${x.miles.toFixed(1)} mi` : '–'); set('xWires', x ? (x.wired ? 'Electric' : 'Diesel') : '–');
    } else if (p?.kind === 'junction') {
      set('jHeld', `${Math.round(sim.heldFor(id) / 60)} min`); set('jKind', sim.flown(id.slice('junction:'.length)) ? 'Flying' : 'Flat');
    } else if (p?.kind === 'stop') {
      const S = sim.state(p.station!); set('sBus', num(S.bus)); set('sWait', `${S.waiting} waiting`);
    } else if (!p) {
      set('nStations', String(g.owned.filter(Boolean).length)); set('nBoard', fmtCount(g.stats.boarded)); set('nEarned', fmtShort(g.earned)); set('nRep', `★ ${reputation(g)}`);
      { const met = new Set(targetsMet(g, sim.S.map(st => st.id)).met); panel.querySelectorAll<HTMLElement>('[data-target]').forEach(li => { const on = met.has(li.dataset['target'] ?? ''); if (li.classList.contains('met') !== on) li.classList.toggle('met', on); }); }
      { const sc = this.roads?.score(); set('nOff', sc ? num(Math.round(sc.off)) : '–'); set('nStart', sc ? num(Math.round(sc.start)) : '–');
        // each day's cars off, today's as it stands last
        const svg = panel.querySelector<SVGSVGElement>('.spark'), days = [...(g.offDays ?? []).map(x => x ?? 0), ...(sc ? [sc.off] : [])];
        if (svg) { svg.toggleAttribute('hidden', days.length < 2); if (days.length >= 2) { const hi = Math.max(1, ...days), pts = days.map((x, k) => `${(100 * k / (days.length - 1)).toFixed(1)},${(19 - 18 * Math.max(0, x) / hi).toFixed(1)}`).join(' '); const pl = svg.querySelector('polyline'); if (pl && pl.getAttribute('points') !== pts) pl.setAttribute('points', pts); } } }
      set('nLost', fmtCount(g.stats.lost)); set('nLate', `${Math.floor(100 * punctuality(g))}%`); set('nBus', fmtCount(g.trouble.bused)); set('lRep', String(reputation(g)));
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
