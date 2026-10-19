// Which line each committed tile belongs to, for the tile budgets per line (docs/decisions/
// ADR-2026-10-14-budgets-and-the-real-railway.md, point 3), read by the terrain and world check groups.
// Today's line (Hazel Grove to Piccadilly, and Stockport's valley) is its 52 kilometre squares, TODAY. Any other point
// belongs to the line out whose corridor is nearest: each corridor off the spine (net.lines) is a line of its own, and
// the spine beyond today's squares is the Buxton line. A new corridor is a new line with the default allowance.
// ALLOW: each line's allowance in bytes, terrain and world squares apart; a line not listed gets DEFAULT (about 0.5 MB
// each, the owner's call). Today's line keeps its own, and so does the Marple line, whose eight stations along 19 km
// already held 0.9 MB of world squares when the budgets went per line, and the Buxton line's world squares, which took
// in the gaps between the lines (Offerton and the country by High Lane) on 19 October 2026.
const MB = 1024 * 1024;
export const DEFAULT = { terrain: 0.5 * MB, world: 0.5 * MB };
export const ALLOW = {
  today: { terrain: 1.5 * MB, world: 2 * MB },
  marple: { terrain: 0.75 * MB, world: 1 * MB },
  buxton: { terrain: 0.5 * MB, world: 0.75 * MB },
};
export const allowance = (line, kind) => (ALLOW[line] ?? DEFAULT)[kind];
export const NAMES = { today: "today's line", buxton: 'the Buxton line', marple: 'the Marple line', 'rose-hill': 'the Rose Hill branch', crewe: 'the Crewe line', macclesfield: 'the Macclesfield leg' };

/** Today's line's kilometre squares (Hazel Grove to Piccadilly, and Stockport's valley). */
export const TODAY = new Set(('0_0 0_1 0_2 0_-1 0_-2 0_-3 1_0 1_1 1_2 1_3 1_-1 2_1 2_2 2_3 2_4 3_2 3_3 -1_0 -1_1 -1_2 -1_-1 -1_-2 -1_-3 -1_-4 -1_-5 -2_0 '
  + '-2_1 -2_-1 -2_-2 -2_-3 -2_-4 -2_-5 -2_-6 -2_-7 -2_-8 -3_-3 -3_-4 -3_-5 -3_-6 -3_-7 -3_-8 -3_-9 -4_-5 -4_-6 -4_-7 -4_-8 -4_-9 -5_-7 -5_-8 -5_-9 -6_-8 -6_-9').split(' '));

/** A function from a point (game metres) to its line's id: 'today', 'buxton' or a corridor's id. */
export function lineOf(net) {
  return (x, z) => {
    if (TODAY.has(`${Math.floor(x / 1000)}_${Math.floor(z / 1000)}`)) return 'today';
    let best = '', bd = Infinity;
    for (const L of net.lines) { const f = L.at(L.nearest(x, z)), d = Math.hypot(f.x - x, f.z - z); if (d < bd) { bd = d; best = L.id === 'spine' ? 'buxton' : L.id; } }
    return best;
  };
}
/** Every line, today's and the lines out, in the network's order, so each is reported even with nothing committed. */
export const linesOf = net => ['today', ...net.lines.map(L => L.id === 'spine' ? 'buxton' : L.id)];
/** "name 123 KB of 512 KB" for each line, and the lines over their allowance. */
export function report(sizes, lines, kind) {
  const kb = n => `${(n / 1024).toFixed(0)} KB`;
  return {
    text: lines.map(l => `${NAMES[l] ?? l} ${kb(sizes[l] ?? 0)} of ${kb(allowance(l, kind))}`).join(', '),
    over: lines.filter(l => (sizes[l] ?? 0) > allowance(l, kind)),
  };
}
