// The renewal sheet: opened from the line panel's "Renew the contract" once Piccadilly is owned. It says what this
// contract banks, shows the perk tree (what's bought, and the next in each branch with its price; the rest stays hidden
// until it's next), and buys perks with the reputation to spend. Nothing happens until "Begin contract n": then the
// page banks the reputation, keeps the perks and starts the run again (src/main.ts). Closing it changes nothing.
// Kept plain: the redesign restyles it. The rules of renewal and perks are the sim's (src/sim/contract.ts).
import './styles/contract.css';
import { buyPerk, canBuyPerk, perkState, renew, reputation, type Career } from '../sim/contract.ts';
import type { ContractDef, GameState } from '../sim/types.ts';

export class ContractSheet {
  readonly sheet: HTMLDialogElement;
  private tree: ContractDef;
  private begin: (c: Career) => void;
  /** The career as it will be once renewed, with the perks chosen so far: kept only while the sheet is open. */
  private draft: Career | null = null;
  private ends = { n: 1, day: 1, rep: 0 };

  constructor(tree: ContractDef, begin: (c: Career) => void) {
    this.tree = tree; this.begin = begin;
    const d = this.sheet = document.createElement('dialog'); d.className = 'settings contract'; d.id = 'contract'; d.setAttribute('aria-labelledby', 'conTitle');
    document.body.appendChild(d);
    d.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      if (t === d) { const r = d.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close(); return; }
      const b = t.closest<HTMLButtonElement>('button'); if (!b || !this.draft) return;
      if (b.dataset['perk']) { const c = buyPerk(this.tree, this.draft, b.dataset['perk']); if (c) { this.draft = c; this.show(); } }
      else if (b.dataset['act'] === 'begin') { const c = this.draft; this.draft = null; d.close(); this.begin(c); }
      else if (b.dataset['act'] === 'close') d.close();
    });
    d.addEventListener('close', () => { this.draft = null; });
  }

  /** Open the sheet for the run in progress: what renewing it now would bank, and the perks to spend it on. */
  open(career: Career, g: GameState, stationIds: string[]): void {
    this.draft = renew(career, g, stationIds);
    this.ends = { n: career.renewals + 1, day: g.day, rep: reputation(g) };
    this.show(); this.sheet.showModal();
  }

  private show(): void {
    const c = this.draft; if (!c) return;
    const { n, day, rep } = this.ends;
    const branches = this.tree.branches.map(b => {
      const perks = this.tree.perks.filter(p => p.branch === b.id).flatMap(p => {
        const st = perkState(this.tree, c, p.id);
        if (st === 'owned') return [`<li class="perk owned"><b>${p.name}</b><span>${p.desc}</span><i>Held</i></li>`];
        if (st === 'locked') return [];
        const can = canBuyPerk(this.tree, c, p.id);
        return [`<li class="perk"><b>${p.name}</b><span>${p.desc}</span><button data-perk="${p.id}" ${can ? '' : 'disabled'}>★ ${p.price}</button></li>`];
      });
      return perks.length ? `<section><h3>${b.name}</h3><ul>${perks.join('')}</ul></section>` : '';
    }).join('');
    this.sheet.innerHTML = `<div class="set-head"><h2 id="conTitle">Renew the contract</h2><button class="set-close" data-act="close" aria-label="Close">✕</button></div>
      <p class="con-sum">Contract ${n} ends on day ${day} and banks <b>★ ${rep}</b>. To spend: <b id="conRep">★ ${c.rep}</b></p>
      ${branches}
      <p class="set-note">The line goes back to halts from Stockport. Perks and milestones last; reputation you don't spend keeps.</p>
      <button class="buy con-begin" data-act="begin">Begin contract ${n + 1}</button>`;
  }
}
