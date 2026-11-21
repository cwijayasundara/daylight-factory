import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeViolations, repeatsPrevious, failureClass } from '../src/contract.ts';

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
test('failureClass: timeouts and evaluator outages are harness; scope, TDD and sensor failures are generator', () => {
  assert.equal(failureClass(['tests timed out after 120s -> x']), 'harness');
  assert.equal(failureClass(['the evaluator returned no usable verdict twice: x']), 'harness');
  assert.equal(failureClass(['src/b/y.ts changed by task t1 outside its declared paths']), 'generator');
  assert.equal(failureClass(['tests failed (exit 1)']), 'generator');
});
