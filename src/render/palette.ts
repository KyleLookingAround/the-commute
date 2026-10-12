// The map's colours, read from the design tokens (src/ui/styles/tokens.css) so the scene and the page share one palette.
// Read once at start; a token missing from the stylesheet falls back to the value here, so the scene never goes magenta.
import * as THREE from 'three';

const FALLBACK = {
  'sky-night': '#0a0f24', 'sky-dawn': '#7a5a78', 'sky-day': '#9ccbee', 'sky-dusk': '#e09a62',
  'zenith-night': '#04071a', 'zenith-day': '#3d84d6', sun: '#fff3c4', cloud: '#ffffff', star: '#dfe6ff', 'lamp-off': '#b8c6d6',
  grass: '#5a9a44', yard: '#8a8276', city: '#7d7a80', river: '#3a6fa8', motorway: '#6b6e75',
  brick: '#a85a3e', 'brick-dark': '#7a4030', concrete: '#c2bdb0', platform: '#d2cdbe', tactile: '#e8cf5c',
  ballast: '#7a7068', rail: '#e4e7ec', canopy: '#4f6a8c', steel: '#8a94a3', glass: '#b8dcef', 'glass-glow': '#27405a',
  roof: '#4a4046', timber: '#e3d6b6', road: '#6c7078', shed: '#a6b2c2', lamp: '#fff1c9', warm: '#ffd88a',
  locked: '#6e7894', pax: '#f2b63a', 'pax-glow': '#6a4a10', 'pax-head': '#f3d9b8', 'pax-2': '#3f6fd8', 'pax-3': '#d84a3f', 'pax-4': '#5e6168', column: '#2b5d7a', rust: '#8a4a2c', shelter: '#25449a', pyramid: '#3f8fd8', 'pyramid-glow': '#0d2a4a', house: '#8a5f50',
  coin: '#f5c542', 'coin-glow': '#5a3f08', 'win-empty': '#9db8cc', 'win-busy': '#ffd27a', late: '#ff8a1c', ghost: '#4fdcff',
  'home-1': '#c0563a', 'home-2': '#d9a35a', 'home-3': '#f1e4c8', 'home-4': '#9fd6b8', 'home-5': '#f2a7a0', 'home-6': '#8fbde6',
  'home-roof': '#5d6b80', 'home-tile': '#a8473a', 'home-glass': '#cfe6f5',
  reach: '#ffcf5c', 'mins-1': '#ffe066', 'mins-2': '#ffad5a', 'mins-3': '#f07fa0', 'mins-4': '#a58be0',
  signal: '#1d2128', 'signal-green': '#3dff7a', board: '#f7f7f2', 'board-ink': '#14161a',
  'board-led': '#ffb52e', 'shop-lit': '#ffe2a6', shutter: '#9aa3ad', 'bay-line': '#eeeeea',
  'cab': '#1f2126', 'cab-sign': '#ffc928', 'cab-bay': '#f2d23c',
  hazard: '#ffa21a', bus: '#2f7fd6', 'bus-band': '#ffd23f', 'bus-stop': '#d8322f',
  'suit-1': '#2c3a5c', 'suit-2': '#45474f', 'suit-3': '#b98a5a', cyclist: '#b5e32b', bike: '#d0402f', case: '#e86a9a', 'case-2': '#3fb6c4',
  'kit-city': '#7ec3ee', 'kit-united': '#d8262f', 'kit-county': '#1f55b5',
  'brick-new': '#b8664a', 'viaduct-lit': '#ffb877', 'pyramid-lit': '#5fb4ff', 'pyramid-frame': '#1d3f66', sandstone: '#b8664c', faience: '#efe6cf',
  'plaza-sign': '#c8322e', merseyway: '#ddd2bb', fascia: '#2f8f9d', skyline: '#5d6b84', 'air-light': '#ff3b30',
  'car-1': '#c8283a', 'car-2': '#2a5cb0', 'car-3': '#c9ccd1', 'car-4': '#f4f4f0', 'car-5': '#2b2e35', 'car-6': '#3a8a55',
};
const NUMBERS = { 'house-sat': 0.45, 'tower-sat': 0.15, 'house-light': 0.42, 'tower-light': 0.5 };

export type ColourName = keyof typeof FALLBACK;
export type NumberName = keyof typeof NUMBERS;
export type Palette = Record<ColourName, THREE.Color> & Record<NumberName, number>;

/** { name: THREE.Color } for every --map-* colour, plus the numeric tokens. */
export function readPalette(el: Element | null = typeof document !== 'undefined' ? document.documentElement : null): Palette {
  const cs = el ? getComputedStyle(el) : null;
  const colours = {} as Record<ColourName, THREE.Color>, numbers = {} as Record<NumberName, number>;
  for (const k of Object.keys(FALLBACK) as ColourName[]) { const v = cs ? cs.getPropertyValue('--map-' + k).trim() : ''; colours[k] = new THREE.Color(v || FALLBACK[k]); }
  for (const k of Object.keys(NUMBERS) as NumberName[]) { const v = cs ? parseFloat(cs.getPropertyValue('--map-' + k)) : NaN; numbers[k] = Number.isFinite(v) ? v : NUMBERS[k]; }
  return { ...colours, ...numbers };
}
