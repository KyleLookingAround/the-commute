// Waiting passengers as instanced figures on each station's queue faces, in the station's local frame.
import * as THREE from 'three';
import { MAT } from './scene.ts';
import type { BuiltStation, Face } from './stations.ts';
import type { GameState } from '../sim/types.ts';

const geo = new THREE.CylinderGeometry(0.3, 0.3, 1.7, 6); geo.translate(0, 0.85, 0);
const m4 = new THREE.Matrix4();

export class PassengerLayer {
  max: number;
  layers: { im: THREE.InstancedMesh; faces: { north: Face; south: Face } }[];
  constructor(builtStations: BuiltStation[], max = 320) {
    this.max = max;
    this.layers = builtStations.map(b => { const im = new THREE.InstancedMesh(geo, MAT.pax, max); im.count = 0; b.group.add(im); return { im, faces: b.kit.faces }; });
  }
  sync(g: GameState): void {
    this.layers.forEach((L, i) => {
      const S = g.st[i];
      if (!g.owned[i] || !S) { L.im.count = 0; return; }
      let k = 0;
      const put = (face: Face, count: number) => {
        const len = face.u1 - face.u0;
        for (let j = 0; j < count && k < this.max; j++, k++) {
          const row = Math.floor(j / 2), c = j % 2;
          const u = face.u0 + 6 + (row * 2.2) % (len - 12), v = face.v + (c - 0.5) * 1.2 + ((row * 7) % 3) * 0.4;
          m4.makeTranslation(u, 1, v); L.im.setMatrixAt(k, m4);
        }
      };
      put(L.faces.north, S.q[0].reduce((a, c) => a + c.n, 0)); put(L.faces.south, S.q[1].reduce((a, c) => a + c.n, 0));
      L.im.count = k; L.im.instanceMatrix.needsUpdate = true;
    });
  }
}
