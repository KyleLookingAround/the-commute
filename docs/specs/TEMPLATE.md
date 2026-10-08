# <Feature name>

Issue: #<number> · Status: Proposed | Approved | Built · PRs: #<number>, … (added as they open)

Copy this file to `docs/specs/<short-name>.md`. Keep it to a page. The owner approves it before building starts.

## What the player gets

The goal or problem in two or three sentences, from the player's side.

## What they see

- On the map (impacts show there, not as text events): which kit parts, trains or scenery change.
- In the panels: which panel, what's new there.
- On a 320 px phone, a landscape phone, a tablet and a large screen.

## How it works

- The rules, with the numbers that matter (`TUNING` in `src/sim/sim.js`), and the clock they run on.
- When it unlocks: a station, an upgrade, or from the start.
- Managers and recommendations: what they do for players who'd rather not handle it.

## Saved state

- New fields in the saved state and their defaults; `SAVE_VERSION` raised if the shape changed.

## Balance

- Expected effect on the bot's milestones (`tools/baseline.json`).
- If pacing should change, by how much, and whether the owner has agreed.

## Checks

- Sim tests for the rules (`test/`), and any browser check group the page needs (`tools/checks/`).
- What to look at in the screenshots.

## Files

Which files under `src/sim/`, `src/data/`, `src/app/`, `src/render/` and `src/ui/` change, and whether it needs a new file.

## Left out

What this deliberately doesn't do, so it doesn't creep.
