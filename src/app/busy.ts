// The busy save, the heavy case the perf check measures and the stats view (?stats&save=busy) opens: five stations
// owned with every upgrade, the line's units, cars and spare bought, every section raised, resignalled and wired, every
// junction flying, homes grown, the morning peak of day 2, rain. One builder, so the check and a real phone measure
// the same game.
import { Sim, UPGRADES, LINE_UPGRADES } from '../sim/sim.ts';
import { simAtHour } from '../sim/day.ts';
import type { Network } from '../sim/network.ts';

/** The busy save as the device keeps it, `{g, selected}` as JSON, built afresh from the network and seed 1. */
export function busySave(net: Network): string {
  const sim = new Sim(net, Sim.fresh(net, 1));
  for (let i = 0; i < Math.min(5, net.stations.length); i++) {
    sim.grant(sim.P.station[i]!); for (const u of UPGRADES.filter(u => sim.offered(i, u))) { const [id, stage] = sim.upgradePlace(i, u.id)!; sim.grant(id, stage); } sim.g.homes[i] = sim.ceiling(i);
  }
  for (const u of LINE_UPGRADES) while (sim.g.line[u.id] < u.max) sim.grant(sim.linePlace(u.id) as string, u.id);   // the timetable has no place of its own, as the check always granted it
  for (const x of sim.secs) { for (let k = 0; k < x.steps; k++) sim.grant(x.id, 'speed'); sim.grant(x.id, 'signals'); if (!x.wired) sim.grant(x.id, 'wires'); }
  for (const j of net.junctions) sim.grant(`junction:${j.id}`, 'flyover');
  sim.advance(1200);
  const t = simAtHour(2, 8);
  sim.g.t = t; sim.g.day = 2;
  sim.g.weather = { ...sim.g.weather, now: 'rain', was: 'rain', since: t - 2000, until: t + 6000 };
  return JSON.stringify({ g: sim.g, selected: 0 });
}
