// The Commute: station tycoon simulation. Pure JS, tick-based in game seconds, no rendering here.
// Trains move along a corridor by distance s (metres, increasing towards Manchester). Stations are at a known s.

export const UPGRADES = [
  { id: 'kiosk', name: 'Kiosk', price: 1500, desc: '+£0.35 per boarding passenger' },
  { id: 'barriers', name: 'Ticket barriers', price: 4000, desc: 'Collect every fare (82% without)' },
  { id: 'canopy', name: 'Canopy', price: 2500, desc: 'Passengers wait 45 min instead of 25' },
  { id: 'lifts', name: 'Footbridge lifts', price: 6000, desc: '+25% catchment' },
  { id: 'extend', name: 'Platform extension', price: 5000, desc: 'Platform holds 320 instead of 150' },
  { id: 'retail', name: null, price: 9000, desc: '+£0.80 per boarding passenger' },
];
export const LINE_UPGRADES = [
  { id: 'units', name: 'Extra unit', prices: [6000, 20000, 50000], desc: 'One more train in service', max: 3 },
  { id: 'cars', name: 'Longer trains', prices: [12000, 40000], desc: '+2 cars per unit', max: 2 },
  { id: 'timetable', name: 'Faster timetable', prices: [20000], desc: 'Line speed 75 → 90 mph', max: 1 },
];

export const TUNING = {
  fareBase: 1.5, farePerMile: 0.6, fareMult: 2.0,
  seatsPerCar: 75, accel: 1.0, brake: 1.1, vmax: 33.5, vmaxFast: 40,
  dwell: 45, turnaround: 300,
  patience: 25 * 60, patienceCanopy: 45 * 60, platformCap: 150, platformCapExtended: 320,
  collectNoBarriers: 0.82, liftsBonus: 1.25, kioskPerPax: 0.35, retailPerPax: 0.8,
};

export function demandCurve(h) {
  // share of catchment per hour by hour of day: morning peak to Manchester, evening peak home, quiet nights
  const g = (c, s) => Math.exp(-((h - c) * (h - c)) / (2 * s * s));
  let v = 0.12 + 1.0 * g(8, 1.2) + 0.85 * g(17.5, 1.5) + 0.25 * g(12.5, 2);
  if (h < 5.5) v *= Math.max(0, (h - 4) / 1.5);
  if (h > 23) v *= Math.max(0, 24 - h);
  return v;
}

export class Sim {
  constructor(network, state) {
    this.net = network;
    this.S = network.stations;              // [{ id, name, s, miles, catchment, price, retail, index }]
    this.g = state || Sim.fresh(network);
    this.first = 0; this.last = this.S.length - 1;
  }
  static fresh(network) {
    return {
      v: 1, t: 6.5 * 3600, day: 1, cash: 3000, earned: 0,
      owned: network.stations.map((_, i) => i === 0),
      ups: network.stations.map(() => ({})),
      line: { units: 0, cars: 0, timetable: 0 },
      st: network.stations.map(() => ({ acc: 0, q: [[], []], waiting: 0, boarded: 0, revenue: 0, lost: 0 })),
      trains: [],
      stats: { boarded: 0, lost: 0 },
    };
  }

  // ---- derived ----
  fare(a, b) { return (TUNING.fareBase + TUNING.farePerMile * Math.abs(this.S[a].miles - this.S[b].miles)) * TUNING.fareMult; }
  unitsInService() { return 1 + this.g.line.units; }
  carsPerUnit() { return 2 + 2 * this.g.line.cars; }
  vmax() { return this.g.line.timetable ? TUNING.vmaxFast : TUNING.vmax; }
  patience(i) { return this.g.ups[i].canopy ? TUNING.patienceCanopy : TUNING.patience; }
  capacity(i) { return this.g.ups[i].extend ? TUNING.platformCapExtended : TUNING.platformCap; }
  hour() { return (this.g.t / 3600) % 24; }
  clock() { const s = Math.floor(this.g.t % 86400); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}`; }
  isTerminus(i) { return i === this.first || i === this.last; }
  reachable(i) { return this.g.owned[i] || this.isTerminus(i); }

  // ---- trains ----
  ensureTrains() {
    const g = this.g, n = this.unitsInService(), s0 = this.S[this.first].s, s1 = this.S[this.last].s;
    while (g.trains.length < n) {
      const k = g.trains.length;
      g.trains.push({ id: k, dir: k % 2 === 0 ? 1 : -1, s: s0 + (s1 - s0) * ((k + 0.5) / n), v: 0, state: 'run', dwell: 0, next: null, load: this.S.map(() => 0), onboard: 0, cars: this.carsPerUnit() });
    }
    for (const tr of g.trains) tr.cars = this.carsPerUnit();
  }
  nextStop(tr) {
    // next reachable station in the direction of travel (dir +1 = towards Manchester, increasing s)
    if (tr.dir > 0) { for (let i = 0; i < this.S.length; i++) if (this.S[i].s > tr.s + 1 && this.reachable(i)) return i; return this.last; }
    for (let i = this.S.length - 1; i >= 0; i--) if (this.S[i].s < tr.s - 1 && this.reachable(i)) return i;
    return this.first;
  }
  callAt(tr, i) {
    const g = this.g, S = g.st[i];
    tr.onboard -= tr.load[i]; tr.load[i] = 0;
    const q = S.q[tr.dir > 0 ? 0 : 1];
    let room = tr.cars * TUNING.seatsPerCar - tr.onboard;
    const collect = g.ups[i].barriers ? 1 : TUNING.collectNoBarriers;
    const retail = (g.ups[i].kiosk ? TUNING.kioskPerPax : 0) + (g.ups[i].retail ? TUNING.retailPerPax : 0);
    while (q.length && room > 0) {
      const c = q[0], n = Math.min(c.n, room);
      c.n -= n; room -= n; S.waiting -= n; tr.onboard += n; tr.load[c.dest] += n;
      if (g.owned[i]) { const rev = n * (this.fare(i, c.dest) * collect + retail); g.cash += rev; g.earned += rev; S.revenue += rev; }
      S.boarded += n; g.stats.boarded += n;
      if (c.n <= 0) q.shift();
    }
  }
  stepTrain(tr, dt) {
    if (tr.state === 'dwell') { tr.dwell -= dt; if (tr.dwell <= 0) { tr.state = 'run'; tr.next = null; } return; }
    if (tr.next === null) tr.next = this.nextStop(tr);
    const target = this.S[tr.next].s, rem = Math.abs(target - tr.s), last = this.isTerminus(tr.next);
    tr.v = Math.min(this.vmax(), tr.v + TUNING.accel * dt);
    tr.v = Math.max(0.5, Math.min(tr.v, Math.sqrt(2 * TUNING.brake * Math.max(rem, 0))));
    const step = tr.v * dt;
    if (step >= rem) {
      tr.s = target; tr.v = 0;
      if (last) tr.dir = -tr.dir;                    // reverse first so boarding uses the departure direction
      this.callAt(tr, tr.next);
      tr.state = 'dwell'; tr.dwell = last ? TUNING.turnaround : TUNING.dwell;
    } else tr.s += tr.dir * step;
  }

  // ---- passengers ----
  generate(i, dt) {
    const g = this.g, st = this.S[i], S = g.st[i], h = this.hour();
    const rate = st.catchment * demandCurve(h) * (g.ups[i].lifts ? TUNING.liftsBonus : 1) / 3600;
    S.acc += rate * dt;
    const n = Math.floor(S.acc); if (n <= 0) return;
    S.acc -= n;
    const toMcr = i === this.last ? 0 : i === this.first ? 1 : (h < 12 ? 0.8 : 0.35);
    const nN = Math.round(n * toMcr), nS = n - nN;
    this.enqueue(i, 0, nN); this.enqueue(i, 1, nS);
  }
  enqueue(i, dirIdx, count) {
    if (count <= 0) return;
    const g = this.g, S = g.st[i], cap = this.capacity(i);
    const room = Math.max(0, cap - S.waiting), take = Math.min(room, count);
    S.lost += count - take; g.stats.lost += count - take;
    if (take <= 0) return;
    const cands = [];
    for (let j = 0; j < this.S.length; j++) { if (j === i) continue; const north = j > i; if ((dirIdx === 0 ? north : !north) && this.reachable(j)) cands.push(j); }
    if (!cands.length) return;
    const w = cands.map(j => this.S[j].catchment + 50), tot = w.reduce((a, b) => a + b, 0);
    let r = this.rand() * tot, dest = cands[0];
    for (let k = 0; k < cands.length; k++) { r -= w[k]; if (r <= 0) { dest = cands[k]; break; } }
    S.q[dirIdx].push({ t: g.t, dest, n: take }); S.waiting += take;
  }
  expire(i) {
    const g = this.g, S = g.st[i], p = this.patience(i);
    for (const q of S.q) while (q.length && g.t - q[0].t > p) { const c = q.shift(); S.waiting -= c.n; S.lost += c.n; g.stats.lost += c.n; }
  }
  rand() { return Math.random(); }

  // ---- stepping ----
  step(dt) {
    const g = this.g; this.ensureTrains();
    const d0 = Math.floor(g.t / 86400); g.t += dt; if (Math.floor(g.t / 86400) > d0) g.day++;
    for (let i = 0; i < this.S.length; i++) { if (!g.owned[i]) continue; this.generate(i, dt); this.expire(i); }
    for (const tr of g.trains) this.stepTrain(tr, dt);
  }
  advance(gameSeconds, maxStep = 2) { let left = gameSeconds; while (left > 0) { const d = Math.min(maxStep, left); this.step(d); left -= d; } }

  // ---- actions ----
  canBuyStation(i) { const g = this.g; return !g.owned[i] && g.cash >= this.S[i].price && (i === 0 || g.owned[i - 1]); }
  buyStation(i) { if (!this.canBuyStation(i)) return false; this.g.cash -= this.S[i].price; this.g.owned[i] = true; return true; }
  buyUpgrade(i, id) { const u = UPGRADES.find(u => u.id === id), g = this.g; if (!u || !g.owned[i] || g.ups[i][id] || g.cash < u.price) return false; g.cash -= u.price; g.ups[i][id] = true; return true; }
  buyLine(id) { const u = LINE_UPGRADES.find(u => u.id === id), g = this.g; if (!u) return false; const lvl = g.line[id]; if (lvl >= u.max || g.cash < u.prices[lvl]) return false; g.cash -= u.prices[lvl]; g.line[id]++; this.ensureTrains(); return true; }
}
