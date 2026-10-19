// Places (docs/design/buying.md, docs/DESIGN.md, Places): everything the player can buy or grow is a place on the map,
// by id (kind:name): a station, a section of line, a junction, a route (a train service), a stop (a bus stop or bus
// station) or a depot. Each starts small and grows through stages. Stations and stops are bought; the rest come with
// what's owned (a section with the stations at its ends, a service with its stations, Stockport's sidings with
// Stockport). A place is offered when it touches one the player owns and what it really needs is built. The saved game
// holds what's owned by place id (GameState.places); `derive` works out the per-station views the rest of the sim and
// the view read. Pure: no rendering, nothing from the DOM.
import type { Network } from './network.ts';
import type { GameState, LineUpgradeId, ServiceDef, StageId, StartDef, StopDef, UpgradeId, BusRouteDef } from './types.ts';

export type PlaceKind = 'station' | 'section' | 'junction' | 'route' | 'stop' | 'depot' | 'network' | 'bus';

/** A station's stage. name null: the station names it (its retail, or its stage in `grow`). requires: stages at the
 * same station that must be built first; one the station doesn't offer counts as built. stage: offered only where the
 * station's `grow` lists it. stop: not the station's own but the bus stop or bus station by it, a place of its own,
 * listed here so the station's card still shows it. */
/** scale: a tier that keeps going (step 18), priced from the station's size: its price at REF_HOMES homes, more with
 * more (Sim.upgradePrice). */
export interface Upgrade { id: UpgradeId; name: string | null; price: number; desc: string; requires?: UpgradeId[]; stage?: boolean; stop?: boolean; scale?: boolean }
/** A stage bought more than once, on a route or a depot: its price each time, up to max. */
export interface LineUpgrade { id: LineUpgradeId; name: string; prices: number[]; desc: string; max: number; steps?: { name: string; desc: string }[] }
/** A stage of a route: the line's (units, cars), or a branch's own through running. */
export type RouteStage = Omit<LineUpgrade, 'id'> & { id: LineUpgradeId | 'through' | 'feeder' | 'bee' | 'every' | 'lanes' | 'stock' | 'maint' | 'shelter' };
/** A service's frequency as a stage of its route: its data's steps (ServiceDef.frequency), one level each. */
export function frequencyStage(def: ServiceDef): LineUpgrade | null {
  const f = def.frequency; if (!f?.steps.length) return null;
  return { id: 'units', name: 'Frequency', prices: f.steps.map(x => x.price), desc: f.steps[0]!.desc, max: f.steps.length, steps: f.steps.map(x => ({ name: x.name, desc: x.desc })) };
}

// a station's stages, in the order it grows: a bought station is a halt (one platform, one line) and these build it up.
// The kiosk is folded into the booking office (docs/design/buying.md, Today's upgrades, mapped): it comes with it, at
// the price of both, and `derive` reads it as built once the booking office is, so the kits' kiosks still show
export const UPGRADES: Upgrade[] = [
  { id: 'crossing', name: null, price: 2000, desc: 'The far side walks across, not round: 5 min off their walk', stage: true },
  { id: 'platform2', name: null, price: 3500, desc: 'Trains call both ways, so the crowd going home too', requires: ['crossing'], stage: true },
  { id: 'building', name: null, price: 4500, desc: '90% of fares collected (82% at a halt), and +£0.35 per boarding passenger at its kiosk', stage: true },
  { id: 'taxi', name: null, price: 1200, desc: 'Cabs take some who’d give up on the train: a cut of each fare', stage: true },
  { id: 'carpark', name: null, price: 4000, desc: 'Drivers from beyond a walk park and ride, while there are spaces: a charge a car', requires: ['building'], stage: true },
  { id: 'carpark2', name: null, price: 7000, desc: 'More spaces, so the car park fills later', requires: ['carpark'], stage: true },
  { id: 'bus', name: null, price: 3000, desc: 'Buses bring people from beyond a walk', stage: true, stop: true },
  { id: 'canopy', name: 'Canopy', price: 2500, desc: 'Waiting in the dry feels a quarter shorter' },
  { id: 'barriers', name: 'Ticket barriers', price: 4000, desc: 'Collect every fare', requires: ['building'] },
  { id: 'extend', name: 'Platform extension', price: 5000, desc: 'Platform holds 320 instead of 150', requires: ['platform2'] },
  { id: 'lifts', name: 'Lifts', price: 6000, desc: 'Step-free: 3 min off the far side’s walk, 1 off everyone’s', requires: ['crossing'] },
  { id: 'retail', name: null, price: 9000, desc: '+£0.80 per boarding passenger', requires: ['building'] },
  { id: 'platforms', name: null, price: 30000, desc: '+20% catchment', requires: ['platform2', 'building'], stage: true },
  { id: 'signature', name: null, price: 0, desc: '', requires: ['travel'], stage: true },
  // Stockport as the hub (step 7): where its `grow` has one, a concourse joining every platform (changing there quicker)
  { id: 'hub', name: null, price: 0, desc: '', requires: ['platforms'], stage: true },
  // the tiers that keep going (step 18): each a further step of an everyday stage, each drawn, priced by the station's size
  { id: 'long', name: '8-car platforms', price: 45000, desc: 'Platform holds 480 instead of 320', requires: ['extend'], scale: true },
  { id: 'canopyFull', name: 'Canopies the full length', price: 25000, desc: 'Waiting in the dry the whole platform: feels a third shorter', requires: ['canopy', 'extend'], scale: true },
  { id: 'travel', name: 'Travel centre', price: 15000, desc: '+£0.40 per boarding passenger', requires: ['building', 'barriers'], scale: true },
  { id: 'shops', name: 'A row of shops', price: 25000, desc: '+£1.20 per boarding passenger', requires: ['retail'], scale: true },
  { id: 'posters', name: 'Posters on the main road', price: 6000, desc: 'Billboards where the traffic sits: 6% more come by train', requires: ['building'], scale: true },
  { id: 'cyclehub', name: 'Cycle hub', price: 15000, desc: '+8% catchment: more ride in from further', requires: ['building', 'lifts'], scale: true },
];
/** A station's stages as a few chains, each a problem it fixes (fewer, bigger choices: docs/DESIGN.md, Chains): the
 * card offers each chain's next step, a step being one or more of UPGRADES bought together. `fixes`: the kind of
 * trouble Strain names (src/ui/strain.ts) that the chain answers, if any. A station's own stage stands alone. */
export interface Chain { id: string; name: string; fixes: 'crowd' | 'walk' | 'park' | null; steps: UpgradeId[][] }
export const CHAINS: Chain[] = [
  { id: 'walk', name: 'Getting to the trains', fixes: 'walk', steps: [['crossing'], ['lifts'], ['cyclehub']] },
  { id: 'room', name: 'Room on the platforms', fixes: 'crowd', steps: [['platform2'], ['canopy', 'extend'], ['long', 'canopyFull'], ['platforms'], ['hub']] },
  { id: 'hall', name: 'The booking hall', fixes: null, steps: [['building'], ['barriers', 'retail'], ['travel', 'shops']] },
  { id: 'beyond', name: 'From beyond a walk', fixes: 'park', steps: [['taxi'], ['carpark'], ['carpark2', 'posters']] },
  { id: 'own', name: 'Its own stage', fixes: null, steps: [['signature']] },
];
/** The stages of the main-line stopper (units, cars, timetable) and of Stockport's sidings (the spare unit). */
export const LINE_UPGRADES: LineUpgrade[] = [
  { id: 'units', name: 'Extra unit', prices: [6000, 20000, 50000, 120000, 240000], desc: 'One more train in service: shorter waits, more passengers', max: 5 },
  { id: 'cars', name: 'Longer trains', prices: [12000, 40000], desc: '+2 cars per unit', max: 2 },
  { id: 'spare', name: 'Spare unit', prices: [8000], desc: 'Stands by in Stockport’s sidings: a failed train is moving again in half the time', max: 1 },
];
/** A section of line's stage (the line between stations, docs/briefs/line-between-stations.md): line speed, 15 mph a
 * step up to SECTION_TOP, at `perMile` pounds a mile a step (the faster timetable's £20,000 over the stopper's six
 * miles). How many steps a section has, from where it starts, is the sim's (Sim.sectionAt). */
export const SECTION_SPEED = { id: 'speed', name: 'Line speed', perMile: 3300, step: 15, top: 90, desc: 'Track renewed for a faster line speed: quicker rides through it' } as const;
/** A section's resignalling: one stage, `perMile` pounds a mile, signal sites re-laid closer through it (shorter
 * blocks, so trains follow closer: Network.closer) and its signal failures held off `holds` of the time (TUNING's
 * resignalHolds, six in ten). */
export const SECTION_SIGNALS = { id: 'signals', name: 'Resignalling', perMile: 5000, desc: 'New colour-light signals at closer spacing: trains follow closer, signals fail less' } as const;
/** A section's electrification, where the real line has no wires: one stage, `perMile` pounds a mile; its trains
 * accelerate as electric units do through it (TUNING.accel, not accelDiesel). */
/** A junction's flying junction: one stage, `price` pounds, offered once trains have stood `after` seconds in all at its
 * signals held for one another; then ways through it that cross no longer wait on each other (ways onto the same track
 * still take turns). */
export const JUNCTION_FLYOVER = { id: 'flyover', name: 'Flying junction', price: 60000, after: 600, desc: 'One line over the other on a bridge: trains crossing here stop waiting for each other' } as const;
export const SECTION_WIRES = { id: 'wires', name: 'Electrification', perMile: 8000, desc: 'Masts and wires: trains accelerate harder through it' } as const;
/** A bus stop's feeder route (step 21): its real route run for the station, more buses an hour, then bigger buses. Each
 * shortens the wait for the bus and widens who comes by it (FEEDER_WAIT, FEEDER_POOL in src/sim/access.ts). */
export const FEEDER: RouteStage = { id: 'feeder', name: 'Feeder buses', prices: [8000, 20000, 45000], desc: 'More buses bring more people from beyond a walk', max: 3,
  steps: [{ name: 'Feeder route', desc: 'Its route run for the station, two buses an hour: shorter waits, people from further out' }, { name: 'Four buses an hour', desc: 'Half the wait for the bus, and more come by it' }, { name: 'Bigger buses', desc: 'Double-deckers on the route: more come by bus' }] };
/** A bus stop growing (step 12): from the pole it opens as to a glass shelter with a seat, then a screen with when the
 * next bus is due. Each makes the wait for the bus feel shorter (STOP_WAIT in src/sim/access.ts). Bus stops only: a bus
 * station has its hall. */
export const SHELTER: RouteStage = { id: 'shelter', name: 'Shelter', prices: [2500, 6000], desc: 'The wait for the bus feels shorter', max: 2,
  steps: [{ name: 'Shelter', desc: 'A glass shelter with a seat: the wait for the bus feels shorter' }, { name: 'Live times', desc: 'A screen with when the next bus is due: the wait feels shorter again' }] };
/** Joining the Bee Network (step 22): a chain over the whole network, as Greater Manchester's lines really join it from
 * December 2026: contactless tap-in and tap-out (no queue for a ticket, TUNING.tapSave off every journey), the yellow on
 * stations and trains (the network's bus riders come: BEE_POOL), then one fare and a daily cap across bus and train
 * once a feeder runs (more again, and the change from the bus quicker: BEE_CHANGE). */
export const BEE: RouteStage = { id: 'bee', name: 'The Bee Network', prices: [30000, 80000, 150000], desc: 'Greater Manchester’s one network', max: 3,
  steps: [{ name: 'Contactless', desc: 'Tap in and tap out: no queue for a ticket, a minute off every journey' }, { name: 'The yellow', desc: 'Bee Network yellow on the stations and trains: the network’s bus riders come by train too' }, { name: 'One fare and a daily cap', desc: 'One ticket across bus and train: more come by bus, and the change is quicker' }] };
/** A bus route's stages (step 8): more buses, so it comes more often, then bus lanes past the queues. The share of the
 * trips along it the trains don't carry that it takes, at each (BUS_SHARE, BUS_LANES in src/sim/sim.ts). */
export const BUS_EVERY: RouteStage = { id: 'every', name: 'More buses', prices: [15000, 40000], desc: 'It comes more often: more take it', max: 2,
  steps: [{ name: 'Every six minutes', desc: 'More buses on the route: more take it' }, { name: 'Every four minutes', desc: 'A bus every few minutes: more again take it' }] };
export const BUS_LANES: RouteStage = { id: 'lanes', name: 'Bus lanes', prices: [60000], desc: 'Lanes of its own past the queues: quicker, so more take it', max: 1 };
/** The fleet (step 5): a train service's newer units (a fifth more seats a car, quicker away: NEW_SEATS, NEW_ACCEL in
 * src/sim/sim.ts), and the sidings' maintenance shed (half as many units failing: MAINT_FAILS). */
export const NEW_STOCK: RouteStage = { id: 'stock', name: 'Newer units', prices: [50000], desc: 'New trains on the service: a fifth more seats a car, and quicker away', max: 1 };
export const MAINT: RouteStage = { id: 'maint', name: 'Maintenance shed', prices: [40000], desc: 'A shed over two of the sidings: half as many units fail', max: 1 };
/** Which kind of place each of those stages is on. */
export const LINE_PLACE: Record<Exclude<LineUpgradeId, 'timetable'>, 'route' | 'depot'> = { units: 'route', cars: 'route', spare: 'depot' };

export const placeId = (kind: PlaceKind, name: string): string => `${kind}:${name}`;

/** A place as the network data gives it. station: the station's index (a station; the one a stop or depot stands by);
 * svc: a route's service; ends: a section's ends, as nodes (station or junction place ids), along `corridor`. */
export interface Place { id: string; kind: PlaceKind; name: string; station?: number; svc?: string; ends?: [string, string]; corridor?: string; stop?: StopDef; bus?: BusRouteDef; s0?: number; s1?: number }

/** Every place on a network, what touches what, and what comes with what. Built once a network (`places`). */
export class Places {
  all: Place[] = [];
  byId = new Map<string, Place>();
  /** Each station's place id, by station index. */
  station: string[];
  /** The stop by each station (none: null). */
  stopOf: (string | null)[];
  /** The main-line stopper's route, and the depot its spare unit stands in (Stockport's sidings). */
  stopper: string; sidings: string | null;
  /** The sections the stopper runs over, end to end. */
  stopperSections: string[] = [];
  /** Each station's neighbours along the lines, through junctions: the next station each way on each corridor. */
  near = new Map<string, string[]>();
  /** The sections and junctions at each node (a station or junction place id). */
  private at = new Map<string, string[]>();
  /** The line's own services: each route's place id, its stations, its home and the station it opens with. */
  private svcs: { id: string; route: number[]; home: number | null; opens: number | null }[];
  /** Where a contract can start (the network data's `starts`), the first the default; a network without any starts
   * from its first station open. */
  starts: StartDef[];
  /** The network as a place of its own: the Bee Network's stages (step 22). */
  bee = 'network:bee';
  private stationIndex = new Map<string, number>();

  constructor(net: Network) {
    const add = (p: Place) => { this.all.push(p); this.byId.set(p.id, p); return p.id; };
    this.station = net.stations.map(st => add({ id: placeId('station', st.id), kind: 'station', name: st.name, station: st.index }));
    for (const st of net.stations) this.stationIndex.set(st.id, st.index);
    this.starts = net.def.starts?.length ? net.def.starts : [{ id: 'open', name: net.stations[0]?.name ?? '', open: [this.station[0]!], offer: [], cash: 3000, clock: { day: 1, hour: 6.5 } }];
    // routes: the line's own services (the expresses run through from off the map and aren't the player's)
    const local = net.services().filter(v => !v.def.through);
    this.svcs = local.map(v => ({ id: add({ id: placeId('route', v.def.id), kind: 'route', name: v.def.name, svc: v.def.id }), route: v.route, home: v.home, opens: v.def.opens ? net.station(v.def.opens).index : null }));
    const first = local[0]; if (!first) throw new Error('network.json names no passenger service');
    this.stopper = placeId('route', first.def.id);
    this.stopOf = net.stations.map(() => null);
    for (const s of net.def.stops ?? []) { const i = net.station(s.station).index; this.stopOf[i] = add({ id: placeId('stop', s.id), kind: 'stop', name: s.name, station: i, stop: s }); }
    add({ id: this.bee, kind: 'network', name: 'The Bee Network' });
    for (const b of net.def.busRoutes ?? []) add({ id: placeId('bus', b.id), kind: 'bus', name: b.name, bus: b });
    const depots = (net.def.depots ?? []).map(d => add({ id: placeId('depot', d.id), kind: 'depot', name: d.name, station: net.station(d.station).index }));
    this.sidings = depots[0] ?? null;
    // the lines as a graph: along each corridor its stations and junctions in chainage order (a junction on the
    // corridor at its s, one it starts or ends at at that end); a section between each neighbouring pair
    for (const c of Object.values(net.corridors)) {
      const items: [number, string][] = net.stations.filter(st => st.corridor === c.id).map(st => [st.s, this.station[st.index]!]);
      for (const j of net.junctions) {
        const k = placeId('junction', j.id);
        if (j.corridor === c.id) items.push([j.s, k]);
        else if (net.def.corridors.find(d => d.id === c.id)?.from === j.id) items.push([c.start, k]);
        else if (net.def.corridors.find(d => d.id === c.id)?.to === j.id) items.push([c.end, k]);
      }
      items.sort((a, b) => a[0] - b[0]);
      const nodes = items.map(x => x[1]).filter((k, n, a) => a.indexOf(k) === n), sAt = (k: string) => items.find(x => x[1] === k)![0];
      for (let n = 0; n + 1 < nodes.length; n++) {
        const a = nodes[n]!, b = nodes[n + 1]!, id = `section:${c.id}:${a.split(':')[1]}${a.startsWith('junction') ? '-junction' : ''}:${b.split(':')[1]}${b.startsWith('junction') ? '-junction' : ''}`;
        const ends = (k: string) => this.byId.get(k)?.name ?? net.junction(k.slice('junction:'.length)).name;
        add({ id, kind: 'section', name: `${ends(a)} – ${ends(b)}`, ends: [a, b], corridor: c.id, s0: sAt(a), s1: sAt(b) });
        for (const k of [a, b]) { const l = this.at.get(k) ?? []; l.push(id); this.at.set(k, l); }
      }
    }
    for (const j of net.junctions) { const k = placeId('junction', j.id); if (this.at.has(k)) add({ id: k, kind: 'junction', name: j.name }); }
    // the stopper's sections: on the corridors its route runs along, between its end stations
    { const path = net.route(first.def), ends = first.route.map(i => net.stations[i]!.s), lo = Math.min(...ends), hi = Math.max(...ends);
      this.stopperSections = this.all.filter(p => p.kind === 'section' && path.uses(p.corridor!) && p.s0! >= lo - 1 && p.s1! <= hi + 1).map(p => p.id); }
    // each station's neighbours: the first station along each section from it, walking on through junctions
    for (const s of this.station) this.near.set(s, this.beyond(s, null));
  }
  /** The stations reached from node k along its sections (not `from`), walking on through junctions: the first each way. */
  beyond(k: string, from: string | null): string[] {
    const out: string[] = [], seen = new Set([k]), walk = (node: string, skip: string | null) => {
      for (const e of this.at.get(node) ?? []) {
        if (e === skip) continue;
        const [a, b] = this.byId.get(e)!.ends!, o = a === node ? b : a;
        if (seen.has(o)) continue; seen.add(o);
        if (o.startsWith('station:')) out.push(o); else walk(o, e);
      }
    };
    walk(k, from); return out;
  }
  /** A start by id, or the first (the first game's) when there's no such start. */
  startOf(id?: string): StartDef { return this.starts.find(x => x.id === id) ?? this.starts[0]!; }
  /** Where a service of this run's start stands held (a station index), while that station is shut: not yet owned. */
  heldAt(g: GameState, route: string): number | null {
    const at = this.startOf(g.start).held?.[route], i = at === undefined ? undefined : this.stationIndex.get(at);
    return i === undefined || this.station[i]! in g.places ? null : i;
  }
  /** Whether station i is one this run's start holds a service at, still shut: nothing calls there, not even an express. */
  shut(g: GameState, i: number): boolean {
    const h = this.startOf(g.start).held; if (!h) return false;
    return !(this.station[i]! in g.places) && Object.values(h).some(at => this.stationIndex.get(at) === i);
  }
  /** Whether the player owns no station yet: the start's `offer` is what's offered. */
  none(g: GameState): boolean { return !this.station.some(k => k in g.places); }
  get(id: string): Place { const p = this.byId.get(id); if (!p) throw new Error(`no place "${id}"`); return p; }

  /** Whether the player owns a place: a station or stop once bought; a route once it runs (the stopper from the start,
   * or once the station the start holds it at reopens; a branch once a station beyond its home is owned, one that
   * opens with a station once that is); a depot with its station; a section once each end is owned (a junction end: a
   * station beyond it is); a junction with any section through it. */
  owns(g: GameState, id: string): boolean {
    if (id in g.places) return true;
    const p = this.byId.get(id); if (!p) return false;
    switch (p.kind) {
      case 'station': case 'stop': case 'network': case 'bus': return false;
      case 'depot': return this.owns(g, this.station[p.station!]!);
      case 'route': {
        const v = this.svcs.find(x => x.id === id)!; if (this.heldAt(g, id) !== null) return false;
        if (v.home === null) return true;
        if (v.opens !== null && !g.places[this.station[v.opens]!]) return false;
        const k = v.route.indexOf(v.home), has = (n: number) => { const i = v.route[n]; return i !== undefined && !!g.places[this.station[i]!]; };
        return has(k - 1) || has(k + 1);
      }
      case 'section': return p.ends!.every(k => k.startsWith('station:') ? k in g.places : this.beyond(k, p.id).some(s => s in g.places));
      case 'junction': return (this.at.get(id) ?? []).some(e => this.owns(g, e));
    }
  }
  /** The places that touch a place (docs/design/buying.md, Touching): a station its neighbours, its sections, the
   * routes calling there, the stop and depot by it; a section its ends and the sections and routes through them; a
   * route its stations; a stop or depot its station. */
  touching(id: string): string[] {
    const p = this.get(id), out = new Set<string>();
    if (p.kind === 'station') {
      for (const s of this.near.get(id) ?? []) out.add(s);
      for (const e of this.at.get(id) ?? []) out.add(e);
      for (const v of this.svcs) if (v.route.includes(p.station!)) out.add(v.id);
      for (const q of this.all) if ((q.kind === 'stop' || q.kind === 'depot') && q.station === p.station) out.add(q.id);
    } else if (p.kind === 'section') {
      for (const k of p.ends!) { if (this.byId.has(k)) out.add(k); for (const e of this.at.get(k) ?? []) if (e !== id) out.add(e); }
    } else if (p.kind === 'junction') for (const e of this.at.get(id) ?? []) out.add(e);
    else if (p.kind === 'route') for (const i of this.svcs.find(x => x.id === id)!.route) out.add(this.station[i]!);
    else out.add(this.station[p.station!]!);
    return [...out];
  }
  /** Whether a place the player can buy (a station or a stop) touches one they own (with nothing owned, whether the
   * start offers it): a station a neighbouring station
   * (the services running on past it don't count: owning a station offers the next, not the whole line), a stop its
   * station. Its needs aren't counted here (`waits`). */
  touches(g: GameState, id: string): boolean {
    const p = this.get(id);
    if (p.kind === 'station') return this.none(g) ? this.startOf(g.start).offer.includes(id) : (this.near.get(id) ?? []).some(s => s in g.places);
    if (p.kind === 'stop') return this.station[p.station!]! in g.places;
    return false;
  }
  /** What a station really needs built elsewhere before it can be bought, while that isn't built. */
  waits(g: GameState, net: Network, id: string): { station: number; upgrade: UpgradeId } | null {
    const p = this.get(id); if (p.kind !== 'station') return null;
    const n = net.stations[p.station!]?.needs; if (!n) return null;
    const i = net.station(n.station).index;
    // through the station's stages as the sim reads them, so a need for its bus link (the stop by it) counts too
    return g.ups?.[i]?.[n.upgrade as UpgradeId] ? null : { station: i, upgrade: n.upgrade as UpgradeId };
  }
  /** The places offered now: not owned, touching one that is, and with what they need built. */
  offered(g: GameState, net: Network): string[] {
    return this.all.filter(p => (p.kind === 'station' || p.kind === 'stop') && !(p.id in g.places) && this.touches(g, p.id) && !this.waits(g, net, p.id)).map(p => p.id);
  }
  /** The stages a place grows through: a station those its `grow` lists and the everyday ones; the stopper its units,
   * longer trains; the sidings the spare unit. A section's line speed is the sim's (Sim.sectionAt); junctions get
   * theirs with the line between stations, stops theirs with buses as a network. */
  stagesFor(net: Network, id: string): (Upgrade | LineUpgrade | RouteStage)[] {
    const p = this.get(id);
    if (p.kind === 'station') { const grow = net.stations[p.station!]?.grow; return UPGRADES.filter(u => !u.stop && (!u.stage || !!grow?.[u.id as StageId])); }
    if (p.kind === 'route') {
      const def = net.def.services?.find(v => v.id === p.svc), f = def && frequencyStage(def);
      const own = id === this.stopper ? LINE_UPGRADES.filter(u => LINE_PLACE[u.id as keyof typeof LINE_PLACE] === 'route') : [];
      const m = def?.manchester, through: RouteStage[] = m ? [{ id: 'through', name: m.name, prices: [m.price], desc: m.desc, max: 1 }] : [];
      return [...(f ? [f, ...own.filter(u => u.id !== 'units')] : own), ...through, NEW_STOCK];
    }
    if (id === this.sidings) return [...LINE_UPGRADES.filter(u => LINE_PLACE[u.id as keyof typeof LINE_PLACE] === 'depot'), MAINT];
    if (p.kind === 'stop') return [...(p.stop?.kind === 'bus-stop' ? [SHELTER] : []), ...(p.stop?.feeder ? [FEEDER] : [])];
    if (p.kind === 'network') return [BEE];
    if (p.kind === 'bus') return [BUS_EVERY, BUS_LANES];
    return [];
  }
}

const cache = new WeakMap<Network, Places>();
/** A network's places, worked out once. */
export function places(net: Network): Places { let P = cache.get(net); if (!P) { P = new Places(net); cache.set(net, P); } return P; }

/** Record a buy in the saved game: a place bought (owned as it first stands), or one more of its stage built. */
export function build(g: GameState, id: string, stage?: string): void {
  const r = g.places[id] ??= {};
  if (stage !== undefined) r[stage] = (r[stage] ?? 0) + 1;
}

/** Work out, from `places`, what the rest of the sim and the view read (GameState.owned, ups and line), as fixed
 * values that aren't saved: each station owned, its stages built (the kiosk with the booking office) and `bus` once the stop by it is, and the
 * stopper's and
 * the sidings' stages. Called whenever `places` changes. */
export function derive(g: GameState, P: Places): GameState {
  const owned = Object.freeze(P.station.map(id => id in g.places));
  const ups = Object.freeze(P.station.map((id, i) => {
    const r = g.places[id], o: Partial<Record<UpgradeId, boolean>> = {};
    if (r) for (const k in r) if (r[k]) o[k as UpgradeId] = true;
    if (o.building) o.kiosk = true;
    // the Bee Network's look at every station owned (step 22): its tap-in posts, then its yellow
    const bee = g.places[P.bee]?.['bee'] ?? 0; if (r && bee >= 1) o.bee1 = true; if (r && bee >= 2) o.bee2 = true;
    const s = P.stopOf[i]; if (s && s in g.places) o.bus = true;
    // its bus stop's shelter, then its live times (step 12)
    const sh = s ? g.places[s]?.['shelter'] ?? 0 : 0; if (sh >= 1) o.shelter = true; if (sh >= 2) o.liveinfo = true;
    // the sidings' maintenance shed, drawn in its station's kit
    if (P.sidings && P.byId.get(P.sidings)?.station === i && (g.places[P.sidings]?.['maint'] ?? 0) > 0) o.maint = true;
    return Object.freeze(o);
  }));
  const R = g.places[P.stopper] ?? {}, D = (P.sidings ? g.places[P.sidings] : undefined) ?? {};
  // the faster timetable's recovery and resistance to leaves (src/sim/sim.ts, weather) once every section the stopper
  // runs has had its line speed raised; its new signals are each section's resignalling now
  const timetable = P.stopperSections.length && P.stopperSections.every(k => (g.places[k]?.['speed'] ?? 0) > 0) ? 1 : 0;
  const line = Object.freeze({ units: R['units'] ?? 0, cars: R['cars'] ?? 0, timetable, spare: D['spare'] ?? 0 });
  for (const [k, value] of [['owned', owned], ['ups', ups], ['line', line]] as const) Object.defineProperty(g, k, { value, enumerable: false, configurable: true, writable: false });
  return g;
}
