---
name: balance
description: Measure and tune The Commute's pacing and economy with the bot on seeds 1-3, before and after a change, against tools/baseline.json. Use for any change to fares, catchments, demand, prices, speeds, dwell times or the clock.
---

# Balance

## What the bot is

- `tools/bot.mjs` plays the game headless in Node through the same `Sim` the page uses, making the choices a sensible player would (its priority order is the comment above `act` in that file): `npm run bot -- --hours 8 --seed 1 --seed 2 --seed 3` (`--json build/bot.json` keeps the runs).
- It prints, per seed: `SEED`, `REACHED {milestone: game hour}`, `MEASURES`, `PLAY` (a fingerprint of the saved state that affects play); then one table of every seed and their mean against `tools/baseline.json`. It exits 1 only on an error.
- The same seed and code always give the same run. Any change to the code can shift the dice, so judge a change on several seeds, before and after.
- The `bot` check group proves it plays 8 sim hours (two game days: the clock runs six times faster than the sim's seconds) without an error and repeats from its seed.

## 1. Before

On the branch's starting point (`main`, in a `git worktree` so the build doesn't disturb yours), run seeds 1, 2 and 3 into `build/before.log`. A run takes under a second.

## 2. Change, then after

Make the change and run the same three seeds into `build/after.log`.

## 3. Compare

- Put before and after side by side per milestone: each seed, and the mean.
- Against `tools/baseline.json`: `ok` is inside the range, `near` within 15% of it, `off` beyond. Aim for `ok`; `near` needs a reason; `off` needs the owner's agreement.
- A change meant to leave the game as it is (a refactor, a renderer change) must leave `PLAY` identical on seeds 1–3 against a build of `main`.
- The number that matters for boredom is the longest quiet stretch (hours with nothing to buy). Night is quiet by design; a quiet stretch in daytime is a design gap to report, not a win.
- Report the table in the PR description.

## 4. When the owner wants the pacing to change

- Agree the target in the issue first ("Heaton Chapel in about ten real minutes").
- Update `tools/baseline.json` and its note in the same PR as the change.

## Tips

- The Balance workflow runs the seeds on a PR when it opens or leaves draft, and again when the `balance` label is added (remove and re-add it to run again).
- `fareMult` in `TUNING` is the single pacing knob; change station prices or catchments only for a reason the station's reality gives.
- Before tuning a constant, run one seed and check that `PLAY` moves: a constant can be dead.
- A wall the bot hits can be its own policy, not the game's: read what it bought before calling a stall a pacing problem.

## Baselines

`tools/baseline.json` holds the ranges. They are **proposed**, not yet agreed: its note says when and why each was set, and the owner agrees ranges when the pacing is settled. Hours are sim hours.

| Milestone or measure | Range | Seeds 1, 2, 3 (12 October 2026, trouble kept out of the peaks' busiest hours) |
| --- | --- | --- |
| Second unit | hour 0.25–0.6 | 0.4, 0.4, 0.4 |
| Heaton Chapel bought | hour 0.5–1.0 | 0.75, 0.75, 0.75 |
| Levenshulme bought | hour 1.6–2.8 | 2.33, 2.37, 2.33 |
| Ardwick bought | hour 4.5–6.5 | 4.93, 5.18, 4.93 |
| Piccadilly bought | hour 8–20 | not in 8 h |
| Cash at 8 h | £25,000–55,000 | £51,006, £43,877, £51,010 |
| Boarded | 3,500–5,200 | 4,808, 4,820, 4,823 |
| Lost | 120–300 | 148, 156, 147 |
| By cab | 15–60 | 45, 35, 31 (taken by a taxi rank instead of lost) |
| Lost beyond home % | 15–100 | 29, 26, 33 (Heaton Chapel and Levenshulme; trouble's losses are mostly Stockport's) |
| Longest quiet | 1.6–2.7 h (the night) | 2.0, 1.8, 2.0 |
| Longest daytime quiet | 0.3–1.0 h | 0.52, 0.67, 0.52 |
| Main-line departures within 5 min | 90–100% | 100, 100, 100 |
| Worst late | 0–8 min | 2.2, 2.0, 0.8 (held behind a failed train or crawling past a signal failure) |
| Failures, signal failures | 0–3 each | 0 and 1, 1 and 1, 0 and 1 |
| Lost in trouble | 0–150 | 1, 42, 33 (gave up while something was wrong or in the quarter hour after; nothing starts in a peak's busiest hour) |

The bot also prints PEAKS: at each morning (06:00–10:00) and evening (16:00–19:30) peak, who gave up at each station, how many took a cab, and how late main-line trains left their stops, with a table of the seeds' mean. Read it for where pressure lands, not just how much.
