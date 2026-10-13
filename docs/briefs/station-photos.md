# Brief: a reference photo library of every station

## Goal and what it may touch

- **The owner (13 October 2026):** "go find photos of all the stations at different angles for future reference."
- Build a library in `docs/reference/photos/` that every later session (kits, the audit, the lines out) can look at instead of searching again: one folder per station, named by the station's id in `src/data/network.json` (or the obvious id for a station not in the game yet, such as `new-mills-newtown`).
- **Two sessions share the work:**
  - **A:** today's line (Stockport, Heaton Chapel, Levenshulme, Ardwick, Manchester Piccadilly, Davenport, Woodsmoor, Hazel Grove), then the Buxton line beyond Hazel Grove (Middlewood, Disley, New Mills Newtown, Furness Vale, Whaley Bridge, Chapel-en-le-Frith, Dove Holes, Buxton).
  - **B:** the other lines of phase 5. The Marple line (Reddish North, Brinnington, Bredbury, Romiley, Marple, Rose Hill). The Crewe line (Cheadle Hulme, Handforth, Wilmslow) and its Macclesfield leg (Bramhall, Poynton). The Styal line (Mauldeth Road, Burnage, East Didsbury, Gatley, Heald Green, Manchester Airport). Reddish South and Denton.
  - Your first message says which you are. Work in that order, and stop at budget, saying where you stopped.
- **For each station, up to eight photographs**, covering as many of these angles as exist:
  - each platform, looking both ways along the line
  - the way across (footbridge, subway, road bridge or level crossing), and the steps, ramps and lifts
  - the entrance and booking office from the street
  - the forecourt, car park, taxi rank and bus stops round it
  - the station from an overbridge or the approach, showing the track layout and the platform ends
  - an aerial view where one exists
- **The outside areas too** (the owner, 13 October 2026: "and the outside areas including the new interchange and roads and buildings"):
  - **Round each station, up to six more photographs:** the streets and road bridges beside it, the buildings that face it, the bus stops and car parks, and what a passenger sees walking up to it. Add these to the station's folder, named `area-<what>-<n>.jpg`, in their own section of its `index.md`.
  - **The bigger places get folders of their own** under `docs/reference/photos/areas/`, each with an `index.md` like a station's and up to ten photographs. Session A takes:
    - `stockport-interchange`: the bus station that opened in March 2024, its roof park (Viaduct Park), its flats, the helix ramp and the link to the railway station, from every side
    - `stockport-town-centre`: Mersey Square, Merseyway, the Pyramid, the Plaza, St Mary's, the Market Hall, Wellington Road (the A6) and the streets round the station, including Station Road, Grand Central and Stockport Exchange
    - `stockport-viaduct`: from the valley, from Mersey Square, from the M60 and from the deck, with the river and the M60 beneath it
    - `piccadilly-approach`: Station Approach, London Road, Fairfield Street, Gateway House and the multi-storey car park
    - the A6 through Levenshulme and Heaton Chapel where it passes the stations
  - Session B takes the town centres and interchanges its lines meet: Marple, Wilmslow, Manchester Airport's station and its transport interchange, and any bus stations beside its stations.
  - In each area's `index.md`, add a **"For the map"** list: how the place should look in the game, its main buildings, their heights, materials and colours, and the roads' widths and what's on them, so later sessions can draw it.
- Prefer recent photographs (from 2015 on), and an older one only where it shows something no newer one does.
- **Sources** (these answer from the sessions): geograph.org.uk (CC BY-SA 2.0) and Wikimedia Commons (check each file's licence; keep only freely licensed ones: CC BY, CC BY-SA, public domain). OpenStreetMap doesn't answer. Don't use photographs from sites without a free licence.
- **Files:** save each as a JPEG at most 800 px on its long edge, quality about 72 (aim for under 100 KB each), named `<angle>-<n>.jpg` (for example `platform-1-north-1.jpg`, `footbridge-1.jpg`, `entrance-1.jpg`, `carpark-1.jpg`, `overview-1.jpg`).
- **Each station's `index.md`:**
  - a table with one row per photo: the file, what it shows and from where (which platform, looking which way, what's in view), the date taken, the photographer, the licence, the source page's URL and the full-size image's URL
  - a short **"What the photos settle"** list for questions the game has left open, for example: Davenport's car park (which side), whether Heaton Chapel or Davenport have a car park at all, Levenshulme's arched recesses, Piccadilly's real platform numbering and its bays' splay, hipped roofs, canopy lengths, where the taxi rank and bus stops are. The open questions are in the kits' `note`s and the "Later" notes of `docs/ROADMAP.md`.
  - **"Still unknown":** what no free photograph shows
- **`docs/reference/photos/README.md`:** what the library is, how to use it, the licences and credits, and a list of stations with how many photos each. Session A writes it; session B adds its lines to it, pulling first.
- Prototype phase: work on your session's branch and push straight to `main`. Before every push, run `git pull --rebase origin main`, since other sessions push too. Before a push, run `npm run rules` and `npm test` (they should be untouched). Commit a station or a few at a time, staging paths by name, so the work lands as you go.
- Files it may touch: `docs/reference/photos/` only, and the brief's line in `docs/ROADMAP.md`'s Throughout section if you need to say where the library is.

## Read first

- The project notes (`CLAUDE.md`), the kits' `note`s in `src/data/kits/` (they cite the geograph and Commons photographs already used, so start from those), and phase 5 of `docs/ROADMAP.md` for the stations to come.

## What it must keep

- Nothing in the game changes: no edits in `src/`.
- Only freely licensed photographs, each credited with photographer, licence and source. Keep the library to a few tens of MB in all: eight photographs a station and six of its surroundings at most, and ten an area.

## Commit author

KyleLookingAround <KyleMck10@hotmail.com> (the session-start hook sets it; check `git config user.email`). No attribution lines.

## Who merges and when

The session pushes each batch to `main` once the rules and tests pass (docs only, so no Publish run follows).

## What's left for others

- The kits and the lines out use the library. List any station you couldn't cover, or any angle that's missing everywhere, in your last commit message under "Handed on".

## When to stop and ask

- The owner has said not to wait on them. Where a licence is unclear, leave the photo out.

## Cost budget

- Estimate: about $15 a session (about 16 to 20 stations with their surroundings, and the bigger places' folders).
- Past twice the estimate: say why in the commit message and stop at the station you're on.
