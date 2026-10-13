---
name: balance
description: Measure and tune The Commute's pacing and economy with the bot on seeds 1-3, before and after a change, against tools/baseline.json. Use for any change to fares, catchments, demand, prices, speeds, dwell times or the clock.
---

# Balance

## What the bot is

- `tools/bot.mjs` plays the game headless in Node through the same `Sim` the page uses, making the choices a sensible player would (its priority order is the comment above `act` in that file): `npm run bot -- --hours 8 --seed 1 --seed 2 --seed 3` (`--json build/bot.json` keeps the runs).
- It prints, per seed: `SEED`, `REACHED {milestone: sim hour}` (at 1×, a sim hour is 20 real minutes; at 3×, 6.7), `MEASURES` (with game days played, and earned and lost a game day, to compare across clock changes), `PLAY` (a fingerprint of the saved state that affects play); then one table of every seed and their mean against `tools/baseline.json`. It exits 1 only on an error.
- The same seed and code always give the same run. Any change to the code can shift the dice, so judge a change on several seeds, before and after.
- The `bot` check group proves it plays 8 sim hours (about three and a half game days: the clock runs 6 to 60 times faster than the sim's seconds, `src/sim/day.ts`) without an error and repeats from its seed.

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

`tools/baseline.json` holds the ranges: `ranges` for the 8-hour run, and `long` for the late game (`--hours 16`: when the bot reaches the Buxton line's stations, and the longest quiet stretches). They are **proposed**, not yet agreed: its note says when and why each was set, and the owner agrees ranges when the pacing is settled. Hours are sim hours.

| Milestone or measure | Range | Seeds 1, 2, 3 (12 October 2026, shorter days and quick nights: 8 sim hours are 3.42 game days) |
| --- | --- | --- |
| Game days | 3.3–3.6 | 3.42, 3.42, 3.42 (the clock's days in the run; earned and lost a game day are printed beside it) |
| Second unit | hour 0.25–0.6 | 0.4, 0.4, 0.4 |
| Heaton Chapel bought | hour 0.5–1.0 | 0.63, 0.63, 0.63 (13 real minutes at 1×) |
| Levenshulme bought | hour 1.6–2.8 | 1.93, 1.93, 1.92 (39 real minutes at 1×, 13 at 3×) |
| Ardwick bought | hour 2.6–4.2 | 3.15, 3.45, 3.17 |
| Piccadilly bought | hour 4.5–8 | 5.82, 5.92, 5.85 |
| Cash at 8 h | £20,000–120,000 | £71,857, £44,741, £51,608 |
| Boarded | 10,000–17,000 | 13,784, 13,398, 13,649 |
| Lost | 400–900 | 550, 581, 683 |
| By cab | 80–200 | 154, 144, 120 (taken by a taxi rank instead of lost) |
| Lost beyond home % | 15–100 | 64, 53, 65 (more stations owned) |
| Longest quiet | 0.5–1.6 h (the night, short now) | 0.7, 1.2, 0.8 |
| Longest daytime quiet | 0.3–1.2 h | 0.67, 1.18, 0.77 |
| Main-line departures within 5 min | 90–100% | 97, 99, 99 |
| Worst late | 0–12 min | 9.4, 8.2, 7.4 (held behind a failed train or crawling past a signal failure) |
| Failures, signal failures | 0–4, 0–3 | 1 and 1, 3 and 1, 3 and 1 |
| Lost after the last train | 0–40 | 11, 8, 10 (who came after 23:30, when the last train has gone; real last and first trains, 12 October 2026) |
| Lost in trouble | 0–550 | 113, 194, 498 (gave up while something was wrong or in the quarter hour after) |
| Homes grown | 180–340 | 262, 259, 264 (homes over the census catchments) |
| Wet hours | 0–2.5 | 1.47, 1.19, 0.76 (sim hours of rain or snow; the first game day stays dry; `--fair` plays the same weather unfelt, to measure what it costs) |
| Express £, through | 5,500–10,500; 1,600–2,900 | 8,052, 8,276, 7,904; 2,226, 2,298, 2,172 (the expresses on the clock, 12 October 2026; the bot also prints express £ and calls a game day) |
| By car, by bus link | 300–650; 100–260 | 490, 478, 489; 176, 178, 180 |

Contract renewal (`--runs 2`): each run but the last renews as soon as it owns Piccadilly, banks its reputation and buys perks in the bot's order (`PERKS` in `tools/bot.mjs`), then the same seed is played again with them. It prints each run's milestones, the reputation banked and the perks bought, and checks three proposed ranges (the `contract` entry in `tools/baseline.json`): reputation banked 45–85 (62, 62, 64), the second run's Piccadilly at 3.6–5 h (4.08, 4.07, 4.82) and 15–35% sooner than the first (26%). A change to the economy moves these too; with no perks a run plays exactly as a single run does.

To compare a change to the clock like for like, run the bot for the same game days before and after (`--hours` takes a fraction: two game days are 4.45 sim hours) and compare earned and lost a game day.

The bot also prints PEAKS: at each morning (06:00–10:00) and evening (16:00–19:30) peak, who gave up at each station, how many took a cab, and how late main-line trains left their stops, with a table of the seeds' mean. Read it for where pressure lands, not just how much.
