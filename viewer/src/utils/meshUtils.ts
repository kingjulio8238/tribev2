import * as THREE from 'three';

/**
 * Given a 3D intersection point and the three vertex indices of the hit face,
 * returns the index of the vertex closest to the intersection point.
 */
export function findClosestVertexOnFace(
  point: THREE.Vector3,
  face: { a: number; b: number; c: number },
  positions: Float32Array,
): number {
  let bestIndex = face.a;
  let bestDist = Infinity;

  for (const vi of [face.a, face.b, face.c]) {
    const i3 = vi * 3;
    const dx = positions[i3] - point.x;
    const dy = positions[i3 + 1] - point.y;
    const dz = positions[i3 + 2] - point.z;
    const dist = dx * dx + dy * dy + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = vi;
    }
  }

  return bestIndex;
}
