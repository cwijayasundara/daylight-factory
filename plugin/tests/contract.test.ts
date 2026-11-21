import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeViolations, repeatsPrevious, classifyFailure } from '../src/contract.ts';

const task = { id: 't1', paths: ['src/a/'] } as any;
test('scopeViolations: files outside declared paths are reported; test files are always allowed', () => {
  const v = scopeViolations(['src/a/x.ts', 'tests/x.test.ts', 'src/b/y.ts'], task, ['.eslintrc*']);
  assert.equal(v.length, 1); assert.match(v[0], /src\/b\/y\.ts.*t1.*outside/);
});
test('scopeViolations: tests are allowed whatever the plan says (the generator was told otherwise four times)', () => {
  assert.equal(scopeViolations(['tests/x.test.ts'], { ...task, tdd: false }, []).length, 0);
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
test('classifyFailure: timeouts, evaluator outages and empty attempts are harness; sensor and scope failures are the generators', () => {
  const ed = ['src/'];
  assert.equal(classifyFailure({ messages: ['tests timed out after 120s -> x'], editable: ed }).cls, 'harness');
  assert.equal(classifyFailure({ messages: ['the evaluator returned no usable verdict twice: x'], editable: ed }).cls, 'harness');
  assert.equal(classifyFailure({ messages: ['the attempt changed nothing relative to the task start'], editable: ed }).cls, 'harness');
  assert.equal(classifyFailure({ messages: ['x.ts changed by task t1 outside its declared paths'], editable: ed }).cls, 'generator');
  assert.equal(classifyFailure({ messages: ['tests failed (exit 1)'], editable: ed }).cls, 'generator');
});
