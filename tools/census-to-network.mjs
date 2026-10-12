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
//      why it's so much busier than the stations up the line; anywhere else beyond a walk takes no train.
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

const BOX = [-2.36, 53.33, -2.04, 53.52];       // west, south, east, north: the line and a walk round it
const REACH = 2500;                              // metres from a station on the line that an area is kept in the extract
const WALK_MAX = 1500, WORK_WALK = 1000;         // metres on foot (straight line times DETOUR) from home to a station, and on to work
const BUS_MAX = 5000, BUS_HUBS = ['stockport'];  // metres (straight line) by bus to a station with a bus station beside it
const DETOUR = 1.25, WALK = 1.33, RIDE = 15, WALK_WEIGHT = 2;   // streets aren't straight; m/s on foot and on the train
const ROOM = 0.5;                                 // a walk's land could hold half as many homes again as it does
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
  const areas = [...at].filter(([, p]) => line.some(s => dist(s, p) <= (BUS_HUBS.includes(s.id) ? BUS_MAX : REACH)))
    .map(([code, p]) => [code, p.lat, p.lon, residents.get(code) ?? 0, workers.get(code) ?? 0]).sort((a, b) => a[0] < b[0] ? -1 : 1);
  mkdirSync(dirname(extractFile), { recursive: true });
  const extract = {
    note: `Census 2021 for the Output Areas within ${REACH} m of a station on the line (${BUS_MAX} m of Stockport), and the National Rail stations round them, from tools/census-to-network.mjs --fetch on ${DATE}: TS001 (usual residents) and WP001 (workplace population) from Nomis, population-weighted centroids from the ONS Open Geography Portal (OA_December_2021_EW_PWC_V4), stations from NaPTAN. Contains Office for National Statistics data © Crown copyright and database right 2021; contains NaPTAN data, Department for Transport; both Open Government Licence v3.0.`,
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
const sum = Object.fromEntries(line.map(s => [s.id, { homes: 0, work: 0, walk: 0 }]));
const lineAt = line.map(s => ({ id: s.id, lat: s.lat, lon: s.lon }));
for (const [, lat, lon, residents, workers] of ex.areas.rows) {
  const p = { lat, lon };
  for (const s of lineAt) if (DETOUR * dist(p, s) <= WALK_MAX) sum[s.id].walk += residents;
  let home = null, homeCost = Infinity, work = null, workWalk = Infinity;
  for (const s of all) {
    const walk = DETOUR * dist(p, s); if (walk > WALK_MAX) continue;
    const cost = WALK_WEIGHT * walk / WALK + (s.id === 'piccadilly' ? 0 : dist(s, picc) / RIDE);
    if (cost < homeCost) { homeCost = cost; home = s; }
    if (walk < workWalk) { workWalk = walk; work = s; }
  }
  // beyond a walk of every station, a bus to the hub within reach (Stockport's bus station, beside the station)
  if (!home) home = all.find(s => BUS_HUBS.includes(s.id) && dist(p, s) <= BUS_MAX) ?? null;
  if (home?.id) sum[home.id].homes += residents;
  if (work?.id && workWalk <= WORK_WALK) sum[work.id].work += workers;
}

const old = Object.fromEntries(line.map(s => [s.id, { catchment: s.catchment, draw: s.draw }]));
const drawScale = PICCADILLY_DRAW / sum.piccadilly.work;
const homeScale = OPENING / (OUT * sum.stockport.homes + (1 - OUT) * sum.stockport.work / sum.piccadilly.work * sum.piccadilly.homes);
const round = v => v >= 100 ? Math.round(v / 10) * 10 : Math.max(1, Math.round(v));
const out = line.map(s => {
  const catchment = round(sum[s.id].homes * homeScale);
  return { id: s.id, homes: sum[s.id].homes, work: sum[s.id].work, walk: sum[s.id].walk, catchment, draw: round(sum[s.id].work * drawScale), ceiling: round(catchment + ROOM * sum[s.id].walk * homeScale) };
});

console.log(`homes × ${homeScale.toPrecision(3)} (Stockport's morning trips to Piccadilly as before), draw × ${drawScale.toPrecision(3)} (Piccadilly's stays ${PICCADILLY_DRAW})`);
console.log(`ceiling: homes and ${ROOM} times the residents within a walk, on the same scale`);
console.log('station        residents  workers  in a walk  catchment (was)  draw (was)  ceiling');
for (const o of out) console.log(`${o.id.padEnd(14)} ${String(o.homes).padStart(9)} ${String(o.work).padStart(8)} ${String(o.walk).padStart(10)}  ${String(o.catchment).padStart(9)} (${old[o.id].catchment})  ${String(o.draw).padStart(5)} (${old[o.id].draw})  ${String(o.ceiling).padStart(7)}`);
if (args.includes('--dry')) process.exit(0);

// write only the three numbers and the note, line by line, so the rest of the file keeps its layout
let text = readFileSync(netFile, 'utf8');
for (const o of out) {
  const re = new RegExp(`(\\{ "id": "${o.id}",[^\\n]*?"catchment": )\\d+(, "draw": )\\d+(?:, "ceiling": \\d+)?(, "note": ")([^"]*)(")`);
  if (!re.test(text)) throw new Error(`can't find ${o.id}'s catchment, draw and note in network.json`);
  text = text.replace(re, (_, a, b, c, note, d) => {
    const what = note.replace(/^Draw from memory: /, '').replace(/^Census 2021[^;]*; draw: /, '');
    return `${a}${o.catchment}${b}${o.draw}, "ceiling": ${o.ceiling}${c}Census 2021 (tools/census-to-network.mjs, ${DATE}): ${o.homes.toLocaleString('en-GB')} residents whose best trip in is from here, ${o.work.toLocaleString('en-GB')} working within a walk; draw: ${what}${d}`;
  });
}
writeFileSync(netFile, text);
console.log(`wrote ${netFile}`);
