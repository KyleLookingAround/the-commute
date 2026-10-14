# Budgets that scale with the network, and the real railway by default

**Status:** Approved · 14 October 2026 (the owner)

## Context

Each new line out hit the same limits. Each line's data and ground are bundled into the script before the first frame, which reached 447 of 450 KB with the Crewe line and forced its near ground to be cut back. The terrain and world budgets were raised for every line, so they no longer held anything back. The triangle budgets were set above what the game drew at the time, not from a real phone, and the gridlock opening can't fit under them. One session at a time stopped the conflicts, but it made the lines out strictly serial.

Separately, sessions take "the option that changes the game less" when a call is the owner's. Each call was right, but they piled up as unrealistic defaults: one unit per branch, no expresses on the Crewe line, the Marple trains on the slow lines, and diesels.

## Decision

The owner agreed to all of the coordinator's proposals.

1. **The script before the first frame keeps its 450 KB, but holds only the opening.** That means Stockport, the spine to Piccadilly and what the first view needs. Every line out's network data, kits and ground load after the first frame. The `perf` group checks it.
2. **Triangle budgets come from a real phone.** The owner opens a stats view on a mid-range phone, and the budgets are set from what holds a steady frame there. The count is of what's on screen at each view, not the whole map.
3. **Committed tile budgets are per line** (about 0.5 MB of terrain and 0.5 MB of world squares per line out), plus a check of what one view loads, which is what a player pays for. The total grows with the network by design.
4. **Up to two sessions at once,** each with files it owns. The browser checks run as six shards rather than four.
5. **The real railway is the default** where a call is only about realism. A session follows the real line's layout, routes, traction and service pattern, rather than the option that changes the game less. Whatever it moves, it still runs the bot on seeds 1–3 and says what moves. A move past the baselines' tolerance is re-proposed in the commit, not avoided. Economy tuning (prices, fares, demand) is not a realism call, and "changes the game less" still holds there.

## Consequences

- The four open calls settle as the real railway:
  - Diesels stay until the lines out are wired.
  - The expresses run up the Crewe and Macclesfield lines once their services are built.
  - The Marple trains get their own pair into platforms 1 to 4.
  - Each line runs its real frequency.
- The last two come in their own item after the Crewe line.
- A new line out adds its own allowance to the tile budgets rather than raising a shared one.
