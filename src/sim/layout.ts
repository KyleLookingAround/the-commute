// What a sensible track layout keeps, checked from the data (docs/DESIGN.md, Where the tracks run): no track shifts
// sideways faster than a turnout would take it; tracks never cross, but run apart or together (one road worked both
// ways), and are only in between, merging, parting or crossing over, for a turnout's length; a station's rails into a
// bay leave a track at a turnout and cross none; each section where tracks move (a throat, a crossover) and each
// junction has clear line either side before the next; on a viaduct or a bridge every track and rail is on the deck;
// and every block section is as long as a train and its overlap, with no signal in a throat. Pure: the test runs it
// (test/layout.test.ts), and it names the place for each fault.
import { LAYOUT, type Network } from './network.ts';
import type { NetworkGeoDef } from './types.ts';

/** A kit's drawn rails, as the layout needs them: polylines in the kit's frame (u along, v across). */
export interface KitRails { parts: { type: string; points?: number[][] }[] }
/** One thing wrong: which rule, and where, in words a person can find on the map. */
export interface Fault { rule: 'slope' | 'cross' | 'turnout' | 'rails' | 'room' | 'deck' | 'block'; at: string }


/** Every fault in the network's layout, with the kits' rails (by kit id) and the structures in its data. */
export function layoutFaults(net: Network, kits: Record<string, KitRails | undefined>, def: NetworkGeoDef): Fault[] {
  const L = LAYOUT, out: Fault[] = [], seen = new Set<string>();
  const add = (rule: Fault['rule'], at: string) => { const k = `${rule}|${at}`; if (!seen.has(k)) { seen.add(k); out.push({ rule, at }); } };
  /** Faults found at points along the line, gathered into one per stretch: by rule and what it's about, the points
   * (corridor, s) and the worst figure there; said once each stretch ends. */
  const runs = new Map<string, { rule: Fault['rule']; corridor: string; s0: number; s1: number; worst: number; say: (from: string, to: string, worst: number) => string }>();
  const at = (rule: Fault['rule'], subject: string, corridor: string, s: number, worst: number, say: (from: string, to: string, worst: number) => string) => {
    const k = `${rule}|${subject}`, r = runs.get(k);
    if (r && r.corridor === corridor && s - r.s1 <= 2 * L.step + 2) { r.s1 = s; r.worst = Math.max(r.worst, worst); return; }
    if (r) add(r.rule, r.say(where(r.corridor, r.s0), where(r.corridor, r.s1), r.worst));
    runs.set(k, { rule, corridor, s0: s, s1: s, worst, say });
  };
  /** A place along a corridor in words: metres from the nearest station on it, rounded to tens. */
  const where = (corridor: string, s: number): string => {
    const near = net.stations.filter(st => st.corridor === corridor);
    const st = near.reduce((a, b) => Math.abs(b.at - s) < Math.abs(a.at - s) ? b : a, near[0]!);
    if (!st) return `${corridor} at ${Math.round(s)}`;
    const u = Math.round((s - st.at) / 10) * 10;
    return `${st.name} ${u >= 0 ? '+' : ''}${u} m`;
  };
  const present = (id: string, s: number) => { const [e0, e1] = net.extent(id); return s >= e0 - 1e-6 && s <= e1 + 1e-6; };

  // ---- each track: how fast it shifts ----
  for (const t of net.tracks) {
    const [e0, e1] = net.extent(t.id);
    for (let s = e0 + L.step; s <= e1 - L.step; s += L.step) {
      const k = Math.abs(net.offsetAt(t.id, s + L.step) - net.offsetAt(t.id, s - L.step)) / (2 * L.step);
      if (k > L.slope + 1e-9) at('slope', t.id, t.corridor, s, k, (a, b, w) => `${t.id} shifts sideways at up to 1 in ${(1 / w).toFixed(1)} from ${a} to ${b}`);
    }
  }

  // ---- each pair of tracks on a corridor: never crossing, and only briefly between apart and together ----
  for (let i = 0; i < net.tracks.length; i++) for (let j = i + 1; j < net.tracks.length; j++) {
    const a = net.tracks[i]!, b = net.tracks[j]!; if (a.corridor !== b.corridor) continue;
    const [a0, a1] = net.extent(a.id), [b0, b1] = net.extent(b.id), s0 = Math.max(a0, b0), s1 = Math.min(a1, b1);
    let side = 0, run = 0, runFrom = s0;
    for (let s = s0; s <= s1; s += L.step) {
      const d = net.offsetAt(a.id, s) - net.offsetAt(b.id, s), m = Math.abs(d);
      if (m > L.together) {
        if (side && Math.sign(d) !== side) add('cross', `${a.id} crosses ${b.id} at ${where(a.corridor, s)}`);
        side = Math.sign(d);
      }
      if (m > L.together && m < L.apart - 1e-6) { if (!run) runFrom = s; run += L.step; }
      else { if (run > L.turnout) add('turnout', `${a.id} and ${b.id} run ${run} m between apart and together from ${where(a.corridor, runFrom)}`); run = 0; }
    }
    if (run > L.turnout) add('turnout', `${a.id} and ${b.id} run ${run} m between apart and together from ${where(a.corridor, runFrom)}`);
  }

  // ---- a station's own rails (its bays' paths and its kit's rails): leave a track at a turnout, cross none ----
  // a station's rails are drawn along the line (src/render/stations.ts, alongLine), as its bays' are by the trains, so
  // their v is an offset across the line, as a track's is
  for (const st of net.stations) {
    const kit = kits[st.kit];
    const lines: { name: string; pts: number[][] }[] = [
      ...(st.platforms ?? []).filter(p => p.path).map(p => ({ name: `platform ${p.id}'s rails`, pts: p.path! })),
      ...(kit?.parts ?? []).filter(p => p.type === 'rails' && p.points).map((p, k) => ({ name: `rails ${k + 1} of the kit`, pts: p.points! })),
    ];
    for (const { name, pts } of lines) for (let k = 1; k < pts.length; k++) {
      const [u0 = 0, v0 = 0] = pts[k - 1]!, [u1 = 0, v1 = 0] = pts[k]!, du = Math.abs(u1 - u0);
      if (du > 0 && Math.abs(v1 - v0) / du > L.slope + 1e-9) add('rails', `${st.name}'s ${name} shift 1 in ${(du / Math.abs(v1 - v0)).toFixed(1)} from u ${u0}`);
      if (du === 0 && v1 !== v0) add('rails', `${st.name}'s ${name} turn square at u ${u0}`);
    }
    for (const { name, pts } of lines) {
      // along the rails every 2 m: each track there, which side of it they are, and for how long they're too close
      const sides = new Map<string, number>(), close = new Map<string, number>();
      for (let k = 1; k < pts.length; k++) {
        const [u0 = 0, v0 = 0] = pts[k - 1]!, [u1 = 0, v1 = 0] = pts[k]!, n = Math.max(1, Math.ceil(Math.abs(u1 - u0) / 2));
        for (let q = 0; q <= n; q++) {
          const u = u0 + (u1 - u0) * q / n, vv = v0 + (v1 - v0) * q / n, s = st.at + u;
          for (const t of net.tracks) {
            if (t.corridor !== st.corridor || !present(t.id, s)) continue;
            const d = vv - net.offsetAt(t.id, s), m = Math.abs(d), was = sides.get(t.id);
            if (m > L.together) {
              if (was && Math.sign(d) !== was) add('rails', `${st.name}'s ${name} cross ${t.id} at u ${Math.round(u)}`);
              sides.set(t.id, Math.sign(d));
            }
            if (m > L.together && m < L.apart - 1e-6) {
              const c = (close.get(t.id) ?? 0) + Math.abs(u1 - u0) / n; close.set(t.id, c);
              if (c > L.turnout) add('rails', `${st.name}'s ${name} run close beside ${t.id} at u ${Math.round(u)}`);
            } else close.set(t.id, 0);
          }
        }
      }
    }
  }

  // ---- room: clear line between one section and the next, and either side of a junction ----
  for (const c of Object.values(net.corridors)) {
    const marks: { s0: number; s1: number; name: string }[] = net.sections(c.id).map(([s0, s1]) => ({ s0, s1, name: `the tracks moving from ${where(c.id, s0)} to ${where(c.id, s1)}` }));
    for (const j of net.junctions) {
      // a junction where a corridor only starts or ends (Edgeley, today) marks the corridors either side
      const on = j.corridor === c.id || def.corridors.some(k => k.id === c.id && (k.from === j.id || k.to === j.id));
      if (on) marks.push({ s0: j.s, s1: j.s, name: j.name });
    }
    marks.sort((a, b) => a.s0 - b.s0);
    // a junction at the end of a stretch where the tracks move is that stretch's own: its ways parting
    for (let k = marks.length - 1; k > 0; k--) {
      const a = marks[k - 1]!, b = marks[k]!;
      if (b.s0 - a.s1 <= 2 * L.step && (a.s0 === a.s1) !== (b.s0 === b.s1)) { a.s1 = Math.max(a.s1, b.s1); a.name = a.s0 === a.s1 ? `${a.name} and ${b.name}` : `${a.name} at ${b.name}`; marks.splice(k, 1); }
    }
    for (let k = 1; k < marks.length; k++) {
      const a = marks[k - 1]!, b = marks[k]!, gap = b.s0 - a.s1;
      if (gap < L.gap) add('room', `${a.name} and ${b.name} are ${Math.max(0, Math.round(gap))} m apart (${L.gap} m wanted)`);
    }
  }

  // ---- on the deck: on every viaduct and bridge, the station's rails lie on it (the tracks make its width) ----
  for (const m of def.landmarks ?? []) {
    if ((m.kind !== 'viaduct' && m.kind !== 'arches') || !m.from || !m.to) continue;
    const corridor = m.corridor ?? 'main', c = net.corridor(corridor), xz = (p: { lat: number; lon: number }) => {
      const o = def.origin, kLat = 111320, kLon = 111320 * Math.cos(o.lat * Math.PI / 180);
      return [(p.lon - o.lon) * kLon, -(p.lat - o.lat) * kLat] as const;
    };
    const a = c.nearest(...xz(m.from)), b = c.nearest(...xz(m.to)), s0 = Math.min(a, b), s1 = Math.max(a, b);
    for (const st of net.stations) {
      if (st.corridor !== corridor) continue;
      for (const p of kits[st.kit]?.parts ?? []) {
        if (p.type !== 'rails' || !p.points) continue;
        for (let k = 1; k < p.points.length; k++) {
          const [u0 = 0, v0 = 0] = p.points[k - 1]!, [u1 = 0, v1 = 0] = p.points[k]!, n = Math.max(1, Math.ceil(Math.abs(u1 - u0) / 2));
          for (let q = 0; q <= n; q++) {
            const u = u0 + (u1 - u0) * q / n, vv = v0 + (v1 - v0) * q / n, s = st.at + u; if (s < s0 || s > s1) continue;
            const [lo, hi] = net.deck(corridor, s, s);
            if (vv < lo + L.cess - L.together || vv > hi - L.cess + L.together) at('deck', `${st.id} ${m.id} ${p.points[0]}`, corridor, s, 0, (a, b) => `${st.name}'s kit rails run off ${m.name} from ${a} to ${b}`);
          }
        }
      }
    }
  }

  for (const r of runs.values()) add(r.rule, r.say(where(r.corridor, r.s0), where(r.corridor, r.s1), r.worst));
  runs.clear();

  // ---- blocks: as long as a train and its overlap, and no signal in a section ----
  for (const t of net.tracks) {
    const B = net.blocks(t.id), moving = net.sections(t.corridor);
    if (B.at.length > 2) for (let k = 1; k < B.at.length; k++) {
      const len = B.at[k]! - B.at[k - 1]!;
      if (len < L.block - 1e-6) add('block', `${t.id}'s block from ${where(t.corridor, B.at[k - 1]!)} is ${Math.round(len)} m (${Math.round(L.block)} m wanted)`);
    }
    for (const s of B.at.slice(1, -1)) if (moving.some(([a, b]) => s > a && s < b)) add('block', `${t.id} has a signal in the tracks moving at ${where(t.corridor, s)}`);
  }
  return out;
}
