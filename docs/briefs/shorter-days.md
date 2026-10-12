# Brief: shorter days, quick nights

## Goal and what it may touch

- **The owner (12 October 2026):** "the whole day/night cycle is quite long and the night cycle seems pointless to wait around for." Today the game clock runs at one rate (`TUNING.dayRate`, 6 clock hours a sim hour), so a game day is 80 real minutes at 1× (27 at 3×, 8 at 10×). The night is a fifth of it with no one travelling: the demand curve is zero from 00:00 to 04:00 and fades either side.
- **Make the clock's rate change through the day.** Today's rate holds through the peaks (06:30 to 09:30 and 16:00 to 19:00, where the trains and the crowds play off each other). The hours between run about twice as fast. The night (23:00 to 05:00) passes in about two real minutes at 1×. That makes a day about 40 to 45 real minutes at 1× (about 14 at 3×, 4 at 10×). Dusk, the lamp-lit platforms, the engineering train and dawn still show, just quickly. Ease the rate between bands so the sky and the clock never jump.
  - **One clock in the sim.** Add a new `src/sim/day.ts` that maps sim seconds to the game's day and time of day, and back, so it can say when a given hour comes. Everything that reads the hour or counts days uses it in place of `t * dayRate`:
    - the sim's `hour()`, `clock()` and day count
    - the weather's hour and year (`src/sim/weather.ts` keeps its own copy of `dayRate`, so retire that)
    - trouble, the boards, the passengers, the trains, the sky and the weather view
    - `window.__day`, the bot, the tests and the checks
  - **Each clock hour carries the trips it does now.** Then a game day earns about what it does today and passes in about half the real time, which is the point. Trains still move in sim seconds, so in the fast hours fewer trains run per clock hour and each carries more. That's fine off-peak, where trains run mostly empty today; check it doesn't strand people. Anything a game day paces (homes that grow, the seasons every two game days, trouble's "by day") stays per game day.
  - **On the clock.** The top bar's clock shows when it's running fast (a small fast-forward mark by the time at night, or something as light), so the player knows why time leapt.
  - **Fold in if it's simple:** the real last and first trains (life handed this on). Services stop after about 23:30 and start about 05:30, so the stations stand empty through the quick night. If it isn't simple, hand it on.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test`, and `npm run check` since this touches the page. Run `git status` and stage paths by name before each commit.
- Files it may touch:
  - sim and app: a new `src/sim/day.ts`, `src/sim/sim.ts` (the clock and `TUNING`), `src/sim/weather.ts`, `src/sim/trouble.ts`, `src/sim/types.ts` and `src/sim/save.ts` (raise `SAVE_VERSION` only if the save's shape changes), `src/app/clock.ts` (its comment, and `MAX_AWAY`'s meaning)
  - view: every render or UI file that reads the hour (`life.ts`, `passengers.ts`, `trains.ts`, `weather.ts`, `sky.ts`, `src/ui/panel.ts`'s clock), `src/main.ts`
  - tests, bot and checks: `test/`, `tools/bot.mjs`, `tools/baseline.json`, `tools/checks/` (whatever sets a day or an hour)
  - docs: the project notes' Time line, `docs/DESIGN.md`, and `.claude/skills/balance/SKILL.md` if what the bot reports changes

## Read first

- The project notes (`CLAUDE.md`, the Time line under "Rules every change keeps"), `docs/DESIGN.md` (time, pacing, the demand curve, weather and seasons, the night), `.claude/skills/balance/SKILL.md`.
- `demandCurve`, `hour()`, `clock()` and the day count in `src/sim/sim.ts`; `src/app/clock.ts`; commit c93dc42 (the tripled speeds) for everything that moved last time the clock changed.

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second.
- **The economy changes on purpose.** Run the bot on seeds 1-3 for 8 sim hours, before and after, with the table in the commit message. Include game days played, and real minutes to Heaton Chapel and Levenshulme at 1× and 3×. Milestones come sooner in sim hours because the dead hours are gone. Don't re-price to undo that, since waiting less is what the owner asked for. Re-propose the baselines with a note saying why. Cash per game day and lost per game day should stay near today's; say if they don't.
- The day still visibly turns (the owner's preference), with nothing jumping. Phones, tablets and desktop. UK English.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and the bot's table is in the commit message. Then it confirms the "Publish to GitHub Pages" run for its commit is green, check job included (it now has 30 minutes), or fixes it in the next push.

## What's left for others

- Car parks and bus links (running) is in `src/sim/sim.ts`, the network data and `life.ts`, and its car parks fill by the hour. Moving around the map (running) is in the camera and the strip. Keep edits to shared files focused and pull often. If another session raised `SAVE_VERSION` meanwhile, take the higher number plus one when you rebase.
- List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them. The numbers above are the coordinator's reading of their words. Where the bot shows a better split (say the night needs three minutes so dawn doesn't flash), take it and say why in the commit message.

## Cost budget

- Estimate: about $15 (one clock function threaded through the sim and the view, the bot's re-baseline, and the checks that set a time).
- Past twice the estimate: say why in the commit message and trim what's left.
