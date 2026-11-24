import { describe, expect, it } from 'vitest';
import { emberlingMesh, wrapYaw } from '../../src/rendering/inspection/emberlingMesh';

describe('3D inspection prototype', () => {
  it('wraps angles for continuous 360-degree rotation', () => {
    expect(wrapYaw(0)).toBe(0);
    expect(wrapYaw(360)).toBe(0);
    expect(wrapYaw(-30)).toBe(330);
    expect(wrapYaw(750)).toBe(30);
    expect(wrapYaw(Number.NaN)).toBe(0);
    expect(wrapYaw(Infinity)).toBe(0);
  });
  it('builds deterministic, finite xyz triangles with normals and colours', () => {
    const m = emberlingMesh();
    expect(m.length % 27).toBe(0);
    expect(m.length).toBeGreaterThan(1000);
    expect(m.byteLength).toBeLessThan(8 * 1024 * 1024);
    let minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < m.length; i += 9) {
      if (!m.subarray(i, i + 9).every(Number.isFinite)) throw new Error('Non-finite vertex');
      minZ = Math.min(minZ, m[i+2]!); maxZ = Math.max(maxZ, m[i+2]!);
      minY = Math.min(minY, m[i+1]!); maxY = Math.max(maxY, m[i+1]!);
      if (Math.hypot(m[i+3]!, m[i+4]!, m[i+5]!) < 0.01) throw new Error('Degenerate normal');
      if (m[i+6]! < 0 || m[i+6]! > 1 || m[i+7]! < 0 || m[i+7]! > 1 || m[i+8]! < 0 || m[i+8]! > 1) throw new Error('Colour outside range');
    }
    expect(minZ).toBeLessThan(-1.5);
    expect(maxZ).toBeGreaterThan(1);
    expect(minY).toBeGreaterThanOrEqual(-0.01);
    expect(maxY).toBeGreaterThan(1.8);
    const second = emberlingMesh();
    expect(second.length).toBe(m.length);
    expect(m.every((v,i) => v === second[i])).toBe(true);
  });
});
