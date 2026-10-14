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
4. **Edit the roadmap.**
   - Add the strongest ideas where they belong, marked "(proposed, ideas review 14 October 2026)".
   - Reorder or rewrite existing items where the review shows a better shape, and say why in the commit.
   - Don't remove anything the owner asked for. Where you'd change an owner's item, propose it in the review instead.
   - The owner decides what moves up, so the coordinator passes the top five to them.

**Files:**
- `docs/ideas/` (new)
- `docs/ROADMAP.md`
- new design notes under `docs/design/` for an idea big enough to need one, with no mockups unless asked

Other sessions add lines to the roadmap as they land work. Edit around them, and run `git pull --rebase origin main` before every push.

## Running alongside

The services, budgets, gridlock G1 and station-surroundings sessions are building. Read their briefs in `docs/briefs/` so you don't propose what's already underway. Don't touch code or data.

## What it must keep

- The owner's preferences in the project notes.
- UK English.
- Concise, plain writing.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

Push straight to `main`: the review first, then the roadmap edits. Send the coordinator the top five ideas in a few plain lines each, with any owner calls they need.

## Afterwards

Stay available. The coordinator may send you new questions from the owner, or ask for another pass after big changes land. Each pass is a new dated file in `docs/ideas/`.

## Cost budget

About $15 a pass. At about 450k of context, add a "## Handed on" section here.
