# Buying is a growing network, with the network's problems shown on the map

**Status:** Approved direction · 13 October 2026 (the owner). The model's details come from the design in `docs/design/buying.md` (`docs/briefs/buying-design.md`).

## Context

Buying was built for a station tycoon: stations bought in order up the line, so there is only ever one "next station"; each station grows through fixed stages that are mostly flat bonuses; and a few line-wide upgrades sit in a panel of their own. The interface follows: a strip of station chips, a station panel and a line panel. Once all public transport is the game (`docs/decisions/ADR-2026-10-13-all-public-transport.md`), with several lines out at once, sections of line, bus routes and stops, trams and depots, there are many next things, and each would need its own panel and rules. The owner: "maybe the way upgrades and buying stations needs to be rethought too, since they become part of the game instead of the game."

## Options considered

1. **A growing network:** everything buyable is a place on the map (a station, a section of line, a junction, a bus route, a bus stop, a tram stop, a depot) that starts small and grows in stages; anything touching what the player owns is offered, fogged with its price; one kind of card for every kind of place.
2. **Problems on the map lead:** the map shows where the network is failing (crowded platforms, slow stretches, people giving up, late trains, held junctions, traffic on the roads), and tapping any place shows what could be built there.
3. **Journeys as the unit:** the player invests in a journey and chooses how to improve it. More strategic, but more abstract and further from the model railway on screen.

## Decision

- **Options 1 and 2 together** (the owner): the player grows a connected network in whichever direction they like, and the map shows where it hurts.
- **Kept:**
  - Buy the next thing, and see it appear on the map.
  - Fogged places with their price are the one locked thing shown; everything else locked stays hidden.
  - Cash from fares, the opening at Stockport station as a halt, contract renewal and its perks.
  - No managers and no recommended buys. The problems layer shows what's happening, never which buy to make: a problem leads to a place, and the place's card lists everything that can be built there, as any place's card does.
- **Goes:** stations bought strictly in order up the line (a `needs` that is real, like Davenport waiting on Stockport's platforms where the Hazel Grove trains turn round, can stay); separate panels per kind of thing; the strip of station chips as the only way round the network.

## Consequences

- **The design session** works out the model and shows it as mockups before anything is built: what counts as a place, what touches what across modes, prices, which of today's upgrades fold into which stages, how the problems show, and what replaces the strip.
- **The line between stations waits for it** (`docs/briefs/line-between-stations.md`), so its sections are bought as places in the new model rather than through a card of their own.
- **The lines out carry on:** their corridors, kits and stages fit the new model; only the buying order changes.
- **Building the model** is new phase 5 steps on the roadmap, from the design's build plan, and comes before the line between stations and buses as a network.
- **The bot** learns the new choices, and the opening's milestones hold within the baselines' tolerance unless the design proposes otherwise and says why.
