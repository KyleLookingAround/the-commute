// Waiting passengers as instanced figures on each station's queue faces, in the station's local frame. The figures are
// drawn about twice life size, like a model railway's, so a queue reads as a crowd from the stock zoom.
import * as THREE from 'three';
import { MAT } from './scene.ts';
import type { BuiltStation, Face } from './stations.ts';
import type { GameState } from '../sim/types.ts';

const geo = new THREE.CylinderGeometry(0.55, 0.7, 3.6, 7); geo.translate(0, 1.8, 0);
const head = new THREE.SphereGeometry(0.6, 7, 6); head.translate(0, 4.1, 0);
const m4 = new THREE.Matrix4();

export class PassengerLayer {
  max: number;
  layers: { im: THREE.InstancedMesh; heads: THREE.InstancedMesh; faces: { north: Face; south: Face } }[];
  constructor(builtStations: BuiltStation[], max = 320) {
    this.max = max;
    this.layers = builtStations.map(b => {
      const im = new THREE.InstancedMesh(geo, MAT.pax, max), heads = new THREE.InstancedMesh(head, MAT.paxHead, max);
      im.count = heads.count = 0; im.castShadow = true; b.group.add(im); b.group.add(heads); return { im, heads, faces: b.kit.faces };
    });
  }
  sync(g: GameState): void {
    this.layers.forEach((L, i) => {
      const S = g.st[i];
      if (!g.owned[i] || !S) { L.im.count = L.heads.count = 0; return; }
      let k = 0;
      const put = (face: Face, count: number) => {
        const len = face.u1 - face.u0;
        for (let j = 0; j < count && k < this.max; j++, k++) {
          const row = Math.floor(j / 2), c = j % 2;
          const u = face.u0 + 6 + (row * 3.4) % (len - 12), v = face.v + (c - 0.5) * 2.4 + ((row * 7) % 3) * 0.6;
          m4.makeTranslation(u, 1, v); L.im.setMatrixAt(k, m4); L.heads.setMatrixAt(k, m4);
        }
      };
      put(L.faces.north, S.q[0].reduce((a, c) => a + c.n, 0)); put(L.faces.south, S.q[1].reduce((a, c) => a + c.n, 0));
      L.im.count = L.heads.count = k; L.im.instanceMatrix.needsUpdate = true; L.heads.instanceMatrix.needsUpdate = true;
    });
  }
}
