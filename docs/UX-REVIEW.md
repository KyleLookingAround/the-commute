# The UI and UX review

A look at how the game looks and works, from a player's side, run when the owner asks. Each review picks a few improvements, ships them the usual way (branch, checks, screenshots, PR, green `check`, squash merge), and leaves a short note in `docs/ux/`.

## 1. Look

1. `npm run build`, then `npm run shots` and look at every screenshot in `build/shots/`: phone, landscape phone, tablet and desktop, at four times of day.
2. Play a few minutes in a browser too, at least on a phone in portrait: orbit the map, buy an upgrade, watch a train arrive, buy a station.
3. Read the last two notes in `docs/ux/`, so a review builds on the last one instead of repeating it.

## 2. Judge

Go through these in order, and write down what you see before deciding what to change:

- **First minute.** Does a new player know what to do, and why it matters, without reading much?
- **The map.** Does what you bought show on it? Do trains, passengers and the time of day read at a glance? Is it colourful and alive, not bleak?
- **Panels.** Is anything crowded, repeated or hard to find? Does each panel lead with what matters most now?
- **Feedback.** Does every tap answer at once? Is anything flickering, jumping or refreshing under the finger?
- **Reach.** Can thumbs reach the controls? Is every target at least 44 px on touch?
- **Text.** Concise, UK English, no jargon; real station and place names.
- **Access.** Contrast, reduced motion, keyboard.
- **Consistency.** Do cards, chips, buttons and spacing behave the same way everywhere?

Respect the owner's preferences in the project notes.

## 3. Change

- Pick one to three improvements a player would feel most for the least risk, each a small PR with before and after screenshots described.
- Anything bigger goes in `docs/ROADMAP.md` as a proposal for the owner.
- Never change the economy in a UI review: the bot's `PLAY` stays identical.

## 4. Note

Add `docs/ux/<yyyy-mm-dd>.md`, five to fifteen lines: what you looked at, what worked, what you changed (PR numbers), what you proposed, what to look at next time.
