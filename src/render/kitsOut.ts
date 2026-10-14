// The lines out's station kits: fetched just after the first frame (src/render/kits.ts, loadOutKits). Every station
// on a line out has its kit listed here; the opening's are in kits.ts.
import type { Kit } from './stations.ts';
import davenport from '../data/kits/davenport.json';
import woodsmoor from '../data/kits/woodsmoor.json';
import hazelGrove from '../data/kits/hazel-grove.json';
import middlewood from '../data/kits/middlewood.json';
import disley from '../data/kits/disley.json';
import newMills from '../data/kits/new-mills-newtown.json';
import ashburys from '../data/kits/ashburys.json';
import belleVue from '../data/kits/belle-vue.json';
import ryderBrow from '../data/kits/ryder-brow.json';
import reddishNorth from '../data/kits/reddish-north.json';
import brinnington from '../data/kits/brinnington.json';
import bredbury from '../data/kits/bredbury.json';
import romiley from '../data/kits/romiley.json';
import marple from '../data/kits/marple.json';
import roseHill from '../data/kits/rose-hill.json';

export const outKits: Record<string, Kit> = {
  davenport: davenport as Kit, woodsmoor: woodsmoor as Kit, 'hazel-grove': hazelGrove as Kit, middlewood: middlewood as Kit, disley: disley as Kit, 'new-mills-newtown': newMills as Kit,
  ashburys: ashburys as Kit, 'belle-vue': belleVue as Kit, 'ryder-brow': ryderBrow as Kit, 'reddish-north': reddishNorth as Kit, brinnington: brinnington as Kit, bredbury: bredbury as Kit,
  romiley: romiley as Kit, marple: marple as Kit, 'rose-hill': roseHill as Kit,
};
