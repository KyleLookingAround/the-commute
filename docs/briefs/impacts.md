# Brief: impacts on the map

## Goal and what it may touch

- Show the game's pressure on the map rather than in text: people turning back at the entrance when a platform is full or they've waited too long (the sim's lost count rising), trains that look as full as they are (lit, busy windows or figures standing in the doorways as the load rises), and a quiet sign of the stations earning most. Then measure whether the peaks bite enough now that stations start as halts (lost is back to about 200 over 8 sim hours) and report what you find; change the economy only if the owner agrees.
- Prototype phase: work on your session's branch and push straight to `main` (pull first). One commit per change.
- Files it may touch: `src/render/passengers.ts`, `src/render/trains.ts`, `src/render/palette.ts` and `src/ui/styles/tokens.css` (new colours as tokens), `src/main.ts` (wiring only), `tools/checks/` and the docs below. Not `src/ui/panel.ts` or `src/render/stations.ts` (the upgrades work owns those now).

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md`, `src/render/passengers.ts` (figures in groups, waiting, boarding, alighting, changing), `src/render/trains.ts`.

## What it must keep

- No economy change: `PLAY` on seeds 1-3 identical to `main`. Anything you'd change in the economy goes to the owner as a `needs-owner` issue with the bot's before-and-after table.
- Cosmetic only: anything random in the view is seeded hashing or ends `// cosmetic`. Instancing for anything repeated, no per-frame allocations.
- Colourful and alive, not bleak: turning back reads as a shrug, not a disaster.
- Phones first: check the frame time doesn't drop on the phone-sized shots.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

The session pushes to `main` once `npm run rules`, `npm test` and `npm run check` pass and it has looked at frame bursts of a busy peak; then it confirms the Publish run is green.

## What's left for others

- The upgrade cards, the ghost preview and the rise of new stages (`docs/briefs/upgrades-ui.md`); managers (`docs/briefs/managers.md`).

## When to stop and ask

- Only for something irreversible or outside this brief. A `needs-owner` issue with a default for real questions, taking the default after 12 hours. Where merely unclear, the safer option.

## Cost budget

- Estimate: about $15 (view work with frame bursts).
- Past twice the estimate: say why in the commit message and trim what's left.
