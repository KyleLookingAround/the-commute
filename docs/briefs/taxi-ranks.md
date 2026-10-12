# Brief: taxi ranks

## Goal and what it may touch

- Phase 3 step 4 of `docs/ROADMAP.md`: a stage a station can buy, a taxi rank outside its entrance, where cabs queue and take some of the people who'd otherwise give up (turned away from a full platform, or out of patience waiting for a late or full train). The player earns a small cut of each cab fare; the people are counted as taken by cab, not lost.
  - **In the sim:** a new upgrade (`taxi`, priced as a cheap early stage, offered where a real rank or forecourt exists, named per station in the network data's `grow` like the other stages). When a group gives up at a station with a rank, a share takes a cab, limited by how many cabs the rank has free: each cab is away for a while (out and back) before it can take more, so a busy peak empties the rank and the rest still give up. Earns a cut per passenger; tally them per station (`StationState`) and in the bot.
  - **On the map:** the rank (a shelter, kerb markings, a sign) and its cabs: cabs waiting in a queue, people walking from the entrance to the front cab, the cab pulling away and another moving up, and an empty rank when they're all out. Instanced, cosmetic, read from the sim.
  - **Balance:** about 200 people give up over the bot's 8 hours now, nearly 40% at Heaton Chapel and Levenshulme in the second morning (commit c79ca29). Taxi ranks should catch a useful share without making lost meaningless: tune the cut and cab numbers so a rank pays for itself over a day or two at a busy station, and the bot buys them where they earn.
- Prototype phase: work on your session's branch and push straight to `main` (pull first; the tracks-and-stations audit session is editing the kits and `src/render/stations.ts` at the same time). Before a push, `npm run rules` and `npm test`; `npm run check` since this touches the page.
- Files it may touch: `src/sim/`, `src/data/network.json` (the stage's names), `test/`, `tools/bot.mjs`, `tools/baseline.json`, a new `src/render/taxis.ts` for the rank and cabs, `src/render/stations.ts` only to register a `taxi` part type (keep the change small), one `taxi` part appended to each kit that gets a rank (where the real station's rank or forecourt is, with a `note` if from memory), `src/render/palette.ts` and `src/ui/styles/tokens.css`, `src/main.ts` (wiring), `tools/checks/` and the docs below. Keep kit edits to that one appended part so they merge with the audit's.

## Read first

- The project notes (`CLAUDE.md`), `docs/DESIGN.md` (halts and stages, door-to-door demand, platforms that block), `.claude/skills/balance/SKILL.md`, phase 3 of `docs/ROADMAP.md`.
- Commit c79ca29 for where people give up (`Sim.onDepart`, the bot's PEAKS line, `StationState.lost`).

## What it must keep

- The sim stays pure and seeded; the bot still runs 8 sim hours in about a second.
- Economy change is agreed: bot on seeds 1-3, 8 sim hours, before and after, table in the commit message; the opening's milestones in range; lost re-proposed if it moves, with the note saying why.
- Everything bought shows on the map; locked stages stay hidden. Raise `SAVE_VERSION` if the save's shape changes. UK English, tokens for colours, no per-frame allocations.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes to `main` once the rules, tests and `npm run check` pass and the bot's table is in the commit message; then it confirms the "Publish to GitHub Pages" run for its commit is green, or fixes it in the next push.

## What's left for others

- Failures and replacement buses (phase 3 step 5) can reuse the cabs' road movement. List what you hand on in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them: where a choice is theirs, take the option that changes the game less, say so in the commit message, and carry on.

## Cost budget

- Estimate: about $15 (a stage in the sim with its balance, and a rank with moving cabs).
- Past twice the estimate: say why in the commit message and trim what's left.
