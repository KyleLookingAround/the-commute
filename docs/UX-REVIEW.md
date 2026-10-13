# The UI and UX review

A look at how the game looks and works, from a player's side, run when the owner asks. Each review picks a few improvements, ships them the usual way (branch, checks, screenshots, PR, green `check`, squash merge), and leaves a short note in `docs/ux/`.

## 1. Look

1. `npm run build`, then `npm run shots` and look at every screenshot in `build/shots/`: phone, landscape phone, tablet and desktop, at four times of day.
2. Play a few minutes in a browser too, at least on a phone in portrait: slide, pinch and turn the map, buy an upgrade, watch a train arrive, buy a station.
3. Read the last two notes in `docs/ux/`, so a review builds on the last one instead of repeating it.

## 2. Judge

Go through these in order, and write down what you see before deciding what to change:

- **First minute.** Does a new player know what to do, and why it matters, without reading much?
- **The map.** Does what you bought show on it? Do trains, passengers and the time of day read at a glance? Is it colourful and alive, not bleak?
- **Panels.** Is anything crowded, repeated or hard to find? Does each panel lead with what matters most now?
- **Feedback.** Does every tap answer at once? Is anything flickering, jumping or refreshing under the finger?
- **Reach.** Can thumbs reach the controls? Is every target at least 44 px on touch? On a phone, is everything tapped often in the bottom half, and does a card's preview land on map you can still see?
- **Text.** Concise, UK English, no jargon; real station and place names.
- **Access.** Contrast (4.5:1 for text, 3:1 for borders and controls, measured from the tokens), no type under 12 px, reduced motion, keyboard.
- **Consistency.** Do cards, chips, buttons and spacing behave the same way everywhere?

Respect the owner's preferences in the project notes.

## Known findings

From the redesign's directions (12 October 2026, `docs/design/redesign.md`); stage 2 of the redesign (the platform sheet, 13 October 2026, `docs/DESIGN.md`, The interface) fixed them, and the `contrast` and `layout` check groups hold the fixes:

- On a phone the panels sit below the map: buying scrolls the map away, and a card's ghost appears off screen.
- The title and ticker take about 180 px of a 390 phone; the map's views sit top right, the hardest reach; the light slider holds the bottom left, the easiest.
- Save, Load and Start over live at the foot of the page under a paragraph of rules.
- Locked text is 3.6:1 and borders 1.4:1 against their surfaces; captions are 10 px.
- The station panel leads with seven stats (Homes first) before any card.

From the buying design (13 October 2026, `docs/design/buying.md`), for phase 5 step 13 to fix:

- The strip of station chips is one line long: it can't show bus stops, routes or two lines out, and the Station | Line switch splits one network into two panels.
- The line panel mixes the trains, the timetable, the spare unit and the contract.
- A train can't be tapped, though it's the thing a player watches most.
- The edge marker only knows the next station up the line.
- A halt's card opens with eight stages at once; the opening reads better with one a ladder.

## 3. Change

- Pick one to three improvements a player would feel most for the least risk, each a small PR with before and after screenshots described.
- Anything bigger goes in `docs/ROADMAP.md` as a proposal for the owner.
- Never change the economy in a UI review: the bot's `PLAY` stays identical.

## 4. Note

Add `docs/ux/<yyyy-mm-dd>.md`, five to fifteen lines: what you looked at, what worked, what you changed (PR numbers), what you proposed, what to look at next time.
