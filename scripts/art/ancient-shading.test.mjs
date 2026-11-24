import assert from 'node:assert/strict';
import { test } from 'node:test';
import { shadeFrame } from './generate-ancient-shading.mjs';

const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 200"><g transform="translate(38.4 54.4) scale(0.68)"><path d="M1 2 L3 4Z" fill="#75B57D"/><circle cx="1" cy="2" r="1" fill="#FFFFFF"/><path d="M4 5Z" fill="#75b57d"/><path fill="url(#aether)" d="M1 0Z"/><path fill="#3A303A" d="M2 0Z"/></g></svg>';
test('same geometry, no external resources, stable soft colour volume', () => {
  const out = shadeFrame(source);
  assert.equal(out, shadeFrame(source));
  assert.ok(out.includes('viewBox="0 0 240 200"'));
  assert.ok(out.includes('transform="translate(38.4 54.4) scale(0.68)"'));
  assert.ok(out.includes('d="M1 2 L3 4Z"'));
  assert.ok(out.includes('fill="#FFFFFF"'));
  assert.ok(out.includes('fill="#3A303A"'));
  assert.ok(out.includes('fill="url(#aether)"'));
  assert.equal((out.match(/id="dravio_shade_75b57d"/g) ?? []).length, 1);
  assert.equal((out.match(/fill="url\(#dravio_shade_75b57d\)"/g) ?? []).length, 2);
  assert.throws(() => shadeFrame(out));
});
