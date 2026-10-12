# UX/UI redesign: directions

Stage 1 of phase 4 step 10 (`docs/ROADMAP.md`), from `docs/briefs/redesign-directions.md`. Three directions for the whole interface, phones first, drawn as static mockups at each device's real size on the page https://kylelookingaround.github.io/the-commute/design/ (source `public/design/`). The page shows each direction's stage and top bar, station strip, station panel, line panel, settings sheet, contract sheet and a new player's first five minutes, at 320 × 568, 390 × 844, 844 × 390, 768 × 1024 and 1440 × 900, beside screenshots of the game as it is. Stage 2 builds the recommended direction unless the owner picks another.

## What's wrong today

Seen in the screenshots and measured from `tokens.css`:

1. **The panels are below the map on a phone.** The page is a column: top bar, stage (52% of the height), strip, station panel, line panel, foot. To buy, a player scrolls the map off screen, so a card's ghost appears on a map they can't see.
2. **Reach.** The title and ticker take about 180 px of a 390 phone before the map starts. The map's views (Minutes, Whole line, settings, full screen) sit top right, the hardest place for a thumb. The light slider holds the bottom left, the best place, for a look-around toy.
3. **Things in odd homes.** Save, Load and Start over are at the foot of a long page under a paragraph of rules; the credits are there too.
4. **Contrast.** Locked text (`--lock` on a card) is 3.6:1, under the 4.5:1 small text needs. Borders (`--line`) are 1.4:1 against the surface, so a card's edge barely shows and a selected card is told apart by colour alone.
5. **Small type.** `--text-xs` is 10 px, used for every caption in the stats, chips and tags.
6. **Leads with the wrong thing.** The station panel opens with seven stats in a grid (Homes first) before the first card; on a phone the cards start below the fold.

## The directions

### A · Platform sheet (recommended)

One sheet rises over the map from the bottom. At rest it is a 142 px peek: the open station's name, waiting count and the speed buttons, then the strip. Tapping a station (on the strip or the map) raises it to half height with the station's cards; a Station | Line switch in its header swaps in the line's cards. Settings and the contract use the full height over a scrim. Picking a card sinks the sheet back to its peek with a Buy bar, so the ghost stands in open map. On landscape phones, tablets and desktop the same sheet docks to the left as a floating side panel, and settings and the contract become a centred sheet.

- **Thumb zones:** everything frequent (strip, cards, Buy, speed) is in the bottom 40% in portrait. The map's views (Line, Mins, Light) stack on the right edge just above the sheet. Cash and clock are top left (read, not tapped); settings top right (rare).
- **One hand:** yes in portrait. In landscape the panel sits under the left thumb and the map under the right.
- **Contrast, keyboard, reduced motion:** solid panels (no see-through behind text), the token changes below. Tab order: top bar, map views, sheet. The handle is a button (Raise, Lower), Esc lowers a step, Enter on a station chip opens it. With reduced motion the sheet jumps between heights and the ghost appears without rising.
- **Cost:** M, about $30.

### B · Tab bar

The map is always full screen. A tab bar (Stations, Line, Views, More; Contract joins once offered) sits along the bottom, and a route diagram above it stands in for the strip: the line drawn as a line, owned stations filled, the rest fogged with their price. Tabs open a panel upwards to 62% height; cards are two-column tiles. More holds settings, saves and credits. In landscape and on wide screens the tab bar becomes a rail down the left and panels open beside it.

- **Thumb zones:** the tab bar and diagram are in the easiest zone, but a panel's upper half is a stretch, and the tab bar costs 64 px of map at all times.
- **Cost:** M–L, about $40 (a tab bar, a rail, the diagram drawn from the network data, every panel re-homed).

### C · Departure board rail

A departure board lists the line, a station per row with its waiting count or price, with the open station's cards underneath. On tablets and desktop it is a rail down the right beside the map; on phones a drawer that covers 86% of the screen, opened from a button at the bottom right (not an edge swipe, which would fight the map's slide).

- **Thumb zones:** good to open and buy, but on a phone the drawer hides the map while open, so preview means closing it to a Buy bar. Left-handers need it mirrored. The roomiest on desktop.
- **Cost:** M, about $35 (moving around the map's strip slider has to move onto the board).

## Recommendation: A

- The map stays the star at every moment: four fifths of a phone at rest, over 40% with a station open, nearly all of it during a preview. B always loses its tab bar's 64 px; C hides the map on a phone while the drawer is open.
- It fixes the worst problem today (ghost off screen) by design: picking a card sinks the sheet.
- One component at every size, so stage 2 builds one thing.
- It leaves the map's gestures alone: only the handle and header drag the sheet (moving around the map's brief).
- It reuses today's cards, strip and settings, so it is the cheapest and easiest to undo.

Worth taking from the others: B's route diagram is a good idea for the line panel's header later, and C's departure board styling (mono figures, amber names) for the strip's numbers.

## The first five minutes (all directions)

No tutorial wall and no recommended buy (the owner's rule):

1. 0:00. The map opens on Stockport at 06:30 with the first train due; one line on the map says so, and fades.
2. 0:40. The train calls; each fare flies off the platform as a coin to the cash. People, trains, fares in one picture.
3. 1:30. The only thing that invites a tap is the open station (the peek in A). Its cards rise with the one hint line the game has now: "Tap a card to see it on the map." No card is singled out.
4. 2:30. A tapped card's ghost stands on the map and a Buy bar waits at the thumb; buying raises the part into place.
5. 4:30. Heaton Chapel waits in the fog with its price, and an edge marker points up the line to it when it's off screen; its chip's meter fills as fares come in.

The edge marker (an off-screen station shown at the screen's edge with its price) is new, and helps "never lost" in moving around the map too.

## What stage 2 builds

### Tokens (`src/ui/styles/tokens.css`)

- `--line` to `#5e6a98` (3.2:1 on the surface, 3.5:1 on cards); keep the old value as `--line-soft` for dividers inside panels.
- `--lock` to `#7d86a6` (4.7:1 on the surface, 5.1:1 on cards).
- Type: `--text-xs` 12 px (no type under 12), `--text-sm` 13, `--text` 15.
- New: `--r-lg` 18 px (sheets), `--elev` (one shadow for what floats over the map), `--glass` (one translucent navy for map pills and labels; panels stay solid), `--peek` 142 px and `--half` 58% (the sheet's heights in portrait), `--sheet-w` 340/360/400 px (side panel in landscape, tablet, desktop).
- `public/design/design.css` has them all, marked "new".

### Components

- **Sheet** (new, `src/ui/sheet.ts`): peek, half and full heights in portrait, a docked side panel from 600 px wide or in landscape; drags only by handle and header; snaps; Esc lowers; reduced motion jumps. Tells the camera how much of the screen it covers, so focus and fly-tos frame into the open map rather than behind the sheet.
- **Top bar**: cash and clock as pills over the map, top left; settings top right. The title goes (it's in the tab and on the home screen icon).
- **Map views**: Line, Mins and Light as labelled round buttons on the right edge above the sheet. Light opens the slider in a small popover instead of holding the corner. Full screen moves into settings.
- **Strip**: chips 124 × 56 in the peek (name and waiting or price, a meter for the next station); fogged chips keep their price. Moving around the map's glide-along-the-strip stays on it.
- **Station panel**: four stats that matter now (Waiting, Boarded, Revenue, Gave up) in one row, the rest behind a "More" toggle; cards in one column on phones, two on desktop; Built chips under them.
- **Buy bar**: the picked card's name, effect and Buy in the peek while its ghost shows.
- **Edge markers**: the next locked station's name and price at the screen's edge when it's off screen.
- **Settings sheet**: Sound, Graphics, Weather, Screen (full screen), Your game (Save, Load, Start over, moved from the foot) and About (credits, moved from the foot).
- **Contract sheet** (restyling `src/ui/contract.ts` once it lands): the plaque, what lasts and what starts again, the perk tree as one card per branch showing what's owned and the next perk only (the rest hidden, with a "Then" chip as cards do), Renew pinned at the bottom.

### Panels and files that change

`index.html` (the page becomes the stage plus the sheet; the foot's text goes into About), `src/ui/panel.ts` (the strip, station and line panels render into the sheet; the stats trimmed), `src/ui/settings.ts` (a sheet instead of a dialog box, gains Screen, Your game, About), `src/ui/saves.ts` (its buttons live in settings), `src/ui/fullscreen.ts` (its button moves into settings), `src/ui/contract.ts`, `src/ui/styles/` (page.css rewritten, settings.css), `src/render/camera.ts` (only to take the sheet's cover as a frame offset), `src/main.ts` (wiring).

### Checks to update (`tools/checks/`)

- `layout`: at the six sizes, the map fills the screen, the sheet's peek and strip are in view, nothing scrolls the page sideways, and a picked card leaves its ghost in the open map (above the sheet).
- `life`, `saves`, `fullscreen`: their controls are found in the settings sheet, still 44 px and fitting at 320 px.
- `daylight`: the slider is in the Light popover.
- `preview`, `line`, `reach`: cards are found in the sheet; picking sinks the sheet to its peek with a Buy bar.
- `access` (or a new `contrast` group): text and border contrast from the tokens (4.5:1 text, 3:1 borders), no font under 12 px, every tap target 44 px.
- `offline`: nothing under `design/` in the worker's list (the filter in `vite.config.ts` this stage added).

## Not chosen, and why

- B's always-on tab bar and C's phone drawer each hide map for the sake of navigation the game barely needs: it has two panels, not five.
- A floating radial menu or gesture-driven panels were left out: they'd fight moving around the map's gestures.
