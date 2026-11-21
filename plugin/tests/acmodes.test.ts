import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, tmp, put, events, MIN_YAML } from './helpers.ts';
import { acModes, taskMode, tddApplies } from '../src/plan.ts';
import { lint as designLint } from '../src/design.ts';
import { matrix } from '../src/trace.ts';
import { lintPlan } from '../src/planlint.ts';
import { verifyDelivery } from '../src/delivery.ts';

const SPEC = '- **AC-1** [test] GET /notes returns 200.\n- **AC-2** [run] The container answers /health.\n- **AC-3** [sensor:complexity] No function exceeds 8.\n- **AC-4** Untagged AC returns 404.\n';
const T = (id: string, acs: string[], o: object = {}) => ({ id, title: id, acs, paths: ['src/'], deps: [], ...o }) as any;

test('acModes: tags [test], [run], [sensor:x]; untagged defaults to test', () => {
  const m = acModes(SPEC);
  assert.deepEqual([...m.entries()], [['AC-1', { mode: 'test' }], ['AC-2', { mode: 'run' }], ['AC-3', { mode: 'sensor', sensor: 'complexity' }], ['AC-4', { mode: 'test' }]]);
});
test('taskMode: any test AC means tdd; only run (and sensor) ACs means run; only sensor ACs or none means none; untagged specs keep the path rule', () => {
  const m = acModes(SPEC);
  assert.equal(taskMode(T('a', ['AC-1', 'AC-2']), m), 'tdd');
  assert.equal(taskMode(T('b', ['AC-2', 'AC-3']), m), 'run');
  assert.equal(taskMode(T('c', ['AC-3']), m), 'none');
  assert.equal(taskMode(T('d', []), m), 'none');
  const none = acModes('- **AC-1** a returns 1.\n');
  assert.equal(taskMode(T('e', ['AC-1'], { paths: ['Dockerfile'] }), none), 'none'); // untagged and config-only: old path rule
  assert.equal(taskMode(T('f', ['AC-1'], { paths: ['src/'] }), none), 'tdd');
  assert.equal(tddApplies(T('g', ['AC-2']), m), false);
});
test('design lint: an unknown tag is an error; sensor tags need a name', () => {
  const d = tmp(); put(d, 'intent.md', '## Why\nx\n## Success criteria\n- 1 ok\n'); put(d, 'architecture.md', '### ADR-1 x\nStatus Context Decision Consequences\n');
  put(d, 'spec.md', '- **AC-1** [bogus] returns 1.\n- **AC-2** [sensor] returns 2.\n- **AC-3** [run] returns 3.\n');
  const e = designLint(d);
  assert.ok(e.some((m) => /AC-1/.test(m) && /tag/.test(m)), e.join('|')); assert.ok(e.some((m) => /AC-2/.test(m) && /sensor/.test(m))); assert.ok(!e.some((m) => /AC-3/.test(m)));
});
test('trace: a [run] AC passes on delivery evidence, a [sensor] AC on a green sensor; without evidence it is NO EVIDENCE, never silently PASS', () => {
  const res = [{ name: 'AC-1 works', pass: true }, { name: 'AC-4 works', pass: true }];
  const ok = matrix(SPEC, res, { delivery: true, sensors: { complexity: true } });
  assert.deepEqual(ok.map((r) => r.result), ['PASS', 'PASS', 'PASS', 'PASS']);
  const no = matrix(SPEC, res, { delivery: false, sensors: { complexity: false } });
  assert.deepEqual(no.map((r) => r.result), ['PASS', 'NO EVIDENCE', 'NO EVIDENCE', 'PASS']);
  assert.equal(matrix(SPEC, res)[1].result, 'NO EVIDENCE'); // no evidence object at all
});
test('planlint: all [run] ACs live in ONE task that is last (depends on every other task) and does not mix test ACs', () => {
  const o = { protectedGlobs: [], spec: SPEC + '- **AC-5** [run] smoke passes.\n', requiredSensors: ['complexity', 'tests'] };
  const good = [T('t1', ['AC-1', 'AC-3', 'AC-4']), T('t2', ['AC-2', 'AC-5'], { deps: ['t1'] })];
  assert.deepEqual(lintPlan(good, o), []);
  assert.ok(lintPlan([T('t1', ['AC-1', 'AC-2', 'AC-3', 'AC-4', 'AC-5'])], o).some((m) => /mixes|run/.test(m)));
  assert.ok(lintPlan([T('t1', ['AC-1', 'AC-3', 'AC-4']), T('t2', ['AC-2'], { deps: ['t1'] }), T('t3', ['AC-5'], { deps: ['t1'] })], o).some((m) => /one delivery task/i.test(m)));
  assert.ok(lintPlan([T('t1', ['AC-2', 'AC-5']), T('t2', ['AC-1', 'AC-3', 'AC-4'], { paths: ['lib/'] })], o).some((m) => /last|depend/.test(m)));
});

const dockerStub = (d: string, health: boolean) => {
  const log = join(d, '../docker-log-' + Math.random().toString(36).slice(2));
  const p = put(d, '../docker-' + Math.random().toString(36).slice(2), '#!/bin/bash\necho "$*" >> ' + log + '\nexit 0\n'); chmodSync(p, 0o755);
  return { p, args: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []) };
};
const cfgFor = (health: string) => ({ deploy: { target: 'local', compose_file: 'docker-compose.yml', health_timeout_s: 1, health_command: health, smoke_command: 'true' } });

test('verifyDelivery: up, health, smoke, then ALWAYS down; failures carry a message the generator can act on', async () => {
  const d = tmp(); put(d, 'docker-compose.yml', 'services: {}\n'); put(d, 'README.md', 'x');
  const s = dockerStub(d, true);
  process.env.DAYLIGHT_DOCKER = s.p;
  const ok = await verifyDelivery(d, cfgFor('true'));
  assert.equal(ok.ok, true); assert.ok(s.args().some((a) => /up -d --build/.test(a))); assert.ok(s.args().some((a) => /down/.test(a)));
  const s2 = dockerStub(d, false); process.env.DAYLIGHT_DOCKER = s2.p;
  const bad = await verifyDelivery(d, cfgFor('false'));
  assert.equal(bad.ok, false); assert.match(bad.msg, /health/); assert.ok(s2.args().some((a) => /down/.test(a)), 'cleans up after a failure too');
  const none = await verifyDelivery(d, { deploy: { target: 'none' } });
  assert.equal(none.ok, true); assert.match(none.msg, /nothing to run/i);
  delete process.env.DAYLIGHT_DOCKER;
});

function runProj(health: string) {
  const d = tmp(); put(d, 'daylight.yaml', MIN_YAML.replace('deploy:\n  target: local\n', '') + 'deploy:\n  target: local\n  compose_file: docker-compose.yml\n  health_timeout_s: 1\n  health_command: "' + health + '"\n  smoke_command: "true"\nretries:\n  task: 1\n'); put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  const spec = put(d, 'spec.md', '- **AC-1** [run] The container answers /health.\n');
  put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 'Docker', acs: ['AC-1'], paths: ['Dockerfile', 'docker-compose.yml'], deps: [] }] }));
  const log = join(d, '../calls-' + Math.random().toString(36).slice(2));
  const g = put(d, '../g-' + Math.random().toString(36).slice(2), '#!/bin/bash\necho "$*" >> ' + log + '\nmkdir -p x; echo "services: {}" > docker-compose.yml; echo "FROM node" > Dockerfile; echo \'{"result":"done"}\'\n'); chmodSync(g, 0o755);
  const dk = put(d, '../dk-' + Math.random().toString(36).slice(2), '#!/bin/bash\nexit 0\n'); chmodSync(dk, 0o755);
  return { d, spec, g, dk, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split(/\n(?=-p )/).filter(Boolean) : []) };
}
const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
test('inner: a run-mode task is verified by executing the delivery, passes with ZERO evaluator calls and no TDD red step', () => {
  const p = runProj('true');
  const r = cli(['inner', 'run', '--plan', join(p.d, 'plan.json'), '--spec', p.spec], { cwd: p.d, env: { DAYLIGHT_CLAUDE: p.g, DAYLIGHT_DOCKER: p.dk, DAYLIGHT_RUN: 'r1' } });
  assert.ok(r.out, r.err); assert.equal(JSON.parse(r.out).t1, 'passed', r.err + r.out);
  assert.equal(p.calls().filter((c) => c.includes('--agent daylight:evaluator')).length, 0);
  assert.ok(events(p.d).some((e) => e.kind === 'x_delivery' && e.ok === true));
});
test('inner: a failing delivery is fed back to the generator as a message and the evaluator is never paid', () => {
  const p = runProj('false');
  const r = cli(['inner', 'run', '--plan', join(p.d, 'plan.json'), '--spec', p.spec], { cwd: p.d, env: { DAYLIGHT_CLAUDE: p.g, DAYLIGHT_DOCKER: p.dk, DAYLIGHT_RUN: 'r1' } });
  assert.ok(r.out, r.err); assert.equal(JSON.parse(r.out).t1, 'escalated');
  const gens = p.calls().filter((c) => c.includes('--agent daylight:generator'));
  assert.equal(gens.length, 2); assert.match(gens[1], /health/);
  assert.equal(p.calls().filter((c) => c.includes('--agent daylight:evaluator')).length, 0);
});
