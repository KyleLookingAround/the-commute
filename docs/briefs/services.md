# Brief: services, the real railway on today's map

## Goal and what it may touch

Phase 5 step 4 of `docs/ROADMAP.md`, inside today's map: depth before breadth (the owner, 14 October 2026). Under the real railway by default (`docs/decisions/ADR-2026-10-14-budgets-and-the-real-railway.md`), the trains on the lines the player can buy run as the real ones do. Running them is something more for the player to buy.

1. **Real frequencies and calling patterns,** from Northern's timetable as far as known, with a `note` where something is a game choice:
   - the stopper
   - the Hazel Grove and Buxton trains
   - the Marple and Rose Hill trains

   Today each branch has one unit, calling everywhere. Each service's frequency becomes **something to buy** on its card: a second unit, then the real off-peak and peak patterns. Every bought unit shows on the map.
2. **The Marple trains get their own pair into Piccadilly's platforms 1 to 4,** as the real Hope Valley lines do. They no longer join the slow lines at Ardwick Junction (the Marple line's Handed on). Re-lay that approach from OpenStreetMap, keeping the layout rule.
3. **The Hazel Grove and Buxton trains through to Manchester** as an upgrade, where they turn short today.
4. **The expresses as real services:** Avanti, CrossCountry and TransPennine, through Stockport to Piccadilly only, on today's map.
   - They pay an access charge to use the player's stations and take platforms there.
   - Platform capacity becomes something to buy for.
   - They don't run up the Crewe line, which is paused.
5. **The economy:** the bot on seeds 1–3 at 8 and 16 h, before and after, with the table in each commit. Frequencies move pacing on purpose. Re-propose the baselines in the commit, with a note saying why.

**Land it in parts,** each leaving `main` playable: the Marple pair, then frequencies, then the through trains, then the expresses.

**Files:**
- `src/data/network.json` (services and the Ardwick approach), Piccadilly's kit and the sim's services
- `src/ui/` for the service cards, and `src/render/` for units and tracks
- `tools/bot.mjs` and `tools/baseline.json`, `test/`, and the checks the change touches
- `docs/DESIGN.md`

## Running alongside

- **Gridlock G1** owns `src/sim/traffic.ts`, `src/data/traffic.json`, `test/traffic.test.ts`, the bot's traffic block and two `TUNING` keys. Keep those lines when you rebase.
- **Budgets** owns `tools/checks/perf.mjs`, `terrain.mjs` and `world.mjs`, `tools/check.mjs`, `.github/workflows/deploy.yml` and the stats view.
- Run `git pull --rebase origin main` before every push.

## Read first

- The project notes (`CLAUDE.md`)
- the decision record above
- `docs/design/buying.md`
- `docs/briefs/marple-line.md` and `docs/briefs/piccadilly-throat.md`, with their Handed on sections
- `docs/DESIGN.md` (trains, the network, the economy)
- `.claude/skills/balance/SKILL.md`

## What it must keep

- The sim pure and seeded.
- Everything bought shows on the map.
- The player buys every upgrade: no managers.
- Phones from 320 px. UK English. Every perf budget.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com>. No attribution lines.

## Who merges and when

Push each part straight to `main` once its checks pass, confirm the Publish run, and send the coordinator a few lines.

## When to stop and ask

The owner has said not to wait. Realism calls follow the real railway. Economy calls take the option that changes the game less. Say so in the commit.

## Cost budget

About $35. At about 450k of context, stop at the end of a part and add a "## Handed on" section here.
