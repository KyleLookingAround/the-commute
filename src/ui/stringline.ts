// A simple timetable view (step 6, docs/DESIGN.md, Timetabling): a service's trains through the last hour by the
// clock as a time and distance chart, a stringline, on the service's card. Across is the clock, the hour up to now; up
// is the line towards Manchester, a faint rule at each station it calls at. Each train is a line, amber where it ran
// five minutes or more late, so bunching, a late run spreading down the line and a gap after a failure show as they
// do on a real train graph. Sampled from the sim every half minute of the clock, kept here (not saved: it fills again
// as the game runs); view only.
import { clockAt } from '../sim/day.ts';
import type { Sim } from '../sim/sim.ts';

const WINDOW = 3600;        // clock seconds shown: the last hour
const EVERY = 30;           // clock seconds between samples
const W = 100, H = 60;      // the chart's own units (the SVG stretches them to the card)

interface Point { c: number; s: number; late: boolean }

export class Stringline {
  /** Each train's points, by its id, oldest first; a NaN chainage breaks the line (off the map, or resting). */
  private readonly trails = new Map<number, { svc: string; pts: Point[] }>();
  private last = -Infinity;
  /** Bumped at every sample, so a chart redraws only when there's something new. */
  version = 0;

  /** Take a sample if half a minute of the clock has passed since the last (and drop what's older than the hour). */
  sample(sim: Sim): void {
    const now = clockAt(sim.g.t);
    if (now < this.last) { this.trails.clear(); this.last = -Infinity; }   // a new game, or a save loaded from earlier
    if (now - this.last < EVERY) return;
    this.last = now; this.version++;
    for (const tr of sim.g.trains) {
      let t = this.trails.get(tr.id); if (!t) { t = { svc: tr.svc, pts: [] }; this.trails.set(tr.id, t); }
      t.pts.push({ c: now, s: tr.state === 'away' ? NaN : tr.s, late: tr.late >= 300 });
      while (t.pts.length && t.pts[0]!.c < now - WINDOW - EVERY) t.pts.shift();
    }
    for (const [id, t] of this.trails) if (!t.pts.length || t.pts[t.pts.length - 1]!.c < now - WINDOW) this.trails.delete(id);
  }

  /** The chart's SVG for a service: its stations' rules, then each of its trains' lines, broken where it was away and
   * split where it turned late or back to time. */
  svg(sim: Sim, svc: string): string {
    const v = sim.svc(svc), at = v.route.map(i => sim.net.stations[i]!.s), lo = Math.min(...at), hi = Math.max(...at), span = hi - lo || 1;
    const now = this.last, x = (c: number) => (W * (c - (now - WINDOW)) / WINDOW).toFixed(1), y = (s: number) => (H - 2 - (H - 4) * (s - lo) / span).toFixed(1);
    const rules = at.map(s => `<line x1="0" x2="${W}" y1="${y(s)}" y2="${y(s)}"/>`).join('');
    const lines: string[] = [];
    for (const t of this.trails.values()) {
      if (t.svc !== svc) continue;
      let run: string[] = [], late = false;
      const flush = () => { if (run.length > 1) lines.push(`<polyline class="${late ? 'late' : 'ok'}" points="${run.join(' ')}"/>`); run = []; };
      for (const p of t.pts) {
        if (Number.isNaN(p.s) || p.s < lo - 200 || p.s > hi + 200) { flush(); continue; }
        const pt = `${x(p.c)},${y(Math.max(lo, Math.min(hi, p.s)))}`;
        // a change of lateness starts a new piece from the last point, so the line stays joined
        if (run.length && p.late !== late) { const prev = run[run.length - 1]!; flush(); run.push(prev); }
        late = p.late; run.push(pt);
      }
      flush();
    }
    return `<g class="rules">${rules}</g>${lines.join('')}`;
  }
}

/** The card's chart for a service: an SVG the card's width, its end stations named at the top and the foot, and what
 * it shows said beneath. */
export function stringlineHtml(sim: Sim, svc: string): string {
  const v = sim.svc(svc), ends = [...v.route].sort((a, b) => sim.net.stations[b]!.s - sim.net.stations[a]!.s).map(i => sim.net.stations[i]!.name.replace('Manchester ', ''));
  return `<figure class="stringline"><div class="chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="The service's trains through the last hour"></svg><span class="end top">${ends[0] ?? ''}</span><span class="end foot">${ends[ends.length - 1] ?? ''}</span></div><figcaption>The last hour, a line a train · amber: late</figcaption></figure>`;
}
