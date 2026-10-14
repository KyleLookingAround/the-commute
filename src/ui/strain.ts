// Strain: where the network hurts, read from the sim and never changing it (docs/design/buying.md, section 6). This
// reads: a crowded platform (waiting against its cap, from 60% full), people giving up this clock hour, late departures
// over the clock hour by the stretch of line behind them, full car parks, the minutes trains lose on a section of line
// against its line speed (away from their stops: a train slowed by the one ahead, a red signal or caution) and the
// minutes trains stand held at a junction's signals, both this clock hour; the card's "what's wrong now" line comes
// from it whether or not the view is on. The glows are drawn by src/render/strain.ts, fetched when the Strain view is
// first turned on. Loaded after the first frame (main.ts), so none of it is in the script before it.
// The sim keeps `lost` as a running count and says when a train leaves late (onDepart); the hour's tallies are kept
// here, in the view, so nothing in the game moves (the bot's PLAY stays as it is).
import { TUNING, type Sim } from '../sim/sim.ts';
import { clockAt } from '../sim/day.ts';
import { parked, spaces } from '../sim/access.ts';
import { loadViews, saveViews } from '../app/prefs.ts';
import { NETWORK, type UI } from './panel.ts';

/** A platform glows from this share of its cap, strongest at full. */
export const CROWD_FROM = 0.6;
/** People giving up this clock hour before the walk home is drawn. */
export const LOST_FROM = 5;
/** A departure this many minutes late tints the stretch behind it amber; at LATE_CORAL minutes, coral. */
export const LATE_FROM = 1, LATE_CORAL = 5;
/** Minutes trains lose on a section this clock hour before it glows (strongest at SLOW_CORAL), and minutes trains
 * stand held at a junction (strongest at HELD_CORAL). */
export const SLOW_FROM = 1, SLOW_CORAL = 6, HELD_FROM = 0.5, HELD_CORAL = 4;

/** A late departure this clock hour, the worst for its service at that station that way: it left station i for
 * the stretch from station `back` (the stop before it on the route), `min` minutes late, at the clock time `at`. */
export interface Late { svc: string; i: number; back: number; dir: 1 | -1; min: number; at: string }
/** A crowded platform: waiting against its cap (station-wide, as the sim keeps it), on each face, and when. */
export interface Crowd { waiting: number; cap: number; faces: [number, number]; at: string }

export class StrainRead {
  sim: Sim;
  /** Gave up at each station this clock hour, and the running count it was last read at. */
  readonly lost: number[] = []; private seen: number[] = [];
  /** Late departures this clock hour, by service, station and way. */
  readonly late = new Map<string, Late>();
  /** Seconds trains have lost on each section of line, and stood held at each junction (by its place id), this clock
   * hour; the sim's running `held` counts last read, and the sim time the trains were last looked at. */
  readonly slow = new Map<string, number>(); readonly held = new Map<string, number>();
  private heldSeen: Record<string, number> = {}; private lastT = NaN;
  /** The clock hour the tallies are for (hours since the start of day 1). */
  private hourKey = -1;
  constructor(sim: Sim) { this.sim = sim; this.attach(sim); }
  /** Read a new sim (a new run, or the first): its counts are where the tallies start from. */
  attach(sim: Sim): void {
    this.sim = sim; this.late.clear(); this.slow.clear(); this.held.clear(); this.heldSeen = { ...sim.g.held }; this.lastT = sim.g.t; this.hourKey = Math.floor(clockAt(sim.g.t) / 3600);
    sim.g.st.forEach((S, i) => { this.lost[i] = 0; this.seen[i] = S.lost; });
    sim.onDepart = (tr, i, late) => {
      const v = sim.svcs.find(x => x.id === tr.svc), min = late / 60;
      if (!v || v.express || !sim.g.owned[i] || min < LATE_FROM) return;
      const k = v.route.indexOf(i), back = (tr.dir > 0 ? v.route[k - 1] : v.route[k + 1]) ?? (tr.dir > 0 ? v.route[k + 1] : v.route[k - 1]);
      if (back === undefined) return;
      const key = `${v.id}|${i}|${tr.dir}`, was = this.late.get(key);
      if (!was || min > was.min) this.late.set(key, { svc: v.id, i, back, dir: tr.dir, min, at: sim.clock() });
    };
  }
  /** Bring the hour's tallies up to date (a few times a second): a new clock hour starts them again. */
  tick(sim: Sim): void {
    if (sim !== this.sim) this.attach(sim);
    const h = Math.floor(clockAt(sim.g.t) / 3600);
    if (h !== this.hourKey) { this.hourKey = h; this.late.clear(); this.lost.fill(0); this.slow.clear(); this.held.clear(); }
    for (const [j, n] of Object.entries(sim.g.held)) { const d = n - (this.heldSeen[j] ?? 0); if (d > 0) this.held.set(`junction:${j}`, (this.held.get(`junction:${j}`) ?? 0) + d); }
    this.heldSeen = { ...sim.g.held };
    const dt = sim.g.t - this.lastT; this.lastT = sim.g.t;
    if (dt > 0 && dt < 600) this.slowing(sim, dt);
    sim.g.st.forEach((S, i) => { const d = S.lost - (this.seen[i] ?? S.lost); if (d > 0) this.lost[i] = (this.lost[i] ?? 0) + d; this.seen[i] = S.lost; });
  }
  /** What trains running between stops lose against their line speed over dt sim seconds, by section: a train well
   * clear of the stop it left and the one it's running to (clear of accelerating and braking) going slower than nine
   * tenths of its line speed loses the shortfall. */
  private slowing(sim: Sim, dt: number): void {
    for (const tr of sim.g.trains) {
      if (tr.state !== 'run' || tr.next === null) continue;
      const v = sim.svc(tr.svc); if (v.express) continue;
      const from = tr.pfAt >= 0 ? tr.pfAt : tr.next, lim = sim.runSpeed(v, from, tr.next); if (!(lim > 0) || tr.v >= 0.9 * lim) continue;
      const toNext = Math.abs(sim.station(tr.next).s - tr.s), fromLast = Math.abs(sim.station(from).s - tr.s);
      if (toNext < lim * lim / (2 * TUNING.brake) + 50 || fromLast < lim * lim / (2 * TUNING.accelDiesel) + 50) continue;
      const c = sim.corridorOf(tr), x = sim.secs.find(q => q.corridor === c && tr.s >= q.s0 && tr.s <= q.s1); if (!x) continue;
      this.slow.set(x.id, (this.slow.get(x.id) ?? 0) + dt * (1 - tr.v / lim));
    }
  }
  /** Minutes trains lost on a section of the player's this clock hour, once it's SLOW_FROM or more. */
  slowOn(id: string): number { const m = (this.slow.get(id) ?? 0) / 60; return this.sim.owns(id) && m >= SLOW_FROM ? m : 0; }
  /** Minutes trains stood held at a junction of the player's this clock hour, once it's HELD_FROM or more. */
  heldAt(id: string): number { const m = (this.held.get(id) ?? 0) / 60; return this.sim.owns(id) && m >= HELD_FROM ? m : 0; }
  /** Station i's platforms, if they're at least CROWD_FROM full. */
  crowd(i: number): Crowd | null {
    const sim = this.sim; if (!sim.g.owned[i]) return null;
    const S = sim.state(i), cap = sim.capacity(i);
    if (!cap || S.waiting < CROWD_FROM * cap) return null;
    const face = (q: { n: number }[]) => q.reduce((n, x) => n + x.n, 0);
    return { waiting: S.waiting, cap, faces: [face(S.q[0]), face(S.q[1])], at: sim.clock() };
  }
  /** Gave up at station i this clock hour, once it's LOST_FROM or more. */
  gaveUp(i: number): number { const n = this.sim.g.owned[i] ? this.lost[i] ?? 0 : 0; return n >= LOST_FROM ? n : 0; }
  /** Station i's car park, once every space is taken. */
  parkFull(i: number): { parked: number; spaces: number } | null {
    const sim = this.sim; if (!sim.g.owned[i]) return null;
    const n = spaces(sim, i), p = parked(sim.state(i));
    return n > 0 && p >= n ? { parked: p, spaces: n } : null;
  }
  /** What's wrong now at a place, in plain figures, or null when Strain sees nothing there. */
  line(id: string): string | null {
    const sim = this.sim; if (id === NETWORK) return null;
    const p = sim.P.byId.get(id); if (!p) return null;
    const out: string[] = [];
    if (p.kind === 'station') {
      const i = p.station!, c = this.crowd(i), lost = this.gaveUp(i), park = this.parkFull(i);
      if (c) out.push(`${c.faces[0] && c.faces[1] ? 'Platforms' : 'Platform'}: ${c.waiting} waiting of ${c.cap} at ${c.at}`);
      if (lost) out.push(`${lost} gave up this hour`);
      if (park) out.push(`Car park full: ${park.parked} of ${park.spaces}`);
    } else if (p.kind === 'route') {
      let worst: Late | null = null, n = 0;
      for (const L of this.late.values()) if (L.svc === p.svc) { n++; if (!worst || L.min > worst.min) worst = L; }
      if (worst) out.push(`${n} late ${n > 1 ? 'departures' : 'departure'} this hour, worst ${Math.round(worst.min)} min leaving ${sim.station(worst.i).name.replace('Manchester ', '')} at ${worst.at}`);
    } else if (p.kind === 'section') {
      const m = this.slowOn(id); if (m) out.push(`Trains lost ${Math.round(m)} min here this hour`);
    } else if (p.kind === 'junction') {
      const m = this.heldAt(id); if (m) out.push(`Trains held ${m < 1 ? 'under a' : Math.round(m)} min here this hour`);
    }
    return out.length ? out.join(' · ') : null;
  }
}

/** What Strain needs from the page: the sim as it is now, the cards, the Strain button, the camera's taps, the checks'
 * window on the view, and what the glows draw on. */
export interface StrainPage {
  sim: () => Sim; ui: UI; button: HTMLButtonElement;
  rig: { onTap: ((x: number, y: number) => void) | null }; view: object;
  map: import('../render/strain.ts').StrainView;
}

/** Start reading, give the cards their line, and wire the Strain button (on as it was left on this device). The glows
 * are fetched the first time it's turned on; from then a tap on one opens its place's card at half height. */
export function wireStrain(page: StrainPage): StrainRead {
  const read = new StrainRead(page.sim()), { ui, button, rig } = page;
  ui.wrong = id => read.line(id);
  setInterval(() => read.tick(page.sim()), 250);
  let layer: Promise<import('../render/strain.ts').StrainLayer> | null = null, on = false;
  const draw = () => import('../render/strain.ts').then(m => {
    const l = new m.StrainLayer(page.map, read), tap = rig.onTap;
    rig.onTap = (x, y) => {
      const id = l.tap(x, y); if (!id) { tap?.(x, y); return; }
      ui.show(id, !id.startsWith('route:')); if (!ui.sheet.docked && ui.sheet.at !== 'half') ui.sheet.to('half');
    };
    Object.assign(page.view, { strain: () => ({ ...l.stats(), pressed: on }) });
    return l;
  });
  const set = (v: boolean) => {
    on = v; button.setAttribute('aria-pressed', String(on));
    if (on || layer) void (layer ??= draw()).then(l => l.setOn(on));
  };
  button.addEventListener('click', () => { set(!on); saveViews({ ...loadViews(), strain: on }); });
  set(loadViews().strain);
  return read;
}
