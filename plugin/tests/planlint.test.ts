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
test('lintPlan: a new file named in architecture.md must be listed explicitly by some task (a broad src/ owns nothing, bh9)', () => {
  const arch = 'Entry: `src/main.ts`. Smoke: `scripts/smoke.ts`. Existing: `src/index.ts`. Test: `tests/a.test.ts`.';
  const o = { ...opts, architecture: arch, exists: (p: string) => p === 'src/index.ts' };
  const e = lintPlan([T('a', { paths: ['src/'] }), T('b', { paths: ['scripts/'], deps: ['a'] })], o);
  assert.ok(e.some((m) => /src\/main\.ts/.test(m) && /no task lists/.test(m)), e.join('|'));
  assert.ok(e.some((m) => /scripts\/smoke\.ts/.test(m)));
  assert.ok(!e.some((m) => /src\/index\.ts|tests\/a/.test(m)), 'existing files and tests are exempt');
  assert.deepEqual(lintPlan([T('a', { paths: ['src/main.ts'] }), T('b', { paths: ['scripts/smoke.ts'], deps: ['a'] })], o), []);
});
test('lintPlan: an AC that names a file only another task owns must be moved or the file shared (bh11: Dockerfile AC naming src/main.ts)', () => {
  const spec = '- **AC-17** `Dockerfile` runs the server with `node src/main.ts`; PORT defaults to 8081.\n';
  const tasks = [T('t1', { acs: ['AC-1'], paths: ['src/main.ts'] }), T('t3', { acs: ['AC-17'], paths: ['Dockerfile', 'docker-compose.yml'], deps: ['t1'] })];
  const e = lintPlan(tasks, { ...opts, spec });
  assert.ok(e.some((m) => /AC-17/.test(m) && /src\/main\.ts/.test(m) && /t1/.test(m) && /t3/.test(m)), e.join('|'));
  // owned by the same task, or the AC moves to the owner, or the task is given the file: clean
  assert.deepEqual(lintPlan([T('t1', { acs: ['AC-1', 'AC-17'], paths: ['src/main.ts', 'Dockerfile'] })], { ...opts, spec }), []);
  assert.deepEqual(lintPlan([tasks[0], { ...tasks[1], paths: [...tasks[1].paths, 'src/main.ts'] }], { ...opts, spec }), []);
});
test('lintPlan: a file named in an AC that no task owns, or a file under a directory the task owns, is not flagged', () => {
  const spec = '- **AC-2** reads `src/a/x.ts` and `docs/none.md`.\n';
  assert.deepEqual(lintPlan([T('t1', { acs: ['AC-2'], paths: ['src/a/'] })], { ...opts, spec }), []);
});
