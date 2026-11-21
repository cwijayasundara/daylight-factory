import test from 'node:test';
import assert from 'node:assert/strict';
import { fastPlan, isFastPath } from '../src/plan.ts';

test('isFastPath: small + low tier + enabled only', () => {
  assert.equal(isFastPath({ size: 'small', tier: 'low' }, { fast_path: true }), true);
  assert.equal(isFastPath({ size: 'medium', tier: 'low' }, { fast_path: true }), false);
  assert.equal(isFastPath({ size: 'small', tier: 'medium' }, { fast_path: true }), false);
  assert.equal(isFastPath({ size: 'small', tier: 'low' }, { fast_path: false }), false);
});
test('fastPlan: one task covering every AC with broad non-protected paths', () => {
  const p = fastPlan('- **AC-1** a.\n- **AC-2** b.\n', 'Do it');
  assert.equal(p.tasks.length, 1); assert.deepEqual(p.tasks[0].acs, ['AC-1', 'AC-2']); assert.deepEqual(p.tasks[0].deps, []);
  assert.ok(p.tasks[0].paths.includes('src/') && p.tasks[0].paths.includes('tests/'));
});
