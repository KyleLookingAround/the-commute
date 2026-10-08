# Four layers, a pure seeded sim, and a bot from the first line

**Status:** Approved · 8 October 2026

## Context

The simulation must run in Node for tests and the bot, catch up time away on load, and stay testable as the renderer grows. The owner's other games learned that a sim that reaches for the DOM or `Math.random()` stops being repeatable, and that a bot found design gaps earlier than play did.

## Options considered

- One module that renders and simulates. Fast to write, impossible to test headless.
- A sim with its own random source and no DOM, enforced by review. Drifts the first time nobody looks.
- The same, enforced by a script the build runs. Costs one file.

## Decision

- **Four layers:** `src/sim/` (pure: the economy, trains, the network, saves), `src/data/` (the line and the kits, plain JSON), `src/app/` (the clock, storage, the only place `localStorage` is named), and the view (`src/render/` for Three.js, `src/ui/` for the panels). `tools/rules.mjs` fails the build if the sim or data import the view, the app or `three`, or name a DOM global.
- **Seeded randomness:** `src/sim/random.js` is a mulberry32 whose state lives in the saved game. `Math.random()` is allowed only there (to pick a seed) and on lines ending `// cosmetic`.
- **A bot:** `tools/bot.mjs` plays a sensible game headless on seeds 1–3; `tools/baseline.json` holds the ranges; a check proves the same seed gives the same game twice.
- **Every file opens with a `//` line** saying what's in it.

## Consequences

- Economy changes are judged by the bot's table, not by feel; a refactor must leave `PLAY` identical.
- The page sets `window.__seed` for checks so a failure repeats.
