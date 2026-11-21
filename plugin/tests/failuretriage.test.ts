import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, tmp, put, events, MIN_YAML } from './helpers.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
function proj(retries: number) {
  const d = tmp(); put(d, 'daylight.yaml', MIN_YAML + 'retries:\n  task: ' + retries + '\n'); put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init'); return d;
}
const stubFor = (d: string, evalReply: string) => {
  const log = join(d, '../calls-' + Math.random().toString(36).slice(2));
  const s = put(d, '../s-' + Math.random().toString(36).slice(2), "#!/bin/bash\necho \"$*\" >> " + log + "\nif [[ \"$*\" == *daylight:evaluator* ]]; then echo '" + evalReply + "'; else mkdir -p src; echo x > src/g-$$.ts; echo '{\"result\":\"done\"}'; fi\n");
  chmodSync(s, 0o755); return { s, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split(/\n(?=-p )/).filter(Boolean) : []) };
};
const run = (d: string, s: string) => cli(['inner', 'run', '--plan', join(d, 'plan.json')], { cwd: d, env: { DAYLIGHT_CLAUDE: s, DAYLIGHT_RUN: 'r1' } });
const failJson = (cite: string) => JSON.stringify({ result: JSON.stringify({ verdict: 'fail', criteria: [{ id: 'ac-met', result: 'fail', cite }], feedback: 'x', citations: [cite] }) });

test('triage: an evaluator that only cites files the task cannot edit stops after ONE evaluator call as a plan defect (bh11 t3 took five)', () => {
  const d = proj(4); put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 't', acs: ['AC-1'], paths: ['src/'], deps: [], tdd: false }] }));
  const { s, calls } = stubFor(d, failJson('Dockerfile:1'));
  assert.equal(JSON.parse(run(d, s).out).t1, 'escalated');
  assert.equal(calls().filter((c) => c.includes('daylight:evaluator')).length, 1);
  const esc = events(d).find((e) => e.kind === 'x_escalation');
  assert.equal(esc.failure_class, 'plan'); assert.equal(esc.reason, 'unfixable_by_generator');
  assert.match(readFileSync(join(d, '.daylight/escalations/t1.md'), 'utf8'), /Failure class: plan/);
});
test('triage: a finding the generator can act on is still retried up to the cap', () => {
  const d = proj(2); put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 't', acs: ['AC-1'], paths: ['src/'], deps: [], tdd: false }] }));
  const { s, calls } = stubFor(d, failJson('src/a.ts:3'));
  run(d, s);
  assert.equal(calls().filter((c) => c.includes('daylight:generator')).length, 3);
});
test('contract: the generator prompt says tests are always allowed and the evaluator prompt carries the inline rubric and the harness facts, never a waiver', () => {
  const d = proj(1); put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 't', acs: ['AC-1'], paths: ['src/'], deps: [], tdd: false }] }));
  const { s, calls } = stubFor(d, JSON.stringify({ result: JSON.stringify({ verdict: 'pass', criteria: [] }) }));
  run(d, s);
  const all = calls(), g = all.find((c) => c.includes('--agent daylight:generator'))!, e = all.find((c) => c.includes('--agent daylight:evaluator'))!;
  assert.match(g, /always allowed/); assert.match(e, /ac-met/); assert.match(e, /Already established by the harness/); assert.doesNotMatch(e, /waiver/i);
});
test('fail-fast: after one task escalates, later waves are not started', () => {
  const d = proj(1);
  put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 'a', title: 'a', acs: [], paths: ['src/'], deps: [], tdd: false }, { id: 'b', title: 'b', acs: [], paths: ['src/'], deps: ['a'], tdd: false }] }));
  const { s } = stubFor(d, failJson('Dockerfile:1'));
  const r = JSON.parse(run(d, s).out); assert.equal(r.a, 'escalated'); assert.equal(r.b, 'blocked');
});
test('daylight red needs --task and --cmd (an argument-less call used to record a bogus red)', () => {
  const d = proj(1); const r = cli(['red'], { cwd: d, env: { DAYLIGHT_RUN: 'r1' } });
  assert.notEqual(r.code, 0); assert.match(r.err, /--task/);
});
