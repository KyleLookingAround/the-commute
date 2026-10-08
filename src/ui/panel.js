// Station strip, station panel, line panel, ticker and toasts. Plain DOM, rebuilt on actions and lightly refreshed on a timer.
import { UPGRADES, LINE_UPGRADES } from '../sim/sim.js';

export const fmt = n => '£' + Math.floor(n).toLocaleString('en-GB');

const BLURB = {
  'heaton-chapel': 'Two platforms on the slow lines, 1,200 commuters a morning, and a footbridge that needs lifts.',
  'levenshulme': 'Up on the embankment over the A6. Busy both ways all day.',
  'ardwick': 'Two bare platforms by the depot. Almost nobody uses it. It is very cheap.',
  'piccadilly': 'The end of the line. Platforms 13 and 14 alone would pay for Stockport ten times over.',
};

export class UI {
  constructor(sim, els, on) {
    this.sim = sim; this.els = els; this.on = on; this.selected = 0; this.toastTimer = 0;
    els.sp1.addEventListener('click', () => on.speed(1)); els.sp3.addEventListener('click', () => on.speed(3));
    els.vLine.addEventListener('click', () => on.viewLine());
    els.reset.addEventListener('click', () => {
      const b = els.reset;
      if (b.dataset.arm) { delete b.dataset.arm; b.textContent = 'Start over'; on.reset(); }
      else { b.dataset.arm = '1'; b.textContent = 'Tap again to wipe progress'; setTimeout(() => { delete b.dataset.arm; b.textContent = 'Start over'; }, 3000); }
    });
  }
  get g() { return this.sim.g; }
  toast(msg) { const t = this.els.toast; t.textContent = msg; t.hidden = false; clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { t.hidden = true; }, 4000); }
  setSpeed(s) { this.els.sp1.setAttribute('aria-pressed', String(s === 1)); this.els.sp3.setAttribute('aria-pressed', String(s === 3)); }
  select(i) { this.selected = i; this.buildStrip(); this.buildPanel(); this.on.focusStation(i); }

  buildAll() { this.buildStrip(); this.buildPanel(); this.buildLinePanel(); }
  buildStrip() {
    const { strip } = this.els, g = this.g; strip.innerHTML = '';
    this.sim.S.forEach((s, i) => {
      const b = document.createElement('button'); b.className = 'card' + (g.owned[i] ? '' : ' lock'); b.setAttribute('aria-pressed', String(i === this.selected));
      b.innerHTML = `<div class="mi">${s.miles} mi</div><div class="nm">${s.name}</div><div class="st" data-st="${i}"></div>`;
      b.addEventListener('click', () => this.select(i)); strip.appendChild(b);
    });
    this.updateStrip();
  }
  updateStrip() {
    const g = this.g;
    this.els.strip.querySelectorAll('[data-st]').forEach(el => { const i = +el.dataset.st; const txt = g.owned[i] ? `${g.st[i].waiting} waiting` : fmt(this.sim.S[i].price); if (el.textContent !== txt) el.textContent = txt; });
  }
  buildPanel() {
    const i = this.selected, s = this.sim.S[i], g = this.g, panel = this.els.panel;
    if (!g.owned[i]) {
      const blocked = i > 0 && !g.owned[i - 1];
      panel.innerHTML = `<h2>${s.name} <small>${s.miles} miles from Stockport · locked</small></h2>
        <p class="blurb">${BLURB[s.id] || ''}</p>
        <button class="buy" id="buyStation" ${this.sim.canBuyStation(i) ? '' : 'disabled'}>${blocked ? 'Buy the stations before it first' : `Buy station · ${fmt(s.price)}`}</button>`;
      panel.querySelector('#buyStation').addEventListener('click', () => { if (this.sim.buyStation(i)) { this.toast(`${s.name} is yours. Trains now call here.`); this.buildStrip(); this.buildPanel(); this.on.changed(); } });
      return;
    }
    panel.innerHTML = `<h2>${s.name} <small>${s.miles} miles · catchment ${s.catchment.toLocaleString('en-GB')}/h at peak</small></h2>
      <div class="stats"><div><small>Waiting</small><b id="pWait"></b></div><div><small>Boarded</small><b id="pBoard"></b></div><div><small>Revenue</small><b id="pRev"></b></div><div><small>Gave up</small><b id="pLost"></b></div></div>
      <div class="ups" id="ups"></div>`;
    const ups = panel.querySelector('#ups');
    for (const u of UPGRADES) {
      const done = !!g.ups[i][u.id], name = u.name || s.retail;
      const d = document.createElement('div'); d.className = 'up' + (done ? ' done' : '');
      d.innerHTML = `<div class="t"><b>${name}</b><span>${u.desc}</span></div><button ${done || g.cash < u.price ? 'disabled' : ''} data-up="${u.id}">${done ? 'Built' : fmt(u.price)}</button>`;
      if (!done) d.querySelector('button').addEventListener('click', () => { if (this.sim.buyUpgrade(i, u.id)) { this.toast(`${name} built at ${s.name}`); this.buildPanel(); this.on.changed(); } });
      ups.appendChild(d);
    }
    this.updatePanel();
  }
  updatePanel() {
    const i = this.selected, g = this.g, S = g.st[i], panel = this.els.panel;
    if (!g.owned[i]) { const b = panel.querySelector('#buyStation'); if (b) b.disabled = !this.sim.canBuyStation(i); return; }
    const set = (id, v) => { const el = panel.querySelector('#' + id); if (el && el.textContent !== v) el.textContent = v; };
    set('pWait', String(S.waiting)); set('pBoard', S.boarded.toLocaleString('en-GB')); set('pRev', fmt(S.revenue)); set('pLost', S.lost.toLocaleString('en-GB'));
    panel.querySelectorAll('[data-up]').forEach(b => { const u = UPGRADES.find(u => u.id === b.dataset.up); if (!g.ups[i][u.id]) b.disabled = g.cash < u.price; });
  }
  buildLinePanel() {
    const g = this.g, lp = this.els.linePanel, sim = this.sim;
    lp.innerHTML = `<h2>The line <small>${sim.unitsInService()} unit${sim.unitsInService() === 1 ? '' : 's'} · ${sim.carsPerUnit()}-car · ${g.line.timetable ? '90' : '75'} mph</small></h2><div class="ups" id="lups"></div>`;
    const holder = lp.querySelector('#lups');
    for (const u of LINE_UPGRADES) {
      const lvl = g.line[u.id], done = lvl >= u.max, price = done ? 0 : u.prices[lvl];
      const d = document.createElement('div'); d.className = 'up' + (done ? ' done' : '');
      d.innerHTML = `<div class="t"><b>${u.name} ${u.max > 1 ? `(${lvl}/${u.max})` : ''}</b><span>${u.desc}</span></div><button ${done || g.cash < price ? 'disabled' : ''} data-lu="${u.id}">${done ? 'Done' : fmt(price)}</button>`;
      if (!done) d.querySelector('button').addEventListener('click', () => { if (sim.buyLine(u.id)) { this.toast(`${u.name}: done`); this.buildLinePanel(); this.on.changed(); } });
      holder.appendChild(d);
    }
  }
  updateLinePanel() { this.els.linePanel.querySelectorAll('[data-lu]').forEach(b => { const u = LINE_UPGRADES.find(u => u.id === b.dataset.lu); const lvl = this.g.line[u.id]; if (lvl < u.max) b.disabled = this.g.cash < u.prices[lvl]; }); }
  tick() {
    const g = this.g, c = fmt(g.cash); if (this.els.cash.textContent !== c) this.els.cash.textContent = c;
    const ck = `Day ${g.day} · ${this.sim.clock()}`; if (this.els.clock.textContent !== ck) this.els.clock.textContent = ck;
    this.updateStrip(); this.updatePanel(); this.updateLinePanel();
  }
}
