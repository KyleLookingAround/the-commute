# Brief: life (passengers, sound, night and settings)

## Goal and what it may touch

- Phase 4 step 6 of `docs/ROADMAP.md`: a line that feels alive at every hour.
  - **Different passengers:** commuters in work clothes at the peaks, students with suitcases (heavier towards Piccadilly and Oxford Road's universities), cyclists wheeling bikes, and football crowds in club colours on match days (a seeded few game days, cosmetic: they don't change demand yet). All instanced, cosmetic, drawn from what the sim already says about who is travelling and when.
  - **Sound, with a mute:** trains arriving and leaving (wheels, brakes, doors), a station announcement chime and a few words when a train is due ("The next train to Manchester Piccadilly..." as a chime and murmur, not synthesised speech), birds by day and quiet at night, rain when there's weather later. Generate the sounds in the browser with the Web Audio API (no third-party recordings to license). Sound follows the camera: near a station you hear it, at whole-line zoom only a soft bed. Off until the player first taps (browsers require it), and a mute that's remembered on the device.
  - **The night:** stations lit and empty after the last trains, a lamp-lit quiet, and the occasional engineering train (a yellow on-track machine with orange lights) crawling through in the small hours, cosmetic only.
  - **A settings sheet:** sound on or off and its volume, and graphics quality (shadows, passenger figures, far detail) for older phones; remembered on the device (`localStorage` through `src/app/storage.ts`'s pattern, never in the save).
- Prototype phase: work on your session's branch and push straight to `main` (pull first; several sessions are pushing). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page, and look at `npm run shots`.
- Files it may touch: `src/render/passengers.ts`, a new `src/render/sound.ts` (or `src/ui/sound.ts`), `src/render/trains.ts` (only for the engineering train), a new `src/ui/settings.ts`, `src/ui/styles/*.css`, `index.html` (the settings control only), `src/app/` (a small prefs store beside storage), `src/main.ts` (wiring), `src/render/palette.ts` and `src/ui/styles/tokens.css`, `tools/checks/` and the docs below. Not the kits, `src/render/stations.ts`, `src/render/world.ts`, `src/ui/panel.ts` or `src/sim/` (other sessions own those right now).

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md`, phase 4 of `docs/ROADMAP.md`, `src/render/passengers.ts`, `src/render/life.ts`.

## What it must keep

- No economy change: the bot's `PLAY` on seeds 1-3 identical to `main` at the commit you started from. Anything random in the view is seeded hashing or ends `// cosmetic`.
- Colourful and alive, never bleak; sound gentle by default. Phones first: no frame-time drop on the phone shots, and the low graphics setting visibly lighter. Tap targets at least 44 px; colours as tokens; UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and it has looked at the shots; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push. One commit per piece (passengers, sound, night, settings) is fine. Run `git status` and stage paths by name before each commit.

## What's left for others

- Weather and seasons (the next phase 4 step) adds rain to the sound and the settings. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where unclear, take the safer option, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $20 (four pieces, each small to medium).
- Past twice the estimate: say why in the commit message and hand on what's left.
