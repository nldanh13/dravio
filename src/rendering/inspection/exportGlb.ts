/** Export the current procedural prototype as a self-contained glTF 2.0 binary.
 * Coordinates, vertex colours and normals only: no rig, skin, UV or animation yet.
 */
export function encodeInspectionGlb(mesh: Float32Array): Uint8Array {
  if (!mesh.length || mesh.length % 27 !== 0 || !mesh.every(Number.isFinite)) {
    throw new Error('Expected finite interleaved triangle mesh');
  }
  const vertices: number[] = [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.length; i += 27) {
    const ax = mesh[i + 9]! - mesh[i]!, ay = mesh[i + 10]! - mesh[i + 1]!, az = mesh[i + 11]! - mesh[i + 2]!;
    const bx = mesh[i + 18]! - mesh[i]!, by = mesh[i + 19]! - mesh[i + 1]!, bz = mesh[i + 20]! - mesh[i + 2]!;
    const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    if (Math.hypot(nx, ny, nz) < 1e-10) continue;
    // glTF front faces must be counterclockwise when seen from outside.
    const outward = nx * (mesh[i + 3]! + mesh[i + 12]! + mesh[i + 21]!)
      + ny * (mesh[i + 4]! + mesh[i + 13]! + mesh[i + 22]!)
      + nz * (mesh[i + 5]! + mesh[i + 14]! + mesh[i + 23]!);
    for (const j of outward >= 0 ? [i, i + 9, i + 18] : [i, i + 18, i + 9]) {
      for (let k = 0; k < 3; k++) {
        const p = mesh[j + k]!;
        min[k] = Math.min(min[k]!, p); max[k] = Math.max(max[k]!, p);
        vertices.push(p);
      }
      const len = Math.hypot(mesh[j + 3]!, mesh[j + 4]!, mesh[j + 5]!);
      if (len < 1e-10) throw new Error('Invalid vertex normal');
      for (let k = 3; k < 6; k++) vertices.push(mesh[j + k]! / len);
      for (let k = 6; k < 9; k++) {
        const v = mesh[j + k]!;
        if (v < 0 || v > 1) throw new Error('Invalid vertex colour');
        vertices.push(v);
      }
    }
  }
  if (!vertices.length) throw new Error('No valid triangles');
  const count = vertices.length / 9;
  const bin = new Uint8Array(vertices.length * 4);
  const bd = new DataView(bin.buffer);
  vertices.forEach((v, i) => bd.setFloat32(i * 4, v, true));
  const gltf = {
    asset: { version: '2.0', generator: 'Dravio inspection prototype exporter' },
    scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Emberling Baby Normal', mesh: 0, extras: { speciesId: 'emberling', stage: 'baby', mutation: 'normal', tier: 'prototype' } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, material: 0, mode: 4 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.length, byteStride: 36, target: 34962 }],
    accessors: [
      { bufferView: 0, byteOffset: 0, componentType: 5126, count, type: 'VEC3', min, max },
      { bufferView: 0, byteOffset: 12, componentType: 5126, count, type: 'VEC3' },
      { bufferView: 0, byteOffset: 24, componentType: 5126, count, type: 'VEC3' },
    ],
  };
  const json = new TextEncoder().encode(JSON.stringify(gltf));
  const padded = Math.ceil(json.length / 4) * 4;
  const output = new Uint8Array(12 + 8 + padded + 8 + bin.length);
  const header = new DataView(output.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, output.length, true);
  header.setUint32(12, padded, true);
  header.setUint32(16, 0x4e4f534a, true);
  output.fill(0x20, 20, 20 + padded);
  output.set(json, 20);
  header.setUint32(20 + padded, bin.length, true);
  header.setUint32(24 + padded, 0x004e4942, true);
  output.set(bin, 28 + padded);
  return output;
}
