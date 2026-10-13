// Views from above of every station on the line and the lines out, for the reference library (docs/reference/aerial/):
// the Environment Agency's LIDAR Composite first-return DSM (1 m, 2022, Open Government Licence), shaded as if lit from
// the north-west, so every roof, tree, platform, bridge and road shows. No free colour aerial photography covers the
// line (the Agency's flights follow rivers and coasts; the commercial imagery's licences don't allow copying), so this
// stands in for it. North is up and the station is at the centre.
//
//    node tools/aerial-views.mjs [--only stockport,marple] [--fresh]
//
// 1. Fetches the stations' positions from NaPTAN (the DfT's stop list, area 910, National Rail) into the git-ignored
//    data/raw/naptan-910.csv, as tools/census-to-network.mjs does (--fresh fetches again), and reads each station's
//    Ordnance Survey grid reference (easting, northing).
// 2. Asks the Agency's map service for a square round each: SIZE m across at PX pixels (1.5 m a pixel), and for the
//    bigger places a WIDE view, WIDE_SIZE m at WIDE_PX (2.4 m a pixel), in British National Grid so the squares are true.
// 3. Writes docs/reference/aerial/<id>.jpg (and <id>-wide.jpg) and the folder's index.md.
// Contains Environment Agency information © Environment Agency and/or database right; contains NaPTAN data, Department
// for Transport; both Open Government Licence v3.0.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './rules.mjs';

const WMS = 'https://environment.data.gov.uk/spatialdata/lidar-composite-digital-surface-model-first-return-dsm-1m/wms';
const LAYER = 'Lidar_Composite_Hillshade_FZ_DSM_1m';
const NAPTAN = 'https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv&atcoAreaCodes=910';
const SIZE = 1200, PX = 800, WIDE_SIZE = 2400, WIDE_PX = 1000;

// [id, NaPTAN's name without " Rail Station", line, wide view too]: the ids are the game's (src/data/network.json) or,
// for stations not in it yet, the photo library's (docs/reference/photos/)
const STATIONS = [
  ['stockport', 'Stockport', "Today's line", true],
  ['heaton-chapel', 'Heaton Chapel', "Today's line"],
  ['levenshulme', 'Levenshulme', "Today's line"],
  ['ardwick', 'Ardwick', "Today's line"],
  ['piccadilly', 'Manchester Piccadilly', "Today's line", true],
  ['davenport', 'Davenport', "Today's line"],
  ['woodsmoor', 'Woodsmoor', "Today's line"],
  ['hazel-grove', 'Hazel Grove', "Today's line"],
  ['middlewood', 'Middlewood', 'The Buxton line'],
  ['disley', 'Disley', 'The Buxton line'],
  ['new-mills-newtown', 'New Mills Newtown', 'The Buxton line'],
  ['furness-vale', 'Furness Vale', 'The Buxton line'],
  ['whaley-bridge', 'Whaley Bridge', 'The Buxton line'],
  ['chapel-en-le-frith', 'Chapel-en-le-Frith', 'The Buxton line'],
  ['dove-holes', 'Dove Holes', 'The Buxton line'],
  ['buxton', 'Buxton', 'The Buxton line'],
  ['ashburys', 'Ashburys', 'The Marple line'],
  ['belle-vue', 'Belle Vue', 'The Marple line'],
  ['ryder-brow', 'Ryder Brow', 'The Marple line'],
  ['reddish-north', 'Reddish North', 'The Marple line'],
  ['brinnington', 'Brinnington', 'The Marple line'],
  ['bredbury', 'Bredbury', 'The Marple line'],
  ['romiley', 'Romiley', 'The Marple line'],
  ['marple', 'Marple', 'The Marple line', true],
  ['rose-hill', 'Rose Hill Marple', 'The Marple line'],
  ['cheadle-hulme', 'Cheadle Hulme', 'The Crewe line'],
  ['handforth', 'Handforth', 'The Crewe line'],
  ['wilmslow', 'Wilmslow', 'The Crewe line', true],
  ['bramhall', 'Bramhall', 'The Macclesfield leg'],
  ['poynton', 'Poynton', 'The Macclesfield leg'],
  ['mauldeth-road', 'Mauldeth Road', 'The Styal line'],
  ['burnage', 'Burnage', 'The Styal line'],
  ['east-didsbury', 'East Didsbury', 'The Styal line'],
  ['gatley', 'Gatley', 'The Styal line'],
  ['heald-green', 'Heald Green', 'The Styal line'],
  ['manchester-airport', 'Manchester Airport', 'The Styal line', true],
  ['reddish-south', 'Reddish South', 'Reddish South and Denton'],
  ['denton', 'Denton', 'Reddish South and Denton'],
];

const args = process.argv.slice(2);
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const fresh = args.includes('--fresh');
const raw = join(root, 'data/raw'), out = join(root, 'docs/reference/aerial');
mkdirSync(raw, { recursive: true }); mkdirSync(out, { recursive: true });

async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return Buffer.from(await r.arrayBuffer()); }
    catch (e) { if (i >= tries - 1) throw e; await new Promise(res => setTimeout(res, 2000 * 2 ** i)); }
  }
}

/** CSV rows as arrays (quoted fields, no newlines inside them). */
function csv(text) {
  return text.split(/\r?\n/).filter(Boolean).map(line => {
    const row = []; let f = '', q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === '"' && line[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
      else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else f += c;
    }
    row.push(f); return row;
  });
}

const naptanFile = join(raw, 'naptan-910.csv');
if (fresh || !existsSync(naptanFile)) writeFileSync(naptanFile, await get(NAPTAN));
const [head, ...rows] = csv(readFileSync(naptanFile, 'utf8'));
const col = name => head.indexOf(name);
const [NAME, E, N, TYPE] = ['CommonName', 'Easting', 'Northing', 'StopType'].map(col);
const where = new Map();
for (const r of rows) if (r[TYPE] === 'RLY') where.set(r[NAME].replace(/ Rail Station$/, ''), [+r[E], +r[N]]);

const view = (e, n, size, px) => `${WMS}?service=WMS&version=1.1.1&request=GetMap&layers=${LAYER}&styles=&srs=EPSG:27700`
  + `&bbox=${e - size / 2},${n - size / 2},${e + size / 2},${n + size / 2}&width=${px}&height=${px}&format=image/jpeg`;

const done = [];
for (const [id, name, line, wide] of STATIONS) {
  const at = where.get(name);
  if (!at) { console.error(`${name}: not in NaPTAN`); process.exitCode = 1; continue; }
  const [e, n] = at;
  if (!only || only.has(id)) {
    writeFileSync(join(out, `${id}.jpg`), await get(view(e, n, SIZE, PX)));
    if (wide) writeFileSync(join(out, `${id}-wide.jpg`), await get(view(e, n, WIDE_SIZE, WIDE_PX)));
    console.log(`${id}: ${e}, ${n}${wide ? ' (and wide)' : ''}`);
  }
  done.push({ id, name, line, wide, e, n });
}

const lines = [...new Set(done.map(s => s.line))];
writeFileSync(join(out, 'index.md'), [
  '# Views from above',
  '',
  `Every station on today's line and the lines out of phase 5, seen from above: the Environment Agency's LIDAR Composite first-return DSM (1 m, 2022), the height of whatever the laser met first (roofs, trees, bridges, the ground), shaded as if lit from the north-west. Written by \`tools/aerial-views.mjs\`; run it again to refresh them or add a station.`,
  '',
  '## How to read them',
  '',
  `- North is up, and the station's NaPTAN point (usually its main entrance or the middle of its platforms) is at the centre.`,
  `- A station's view is ${SIZE} m across at ${PX} px (${(SIZE / PX).toFixed(1)} m a pixel). The bigger places also have a wide view, ${WIDE_SIZE} m across at ${WIDE_PX} px.`,
  '- What it shows well: building footprints and roof shapes, platforms and canopies, footbridges and road bridges, cuttings and embankments, car parks, roads, trees and hedges, the line\'s curves.',
  '- What it can\'t show: colour, materials, signs or markings. The photos in `docs/reference/photos/` do that.',
  '- Settle a question from both where you can: the view says where and how big, a photo says what it looks like.',
  '',
  '## Licence',
  '',
  'Contains Environment Agency information © Environment Agency and/or database right; contains NaPTAN data, Department for Transport. Both under the [Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): reuse them with that credit.',
  '',
  ...lines.flatMap(l => [
    `## ${l}`, '',
    '| Station | View | Grid reference (easting, northing) |',
    '| --- | --- | --- |',
    ...done.filter(s => s.line === l).map(s => `| ${s.name} | [${s.id}.jpg](${s.id}.jpg)${s.wide ? `, [wide](${s.id}-wide.jpg)` : ''} | ${s.e}, ${s.n} |`),
    '',
  ]),
].join('\n'));
console.log(`${done.length} stations; index at docs/reference/aerial/index.md`);
