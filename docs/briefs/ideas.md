# Brief: ideas for the game

## Goal and what it may touch

The owner, 14 October 2026: a session that comes up with ideas to improve the game and can edit the roadmap. That covers new features, improving current features, improving the game's design, and reworking systems.

This session thinks and writes. It doesn't build.

1. **Play it and read it.**
   - Play the live game: `npm run build`, `npm run dev`, screenshots with `npm run shots` and `tools/shots.mjs`. Play from the opening through the first hours at 10×, on a phone size and a desktop.
   - Run the bot on seeds 1–3 to 8 and 16 sim hours and read where the time goes: quiet stretches, buys that nobody takes, the money curve.
   - Read `docs/DESIGN.md`, `docs/design/buying.md`, `docs/design/gridlock.md`, `docs/ROADMAP.md` and the decision records.
2. **Find what would make it better.** Work against the owner's direction:
   - **Depth before breadth:** more to do and upgrade on today's map before new areas.
   - **An incremental upgrade game:** always a next thing to buy.
   - **All public transport,** with the car as the rival.
   - **Impacts on the map, not in text.**
   - **No advisor or managers.**
   - **Colourful and alive.**
   - **Phones first.**

   Look at what good games in the genre do well and whether it would fit here: incremental and idle games' pacing and prestige; Mini Metro's clarity; NIMBY Rails, Transport Fever and A-Train's depth. Look too at the real network: Bee Network fares, Metrolink, and the real station upgrades planned round Stockport.
   Questions worth answering:
   - Where is the player waiting with nothing to do?
   - Which systems are flat?
   - Which buys don't show enough on the map?
   - What would make a session on a phone satisfying in five minutes?
   - What would make the late game deeper?
3. **Write it up** as `docs/ideas/2026-10-14-review.md`. Rank the ideas, most valuable first. For each:
   - what it is, in a few lines
   - why it makes the game better, and which preference it serves
   - its size (S, M or L)
   - what it changes or replaces
   - any risk to pacing, phones or the perf budgets
   - the owner's call it needs, if any

   Mark which ideas improve what exists and which are new.
4. **Edit the roadmap.** The owner, 14 October 2026: the ideas session adds to the roadmap without the owner's approval.
   - Put the strongest ideas straight into the roadmap where they belong, marked "(ideas review <date>)", in the order you'd build them. The coordinator briefs and builds from that order.
   - Reorder or rewrite existing items where the review shows a better shape, and say why in the commit.
   - The owner, 14 October 2026: you may also change the owner's own roadmap items and the owner's preferences in the project notes. When you do:
     - say what changed and why in the review and in the commit
     - mark the preference "(changed by the ideas review <date>; was: ...)" so the old wording stays visible
     - tell the coordinator, which tells the owner
   - The coordinator tells the owner the top five as news, not as a question.

**Files:**
- the owner's preferences in the project notes (`CLAUDE.md`)
- `docs/ideas/` (new)
- `docs/ROADMAP.md`
- new design notes under `docs/design/` for an idea big enough to need one, with no mockups unless asked

Other sessions add lines to the roadmap as they land work. Edit around them, and run `git pull --rebase origin main` before every push.

## Running alongside

The services, budgets, gridlock G1 and station-surroundings sessions are building. Read their briefs in `docs/briefs/` so you don't propose what's already underway. Don't touch code or data.

## What it must keep

- The owner's preferences in the project notes, unless a review changes them as above.
- UK English.
- Concise, plain writing.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

Push straight to `main`: the review first, then the roadmap edits. Send the coordinator the top five ideas in a few plain lines each, with any owner calls they need.

## Always running

The owner wants an ideas session running at all times.
- When a pass is done, start the next: look at what has landed since, and play the game again.
- Each pass is a new dated file in `docs/ideas/`, which says what changed since the last one.
- Between passes, answer the coordinator's questions.
- At about 450k of context, add a "## Handed on" section here and tell the coordinator, which starts the next ideas session.

## Cost budget

About $15 a pass. At about 450k of context, add a "## Handed on" section here.

## Handed on

Paused by the owner, 14 October 2026, after three passes:

| Pass | File | Main finding |
| --- | --- | --- |
| 1 | `docs/ideas/2026-10-14-review.md` | The first ten ideas. |
| 2 | `docs/ideas/2026-10-14-review-2.md` | The bot never bought the late game's fix. |
| 3 | `docs/ideas/2026-10-14-review-3.md` | The late game is calm once the trains are bought. |

**Where it stands.**
- **Roadmap.** Phase 5 steps 16 to 26 came from these reviews. Built: 16 (the network view), 17 (coming back to a changed map), 24 (the bot buys every buy) and 25 (cause chips).
- **Build order.** 26 (pressure that grows with success) first. Then 18 (stage tiers), 19's punctuality part, 20 after the gridlock's G4, 21 (feeders), 22 (the Bee Network) and the rest of 23.
- **Owner's items.** One changed: G5 is built after G4, recorded in step 15. No preferences changed.

**Since pass 3** only view and check work had landed when the owner paused: the gridlock's map (G3), the stops on real streets, and the budgets' ground cover. Pass 4 should look at G3 on a phone, and run the bot again once 26 or 18 lands.

**Tools that helped.** A few scratch scripts did the playing. They run the bot's `act` over a `Sim` to 0.3, 2, 6 and 14 sim hours and save `{ g }`. A page is then loaded with each save in `localStorage` (`the-commute-save-v1`) at 390 px and 1440 px, shooting the home view, Whole line (`#vLine`) and the Network card (`#cash`). Driving the page by clicking stalls under software drawing; loading saves doesn't.
