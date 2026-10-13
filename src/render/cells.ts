// Instanced layers spread along the whole line (the houses, the trees, the track, the masts) split into one
// InstancedMesh per square of the ground, each with its own bounds, so the camera and the sun's shadow camera each draw
// only the squares they can see rather than the whole map's worth every frame. Drawn the same either way.
import * as THREE from 'three';

/** The squares' size, in metres: the shadows reach 320 m round where the camera looks, so a few at most there. */
export const CELL = 1000;

/** A layer split by square: the group to add to the scene, its meshes, and where each instance went (its mesh and
 * its index in it), for a layer that changes after it's split. */
export interface Split { group: THREE.Group; meshes: THREE.InstancedMesh[]; mesh: Uint16Array; slot: Uint32Array }

/** Split a filled InstancedMesh (its first `count` instances, their colours too) by square; it keeps its geometry and
 * material, shared by the pieces, and the shadow and draw-order settings it has now. */
export function byCell(inst: THREE.InstancedMesh, cell = CELL): Split {
  const n = inst.count, m4 = new THREE.Matrix4(), col = new THREE.Color(), lists = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    inst.getMatrixAt(i, m4);
    const key = `${Math.floor(m4.elements[12]! / cell)},${Math.floor(m4.elements[14]! / cell)}`;
    let list = lists.get(key); if (!list) { list = []; lists.set(key, list); } list.push(i);
  }
  const group = new THREE.Group(), meshes: THREE.InstancedMesh[] = [], mesh = new Uint16Array(n), slot = new Uint32Array(n);
  for (const list of lists.values()) {
    const m = new THREE.InstancedMesh(inst.geometry, inst.material, list.length);
    m.castShadow = inst.castShadow; m.receiveShadow = inst.receiveShadow; m.renderOrder = inst.renderOrder;
    list.forEach((i, j) => {
      inst.getMatrixAt(i, m4); m.setMatrixAt(j, m4);
      if (inst.instanceColor) { inst.getColorAt(i, col); m.setColorAt(j, col); }
      mesh[i] = meshes.length; slot[i] = j;
    });
    m.computeBoundingSphere(); meshes.push(m); group.add(m);
  }
  return { group, meshes, mesh, slot };
}
