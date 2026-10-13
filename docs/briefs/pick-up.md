# Brief: pick up

On 13 October 2026, at about 07:45, the owner wound down the four sessions running in parallel (the Buxton line, the Marple line, the real surroundings and the phase 3 and 4 visual audit), because their pushes had started to conflict. One session now works through what they left, **one item at a time, in order**. The coordinator acts for the owner: take its messages as the owner's.

## Goal and what it may touch

- Work down **The list** below. Each item lands on `main` whole (prototype phase: straight to `main`, no PR), with its Publish run green on all four shards and the report job, before the next item starts.
- Each item names its brief or source. Its files are what that brief allows. Anything else is outside this brief.
- Before every push, run `git pull --rebase origin main`. Regenerate generated files (terrain tiles, `base.json`, world tiles) with their tools; never merge them by hand. Run `npm run rules`, `npm test` and the check groups the item touches. Stage paths by name.

## The list

1. **Main green after the Marple line.** Confirm Publish run 100 (bd28997, the Marple line's nine stations) is green. If the `life` group fails (the Marple line's Handed on: 10× tap timing out at 1280×800), or `perf` (the script before the first frame was 441 of 450 KB), fix that first.
2. **Places in the sim** (buying, rethought, part 13a): `docs/briefs/places-in-sim.md`, in full. This is the quiet window it needs, since no other session is changing `src/sim/`. Include every station and service now on `main`: the Buxton line's three and the Marple line's nine. Its tests should cover Middlewood once Hazel Grove is owned, and Ashburys once Ardwick is.
3. **The audit fix.** Once `docs/audits/phase-3-4.md` is on `main`, fix its findings, worst first, in kits, the view and the data only, out of `src/sim/`. Also fold in the checks listed under "When each lands" in `docs/briefs/coordinator-handover.md`: the from-memory items checked against the OSM API and `docs/reference/aerial/`; Piccadilly's throat; Stockport's Station Road side; Davenport's car park; Stockport's crossover ladder; the viaduct's stepped deck edges; and any bridges over the line from the real surroundings' Handed on. If the audit isn't on `main` when you reach this item, go to item 4 and come back.
4. **The whole-line view** (the Buxton line's Handed on): frame the whole line by its extent so the outer stations show, and draw far kits more simply or leave them out at that distance, so the camera check's flight is quick even under software rendering.
5. **Buying, rethought, parts 13b to 13e**, one at a time, in this order: one card; finding places; the folds; Strain. Follow `docs/design/buying.md`'s Build plan. Write each part's brief from `TEMPLATE.md` as `docs/briefs/buying-13<x>.md`, and commit it before starting the part.
6. **The line between stations** (step 11, `docs/briefs/line-between-stations.md`). Rebrief it to the buying design first: sections come with their stations, and their stages go on the place card. It also owns the Marple line's speeds (75 mph where the real line runs at 30 to 60).
7. **Real surroundings beyond today's line:** run the tool along the Buxton line beyond Hazel Grove and along the Marple and Rose Hill lines. Then do whatever else `docs/briefs/real-surroundings.md`'s Handed on lists (ground cover, homes on real gaps).

The rest of the coordinator handover's queue (the other lines out, the 192, buses as a network, the main roads, phase 5's later steps) comes after this. The coordinator will brief it.

Left as they are, because each is the owner's call and leaving them changes the game less: one unit on each branch (the Buxton, Marple and Rose Hill services), and the Marple trains joining the slow lines at Ardwick Junction until Piccadilly is re-laid.

## Read first

- The project notes (`CLAUDE.md`), `.claude/skills/feature/SKILL.md`, `docs/DESIGN.md`.
- The Handed on sections of `docs/briefs/buxton-line.md`, `docs/briefs/marple-line.md` and `docs/briefs/real-surroundings.md`.
- Each item's own brief, when you reach it.

## What it must keep

- The sim stays pure and seeded. The bot's `PLAY` on seeds 1–3 is identical to `main` for every item except one whose brief changes the economy, and none on this list does.
- Everything bought shows on the map. Locked stations stand fogged with their price; everything else locked is hidden.
- Phones from 320 px, landscape, tablet and desktop. UK English.
- The perf group's first-frame budget (450 KB) and the terrain and world budgets. Measure them before and after any item that adds to the map.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes each item to `main` once its rules, tests and check groups pass, then confirms that commit's Publish run is green, or fixes it in the next push. After each item, send the coordinator a few lines: what landed, its commit, the run, and what's next.

## What's left for others

Nothing runs alongside this session. If the coordinator starts another, it will say which files that session owns.

## When to stop and ask

- Only for something irreversible or outside this brief.
- Otherwise, if something truly needs the owner, ask the coordinator with the option you'll take by default, and carry on with that default.
- Where it's merely unclear, take the safer option (easier to undo, or changing the game less) and say so in the commit message.

## Cost budget

- Estimate: about $30 an item for items 2 and 5's parts, and $10 to $20 for the others.
- At about 500k of context, stop at the end of the current item. Add a "## Handed on" section here saying where the list stands, and tell the coordinator, which will start a fresh session on it.

## Handed on

13 October 2026, from the first pick-up session, stopping at about 450k of context as the cost budget says.

- **Item 1, done.** Main is green from 9059634 (run 38394838744, all four shards). What it took: camera flights take the frame's real time up to half a second a frame, and riding follows a unit's cars rather than its group, which stood at the origin (4141ff8, 03240af, 3d1c50b); the far tree clumps only from 8 m across, to keep the triangle budgets; the trouble group waits for its flashing lamps; the shards rebalanced on current minutes, with a 40-minute job limit (ff18792); the perf group counts the map with every square loaded, so CI and a local run agree (9059634: opening 447,040 of 450,000, busy save 541,428 of 550,000 on main). The coordinator decided against trimming further for headroom until a run comes in over budget.
- **Item 2, done** (d4f9dde, its Publish run to be confirmed by the next session if this one hasn't): places in the sim, as its commit message says. The busy save's perf count is 548,514 with it, as the save now opens its taxi ranks and car parks: little room under 550,000, so item 3 or 4 adding to the map must make room first.
- **Next: item 3**, the audit fix. `docs/audits/phase-3-4.md` is on `main` (ffc2918), with the coordinator's additions: the Middlewood bridge slab, and leave the roads (finding 1) and buildings across the stand-in roads to steps 8 and 9. The road bridges over the line are in `docs/briefs/real-surroundings/bridges.md`. Then items 4 to 7 as listed.
- **Working here:** a browser check group takes 5 to 20 minutes in this container (the camera group about 19); run the groups an item touches in the background, one at a time, and let the Publish run do the rest.
