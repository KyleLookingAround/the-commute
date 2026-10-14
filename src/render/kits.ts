// The station kits the page has: the opening's (the line from Stockport to Piccadilly) come with it; every line out's
// (src/render/kitsOut.ts) are fetched just after the first frame (loadOutKits), so the script before it holds only the
// opening. Until a line out's kits are in, its stations stand as empty groups (src/render/stations.ts, fillStations).
import type { Kit } from './stations.ts';
import stockport from '../data/kits/stockport.json';
import heatonChapel from '../data/kits/heaton-chapel.json';
import levenshulme from '../data/kits/levenshulme.json';
import ardwick from '../data/kits/ardwick.json';
import piccadilly from '../data/kits/piccadilly.json';

/** Every kit in so far, by name: the opening's, and the lines out's once loadOutKits has them. */
export const kits: Record<string, Kit> = {
  stockport: stockport as Kit, 'heaton-chapel': heatonChapel as Kit, levenshulme: levenshulme as Kit, ardwick: ardwick as Kit, piccadilly: piccadilly as Kit,
};
let out: Promise<Record<string, Kit>> | null = null;
/** Fetch the lines out's kits (once), and add them to `kits`. */
export function loadOutKits(): Promise<Record<string, Kit>> {
  return out ??= import('./kitsOut.ts').then(m => { Object.assign(kits, m.outKits); return m.outKits; });
}
