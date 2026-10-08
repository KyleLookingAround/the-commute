// The map's colours, read from the design tokens (src/ui/styles/tokens.css) so the scene and the page share one palette.
// Read once at start; a token missing from the stylesheet falls back to the value here, so the scene never goes magenta.
import * as THREE from 'three';

const FALLBACK = {
  'sky-night': '#0a0f24', 'sky-dawn': '#5a3f5e', 'sky-day': '#8fb4d8', 'sky-dusk': '#d08a5a',
  grass: '#2f4a2c', yard: '#4d4a45', city: '#3d3d45', river: '#1a3354', motorway: '#383b42',
  brick: '#6b3f33', 'brick-dark': '#4e2e26', concrete: '#8d8a80', platform: '#9a968a', tactile: '#d9c36a',
  ballast: '#2d2a2a', rail: '#b9bcc4', canopy: '#3b4660', steel: '#5d6572', glass: '#9fc0d6', 'glass-glow': '#27405a',
  roof: '#2f2a2e', timber: '#cfc3a8', road: '#3a3d44', shed: '#7f8a99', lamp: '#fff1c9', warm: '#ffd88a',
  locked: '#3a4158', pax: '#f2b63a', 'pax-glow': '#6a4a10', pyramid: '#2f6fb0', 'pyramid-glow': '#0d2a4a', house: '#5a4642',
};
const NUMBERS = { 'house-sat': 0.3, 'tower-sat': 0.08 };

/** { name: THREE.Color } for every --map-* colour, plus the numeric tokens. */
export function readPalette(el = typeof document !== 'undefined' ? document.documentElement : null) {
  const cs = el ? getComputedStyle(el) : null, out = {};
  for (const [k, fb] of Object.entries(FALLBACK)) { const v = cs ? cs.getPropertyValue('--map-' + k).trim() : ''; out[k] = new THREE.Color(v || fb); }
  for (const [k, fb] of Object.entries(NUMBERS)) { const v = cs ? parseFloat(cs.getPropertyValue('--map-' + k)) : NaN; out[k] = Number.isFinite(v) ? v : fb; }
  return out;
}
