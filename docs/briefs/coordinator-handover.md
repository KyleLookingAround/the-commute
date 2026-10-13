# Coordinator handover, 13 October 2026, 04:00

The coordinator session that ran phases 2 to 5 so far (session_01Ru3gEy52pDNFEkGoPz4AkG) hands over to a fresh one, so the new session picks up the owner's widened network access. Read this, the project notes (`CLAUDE.md`) and `.claude/skills/coordinator/SKILL.md`, then carry on.

## First

1. Delete the old coordinator's pending check-in so two coordinators don't act at once: `delete_trigger` on `trig_01PrnHaCbrrLN7kfa36h4sRp` (and any other "The Commute coordinator check-in" trigger `list_triggers` shows that isn't yours). Leave the old session alone; it stops once the owner confirms the handover.
2. Test the network: `curl -sS -o /dev/null -w "%{http_code}" https://overpass-api.de/api/status` and `https://download.geofabrik.de/`. OpenStreetMap's main API answered in the old container (`https://api.openstreetmap.org/api/0.6/map?bbox=W,S,E,N`, boxes a few hundred metres across), but Overpass and Geofabrik didn't. Tell the owner which answer now, and point briefs at whatever works.
3. Sweep the running sessions (below), book a check-in with `send_later` for about 45 minutes, and give the owner a short report.

## The role

- Write briefs in `docs/briefs/` (from `TEMPLATE.md`; the recent ones are the pattern), commit them first, then start each session with `create_session` (source_url `https://github.com/KyleLookingAround/the-commute`, a tag `the-commute:phase-N`, and a prompt that names the brief, the sessions running beside it and the rules below).
- **At each check-in** (about every 45 minutes, with `send_later`; write the next check-in's prompt so it stands alone):
  - each session's status and cost against its brief
  - its commits on main (authored KyleLookingAround <KyleMck10@hotmail.com>, no attribution, no mention of Claude, Anthropic, AI or an assistant)
  - the Publish runs: build, deploy, four check shards and the report job
  - "main is red" and needs-owner issues
  - archive what's finished and green, mark the roadmap, start the next item
- At most four item sessions at once. Start nothing new if `rate_limit_info` shows a warning. The coordinator writes no game code. Infrastructure and docs are fine (it fixed the Publish workflow's lock, sharded the checks and balanced the shards).
- Report to the owner briefly, in plain UK English, after each batch. Relay what matters from sessions' commit messages; they aren't shown to the owner. When something lands that the owner would want to see (screenshots, the audit's findings, photos), `git pull` and send it with `SendUserFile`.

## Standing rules and the owner's decisions

- **Prototype phase:** sessions push straight to `main` (pull with rebase first, stage paths by name). Before a push: `npm run rules`, `npm test` and only the check groups the change touches. The full suite takes an hour in a session's software-GL container, while the Publish workflow runs it in four shards in about 13 to 15 minutes. Main deploys first and checks after; a red check opens a "main is red" issue and a green one closes it; a cancelled job opens nothing, so read the jobs. If a shard passes 20 minutes, rebalance `MINUTES` in `tools/check.mjs` from the "-- group took" lines.
- **Don't wait on the owner:** where a call is theirs, take the option that changes the game less, and say so.
- **Owner preferences** (also in the project notes):
  - no managers or recommended buys
  - hide locked things, except fogged stations with their price
  - impacts shown on the map
  - phones from 320 px
  - saves on the device
  - UK English
  - colourful and alive
  - an incremental upgrade game
- **The owner's decisions:**
  - Stockport's Manchester stoppers use platforms 3 and 4.
  - Stations grow into their surroundings phase by phase, not all at once.
  - Game speeds tripled.
  - Shorter days with quick nights.
  - Redesign direction A (the platform sheet) is built.
- **New tonight:**
  - **Track spacing:** "make sure we have good enough distances between stations and sections so we don't end up with this spaghetti junction". The new rule is a test every line must pass.
  - **A visual audit at the end of every phase:** "take screenshots of everything fully upgraded and the areas around and make sure everything looks correct and if not add them to the next phase to fix". See `docs/briefs/visual-audit.md`; the coordinator playbook says when.
  - **A reference photo library** of every station and the areas round it: `docs/reference/photos/`.
  - **On the roadmap:** the A6 and the 192 (phase 5 step 8), the main roads (step 9), the inner ring road (phase 6) and the M60 all round (phase 8).

## Running now (13 October, about 04:00)

| Session | Id | Brief | State |
| --- | --- | --- | --- |
| Track spacing (in the graph session) | session_019FzUqSzuchggwjfyVtBbVh | `docs/briefs/track-spacing.md` | The graph itself is built (f4b4e19 to 56b201f, $15.80 of $40); then given track spacing at 03:04, about $15 more; told about the OSM API at 03:52. Two parts: a track layout test in `npm test`, and Stockport's north end re-laid from the real layout, then what else the test finds. When it lands, send the owner its before and after views from Stockport looking north over the viaduct, and archive it. |
| Phase 3 and 4 visual audit | session_011HtBxmUJkGH8Vh2JmK98BZ | `docs/briefs/visual-audit.md` | Builds `node tools/shots.mjs --audit`, looks at every image, writes `docs/audits/phase-3-4.md`, adds a phase 5 step listing the findings. Fixes nothing. When it lands, send the owner its contact sheet and worst findings, then brief "Fix what the phase 3 and 4 audit found", folding in the OSM checks of things from memory (the M60's course, the depots, Piccadilly's multi-storey, the kits' from-memory parts). |
| Station photos A | session_01Cc2eZro44QxLLdY8fEgtvt | `docs/briefs/station-photos.md` | Today's eight stations, then Stockport Interchange, the town centre, the viaduct, Piccadilly's approach and the A6 along its whole course (`areas/`), then the Buxton line. About $15. Docs only. |
| Station photos B | session_015dhoDLwQULvH7v6cxCPxwu | `docs/briefs/station-photos.md` | The Marple, Crewe and Macclesfield, Styal and Reddish South lines, with Marple, Wilmslow and the Airport's areas. About $15. Docs only. |

## The queue, in order

1. **The Buxton line** (`docs/briefs/buxton-line.md`, $30): starts once track spacing has landed and is green. It uses the OSM API and the photo library, and builds to the spacing rule.
2. **The lines out**, one session each, side by side once the Buxton line is under way: Marple; Crewe with Macclesfield; Styal; Reddish South. Write their briefs from the Buxton line's. Mind the graph's decision record: a line beside the spine needs its own ground, and a route that turns back at a junction (Reddish South at Heaton Norris) needs a leg direction.
3. **Fix what the phase 3 and 4 audit found:** when a slot is free, kept out of the line sessions' files.
4. **The A6 and the 192**, then **the main roads round the lines** (phase 5 steps 8 and 9): once the lines out are under way.
5. **Phase 5's later steps:** services (real calling patterns, through trains, TransPennine), the fleet, timetabling, Stockport as the hub. Then phase 5's visual audit and its release.

## Waiting on the owner (the safer option taken meanwhile)

- **The first shareable release:** only they can call it. It switches on the full loop: PRs, specs, save compatibility.
- **Contract renewal's pacing:** renewing often makes the opening very quick, 39% sooner to Piccadilly by the fourth contract.
- **Grown homes on renewal:** they reset now.
- **Quiet nights:** units stand only briefly. Stations visibly empty overnight would need a slower night.
- **Redesign direction:** A is built; B or C is still possible.

## Where things are

- Recent briefs: `docs/briefs/`. The roadmap's phases 3 to 5 carry each item's state and its "Later" notes.
- Decisions: `docs/decisions/` (the graph's record is the latest).
- The check workflow: `.github/workflows/deploy.yml` (job-level locks, four shards, a report job).
