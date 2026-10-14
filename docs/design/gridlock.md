# The gridlock opening

The design for a new opening, from `docs/briefs/gridlock-opening.md` and the owner's idea of 13 October 2026: the game starts with no public transport running and the roads gridlocked, the first action is reopening Stockport, and the traffic easing on the map is the score. The mockups are at https://kylelookingaround.github.io/the-commute/design/gridlock/ (source `public/design/gridlock/`), at 320 and 390 px portrait, a landscape phone and a desktop. Nothing here is built yet; the build plan at the end says how, a session a part.

## Open questions for the owner

**Answered 14 October 2026: the owner said to go with the defaults, all eight as taken below.** Question 3's G5 isn't built unless the owner asks for it later.

1. **Starting cash and the price of reopening.** *Take: £4,000 to start, Reopen Stockport £1,000.* After reopening the player holds today's £3,000 and Stockport stands as today's halt, so everything after the first tap plays as today's opening does, only sooner (Pacing, below). A dearer reopening (say all of £3,000) makes the first minute a wait for fares before the second buy.
2. **Every station starts shut, and buying one is "Reopen".** *Take: yes, the same buy with a new word.* Every station on the map is a real station with no trains calling, fogged with its price as now; the button on a station's card says Reopen instead of Buy. Stops and routes that never existed (a bus stop, a bus lane) keep Buy. Nothing else about buying changes.
3. **Does the jam push people onto the trains?** *Take: not in the first build.* The car figure is first worked out from the journeys the network already models and changes nothing the sim does (part G1), so pacing holds and the bot can measure it. Letting slow roads send more people to the trains (and clear roads tempt some back, the Downs–Thomson effect) is part G5, built only if the owner wants it, with its own balance run.
4. **A reward for cars taken off the road.** *Take: no cash for it; the reward is the map.* Fares already pay for every rider; paying again per car would double-count and change the pacing. If the owner wants the score to count for something, the cheapest place is reputation (the contract): a point for each hundred cars off the morning peak, which moves the contract baselines a little.
5. **A traffic figure in the top bar.** *Take: no.* The top bar keeps cash and the clock (320 px has no room for a third pill). The score is on the map, on the Network card (tap the cash pill) and on each road's card.
6. **The M60.** *Take: it eases slowly and is the last road to clear.* Most of its traffic goes round Manchester, not along the player's lines, so the main line only takes it from coral to amber; the lines out, park and ride and trams take it further. Honest, and a long goal in sight from the first minute. The other way, scaling the M60 to clear with the main line, would make the opening's map lie about the late game.
7. **Trains that aren't the player's.** *Take: the expresses keep running through, without stopping.* What's shut is the local network: Stockport's station and its stopper. Avanti and CrossCountry already pass Stockport until platform 3 is built; a railway with nothing moving at all would read as broken rather than as a job to do.
8. **How a later start is chosen** (the owner's idea of 13 October 2026: renewals unlock other starting positions). *Take: a Starts branch of perks on the renewal sheet; each start bought there is offered beside Stockport on "Begin contract n", and Stockport stays the default.* The first game has no choice, as the owner's no-scenario rule says; the choice only ever appears after a contract has been renewed, among starts the player has earned. The other way, unlocking starts by milestones (own Piccadilly once, run a bus station), works too and needs no reputation, but puts a menu where there was none.

## The idea in one paragraph

It's 06:30 on a weekday and nothing local is running: Stockport's station is shut, the stopper stands dark at platform 4, and everyone who'd have taken a train is in a car. Wellington Road is nose to tail over Mersey Square, the M60 crawls under the viaduct, and the side streets glow amber. The one thing on offer is Reopen Stockport. Tap it and the shutters go up, the crowd on Station Road walks in, the train's doors open and the first fares land within seconds. From then on every station, unit, section, bus stop and car park takes cars off the roads, and the map shows the queues shortening and the roads' colour cooling from coral to clear, at the morning peak most of all. The car is the rival the player can see.

## The real picture

The numbers the design starts from. Peak hour taken as about 9% of a day's flow, the usual rule of thumb for urban roads; marked *est.* where the Department for Transport estimated rather than counted.

| Stretch | Vehicles a day (2024, DfT) | Peak hour, both ways (est.) | Count point |
| --- | --- | --- | --- |
| M60, junction 1 to 2 (under the viaduct, west) | 147,744 | about 13,300 | 17918, counted |
| M60, junction 27 to 1 (Portwood to Stockport) | 134,020 | about 12,100 | 48011, counted |
| A6 Wellington Road South, by Merseyway over Mersey Square | 19,796 *est.* | about 1,800 | 92103 |
| A6 Wellington Road North, Heaton Chapel | 15,892 *est.* | about 1,430 | 92102 |
| A6 Stockport Road at the Manchester boundary (Levenshulme) | 23,336 | about 2,100 | 73778, counted |
| A6 Stockport Road, Longsight | 16,305 *est.* | about 1,470 | 7946 |
| A6 London Road, Ardwick (A57 to A57(M)) | 22,438 *est.* | about 2,000 | 26157 |
| A6 Buxton Road, Davenport | 23,069 *est.* | about 2,080 | 91104 |
| A6 at Hazel Grove | 36,098 | about 3,250 | 3000, counted |
| A5145, M60 junction 1 to the A6 | 17,073 *est.* | about 1,540 | 92104 |
| A57 Hyde Road | 20,629 | about 1,860 | 56582, counted |

- **How Stockport gets to work** (Census 2021, TS061, Nomis): of 89,651 residents in work who travelled (50,157 more worked from home in lockdown), 71.6% drove, 5.1% were car passengers, 6.0% took a bus, 2.4% a train, 0.3% a tram, 9.3% walked and 2.6% cycled. In 2011 (QS701EW), before lockdown, of 129,896 who travelled: 69.0% drove, 8.6% bus, 5.4% train. So a car carries about 1.07 commuters, and about 14% of Stockport's commuters used public transport in a normal year: they're the cars added to the roads when nothing runs.
- **All trips in Greater Manchester** (TfGM's Travel Diary Survey, 2022, as reproduced in a Stockport Council paper): 40% as car drivers and 17% as car passengers, 30% walking, 6% by bus; in Stockport 45% as drivers. A quarter of households have no car.
- **Mersey Square and the A6 through the town** are the centre of Stockport's Town Centre Access Plan (about £76m: the Greek Street roundabout, the Wellington Road South and Railway Road junction, the Travis Brow link), which exists because the A6 through the town jams. No published peak-hour delay figures were found for the gyratory; the design takes the A6 there as at capacity in today's peaks.
- **What this means for the game:** with today's public transport, the A6 and the M60 near Stockport run at about capacity at the peak. Take the public transport away and their 14% or so of commuters drive: the A6 goes over capacity and queues grow all morning. That's the opening.

Sources: DfT road traffic statistics (roadtraffic.dft.gov.uk, average annual daily flow, 2024, Stockport and Manchester); Census 2021 TS061 and 2011 QS701EW (nomisweb.co.uk); TfGM TRADS 2022 via democracy.stockport.gov.uk; Stockport Council's Mersey Square and Town Centre Access Plan pages.

## 1. The first 60 seconds

Real seconds at 1× (three sim seconds a real second). Mockups: "On load", "Reopened" and "One minute in".

| When | What the player sees | What the sim does |
| --- | --- | --- |
| **0 s, on load** | Day 1, 06:30, low gold sun. Today's camera over Stockport, the viaduct across the valley. The station is shut: platforms empty, lamps off, the stopper dark at platform 4, a shutter across the Station Road entrance and a small crowd on the forecourt (cosmetic, up to 30). Wellington Road is solid over Mersey Square, brake lights lit; the M60 under the viaduct crawls both ways; the streets round the town are washed amber to coral. A low traffic murmur. Top bar: £4,000 and Day 1 · 06:30. On Stockport, one bright price pill with its meter full: **Reopen · £1,000**. The peek shows Stockport's card: Shut, and one card, **Reopen Stockport**: "Trains every 30 min to Manchester". Nothing else is offered: Heaton Chapel and the stations beyond stand fogged with dim prices. | Nothing local runs: no station owned, the stopper held at Stockport. Every pair of places' would-be trips go by car (The car in the sim, below); the A6 at Mersey Square stands at 1.25 times its capacity and its queue grows. |
| **0–5 s** | The price pill breathes slowly (none with reduced motion). No tutorial, no arrow: it's the only bright thing on the map and the only card in the sheet. | |
| **about 5 s, Reopen** | Cash ticks down to £3,000. The shutter rolls up, the platform lamps and the departure board come on ("Manchester Piccadilly · 06:32"), the stopper's lights and windows warm, its doors open. The forecourt crowd walks in by the stairs to platform 4. The card becomes the halt's card (four stages, `docs/design/buying.md` §5). Heaton Chapel's price turns bright with its meter: it touches Stockport now. | `buy('station:stockport')`. The stopper's timetable starts from now: it stands its dwell at platform 4, then runs. The people who'd gathered (the trips Stockport would have had in the last five clock minutes, at most 80) are on the platform at once. |
| **5–20 s** | People board through the doors; the cash pill counts up with each one (as today, a fare as they board). The tail of the queue on Wellington Road thins: a few cars turn off into the side streets and don't come back. | About 60 board: about £4,000 by the time the doors close. Cars on the A6 at Mersey Square fall by the drivers who took the train. |
| **20–60 s** | The train pulls out and crosses the viaduct, moving over the stopped M60: the shot that says what the game is. The player buys the subway (£2,000) the moment they look at the card. | Cash about £5,000 after the subway. Journeys get quicker, the reach rises, more of the morning's trips fit the train and fewer drive. |
| **after that** | The next train in about ten real minutes; Platform 3 and the booking hall from its fares; the second unit; then Heaton Chapel, as today. Over the first morning the queue on Wellington Road stops growing, then shortens from its tail. | |

- **Quicker than today.** Today the first fare comes when the first train reaches Stockport, about 200 real seconds in (605 sim seconds on seed 1, measured on `main`), and the first buy (the subway) is at once. Here the first buy is at about 5 seconds and the first fare at about 15. Everything after comes a little sooner (Pacing).
- **No scenario choice, no text wall:** the opening is the map, one bright price and one card. The card's line says what reopening does in the words cards already use.
- **Reduced motion:** the shutter and the lamps switch at once; the crowd appears on the platform.

## 2. The car in the sim

### What's new

A pure module, `src/sim/traffic.ts`, works out the roads from what the sim already knows, and the network data gains the road stretches it loads.

- **Who would travel.** Today `tripRates` gives the trips from station i to station j an hour as `demand × curve(hour) × reach × (homes and draw)`, where `reach` is the share of people whose budget the journey fits. Drop the reach and it's everyone who'd make that trip at all: `wouldTravel(i, j)`. It's worked out for every pair of places on the map, owned or not, with each station's homes now (the census catchment for those not yet owned).
- **Who drives.** Whoever the network doesn't carry: `cars(i, j) = (wouldTravel − rail) × carShare`, where `rail` is today's trip rate (zero when either end isn't open), and `carShare` is 0.72, Stockport's census share driving among those who don't take public transport, one to a car (a car carries 1.07 commuters on average; the passengers are already in the drivers' cars). The drive pools beyond a walk (Car parks and bus links) drive the whole way until their station's car park is built; then they drive only to it.
- **Where they drive.** Each road stretch lists the pairs of places whose drive uses it (`serves`: for the A6 stretches, the main-line pairs either side of it and the Hazel Grove line's into Stockport and beyond; for the M60 and the A560, the Marple line's and the lines out's), so a car between Levenshulme and Piccadilly loads Longsight and Ardwick but not Mersey Square. Plus `through`: traffic the network never touches (going round Manchester, deliveries, the school run), a fixed share of the stretch's real flow.
- **How full each stretch is.** `load = (through + Σ cars on it) / capacity`, at the clock hour, with capacity from the real peak-hour flow (above): the real road runs at about 0.95 of its capacity at the peak with today's public transport. Calibrated so that, at the morning peak:

| Stretch | At the start | Main line to Piccadilly, everything bought | Whole network, late game |
| --- | --- | --- | --- |
| A6 at Mersey Square, Heaton Chapel, Levenshulme, Longsight, Ardwick | 1.25 (gridlock) | about 0.95 (busy, moving) | about 0.8 |
| A6 south: Davenport, Hazel Grove | 1.2 | 1.15 until the Hazel Grove line, then 0.95 | about 0.8 |
| M60 by Stockport | 1.2 | about 1.1 | about 0.95, with the lines out and park and ride |

  The build sets `through` and the scale between the game's people and real cars (`carScale`) to land these, on seeds 1–3; the figures shown are in real vehicles an hour, so the A6 at Mersey Square reads about 1,800 an hour at the peak when it's at capacity, as it is today.
- **Queues.** Past capacity a queue grows by the excess, and drains when the load falls back under: `queue(t) = max(0, queue + (load − 1) × capacity × dt)`, from 05:00 each day in ten-clock-minute steps (cheap: a dozen stretches by about a hundred steps). At 1.25 the A6's queue into Mersey Square grows by about 240 cars an hour in the busier direction (a quarter of about 950 an hour each way): about 900 m of Wellington Road on two lanes by 07:30, and twice that by 08:30 if nothing changes. Speed on a stretch below capacity is the standard road-planning curve, `free speed / (1 + 0.15 × load⁴)`; in a queue, a crawl.
- **What it gives:** for each stretch, cars an hour, load, speed and queue; for the map and the Network card, the cars off the road at the morning peak (the start's total less today's) (`traffic(sim)`, `trafficKey` for when to work it out again, as `journeyKey` does).

### What stays

- **It's derived, never stepped.** Nothing in `Sim.step` reads it, so the sim plays exactly as before (part G1 leaves `PLAY` identical on seeds 1–3), and it can live in a chunk loaded after the first frame (Performance, below). It reads the journeys, homes and the clock; it's worked out again when they change and twice a second for the queues.
- **Seeded and pure:** no random numbers at all, no DOM, nothing from the view. The same purchases at the same hour give the same roads.
- **The journeys model** is untouched: walks, waits, rides, changes, felt time and reach work as they do. The car is the people the network doesn't yet carry.

### What the bot measures

- **cars at the first morning peak** (08:00 on day 1, real vehicles an hour over the drawn stretches) and **cars at the last morning peak**, and **cars off %**, one less the second over the first.
- **A6 load at the last morning peak** (at Mersey Square) and **M60 load**.
- **first fare s** (real seconds at 1× to the first fare) and **reopened** (the game hour of the first buy).
- Proposed ranges, from the targets above, after the first run: cars off 20–40% in 8 sim hours (main line and some of the Hazel Grove line, the M60 barely moving), the A6 at Mersey Square 0.9–1.05, first fare s 5–40.

## 3. Gridlock on the map, within budget

### What it draws

- **Cars, near the camera:** instanced on the roads that exist (the `roads` in the network data, mostly the A6, and the M60's course), within about 600 m of the camera and at most 300 at a time. A car is one low box with a cabin step, ten triangles (no floor), in the model railway's colours (red, blue, yellow, white, silver, green, the `--map-car-*` tokens), each a touch lighter or darker. No shadows (`noShadow`): a soft dark patch is painted under the queue by the wash instead.
- **Queues at junctions:** the sim's queue length on a stretch is drawn back from its junction point (Mersey Square, Heaton Chapel's crossroads, Levenshulme, Longsight, Ardwick Green, M60 junction 1) nose to tail, about 7 m a car per lane, standing still; the rest of the stretch's cars move at the stretch's speed, spaced by the flow. As the queue shortens it shortens from its tail, so the jam visibly recedes towards the junction.
- **Brake lights:** the rear face's vertex colour, lit (`--map-brake`, a warm red-orange that reads in daylight) on cars standing or crawling, off on cars moving freely; one instance attribute, no extra triangles. At dusk and night headlights come on as the street lamps do.
- **The road wash, everywhere else:** the ground's cover already paints the streets into its texture (The surroundings). A small congestion texture (64 × 64 over the map, one byte a cell, the stretch's load where a stretch runs) tints the cover's road pixels in the terrain shader: clear roads their usual grey, from 0.9 a warm amber (`--map-jam-1`), from 1.15 coral (`--map-jam-2`), soft-edged, lit like the ground. Zero triangles; the texture is written twice a second at most, only when a load moves.
- **Calm, not grim:** daylight, toy-coloured cars, warm tints rather than red, a murmur rather than horns. The fun is in watching it drain.

### What it costs, and what it draws instead

| | Opening today | Opening with gridlock |
| --- | --- | --- |
| Triangles (shadows included; budget 450,000) | about 443,000 | about 446,000: up to 3,000 for 300 cars, no shadow pass; the wash is free |
| Draw calls | as today | one more (the cars) |
| Script before the first frame (budget 450 KB) | 447 KB | 447 KB: `src/sim/traffic.ts` and `src/render/traffic.ts` load in a chunk after the first frame, as the terrain does |

- **Room for the cars:** at 10 triangles a car, 300 fit inside the 7,000 left. The shut station at the opening draws a little less than the halt does today (no platform crowd until it's reopened, only up to 30 people on the forecourt), which covers the forecourt. On Low (Fewer people) the cars are capped at 120 and the wash stays.
- **Before the chunk arrives** (a fraction of a second): the wash's uniform defaults to the opening's jam, so the first frame already shows the roads amber and coral; the cars fade in when the chunk lands.
- **The busy save** (`perf`'s 550,000): by then the roads are clearer, so fewer cars stand in queues, but the cap still holds at 300.

### What it needs from the roads, and in what order

- **Today's stand-in roads are from memory** (the A6 from Stockport to Piccadilly and south to Hazel Grove, the side streets to each station) and the M60's course is from memory checked against the LIDAR. Cars follow whatever polylines the data has, so the gridlock can be drawn on the stand-ins first and follows the real courses when they land.
- **From step 8 (the A6 and the 192):** the A6 on its real course from OpenStreetMap; each stretch's junction points by name (`junctions: [{ name, at }]`: Mersey Square, Heaton Chapel's crossroads, Levenshulme, Longsight, Ardwick Green); lanes each way; the DfT count point id on each stretch (`aadf`), so capacities come from the data. Its traffic "busy at the peaks" is this design's cars: step 8 builds on part G3 rather than its own.
- **From step 9 (the main roads):** the M60's junctions (1 at Stockport, 27 at Portwood, 2 and 25) and the A5145 and A560 into the town, with the same fields.
- **Order:** part G1 (the sim) needs no roads. Part G3 (the map) can come before or after step 8; if step 8 is already under way, G3 waits for it and saves redrawing.

## 4. Places that start shut

- **Every station starts shut** and fogged with its price, as now (the owner's one exception to hiding locked things). There's no second kind of locked station: "shut" is what fogged means in this opening.
- **Reopen is the same buy as Buy,** with a new word on a station's card and button (open question 2). Stockport is simply the first: its price is £1,000 rather than free, and it's the only place offered at the start because nothing is owned yet.
- **What touches what** works as in `docs/design/buying.md`: with nothing owned, the only place offered is the start's `offer` (§7): for the first game, Stockport. Once it's reopened, its neighbours are offered as now.
- **What shows on a shut Stockport:** a shutter across the Station Road entrance (a new kit part with `until: "open"`, the opposite of `upgrade`: shown until the station is owned), lamps and board off, the stopper standing dark. Other fogged stations stay as they are drawn today.

## 5. Pacing

- **Income per passenger is unchanged:** the same fares, `fareMult` 13.5, the same demand formula. Demand doesn't start lower: the people are the same, and the gridlock is why they come (until part G5, the jam doesn't push extra people onto the trains).
- **No cash for cars taken off** (open question 4).
- **What moves:** only the first minutes. After Reopen the game stands where today's starts (Stockport a halt, £3,000), but the first train boards at once instead of 200 real seconds later, with a smaller first load (about 60 against 124), so the first ten minutes earn about the same and the next buys come a little sooner.
- **What the bot should show** (part G2's run on seeds 1–3, against today's): Reopen at 0; the subway at 0 as now; Platform 3 and the booking hall a few game minutes sooner than 0.17 h; the second unit and Heaton Chapel up to about 0.05 h sooner (both inside their ranges, 0.25–0.6 and 0.5–1.0, unless Heaton Chapel falls under 0.5, when its range is re-proposed); Levenshulme to Piccadilly as now within noise; cash at the end, boarded and lost inside their ranges. The new measures as proposed above. A change outside the ranges goes to the owner with the run.

## 6. What it replaces or folds into

| Today | With the gridlock opening |
| --- | --- |
| The opening: Stockport owned as a halt from the start, £3,000 | Stockport shut, £4,000; Reopen (£1,000) gives today's start |
| The stopper running from 05:30 | Held at Stockport until it's reopened; its day 1 timetable starts then; from day 2 as today |
| Contract renewal: the next contract starts from Stockport as a halt | The next contract starts in gridlock: every stage folds down, Stockport shuts, the queues come back. Perks act as now (starting cash adds to £4,000) |
| Strain's "traffic" row (`docs/design/buying.md` §6, steps 8, 9, 12) | Is this: the road wash is always on as the map's own life; with Strain on it's drawn stronger, and a road's figure shows on a strong glow |
| Car parks and drive pools | The drive pools are the same people as the cars on the roads: until a car park is built they drive the whole way, loading the A6; once it is they drive only to the station and ride, so a car park takes them off the stretches beyond it. Shown on the map as the queue shortens; the car park's card says "takes about 40 cars off the A6 north of here" |
| Rail replacement buses' roads | The same `roads`: the buses drive in the traffic (stuck in a queue they wait, which is the real reason replacement buses are slow) |
| The 192 (step 8) and bus lanes (step 12) | A bus is one more way off the road; a bus lane lets the 192 pass the queue, drawn so |

### The road card

A road stretch becomes a kind of place that's never bought (until a bus lane or bus priority is, step 12): tap the traffic and its card opens with four figures (Cars an hour, Load, Speed, Queue) and the time it takes to drive the stretch now against free-flowing. Next to lists the stations along it, owned or fogged with their price, as any card's does: neutral, never a recommended buy. The Network card (tap the cash pill) leads with the score: **cars off the road at 08:00**, a figure that only rises as the network grows (the cars at the start less the cars now, over every drawn stretch, in real vehicles an hour), with the start's total beside it and a small sparkline by game day. A rising number suits an incremental game better than a falling one, and it isn't swamped by the M60's through traffic the way a total would be.

## 7. Starts as data

The first game always opens on gridlocked Stockport, but contract renewal will later unlock other starting positions (the owner, 13 October 2026). So nothing about the opening is in code: a start is a record in the network data, and the code reads it.

```jsonc
// src/data/network.json, "starts": the first is the first game's, and the default
{
  "id": "stockport",
  "name": "Stockport",
  "open": [],                                   // places owned at the start (none: everything shut)
  "offer": ["station:stockport"],               // what's offered with nothing owned
  "prices": { "station:stockport": 1000 },      // a price for an offered place, where the start differs from the data
  "cash": 4000,
  "clock": { "day": 1, "hour": 6.5 },
  "held": { "route:stopper": "stockport" },     // services standing until a place on them opens, and where
  "camera": { "at": "station:stockport", "look": "mersey-square", "height": 420 },
  "roads": ["a6-mersey-square", "m60-j1", "a6-heaton-chapel", "a6-davenport"],   // stretches the first card and the camera name
  "unlock": null                                // the first game's: nothing to unlock
}
```

- **The jam is never authored.** Which roads are jammed follows from what's open: with nothing open every pair of places drives, so every stretch starts at its own load. A start's `roads` only says which stretches its first card mentions and the camera frames. Change what's open and the roads follow, in the same sums as the rest of the game.
- **What reads it:** `Sim.fresh(net, seed, perks, start)` (part G2) sets `places`, cash, the clock and the held services from it; "with nothing owned, the home station is offered" becomes the start's `offer`; the camera's first framing and the shut look (shutters, dark trains) read `open`, `held` and `camera`; the save records the start's id; the bot takes `--start <id>` and plays from it. Prices stay fixed per place in the data (`docs/design/buying.md`, open question 3); a start overrides only the few it offers first.
- **Touching and rings still work from wherever the start is:** what's offered is what touches what's open, so a start on another line grows outwards from there, and its first rings cost what that line's stations cost.
- **Unlocked by the contract** (open question 8): each later start is a perk with its reputation price, and once bought it's offered on "Begin contract n" beside Stockport. Perks still act as perks on whichever start is picked.

### Three later starts, sketched

- **Piccadilly: the city end.** Open: nothing; offered: Piccadilly, at a price that fits a bigger first buy and more cash (say £12,000 of a £15,000 start). The stopper is held in platform 5 and runs out towards Stockport. Jammed: the A6 London Road and Ardwick Green, the A57(M) Mancunian Way, Hyde Road. The camera on the train shed with the city's towers behind. It grows outwards: Ardwick, then the Marple line's Ashburys or the main line's Levenshulme. Stockport is the far goal. It plays differently: the city draws a lot but has few homes (830 against Stockport's 1,000), so the evening matters more than the morning.
- **Stockport Interchange: a bus start** (after step 12, buses as a network). Open: nothing; offered: the Interchange and the 192 as one buy. The first vehicles are buses, and they sit in the same queue on Wellington Road as the cars, so the first stages offered are a bus lane and more buses. The station across the road is offered once the Interchange is open. Jammed as the first game, but the score starts from buses passing the queue.
- **Marple and Rose Hill: another line.** Open: nothing; offered: Marple (or Rose Hill), with the Marple line's unit held there. Jammed: the A626 into Marple and the A560 and M60 junction 25 at Bredbury. Smaller towns and a quieter jam: one unit, long gaps, and a slow climb towards the city, with Ardwick and Piccadilly as the far goal. It shows off the Marple arches and the Goyt valley.

Each needs only data: a start record and, for the bus start, the places step 12 brings.

## The bot

`tools/bot.mjs` reopens Stockport first (the only thing it can buy), then plays as now. It reports the new measures (§2) and a table of each stretch's load at each morning peak, so a balance run shows where the roads cleared.

## The save

- A fresh game's `places` is empty (no Stockport). `cash` starts at £4,000.
- No new saved field for the roads: the traffic is derived from what's saved. The queues are worked out from the clock, so they're right on load.
- `SAVE_VERSION` goes up with part G2 (the start changes shape). Before the first release there's no migration; a save from before loads as a fresh game, as now.

## Build plan

Each part about one session, in order, each leaving `main` playable.

1. **G1 · The car in the sim** (sim, data, bot, tests; nothing on screen). *Built 14 October 2026 (`docs/DESIGN.md`, The car): the stretches are in their own `src/data/traffic.json`, not the network data, so they load after the first frame; `traffic(sim, TUNING, data, hour)` takes them.* `src/sim/traffic.ts` (`wouldTravel`, `cars`, stretches, loads, queues, `traffic(sim)`, `trafficKey`); `traffic` stretches with their real counts and sources, `serves`, `through` and capacities; `carShare` and `carScale` in `TUNING`. Not read by `Sim.step`, so `PLAY` stays identical on seeds 1–3. The bot reports the new measures on today's opening (Stockport owned from the start), and the calibration lands the targets in §2. Tests: pure (two calls, same answer), a shut station's pairs all drive, reopening lowers the A6's load, queues grow past capacity and drain under it.
2. **G2 · Stockport starts shut** (sim, data, save, bot, a little view). `starts` in the network data with the first game's record (§7), read by `Sim.fresh`: a fresh game owns nothing, £4,000; the start's `offer` (Stockport, £1,000); the stopper held at platform 4 until it's reopened, its day 1 timetable from then; the gathered crowd on reopening; `SAVE_VERSION` up. The bot reopens first; its run on seeds 1–3 against `main`, a table in the commit message, baselines re-proposed only if a range breaks. View: Reopen on a station's card and button; Stockport's shutter part (`until: "open"`), lamps and board off, the forecourt crowd; checks `preview`, `places` and the opening's screenshots updated.
3. **G3 · Gridlock on the map** (view). `src/render/traffic.ts` in a chunk after the first frame: instanced cars on `roads` and the M60's course, queues from each junction point, brake lights, the 300-car cap (120 on Low); the congestion texture and the wash in the cover patch; `--map-car-*`, `--map-brake`, `--map-jam-1`, `--map-jam-2` tokens; the wash's default for the first frame. Checks: `perf` (the opening inside 450,000 triangles and 450 KB), a `traffic` group (the opening's jam drawn, a bought main line's roads cooler, nothing drawn changes `PLAY`, reduced motion).
4. **G4 · The road card and the score** (view). Road stretches as places that open a card (tap the traffic); the Network card's score and sparkline; Strain's traffic row as the wash drawn stronger; the car park's card line. Checks: `places` (a road's card at 320 px), `strain`.
5. **G5 · The jam pushes back** (sim, balance; only if the owner wants it, open question 3). The car's felt time (the stretches' drive at their speed, the queue, the parking) joins the journeys as the rival: a trip's reach rises when the car is slow and falls as the roads clear. The bot before and after, the baselines re-proposed with the owner.

**What it changes elsewhere:**

- **The A6 and the 192** (roadmap phase 5 step 8): its traffic is G3's cars; it adds the A6's real course, junction points, lanes and count ids (§3).
- **The main roads** (step 9): the M60's junctions and the A5145 and A560, with the same fields.
- **Buses as a network** (step 12): bus lanes and priority are drawn as buses passing the queue, and a road stretch's card is where they're offered.
- **Contract renewal** (`docs/DESIGN.md`): the next contract starts in gridlock.
- **`docs/design/buying.md` §5** (the opening) is replaced by §1 here once G2 lands; its "touching" gains the rule that with nothing owned the start's `offer` is offered (§7).
