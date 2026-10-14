# What looks broken round the stations

The audit for `docs/briefs/station-surroundings.md`, 14 October 2026: every station on today's map with every upgrade bought, from the `surroundings` check (`node tools/check.mjs surroundings`, which lists what it still finds at the stations on its `LATER` list) and screenshots at street level and from above with every square's buildings loaded. Worst first: a part buried in a bank or standing on a pad dug into a cutting's side, then a part with no road, then a road that runs along or into the railway, then a part over a real building.

The before shots and the check's first run are in the session's report to the coordinator; the check's run on today's `main` failed on all five of its tests.

## Fixed

### Heaton Chapel (14 October 2026)

What the owner saw from a phone (`docs/briefs/station-surroundings/owner-heaton-chapel-phone.png`):

- **The taxi rank** stood on the station's pad, dug down into the cutting's west side beside the platform (4.2 m below the real ground, 7 m from a street): the terrain clears a pad for every part on the pad, so the rank cut a pit with brick walls into the bank, which read as brown roads running into the cutting.
- **The bus stop** stood in the same pit (6.6 m below the real ground).
- **The replacement buses' roads** (from memory) left the stop across the cutting at rail level and over the gardens beyond, dropping 7.9 m into the railway.
- **The road over the bridge** stopped at the deck's ends: the bridge is drawn square to the line and the real Heaton Moor Road crosses it on the skew, so its ends missed the street painted either side.

Now:

- OpenStreetMap has no rank at Heaton Chapel; the game's stands where one would go, on Tatton Road North at the top of the cutting by the booking office's door, at street level.
- The bus stop is the real stop F (Heaton Moor Road / Heaton Chapel Station) south-west of the bridge, at street level.
- Two `road` parts carry Heaton Moor Road on from each end of the deck, over the abutments at the deck's height, to the street painted on the ground.
- Both buses' roads are drawn from OpenStreetMap's streets (`tools/osm-to-roads.mjs`), and run over the kit's deck and roads where they cross the line.
- Every street-level part and road is seated again as the fine terrain comes in, and a rank or a stop stands on the highest ground along its bay.
- The buses' roads cross any cutting between streets on a bridge, straight from one side's height to the other's.

### Ardwick, Ashburys, Reddish North, Woodsmoor and Davenport (14 October 2026)

- **Ardwick**: the bus stop stood on the station's pad 5.9 m above the street, with no street within 50 m. It now stands on the real approach, a service road along the foot of the line from Devonshire Street North, past the booking office's door, drawn as a kit `road`.
- **Ashburys**: the stop's bay ran back under the rail bridge onto the railway's land, and stood 6.7 m above Pottery Lane. It's now moved clear of the bridge, at stop A.
- **Reddish North**: the stop and the car park stood on the pad, 4.7 m and 1.7 m above the real ground. Both are now at street level on the station approach off Gorton Road, drawn as a kit `road`.
- **Woodsmoor**: the stop stood on the pad, 4 m from any street. OpenStreetMap has no stop by the station, so it's placed on Moorland Road north of the bridge. The square-drawn deck stands higher than the real road, so Moorland Road now comes down a bank off each end.
- **Davenport**: the stop was 10 m from a street. It's now the real stop C on Bramhall Lane. Bramhall Lane joins each end of the square-drawn deck, and the buses' roads cross on it.
- Every bus road to these stations is redrawn from OpenStreetMap: Levenshulme to Ardwick, Ardwick to Piccadilly, Piccadilly to Ashburys, Ashburys to Belle Vue, Ryder Brow to Reddish North, Reddish North to Brinnington, Stockport to Davenport, Davenport to Woodsmoor and Woodsmoor to Hazel Grove.

## Still to put right

From the check (heights are against the real ground; streets are the real ones painted on the ground, the kits' roads and bridge decks):

1. **Stockport**: the taxi rank is 2.2 m off the ground and 40 m from a street; the bus stop is 2.8 m off.
2. **Rose Hill**: the bus stop is 2.8 m off and 31 m from a street; the first car park is 27 m from a street; the second is 2.2 m off.
3. **New Mills Newtown**: the bus stop is 2.4 m off the ground.
4. **Romiley**: the car park is 2.3 m off the ground.
5. **Middlewood, Disley, Marple**: the bus stops are 39 m to more than 50 m from a street.
6. **Hazel Grove**: the taxi rank, bus stop and bus link are 21 to 25 m from a street; both car parks stand on real buildings.
7. **Levenshulme**: the taxi rank is 12 m from a street; the car park stands on a real building.
8. **Disley, Bredbury**: a car park stands on a real building.
9. **The roads from memory**: Hazel Grove to Middlewood, Middlewood to Disley and Disley to New Mills Newtown (the last runs 80 m along the railway's land). They should be redrawn from OpenStreetMap with `tools/osm-to-roads.mjs`, once each station's stop is in its real place.
10. **Piccadilly**: the taxi rank and bus stop are 8.8 m off the ground with no street within 50 m; the car park is 23 m off. Its kit waits until the services work's first part (the Marple pair into platforms 1 to 4) has landed.

The buses' roads still cross the land at rail level where they pass under an embankment, because the terrain check holds them on or above the ground as it's drawn. A road under the line would need that rule to allow it.
