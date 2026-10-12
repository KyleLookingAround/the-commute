# Brief: UX/UI redesign, stage 1: directions

## Goal and what it may touch

- Phase 4 step 10 of `docs/ROADMAP.md`, stage 1 of 2. Design two or three directions for the whole interface, phones first, and show them side by side on a page the owner can open on their phone. Recommend one. Stage 2 builds the chosen direction once contract renewal and moving around the map have landed, since both are in `src/ui/` now. It gets its own brief.
  - **The page:** `public/design/index.html`, so it goes live at https://kylelookingaround.github.io/the-commute/design/. Use static HTML and CSS mockups, no game code. Each direction shows the same screens:
    - the stage with its top bar
    - the station strip
    - a station panel with its upgrade cards
    - the line panel
    - the settings sheet
    - the contract renewal sheet and perk tree (being built now: mock it from `docs/briefs/contract-renewal.md`)
    - a new player's first five minutes: what they tap first, and why it matters, without a tutorial wall
  - **Sizes:** each screen at 320 px and 390 px portrait, a landscape phone, a tablet and a desktop. Lay the page out so it reads well on a phone: one direction at a time with a switcher, or a column per direction on a wide screen.
  - **Today, for comparison:** screenshots of the game as it is (`npm run shots`), on the same page.
  - **Each direction:**
    - a name
    - a short idea in a sentence or two
    - the thumb zones it relies on
    - how it handles one-handed play, contrast, keyboard and reduced motion
    - what it would cost to build
  - **The directions should differ:** for example, a bottom sheet that rises over the map; a bottom tab bar with the map always full; and a side rail on wider screens that becomes a drawer on phones. Every direction keeps the owner's preferences: the map is the star, locked things are hidden, impacts show on the map, text is concise UK English, and the look is colourful and alive.
  - **The recommendation:** one direction, with reasons, at the top of the page.
  - **The write-up:** a `docs/design/redesign.md` with the directions, the recommendation and what stage 2 must build. It covers the token changes, the components, which panels change and the checks to update. Add the findings to `docs/UX-REVIEW.md` where they belong.
- **Keep it out of the offline cache:** everything in `dist/` is precached by the build's offline step (`offline()` in `vite.config.ts`), so leave `design/` out of the precache list there (one filter).
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test`. Run `git status` and stage paths by name before each commit.
- Files it may touch: `public/design/` (the page, its CSS, and PNG screenshots kept small, a few MB at most), `vite.config.ts` (the one precache filter), `docs/design/redesign.md`, `docs/UX-REVIEW.md`, `docs/ROADMAP.md` (step 10's line), and nothing in `src/`.

## Read first

- The project notes (`CLAUDE.md`, the owner's preferences above all), `docs/UX-REVIEW.md`, `src/ui/styles/tokens.css`, `index.html`, and the panels as they are (`src/ui/panel.ts`, `settings.ts`, `saves.ts`, `fullscreen.ts`).
- `docs/briefs/moving-around-the-map.md` (gestures that own the map: the design must leave the map's gestures alone) and `docs/briefs/contract-renewal.md`.

## What it must keep

- Nothing in the game changes: no edits in `src/`, and the bot's `PLAY` is untouched.
- Mockups use real station names, real prices from the game, and UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules and tests pass. Then it confirms the "Publish to GitHub Pages" run deployed the page, and gives the page's live URL in its last commit message.

## What's left for others

- Stage 2, building the chosen direction, gets its own brief from the coordinator once contract renewal and moving around the map have landed.

## When to stop and ask

- The owner has said not to wait on them. The page is for them to choose from, so recommend clearly; if they don't choose, stage 2 builds the recommendation.

## Cost budget

- Estimate: about $12 (three directions' mockups at five sizes, the comparison screenshots, and the write-up).
- Past twice the estimate: say why in the commit message and trim what's left.
