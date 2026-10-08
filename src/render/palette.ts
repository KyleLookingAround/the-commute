// The map's colours, read from the design tokens (src/ui/styles/tokens.css) so the scene and the page share one palette.
// Read once at start; a token missing from the stylesheet falls back to the value here, so the scene never goes magenta.
import * as THREE from 'three';

const FALLBACK = {
  'sky-night': '#0a0f24', 'sky-dawn': '#7a5a78', 'sky-day': '#9ccbee', 'sky-dusk': '#e09a62',
  'zenith-night': '#04071a', 'zenith-day': '#3d84d6', sun: '#fff3c4', cloud: '#ffffff',
  grass: '#5a9a44', yard: '#8a8276', city: '#7d7a80', river: '#3a6fa8', motorway: '#6b6e75',
  brick: '#a85a3e', 'brick-dark': '#7a4030', concrete: '#c2bdb0', platform: '#d2cdbe', tactile: '#e8cf5c',
  ballast: '#7a7068', rail: '#e4e7ec', canopy: '#4f6a8c', steel: '#8a94a3', glass: '#b8dcef', 'glass-glow': '#27405a',
  roof: '#4a4046', timber: '#e3d6b6', road: '#6c7078', shed: '#a6b2c2', lamp: '#fff1c9', warm: '#ffd88a',
  locked: '#6e7894', pax: '#f2b63a', 'pax-glow': '#6a4a10', pyramid: '#3f8fd8', 'pyramid-glow': '#0d2a4a', house: '#8a5f50',
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
