#!/usr/bin/env node
// Census 2021 homes and draw for each station in src/data/network.json (docs/DESIGN.md, Journeys).
//
// 1. Get the raw data (kept in data/raw/, which is git-ignored), or skip this and run from the extract:
//
//      node tools/census-to-network.mjs --fetch
//
//    It downloads, from hosts that answer from a session:
//      - TS001, usual residents by Output Area (Nomis bulk download, census2021-ts001.zip)
//      - WP001, workplace population by Output Area (Nomis bulk download, wp001.zip)
//      - Output Areas' population-weighted centroids, December 2021 (the ONS Open Geography Portal's
//        OA_December_2021_EW_PWC_V4 feature service), within the box below
//      - every National Rail station with its position (NaPTAN, the DfT's stop list, area 910)
//    and writes data/census/extract.json: each Output Area within reach of a station on the line (code, lat, lon,
//    residents, workers) and every rail station near them, so the rest runs offline.
//
// 2. Run:  node tools/census-to-network.mjs [--dry]
//
//    It reads the extract, works out each station's homes and draw, and writes `catchment` and `draw` and a note of
//    the source into src/data/network.json (only those fields; --dry prints them and writes nothing).
//
//    - Homes: each Output Area's residents go to the station whose door-to-door trip into Manchester is best, walking
//      there (felt at twice riding, as the journeys weigh it) and riding on (the straight line to Piccadilly at an
//      average 15 m/s), counting every real station, on the line or not, so Reddish, Gorton or Mauldeth Road take
//      their own. An area further than a walk (WALK_MAX) from every station takes the bus to Stockport if it's within
//      BUS_MAX of it: Stockport's bus station stands beside it, and the town's buses meet its trains, which is most of
//      why it's so much busier than the stations up the line; anywhere else beyond a walk takes no train until the
//      player builds a car park or a bus link (the pools, below).
//    - Pools (car parks and bus links, docs/DESIGN.md): the rest of the areas beyond a walk of every station. Of an
//      area's residents, DRIVE_SHARE drive, to the nearest of the line's stations within DRIVE_MAX (past a smaller
//      station on another line, for the line's trains and a space) that's nearer Manchester than they are and at least
//      DRIVE_OUT from it (Piccadilly's, the city's drivers going out, within DRIVE_CITY), and the rest take the bus, to the nearest station within BUS_STOP, or else to
//      Stockport's Interchange within BUS_WIDE; each only where that station is the line's (Piccadilly is where they're
//      going, so it has none). So each resident is counted once, at one station. Each pool's time is its residents' mean
//      straight line times ROAD at DRIVE_SPEED or BUS_SPEED, and its reach (for the map's outer ring) the distance
//      within which nine in ten of them live. Stockport's busShare is the share of its homes that come by bus today
//      (the hub's areas over all of its own), whose bus leg the Interchange makes quicker.
//    - Draw: each Output Area's workers go to the station nearest on foot, within a shorter walk (WORK_WALK): people
//      getting off walk to work. Until phase 6 brings Oxford Road, Deansgate, Victoria and Salford Central, Piccadilly
//      stands for the whole city centre, so their areas (homes and work) count as its own.
//      The census was taken in March 2021, in lockdown: people working from home were counted at home, so the city
//      centre's jobs are understated against a normal year.
//    - Ceiling: how many homes the station's land could hold as the line brings it within reach (homes that grow,
//      docs/DESIGN.md): its homes now, and ROOM times as many again as live within a walk of it (WALK_MAX, every area
//      whichever station it takes now): infill, flats on old yards, new estates. The sim grows each station's homes
//      towards it.
//    - Scale: real counts are far larger than the game's, so homes are multiplied by one factor that keeps the
//      opening where it was (Stockport's morning trips to Piccadilly, as the old guesses gave them), and
//      draw by one that keeps Piccadilly's (the sim only uses draw over Piccadilly's, so that one is for the panels).
//
// Contains Office for National Statistics data © Crown copyright and database right 2021 (Open Government Licence);
// NaPTAN, Department for Transport, Open Government Licence.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = join(root, 'data/raw'), extractFile = join(root, 'data/census/extract.json'), netFile = join(root, 'src/data/network.json');
const args = process.argv.slice(2);

const BOX = [-2.36, 53.31, -2.02, 53.52];       // west, south, east, north: the line and a short drive round it
const REACH = 2500;                              // metres from a station on the line that an area is kept in the extract
const WALK_MAX = 1500, WORK_WALK = 1000;         // metres on foot (straight line times DETOUR) from home to a station, and on to work
const BUS_MAX = 5000, BUS_HUBS = ['stockport'];  // metres (straight line) by bus to a station with a bus station beside it
const DETOUR = 1.25, WALK = 1.33, RIDE = 15, WALK_WEIGHT = 2;   // streets aren't straight; m/s on foot and on the train
const ROOM = 0.5;
// the pools: metres (straight line) to the station, the road's detour, and speeds in m/s door to door (town traffic;
// a bus with its stops); DRIVE_SHARE of those beyond a walk who'd take the train drive to it, the rest the bus (a game
// choice: about how the A6's park and ride and buses split, not survey)
const DRIVE_MAX = 8000, DRIVE_OUT = 4000, DRIVE_CITY = 3000, BUS_STOP = 3000, BUS_WIDE = 7000, ROAD = 1.3, DRIVE_SPEED = 8, BUS_SPEED = 5, DRIVE_SHARE = 0.5;                                 // a walk's land could hold half as many homes again as it does
const DATE = '12 October 2026';
// the game's scale: Piccadilly's draw as it was (the sim only uses draw over Piccadilly's), and Stockport's morning trips
// to Piccadilly as they were with the old guesses (catchment 900 and draw 1400 at Stockport, 2200 and 6000 at
// Piccadilly; 0.8 of them from home, TUNING.amOut), so the opening and its first morning's peak hold
const PICCADILLY_DRAW = 6000, OUT = 0.8, OPENING = OUT * 900 + (1 - OUT) * 1400 * 2200 / 6000;

const dist = (a, b) => { const kx = 111320 * Math.cos(a.lat * Math.PI / 180); return Math.hypot((a.lon - b.lon) * kx, (a.lat - b.lat) * 111320); };

/** The files in a zip, by name, as text: enough of the format for the census's bulk downloads. */
function unzip(buf) {
  let e = buf.length - 22; while (e >= 0 && buf.readUInt32LE(e) !== 0x06054b50) e--;
  if (e < 0) throw new Error('not a zip');
  const out = {}, n = buf.readUInt16LE(e + 10); let p = buf.readUInt32LE(e + 16);
  for (let k = 0; k < n; k++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20), nameLen = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30), comment = buf.readUInt16LE(p + 32), at = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28), data = buf.subarray(start, start + size);
    out[name] = (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    p += 46 + nameLen + extra + comment;
  }
  return out;
}

/** CSV rows as arrays (quoted fields, no newlines inside them: the census's and NaPTAN's files). */
const csv = text => text.trim().split(/\r?\n/).map(l => [...l.matchAll(/("([^"]*)"|[^,]*)(,|$)/g)].slice(0, -1).map(m => m[2] ?? m[1]));

async function get(url, file) {
  const res = await fetch(url); if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer()); writeFileSync(join(raw, file), buf); console.log(`fetched ${file} (${buf.length} bytes)`); return buf;
}

async function fetchRaw() {
  mkdirSync(raw, { recursive: true });
  const ts = existsSync(join(raw, 'census2021-ts001.zip')) ? readFileSync(join(raw, 'census2021-ts001.zip')) : await get('https://www.nomisweb.co.uk/output/census/2021/census2021-ts001.zip', 'census2021-ts001.zip');
  const wp = existsSync(join(raw, 'wp001.zip')) ? readFileSync(join(raw, 'wp001.zip')) : await get('https://www.nomisweb.co.uk/output/census/2021/wp001.zip', 'wp001.zip');
  const rail = existsSync(join(raw, 'naptan-910.csv')) ? readFileSync(join(raw, 'naptan-910.csv')) : await get('https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv&atcoAreaCodes=910', 'naptan-910.csv');
  // the centroids, a page at a time
  const pwc = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/OA_December_2021_EW_PWC_V4/FeatureServer/0/query';
  const at = new Map();
  for (let off = 0; ; off += 2000) {
    const q = new URLSearchParams({ where: '1=1', geometry: BOX.join(','), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: 'OA21CD', outSR: '4326', resultOffset: String(off), resultRecordCount: '2000', f: 'json' });
    const res = await fetch(`${pwc}?${q}`); if (!res.ok) throw new Error(`centroids: ${res.status}`);
    const d = await res.json(); for (const f of d.features) at.set(f.attributes.OA21CD, { lat: +f.geometry.y.toFixed(5), lon: +f.geometry.x.toFixed(5) });
    if (!d.exceededTransferLimit) break;
  }
  writeFileSync(join(raw, 'oa-pwc.json'), JSON.stringify(Object.fromEntries(at))); console.log(`fetched ${at.size} centroids`);

  const residents = new Map(), workers = new Map();
  const tsCsv = csv(Object.entries(unzip(ts)).find(([n]) => n.endsWith('-oa.csv'))[1]);
  for (const r of tsCsv.slice(1)) residents.set(r[2], +r[3]);
  const wpCsv = csv(Object.entries(unzip(wp)).find(([n]) => /_oa\.csv$/.test(n))[1]);
  for (const r of wpCsv.slice(1)) workers.set(r[0], +r[1]);

  const head = csv(rail.toString('utf8').split('\n', 1)[0])[0], rows = csv(rail.toString('utf8')).slice(1), col = n => head.indexOf(n);
  const stations = rows.filter(r => r[col('StopType')] === 'RLY' && r[col('Status')] === 'active')
    .map(r => ({ name: r[col('CommonName')].replace(/ Rail Station$/, ''), lat: +(+r[col('Latitude')]).toFixed(5), lon: +(+r[col('Longitude')]).toFixed(5) }))
    .filter(s => s.lon >= BOX[0] - 0.05 && s.lon <= BOX[2] + 0.05 && s.lat >= BOX[1] - 0.03 && s.lat <= BOX[3] + 0.03);

  const line = JSON.parse(readFileSync(netFile, 'utf8')).stations;
  const areas = [...at].filter(([, p]) => line.some(s => dist(s, p) <= (BUS_HUBS.includes(s.id) ? BUS_WIDE : DRIVE_MAX)))
    .map(([code, p]) => [code, p.lat, p.lon, residents.get(code) ?? 0, workers.get(code) ?? 0]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  mkdirSync(dirname(extractFile), { recursive: true });
  const extract = {
    note: `Census 2021 for the Output Areas within ${DRIVE_MAX} m of a station on the line (${BUS_WIDE} m of Stockport), and the National Rail stations round them, from tools/census-to-network.mjs --fetch on ${DATE}: TS001 (usual residents) and WP001 (workplace population) from Nomis, population-weighted centroids from the ONS Open Geography Portal (OA_December_2021_EW_PWC_V4), stations from NaPTAN. Contains Office for National Statistics data © Crown copyright and database right 2021; contains NaPTAN data, Department for Transport; both Open Government Licence v3.0.`,
    areas: { columns: ['code', 'lat', 'lon', 'residents', 'workers'], rows: areas },
    stations,
  };
  writeFileSync(extractFile, JSON.stringify(extract).replace(/\],\[/g, '],\n[') + '\n');
  console.log(`wrote ${extractFile}: ${areas.length} areas, ${stations.length} stations`);
}

if (args.includes('--fetch')) await fetchRaw();

// ---- from the extract to the network ----
const ex = JSON.parse(readFileSync(extractFile, 'utf8'));
const net = JSON.parse(readFileSync(netFile, 'utf8')), line = net.stations;
// every real station, the line's own by their id (matched to NaPTAN's by position: the nearest within 300 m), and the
// city centre's others as Piccadilly, which stands for the city until phase 6 brings them (docs/ROADMAP.md)
const CITY = ['Manchester Oxford Road', 'Deansgate', 'Manchester Victoria', 'Salford Central'];
const all = ex.stations.map(s => ({ ...s, id: CITY.includes(s.name) ? 'piccadilly' : null }));
for (const s of line) {
  const near = all.filter(o => dist(o, s) < 300).sort((a, b) => dist(a, s) - dist(b, s))[0];
  if (near) near.id = s.id; else all.push({ name: s.name, lat: s.lat, lon: s.lon, id: s.id });
}
const picc = line.find(s => s.id === 'piccadilly');
const sum = Object.fromEntries(line.map(s => [s.id, { homes: 0, work: 0, walk: 0, hub: 0, drive: [], bus: [] }]));
const lineAt = line.map(s => ({ id: s.id, lat: s.lat, lon: s.lon }));
for (const [, lat, lon, residents, workers] of ex.areas.rows) {
  const p = { lat, lon };
  // homes, draw and the walk from the areas near the line, as before the pools widened the extract
  const near = lineAt.some(s => dist(s, p) <= (BUS_HUBS.includes(s.id) ? BUS_MAX : REACH));
  if (near) for (const s of lineAt) if (DETOUR * dist(p, s) <= WALK_MAX) sum[s.id].walk += residents;
  let home = null, homeCost = Infinity, work = null, workWalk = Infinity;
  for (const s of all) {
    const walk = DETOUR * dist(p, s); if (walk > WALK_MAX) continue;
    const cost = WALK_WEIGHT * walk / WALK + (s.id === 'piccadilly' ? 0 : dist(s, picc) / RIDE);
    if (cost < homeCost) { homeCost = cost; home = s; }
    if (walk < workWalk) { workWalk = walk; work = s; }
  }
  // beyond a walk of every station, a bus to the hub within reach (Stockport's bus station, beside the station)
  const walked = !!home;
  if (!home) { home = all.find(s => BUS_HUBS.includes(s.id) && dist(p, s) <= BUS_MAX) ?? null; if (home?.id) sum[home.id].hub += residents; }
  if (home?.id && near) sum[home.id].homes += residents;
  // beyond a walk and the hub's buses: a pool, at one station only
  if (!walked && !home) {
    // drivers: to the nearest of the line's stations within a short drive (they'll pass a smaller station on another
    // line for the line's trains and a space), driving in towards Manchester, and only to a station at least DRIVE_OUT
    // from it (closer in, they'd drive the rest); Piccadilly's car park takes the city's own drivers going out, from
    // within DRIVE_CITY
    const car = lineAt.reduce((a, s) => (s.id === 'piccadilly' ? dist(p, s) <= DRIVE_CITY : dist(s, picc) >= DRIVE_OUT && dist(p, picc) > dist(s, picc) && dist(p, s) <= DRIVE_MAX) && (!a || dist(p, s) < dist(p, a)) ? s : a, null);
    if (car) sum[car.id].drive.push([dist(p, car), residents * DRIVE_SHARE]);
    // the rest: a bus to the nearest station, if it's the line's and near, or Stockport's Interchange further out
    const near = all.reduce((a, s) => !a || dist(p, s) < dist(p, a) ? s : a, null);
    const bus = near?.id && near.id !== 'piccadilly' && dist(p, near) <= BUS_STOP ? near : lineAt.find(s => BUS_HUBS.includes(s.id) && dist(p, s) <= BUS_WIDE);
    if (bus?.id) sum[bus.id].bus.push([dist(p, bus), residents * (1 - DRIVE_SHARE)]);
  }
  if (work?.id && workWalk <= WORK_WALK && near) sum[work.id].work += workers;
}

const old = Object.fromEntries(line.map(s => [s.id, { catchment: s.catchment, draw: s.draw }]));
const drawScale = PICCADILLY_DRAW / sum.piccadilly.work;
const homeScale = OPENING / (OUT * sum.stockport.homes + (1 - OUT) * sum.stockport.work / sum.piccadilly.work * sum.piccadilly.homes);
const round = v => v >= 100 ? Math.round(v / 10) * 10 : Math.max(1, Math.round(v));
/** A pool's homes on the game's scale, its time door to the station (seconds) at a speed, and the distance nine in ten
 * of its residents live within (metres). */
function pool(list, speed) {
  const n = list.reduce((a, [, r]) => a + r, 0); if (!n) return null;
  const sorted = [...list].sort((a, b) => a[0] - b[0]); let acc = 0, r90 = 0;
  for (const [d, r] of sorted) { acc += r; r90 = d; if (acc >= 0.9 * n) break; }
  const time = Math.round(list.reduce((a, [d, r]) => a + d * r, 0) / n * ROAD / speed);
  return { homes: round(n * homeScale), residents: Math.round(n), time, r: Math.round(r90 / 10) * 10 };
}
const out = line.map(s => {
  const P = sum[s.id], catchment = round(P.homes * homeScale), drive = pool(P.drive, DRIVE_SPEED), bus = pool(P.bus, BUS_SPEED);
  const access = { drive: drive?.homes ?? 0, driveTime: drive?.time ?? 0, driveR: drive?.r ?? 0, bus: bus?.homes ?? 0, busTime: bus?.time ?? 0, busR: bus?.r ?? 0, ...(P.hub ? { busShare: +(P.hub / P.homes).toFixed(2) } : {}) };
  return { id: s.id, homes: P.homes, work: P.work, walk: P.walk, catchment, draw: round(P.work * drawScale), ceiling: round(catchment + ROOM * P.walk * homeScale), access, driveRes: drive?.residents ?? 0, busRes: bus?.residents ?? 0 };
});

console.log(`homes × ${homeScale.toPrecision(3)} (Stockport's morning trips to Piccadilly as before), draw × ${drawScale.toPrecision(3)} (Piccadilly's stays ${PICCADILLY_DRAW})`);
console.log(`ceiling: homes and ${ROOM} times the residents within a walk, on the same scale`);
console.log('station        residents  workers  in a walk  catchment (was)  draw (was)  ceiling');
for (const o of out) console.log(`${o.id.padEnd(14)} ${String(o.homes).padStart(9)} ${String(o.work).padStart(8)} ${String(o.walk).padStart(10)}  ${String(o.catchment).padStart(9)} (${old[o.id].catchment})  ${String(o.draw).padStart(5)} (${old[o.id].draw})  ${String(o.ceiling).padStart(7)}`);
console.log(`pools: ${DRIVE_SHARE} of those beyond a walk drive (within ${DRIVE_MAX} m), the rest take the bus (within ${BUS_STOP} m, ${BUS_WIDE} m of Stockport)`);
console.log('station        drive (residents) time  reach   bus (residents) time  reach  share');
for (const o of out) { const a = o.access; console.log(`${o.id.padEnd(14)} ${String(a.drive).padStart(5)} (${String(o.driveRes).padStart(6)}) ${String(a.driveTime).padStart(5)} ${String(a.driveR).padStart(6)}  ${String(a.bus).padStart(5)} (${String(o.busRes).padStart(6)}) ${String(a.busTime).padStart(5)} ${String(a.busR).padStart(6)}  ${a.busShare ?? ''}`); }
if (args.includes('--dry')) process.exit(0);

// write only the three numbers and the note, line by line, so the rest of the file keeps its layout
let text = readFileSync(netFile, 'utf8');
for (const o of out) {
  const re = new RegExp(`(\\{ "id": "${o.id}",[^\\n]*?"catchment": )\\d+(, "draw": )\\d+(?:, "ceiling": \\d+)?(?:, "access": \\{[^}]*\\})?(, "note": ")([^"]*)(")`);
  if (!re.test(text)) throw new Error(`can't find ${o.id}'s catchment, draw and note in network.json`);
  text = text.replace(re, (_, a, b, c, note, d) => {
    const what = note.replace(/^Draw from memory: /, '').replace(/^Census 2021[^;]*; draw: /, '');
    return `${a}${o.catchment}${b}${o.draw}, "ceiling": ${o.ceiling}, "access": ${JSON.stringify(o.access).replace(/([,:])/g, '$1 ').replace(/^\{/, '{ ').replace(/\}$/, ' }')}${c}Census 2021 (tools/census-to-network.mjs, ${DATE}): ${o.homes.toLocaleString('en-GB')} residents whose best trip in is from here, ${o.work.toLocaleString('en-GB')} working within a walk; draw: ${what}${d}`;
  });
}
writeFileSync(netFile, text);
console.log(`wrote ${netFile}`);
