// The game's random numbers: a seeded mulberry32 kept in the saved state, so the same seed and the same commands
// always give the same game, in a test, in the bot and on the page. The only Math.random() in the sim is here, picking
// a fresh seed for a new game; the rules check (tools/rules.mjs) rejects it anywhere else outside a `// cosmetic` line.

export function freshSeed(): number { return (Math.random() * 0x100000000) >>> 0; }

/** Advance the state in g and return a float in [0, 1). */
export function rand(g: { rngState: number }): number {
  let t = (g.rngState = (g.rngState + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
