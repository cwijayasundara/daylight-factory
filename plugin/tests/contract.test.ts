import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeViolations, repeatsPrevious } from '../src/contract.ts';

const task = { id: 't1', paths: ['src/a/'], tdd: true } as any;
test('scopeViolations: files outside declared paths are reported; own tests are allowed for TDD tasks', () => {
  const v = scopeViolations(['src/a/x.ts', 'tests/x.test.ts', 'src/b/y.ts'], task, ['.eslintrc*']);
  assert.equal(v.length, 1); assert.match(v[0], /src\/b\/y\.ts.*t1.*outside/);
});
test('scopeViolations: tests are not exempt when tdd is false', () => {
  assert.equal(scopeViolations(['tests/x.test.ts'], { ...task, tdd: false }, []).length, 1);
});
test('scopeViolations: protected paths are always reported, even inside declared paths', () => {
  const v = scopeViolations(['src/a/.eslintrc.json'], task, ['**/.eslintrc*']);
  assert.ok(v.some((m) => /protected/.test(m)));
});
test('repeatsPrevious: true only when the same computational message appears on consecutive attempts', () => {
  assert.equal(repeatsPrevious(['a', 'b'], ['b', 'a']), true);
  assert.equal(repeatsPrevious(['a'], ['b']), false);
  assert.equal(repeatsPrevious([], []), false);
  assert.equal(repeatsPrevious(undefined, ['a']), false);
});
