import test from 'node:test';
import assert from 'node:assert/strict';
import { lintPlan } from '../src/planlint.ts';
import { generatorContext } from '../src/context.ts';

const T = (id: string, o: object = {}) => ({ id, title: id, acs: ['AC-1'], paths: ['src/' + id + '/'], deps: [], ...o }) as any;
const opts = { protectedGlobs: ['daylight.yaml', '**/rubrics/**', '**/spec.md'], spec: '- **AC-1** returns 1.\n', requiredSensors: ['tests'] };

test('lintPlan: a clean plan has no errors', () => assert.deepEqual(lintPlan([T('a'), T('b')], opts), []));
test('lintPlan: an unknown dependency is an error', () => assert.match(lintPlan([T('a', { deps: ['zz'] })], opts)[0], /depends on unknown task zz/));
test('lintPlan: a dependency cycle is an error', () => assert.match(lintPlan([T('a', { deps: ['b'] }), T('b', { deps: ['a'] })], opts).join(), /cycle/));
test('lintPlan: a task whose paths include a protected file is an error', () => assert.match(lintPlan([T('a', { paths: ['src/a/', 'daylight.yaml'] })], opts)[0], /protected.*daylight\.yaml/));
test('lintPlan: independent tasks with overlapping paths are an error; dependent ones are fine', () => {
  assert.match(lintPlan([T('a', { paths: ['src/'] }), T('b', { paths: ['src/b/'] })], opts)[0], /overlap/);
  assert.deepEqual(lintPlan([T('a', { paths: ['src/'] }), T('b', { paths: ['src/b/'], deps: ['a'] })], opts), []);
});
test('lintPlan: a meta AC (coverage, complexity...) with no matching required sensor is an error', () => {
  const spec = '- **AC-1** returns 1.\n- **AC-2** test coverage stays above 80%.\n';
  assert.match(lintPlan([T('a', { acs: ['AC-1', 'AC-2'] })], { ...opts, spec })[0], /AC-2.*coverage.*sensor/);
  assert.deepEqual(lintPlan([T('a', { acs: ['AC-1', 'AC-2'] })], { ...opts, spec, requiredSensors: ['tests', 'coverage'] }), []);
});

test('generatorContext: carries AC text, sensor limits and conventions', () => {
  const c = generatorContext(T('a', { acs: ['AC-1'] }), { spec: '- **AC-1** returns 1 when imported.\n- **AC-2** other.\n', sensors: { coverage_min: 80, complexity_max: 10, duplication_max: 0.8 }, conventions: 'use tabs' });
  assert.match(c, /AC-1: returns 1 when imported/); assert.doesNotMatch(c, /AC-2/);
  assert.match(c, /coverage.*80/); assert.match(c, /complexity.*10/); assert.match(c, /use tabs/);
});
test('generatorContext: no conventions section when none exist', () => assert.doesNotMatch(generatorContext(T('a'), { spec: '', sensors: {}, conventions: '' }), /Conventions/));
