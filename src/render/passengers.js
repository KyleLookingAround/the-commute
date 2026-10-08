// Waiting passengers as instanced figures on each station's queue faces, in the station's local frame.
import * as THREE from 'three';
import { MAT } from './scene.js';

const geo = new THREE.CylinderGeometry(0.3, 0.3, 1.7, 6); geo.translate(0, 0.85, 0);
const m4 = new THREE.Matrix4();

export class PassengerLayer {
  constructor(builtStations, max = 320) {
    this.max = max;
    this.layers = builtStations.map(b => { const im = new THREE.InstancedMesh(geo, MAT.pax, max); im.count = 0; b.group.add(im); return { im, faces: b.kit.faces }; });
  }
  sync(g) {
    this.layers.forEach((L, i) => {
      if (!g.owned[i]) { L.im.count = 0; return; }
      const S = g.st[i]; let k = 0;
      const put = (face, count) => {
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
