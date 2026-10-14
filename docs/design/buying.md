# Buying, rethought: a growing network

The design for phase 5 step 13 of `docs/ROADMAP.md`, from `docs/briefs/buying-design.md`, carrying out the owner's decision (`docs/decisions/ADR-2026-10-13-buying-a-growing-network.md`): **a growing network**, with **the network's problems shown on the map**. The mockups are at https://kylelookingaround.github.io/the-commute/design/buying/ (source `public/design/buying/`), at 320 and 390 px portrait, a landscape phone and a desktop, beside the game as it is. Nothing here is built yet; the build plan at the end says how, a session a step.

## Open questions for the owner

Each has the option the build takes if the owner doesn't answer, and why. Where it was only unclear, the design took the option that changes the game less and says so in its section.

1. **Where the trains you buy live until the fleet step.** *Take: on the train service's card.* The stopper is a place like a bus route (a route on the map; tap a train to open it), and its card holds Extra unit, Longer trains and, until the line between stations replaces it, Faster timetable. The spare unit goes to a depot, Stockport's carriage sidings, where it already stands. Why: "trains an hour" is what a player sees and feels, and a bus route will have the same shape (more buses, bigger buses, a bus lane). The fleet step (step 5) later makes a service draw its units from a depot. The other way, a depot holding every unit now, adds a place to visit for the commonest buy in the game.
2. **Which locked stations stand in the fog.** *Take: every station, as today; the ones you can buy now carry a bright price, the rest a dim one.* The owner chose fogged stations as the one locked thing on show because seeing the line ahead is the point. With several lines out, that's a lot of prices, so only offered places get the accent price pill and a meter; the rest show their price small, and only near the camera. Every other kind of place shows only once it's offered.
3. **Prices.** *Take: each place's price is fixed in the network data, as stations' are today, with today's prices kept.* New places are drafted by a rule (Fog and price, below) and then set by hand like the rest. The other way, prices that rise with every place owned (the classic incremental curve), reads as Heaton Chapel getting dearer because you bought a bus stop, and moves today's pacing.
4. **The problems layer: always on, or on demand.** *Take: a map view, Strain, beside Line, Mins and Light, off at the start and remembered on the device.* The map's own life (crowds, the shrug and walk home, amber lamps on late trains) always shows pressure; Strain draws it all at once as soft warm glows. Always on would sit over the model railway all day, against "calm in daylight".
5. **Sections of line: bought, or come with the stations.** *Take: a section comes with the stations at its ends.* Buying Heaton Chapel opens the line to it; the section is then a place with stages of its own (line speed, resignalling, wires). The other way splits every next station into two buys and slows the opening.
6. **Contract renewal's home.** *Take: tapping the cash pill opens the Network card* (the whole network's figures, reputation and, once Piccadilly is owned, Renew the contract). The line panel it lives in today goes.

## The model in one paragraph

Everything the player can buy is a **place** on the map: a station, a section of line, a junction, a train service or bus route, a bus stop or bus station, a tram stop, a depot. Each starts small and grows through **stages**, as a station grows from a halt today. A place is **offered** when it touches something the player owns (and any real `needs` are met): it stands in the fog with its price until bought. Some places come with others (a section with the stations at its ends, a service with its stations) and are never bought, only grown. Every place opens the same **card**: what it carries and earns now, its stages built, and the stages offered with their prices and what each saves. The map shows where the network hurts (Strain), and tapping a problem opens the card of the place it's at, never a buy.

## 1. Places

Six kinds, each a kit or a drawn thing on the map, with stages written as they act in the sim. Stages are a `requires` graph within the place, as `UPGRADES` is today: a stage shows once what it needs is built, and the rest stay hidden.

### Station

- **First state:** a halt. One platform on one line, trains one way (`serves`), 82% of fares, the walk round for the far side. As today.
- **Stages:**

| Stage | Price (today's) | What it does in the sim | Needs |
| --- | --- | --- | --- |
| Way across (subway, footbridge, steps) | £2,000 | The far side walks across, not round: 5 min off their walk (8 round, 3 over the stairs) | — |
| Second platform | £3,500 | Trains call both ways (`serves`), so the evening crowd comes too; at Stockport, platform 3, where a second unit turns | Way across |
| Booking office (with its kiosk) | £4,500 (3,000 + 1,500) | 90% of fares collected, and £0.35 a boarding passenger | — |
| Ticket barriers | £4,000 | Every fare collected | Booking office |
| Shops (the station's own: Greggs, a bakery) | £9,000 | £0.80 a boarding passenger | Booking office |
| Canopy | £2,500 | Waiting feels a quarter shorter (1.5 not 2) | — |
| Lifts | £6,000 | Step-free: the far side's 3 min of stairs gone, 1 min off everyone's walk | Way across |
| Longer platforms | £5,000 | The platform holds 320 instead of 150 (and, after the fleet step, six-car trains) | Second platform (was none) |
| The rest of the station (Stockport's platforms 0, 1 and 2; Piccadilly's train shed and bays) | £30,000 / £60,000 | +20% homes; at Stockport the Hazel Grove trains' platform, which Davenport needs | Second platform, booking office |
| Taxi rank | £1,200 | Of those giving up, 60% take a cab while one's in; 1.5 times the train fare to you | — |
| Car park | £10,000–£35,000 | Drivers from beyond a walk park and ride while there's space: £20 a car | Booking office (was none) |
| Car park's second stage (upper deck, extension) | £18,000–£20,000 | More spaces | Car park |

Offered only where the station's `grow` lists them, as today. The card groups them under three heads, so a long list reads: **Platforms** (way across, second platform, longer platforms, the rest, lifts, canopy), **Takings** (booking office, barriers, shops) and **Getting here** (taxi rank, car park).

### Section of line

- **What it is:** the line between two neighbouring stations, or a station and a junction, on one corridor, as `docs/briefs/line-between-stations.md` defines it. Its ends are named ("Heaton Chapel – Levenshulme", "Stockport – Edgeley Junction").
- **First state:** the line as it runs today: the game's line speed (75 mph), today's signals, wired where the real line is.
- **Comes with:** the stations at both its ends: a section is the player's once they own the neighbouring stations it lies between (through a junction, the stations either side of it). Buying Heaton Chapel brings Stockport – Heaton Chapel; Davenport brings both Stockport – Edgeley Junction and Edgeley Junction – Davenport. The stopper running on through Levenshulme – Ardwick to Piccadilly doesn't make that section the player's: Ardwick does. Nothing to save for that: it's worked out from what's owned. (The line between stations' brief offered a section's stages once either end was owned; both ends keeps the opening's offers few.)
- **Stages** (built by step 11, the line between stations):

| Stage | Draft price | What it does |
| --- | --- | --- |
| Line speed (track renewal), in steps towards the real speed | £3,300 a mile a step (the faster timetable's £20,000 over Stockport – Piccadilly's 6 miles) | Trains run the section at its own speed: minutes off the ride for everyone through it |
| Resignalling | £5,000 a mile | Shorter blocks, so trains can run closer (more units fit); signal failures there six in ten times less often |
| Electrification (unwired lines only: the Buxton line beyond Hazel Grove, the Marple line) | £8,000 a mile | Harder acceleration on the section |

### Junction

- **First state:** a flat junction as the data draws it (Edgeley, Heaton Norris, Slade Lane, Ardwick).
- **Comes with:** any section through it.
- **Stage:** a flying junction, offered only once the sim counts trains held there (step 11 builds it), so it shows when it's real.

### Route: a train service, a bus route, a tram line

One kind for all three, because they behave alike: vehicles running a line of stops at a frequency.

- **Train service** (the Northern stopper; the Hazel Grove line). **Comes with** its stations: the stopper is the player's from the start (Stockport and Piccadilly are its fixed ends), the Hazel Grove line from Davenport. **Stages**, today's line upgrades moved here: Extra unit (£6,000, £20,000, £50,000; shorter waits; the first needs Stockport's platform 3, a real need across places), Longer trains (£12,000, £40,000; +2 cars a unit), Faster timetable (£20,000; until step 11 replaces it with each section's line speed and resignalling). Later: through running (step 4, Hazel Grove trains on to Manchester). Tap a train to open its service.
- **Bus route** (the 192 first, step 8). **First state:** a bus every 15 minutes, poles at its stops. **Bought** when one of its stops is within a walk of a station or stop the player owns. **Stages** (drafts for step 12): More buses (every 10 minutes, then every 6), Double-deckers (more seats), a bus lane on a named stretch (Wellington Road North), bus priority at a junction. Draft prices: the route £24,000; more buses £10,000 then £24,000; double-deckers £15,000; a bus lane £12,000.
- **Tram line** (phase 7): the same shape, with tram stops.

### Stop: a bus stop, a bus station, a tram stop

- **Bus stop** (Bus stop on Station View at Levenshulme, on the A6 at Hazel Grove). **First state** does what today's bus link stage does: the census's bus pool beyond a walk travels via this station (`access.bus`), a 6-minute wait for the bus. Price as today's stage (£6,000; £2,000). **Stages** (step 12): a shelter (the bus wait feels a quarter shorter, as a canopy), a second bay (more buses), a real-time board (the wait feels shorter again).
- **Bus station** (Stockport Interchange, £50,000 as today): its first state is today's Interchange stage (the change to the train 4 felt minutes quicker for those who come by bus); later stages add bays and routes from it.
- **Tram stop** (phase 7): a single platform that grows as a station does.

### Depot

- **Stockport's carriage sidings** (comes with Stockport; drawn today): the **Spare unit** (£8,000, offered once a train has failed) and the perk's unit stand here.
- **Later:** Longsight (trains, step 5), Stagecoach's Daw Bank and Hyde Road garages (buses, step 12), each bought when it touches what the player owns and growing by roads or bays: room for more units or buses, maintenance (fewer failures).

## 2. Touching

A place is **offered** when it isn't the player's, it touches a place that is, and any real `needs` are met. With nothing owned, the start's `offer` is offered (`docs/design/gridlock.md` §7): in the first game, Reopen Stockport. Touching, for every pair of kinds that can touch:

| | Station | Section | Junction | Route | Stop | Depot |
| --- | --- | --- | --- | --- | --- | --- |
| **Station** | the next station each way along each corridor, through junctions (Stockport touches Heaton Chapel and, across Edgeley Junction, Davenport) | a section touches the stations at its ends | — | a route touches every station it calls at | a stop touches a station within a walk (400 m on foot) | a depot touches the station its yard opens off |
| **Section** | | sections meeting at a station or junction | a section touches the junction at its end | a route touches the sections it runs over | — | a depot touches the section its yard joins |
| **Junction** | | | — | (through its sections) | — | — |
| **Route** | | | | — | a route touches every stop it calls at | a bus route touches the garage it runs from, a service the depot its units come from (step 5) |
| **Stop** | | | | | stops within a walk (a change on foot) | — |

What it means in play:

- **Stations along every line, outwards, in any order.** Owning Heaton Chapel offers Levenshulme; owning Stockport offers both Heaton Chapel and Davenport. No more "in order up the line": the lines out (Buxton, Marple) are fronts the player picks between.
- **Real needs stay.** Davenport waits on Stockport's platforms 0, 1 and 2, where the Hazel Grove trains turn round (`needs` in `src/data/network.json`). It stands in the fog with its price, and its card says what it waits on. The first extra unit waits on Stockport's platform 3, as `lineReady` does today.
- **Across modes through stops.** A bus stop is offered once the station it stands by is owned; a bus route once one of its stops is within a walk of anything owned; a tram stop by Piccadilly once Piccadilly is.
- **What comes with what** isn't offered; it appears with the place it comes with: sections and junctions with the stations at their ends, a train service with its stations, Stockport's sidings with Stockport.

## 3. Fog and price

- **On the map:** an offered place stands in the fog (a kit, a pole, a stretch of road for a route) with its name and a bright price pill, and the pill carries a meter of how near the cash is. Stations further out stand fogged as today with a dim price, shown only near the camera (open question 2). Nothing else locked shows: no fogged bus stop at a station you don't own, and no stage you can't build yet.
- **Prices are fixed per place in the data** (open question 3), and today's are kept: stations £9,000 (Heaton Chapel) to £200,000 (Hazel Grove), every stage as today but the booking office, which takes the kiosk's £1,500 with it.
- **Drafting a new place's price**, before it's set by hand and checked with the bot:
  - **Stations** go up in rings: a station a ring further from Stockport (counted in stations bought to reach it) costs about 1.5 to 3 times the ring before (today: £9,000, £30,000, £45,000, £150,000 for Piccadilly, which draws the city). Two lines at the same ring cost about the same, so neither front is the obvious one. A station that draws far more than its homes (Piccadilly) costs more.
  - **Other kinds** price against the station they touch: a bus stop or bus station about £100 a home in its bus pool (Levenshulme's 58 homes £6,000, Hazel Grove's 13 £2,000, Stockport Interchange's 580 £50,000), a bus route about a station of its ring, section stages by the mile as above.
  - **What it brings** sets the order within a ring: homes and draw within a walk, or the pool beyond it, per pound.
- **The incremental shape:** prices rise with the rings, and the next ring is always a little out of reach as you get the last. Every front has something cheap near home (a stage, a bus stop) and something dear further out (the next station).

## 4. Today's upgrades, mapped

| Today | Goes to | Why |
| --- | --- | --- |
| `crossing` (way across) | Station: way across | Kept |
| `platform2` | Station: second platform | Kept |
| `building` | Station: booking office, now with its kiosk (£4,500) | Kept; the kiosk folds in |
| `kiosk` (£0.35 a passenger) | Folded into the booking office | A small flat bonus: one card fewer at every station, and the bot buys them together today |
| `barriers` | Station: ticket barriers | Kept |
| `retail` | Station: shops | Kept: a real, named thing on the map |
| `canopy` | Station: canopy | Kept |
| `extend` | Station: longer platforms, now after the second platform | Kept; the fleet step ties it to longer trains |
| `lifts` | Station: lifts | Kept |
| `platforms` | Station: the rest of the station | Kept; Davenport's need |
| `taxi` | Station: taxi rank | Kept on the station: the rank is on its forecourt |
| `carpark` | Station: car park, now after the booking office | Kept on the station; waits on the office so a halt's first card is short |
| `carpark2` | Station: the car park's second stage | Kept |
| `bus` (bus link) | **A place:** Bus stop (Levenshulme, Hazel Grove) or Bus station (Stockport Interchange), its first state doing what the link does | It's a stop on the map, and it grows with buses as a network |
| Line: `units` | Route: the main-line stopper's Extra unit | Open question 1; the fleet step moves units to depots |
| Line: `cars` | Route: the stopper's Longer trains | With the units |
| Line: `timetable` | Route: the stopper's Faster timetable, until step 11 splits it into each section's line speed and resignalling | Keeps today's pacing until sections are built |
| Line: `spare` | Depot: Stockport's carriage sidings, Spare unit | It stands there already |

Nothing is dropped. The kiosk is the one stage folded, and two stages wait on a stage they didn't before (car park on the booking office, longer platforms on the second platform), which the bot never meets (it buys those far later), so its milestones hold.

## 5. The opening

Replaced by `docs/design/gridlock.md` §1 (built 14 October 2026, part G2): Stockport starts shut at 07:30 on day 1, in the morning peak, with £4,000, and the one thing offered is Reopen Stockport for £1,000. Reopening gives what this section used to describe, Stockport as a halt with £3,000, the stopper starting from platform 4 at once with the people who'd gathered aboard. From there the opening plays as before:

- **On Stockport's card:** four stages, one from each ladder: Subway £2,000, Booking hall £4,500, Canopy £2,500, Taxi rank on Station Road £1,200.
- **On the map, in the fog:** Heaton Chapel £9,000 up the line, Davenport £80,000 down the Hazel Grove line (waits on platforms 0, 1 and 2), and Stockport Interchange £50,000 by the station.
- **Pace** (the bot, seeds 1–3): Reopen and the subway at 0, the taxi rank at 0.18 sim hours, Platform 3 and the booking hall at 0.22 (0.17 before, when the first train's load paid for them), the second unit at 0.45 (0.4), Heaton Chapel at 0.58 (0.57 to 0.62), Piccadilly at about 5.6 (`tools/baseline.json`). The first fare comes a real second after Reopen (220 seconds in before).
- **Not swamped:** a halt offers one stage a ladder; the map offers what touches Stockport and no more.

## 6. The problems layer: Strain

A map view, **Strain**, a round labelled button with Line, Mins and Light on the right edge (open question 4). View only: it reads the sim's numbers, never changes them, and draws on the map as the reach glow does, in a warm ramp from amber (`--map-strain-1`) to coral (`--map-strain-2`), soft-edged and lit, so it reads in daylight without turning the map red. While it's on, the reach glow steps back, so the two never mix.

| Problem | The sim's number | On the map |
| --- | --- | --- |
| Crowded platform | waiting against the platform's cap (150, 320), each face | a glow on the platform, from 60% full to its strongest at full, with the figure (142 / 150) |
| People giving up | gave up at the station this clock hour (`lost`, by cab apart) | the walk home drawn out: a thin trail of figures from the station into its streets, more as more give up |
| Late trains | how late trains leave each stop (`late`), over the clock hour | the stretch of line behind each late departure tinted amber from 1 minute late, coral from 5 |
| Slow sections (step 11) | minutes trains lose on the section against its line speed | the section's ballast tinted |
| Junctions holding trains (step 11) | seconds held at the junction's signals this hour | a glow on the junction |
| Full car parks | spaces taken against spaces | the car park's outline lit once full |
| Full buses, traffic (steps 8, 9, 12) | people left at a stop; delay on a road stretch | a glow at the stop; the road ribbon tinted |

- **Calm:** soft glows that breathe slowly (none with reduced motion), no icons, arrows or badges, no ranking of worst to least. A figure shows only on a glow that's strong, only when the camera is near enough for it to sit by its place, and never more than the screen has room for (labels give way, as station names do).
- **Tap a glow:** the place's card opens at half height, with what's wrong at the top in plain figures ("Platform 1: 142 waiting of 150 at 07:50 · 23 gave up this hour") and then its stages as any card lists them. No stage is marked as the fix.
- **320 px:** glows have a least size on screen (40 px), so a stretch or a stop stays tappable, and the figures are 12 px mono on the glass pill.

## 7. One card for every place

Direction A of the redesign stays the frame (`docs/design/redesign.md`): the map full screen, the sheet over it, docked to the left in landscape and on wide screens.

**The card, for any place:**

1. **Head:** its name, its kind (Station · halt, Line, Train service, Bus stop, Bus route, Depot), and a thin stripe in its mode's colour (rail navy, bus yellow, tram later).
2. **Now:** four figures that matter for its kind, the rest behind More. Station: Waiting, Boarded, Revenue, Gave up. Section: Trains an hour, Speed, Late, Failures. Route: Trains (or buses) an hour, How full, Revenue, Late. Stop: Waiting, By bus, Gave up. Depot: Units, Spare.
3. **What's wrong now** (only if Strain sees something there, whether or not the view is on): one line of figures.
4. **Stages offered**, as today's cards: name, price, what it saves ("5 min less walk for about 500 homes", "1 min off the ride for 3,900 homes a day", "a train every 8 min, not 12"), what it opens next, and Buy, or a meter and how much to go. Grouped by the kind's ladders.
5. **Built:** chips.
6. **Next to:** chips for each touching place, owned (with its figure) or offered (fogged, with its price). A tap flies there and opens it. This is how a player walks the network across modes without the map.

**A place not yet owned** opens the same card: price and meter, what it brings (homes and draw within a walk, or the pool beyond it, "1.75 mi from Stockport"), what it waits on if anything, Next to, and Buy. Its ghost stands on the map while the card is picked, as stages' do.

**Finding places: the strip gives way to Places.** The peek's strip of station chips becomes the **Places** row: a chip for each place the player owns or is offered (name, its figure or a fogged price with the meter), in network order (each line out from Stockport, its stops after their station, routes after the stations they serve). Once there's a second mode, the row's first chip is a kind filter (All, Rail, Bus; a tap moves it on), so the peek keeps its height. Raised to full, the sheet lists the same places grouped by kind with their figures. The Station | Line switch goes: there's one card, and the line panel's contents move to the stopper's card (units, longer trains, faster timetable), the sidings' (spare unit) and the Network card (open question 6). **Edge markers** point to offered places off the open map, at most three, nearest first. Search waits for the city (phase 6), when places run into the hundreds.

## 8. The bot

`tools/bot.mjs` keeps its order of priorities and learns one rule for choosing among places:

- **Stages** as today: its list (way across, second platform, booking office, barriers; taxi ranks where a dozen have given up; car parks and bus stops before a morning with twice the price; the stopper's units, longer trains and faster timetable at its cash thresholds; the spare after a failure; extensions; canopies).
- **Places:** of the stations offered (counting what each waits on elsewhere), it saves for the one that brings most per pound, homes and draw over its price and the price of what it waits on, and buys it when it can, building what it waits on first. On today's network that is today's order exactly, in homes and draw per £1,000: Heaton Chapel 80 against Davenport's 4 (£80,000 and platforms 0, 1 and 2's £30,000), then Levenshulme 28, Ardwick 12, Piccadilly 46 once Ardwick offers it, and Davenport, Woodsmoor and Hazel Grove after. Bus stops count as today's bus links; sections (step 11) rate by felt minutes saved times the homes that travel through them, per pound.
- So the bot's `PLAY` is identical on seeds 1–3 through the port (step 13a, which brings this rule), then moves only by the folds (step 13d), measured as the balance playbook says. With the lines out it also says which front it took first.

## 9. The save

The save holds what's owned and how far it has grown, by place id, in place of `owned`, `ups` and `line`:

```ts
/** Places the player has bought or grown, by id (kind:name), each with its stages built (a count, for stages bought more than once). */
places: Record<string, Record<string, number>>;
// 'station:stockport': { crossing: 1, platform2: 1, building: 1, barriers: 1, taxi: 1 }
// 'station:heaton-chapel': {}                          // owned as a halt
// 'route:stopper': { units: 2, cars: 1, timetable: 1 }
// 'depot:stockport-sidings': { spare: 1 }
// 'stop:levenshulme-station-view': {}
// 'section:main:heaton-chapel:levenshulme': { speed: 1 }   // step 11
```

- A place is owned if it's in `places`, or comes with something that is (sections, junctions, services, the sidings); those enter `places` only once one of their stages is bought.
- Each station's running state (`st`, `homes`) stays in arrays by station index for now, the least change; keyed by id later if the lines out make indices shift. `SAVE_VERSION` goes from 15 to 16 (or the next free number) when step 13a lands. Before the first release there's no migration.

## Build plan

Each step is about one session, in order, each leaving `main` playable. Steps 13a to 13e are phase 5 step 13 on the roadmap, and come before step 11 (the line between stations) and step 12 (buses as a network).

1. **13a · Places in the sim** (sim, save, bot; nothing on screen changes). A `src/sim/places.ts`: kinds, ids, what comes with what, touching from the network data, `offered`, `stagesFor`, `buy(place, stage)`. Stations, the stopper and the Hazel Grove line (routes), Stockport's sidings (depot) and the three bus links (moved from `grow` to stops in the network data, with their positions) as places; `UPGRADES` and `LINE_UPGRADES` re-expressed as stages; stations bought by touching rather than in order, and the bot's per-pound choice among them (Section 8); `places` replaces `owned`, `ups` and `line` in the save (`SAVE_VERSION` up). The bot calls the new buys and fingerprints the same fields it does today, so `PLAY` stays identical on seeds 1–3. Tests: touching, needs, the save round trip.
2. **13b · One card** (view). The place card replaces the station and line panels in the sheet (`src/ui/panel.ts`); a tap on a train opens its service, on the sidings the depot, on a bus link's bays the stop; tapping the cash pill opens the Network card with Renew. Checks: `preview`, `line`, `layout`, `reach` updated; a new `places` group (every kind's card at 320 px, nothing locked shown).
3. **13c · Finding places** (view). The Places row replaces the strip (kind filter once there are two modes), the full sheet's list by kind, Next to chips, edge markers for up to three offered places, fog with bright and dim prices on the map. Checks: `layout` at the six sizes, `places`.
4. **13d · The folds** (sim, bot, balance). The kiosk into the booking office; car park after the booking office; longer platforms after the second platform. The bot on seeds 1–3 before and after, a table in the commit message, baselines re-proposed only if a milestone moves.
5. **13e · Strain** (view only). The map view and its glows for crowded platforms, the walk home, late trains by stretch and full car parks; a glow opens its place's card with "what's wrong now"; `--map-strain-*` tokens; a `strain` check group (320 px, reduced motion, nothing drawn changes `PLAY`).

**The briefs it changes** (each session that picks one up takes this design's word over its brief's):

- **The line between stations** (`docs/briefs/line-between-stations.md`, step 11): sections and junctions are places in this model, coming with the stations at their ends; their stages (line speed, resignalling, wires, flying junctions) are on their cards, not a section card of their own or the line panel; the stopper's Faster timetable stage goes when line speed by section lands; slow sections and held junctions join Strain.
- **The Buxton line and the Marple line** (`docs/briefs/buxton-line.md`, `docs/briefs/marple-line.md`): only the buying order: their stations are offered by touching (Middlewood once Hazel Grove is owned, Ashburys once Ardwick is), not strictly in order along the whole network, and priced by ring so the two lines are fronts of about the same cost.
- **Buses as a network** (step 12): bus routes are Route places and stops are Stop places as above, the 192 the first route (step 8), Stagecoach's garages depots; stops grow from a pole to a shelter to a bus station; full buses and traffic join Strain.

## For the UI and UX review

Added to `docs/UX-REVIEW.md`'s known findings: the strip of station chips doesn't scale past one line; the Station | Line switch splits one network into two panels; the line panel mixes trains, the timetable, the spare and the contract; a train can't be tapped; the edge marker only knows the next station.
