// Contract renewal (docs/DESIGN.md, Contract renewal): running the line is an operating contract. Once the player owns
// Piccadilly they may renew it whenever they like: the run's reputation is banked, the network goes back to halts, and
// the next run starts from Stockport a little stronger, with the perks the reputation bought. What lasts (the career:
// reputation, perks, milestones, contracts renewed) is kept apart from the run, in its own save with its own version, so
// starting a run again never touches it. Perks act through the sim's own numbers (src/sim/sim.ts reads `effects`).
// Pure: no DOM, no clock, no random numbers; the deeper layers (eras, challenges) build on this shape later.
import type { ContractDef, GameState, PerkDef } from './types.ts';

/** The career's own save version: raise it when the career's shape changes (no compatibility promise before the first
 * release, as for the run's save). */
export const CAREER_VERSION = 1;

/** One contract as it ended: its number, the game day it was renewed on, and the reputation it banked. */
export interface ContractEnd { n: number; day: number; rep: number }
/** What lasts through every renewal. rep: reputation banked and not yet spent; perks: the perks bought (ids); renewals:
 * contracts renewed so far (the one being played is renewals + 1); milestones: what any contract has reached
 * ("owns:<station>", "renewed"); contracts: each renewed contract, oldest first. */
export interface Career { v: number; rep: number; perks: string[]; renewals: number; milestones: string[]; contracts: ContractEnd[] }

export function freshCareer(): Career { return { v: CAREER_VERSION, rep: 0, perks: [], renewals: 0, milestones: [], contracts: [] }; }
/** Whether a career has anything in it: a contract renewed or a perk bought. */
export const careerEmpty = (c: Career): boolean => !c.renewals && !c.perks.length && !c.rep;

/** A career read from JSON, or null when it isn't one or is from another version (before the first release an older
 * career starts afresh, as an older run does). */
export function readCareer(raw: unknown): Career | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Partial<Career>;
  if (c.v !== CAREER_VERSION || typeof c.rep !== 'number' || !Array.isArray(c.perks) || typeof c.renewals !== 'number') return null;
  return { v: c.v, rep: c.rep, perks: c.perks.filter(p => typeof p === 'string'), renewals: c.renewals,
    milestones: Array.isArray(c.milestones) ? c.milestones.filter(m => typeof m === 'string') : [], contracts: Array.isArray(c.contracts) ? c.contracts : [] };
}

// ---- reputation ----
/** Reputation earned: a point for every hundred passengers who started a journey, less three for each who gave up and
 * went home, all times the punctuality (the share of departures within five minutes), so a well-run line banks more
 * than a big one run badly. A cab taken instead of the train counts half. Never below nothing. */
export const REP = { per: 100, cab: 0.5, lost: 3 };
/** The share of departures from stops within five minutes of time, 0 to 1 (1 before any). */
export function punctuality(g: GameState): number { const s = g.stats, n = s.deps ?? 0; return n ? Math.max(0, 1 - (s.late ?? 0) / n) : 1; }
export function reputation(g: GameState): number {
  const s = g.stats;
  return Math.max(0, Math.floor((s.boarded + REP.cab * s.cab - REP.lost * s.lost) * punctuality(g) / REP.per));
}

/** Whether the contract can be renewed: once the player owns the whole line, Piccadilly. */
export function renewable(g: GameState, piccadilly: number): boolean { return !!g.owned[piccadilly]; }

/** The career once this run's contract is renewed: its reputation banked, its milestones kept, one more contract. The
 * run itself is the caller's to start again (Sim.fresh with the career's perks). */
export function renew(c: Career, g: GameState, stationIds: string[]): Career {
  const rep = reputation(g), n = c.renewals + 1;
  const reached = stationIds.filter((_, i) => g.owned[i]).map(id => 'owns:' + id);
  return { ...c, rep: c.rep + rep, renewals: n, milestones: [...new Set([...c.milestones, ...reached, 'renewed'])], contracts: [...c.contracts, { n, day: g.day, rep }] };
}

// ---- perks ----
/** The perks of a branch, in the order they're bought. */
export const branchPerks = (def: ContractDef, branch: string): PerkDef[] => def.perks.filter(p => p.branch === branch);
/** A perk by id, or undefined. */
export const perkDef = (def: ContractDef, id: string): PerkDef | undefined => def.perks.find(p => p.id === id);
/** Where a perk stands for a career: bought; next in its branch (all before it bought); or locked behind one that isn't. */
export function perkState(def: ContractDef, c: Career, id: string): 'owned' | 'next' | 'locked' {
  if (c.perks.includes(id)) return 'owned';
  const p = perkDef(def, id); if (!p) return 'locked';
  for (const q of branchPerks(def, p.branch)) { if (q.id === id) return 'next'; if (!c.perks.includes(q.id)) return 'locked'; }
  return 'locked';
}
/** Whether a career can buy a perk with `rep` reputation to spend (the banked rep, or more while a renewal is pending). */
export const canBuyPerk = (def: ContractDef, c: Career, id: string, rep = c.rep): boolean => perkState(def, c, id) === 'next' && rep >= (perkDef(def, id)?.price ?? Infinity);
/** The career with a perk bought, or null if it can't be. */
export function buyPerk(def: ContractDef, c: Career, id: string): Career | null {
  const p = perkDef(def, id); if (!p || !canBuyPerk(def, c, id)) return null;
  return { ...c, rep: c.rep - p.price, perks: [...c.perks, id] };
}

/** What a run's perks do, added up: cash at the start, a share off every price, seconds off every walk, the first extra
 * unit in hand, the spare unit from the start. All nothing with no perks, so a run without them plays as before. */
export interface Effects { cash: number; build: number; walk: number; unit: boolean; spare: boolean }
export const NO_EFFECTS: Effects = { cash: 0, build: 0, walk: 0, unit: false, spare: false };
export function effects(def: ContractDef | undefined, perks: readonly string[] | undefined): Effects {
  if (!def || !perks?.length) return NO_EFFECTS;
  const e = { ...NO_EFFECTS };
  for (const id of perks) {
    const p = perkDef(def, id); if (!p) continue;
    e.cash += p.cash ?? 0; e.build += p.build ?? 0; e.walk += p.walk ?? 0; e.unit ||= !!p.unit; e.spare ||= !!p.spare;
  }
  return e;
}
