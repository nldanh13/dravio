import { describe, expect, it } from 'vitest';
import { emberlingMesh } from '../../src/rendering/inspection/emberlingMesh';
import { encodeInspectionGlb } from '../../src/rendering/inspection/exportGlb';

describe('Emberling prototype GLB', () => {
  it('exports a self-contained GLB with valid aligned chunks and normalized normals', () => {
    const bytes = encodeInspectionGlb(emberlingMesh());
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(v.getUint32(0, true)).toBe(0x46546c67);
    expect(v.getUint32(4, true)).toBe(2);
    expect(v.getUint32(8, true)).toBe(bytes.byteLength);
    const length = v.getUint32(12, true);
    expect(length % 4).toBe(0);
    expect(v.getUint32(16, true)).toBe(0x4e4f534a);
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
    const binSize = v.getUint32(20 + length, true);
    expect(v.getUint32(24 + length, true)).toBe(0x004e4942);
    expect(28 + length + binSize).toBe(bytes.byteLength);
    expect(json.buffers[0].byteLength).toBe(binSize);
    expect(json.buffers[0].uri).toBeUndefined();
    const count = json.accessors[0].count as number;
    expect(count % 3).toBe(0);
    expect(binSize).toBe(count * 36);
    expect(json.nodes[0].extras.speciesId).toBe('emberling');
    let min = Infinity, max = 0;
    for (let i = 0; i < count; i++) {
      const off = 28 + length + i * 36 + 12;
      const len = Math.hypot(v.getFloat32(off, true), v.getFloat32(off+4, true), v.getFloat32(off+8, true));
      min = Math.min(min, len); max = Math.max(max, len);
    }
    expect(min).toBeGreaterThan(0.99999);
    expect(max).toBeLessThan(1.00001);
  });
  it('rejects empty and malformed meshes', () => {
    expect(() => encodeInspectionGlb(new Float32Array())).toThrow();
    expect(() => encodeInspectionGlb(new Float32Array(27))).toThrow();
    expect(() => encodeInspectionGlb(new Float32Array([NaN]))).toThrow();
  });
});
