import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmp, put } from './helpers.ts';
import { editablePaths, scopeViolations, classifyFailure, citedFiles } from '../src/contract.ts';
import { evaluatorPrompt, generatorContract } from '../src/context.ts';
import { tddCheck, waiverFor } from '../src/tdd.ts';
import { append, auditFile } from '../src/lib/events.ts';

const T = (id: string, paths: string[], deps: string[] = []) => ({ id, title: id, acs: [], paths, deps }) as any;
const plan = [T('t1', ['src/main.ts']), T('t2', ['src/h.ts'], ['t1']), T('t3', ['Dockerfile'], ['t2']), T('t4', ['scripts/'], [])];

test('editablePaths: own paths plus those of every task in the dependency closure (they ran earlier)', () => {
  assert.deepEqual(editablePaths(plan[2], plan).sort(), ['Dockerfile', 'src/h.ts', 'src/main.ts']);
  assert.deepEqual(editablePaths(plan[3], plan), ['scripts/']);
});
test('scopeViolations: a dependent task may edit its dependencies files; tests are always allowed; an independent task may not', () => {
  assert.deepEqual(scopeViolations(['src/main.ts', 'tests/x.test.ts', 'Dockerfile'], plan[2], [], editablePaths(plan[2], plan)), []);
  assert.equal(scopeViolations(['src/main.ts'], plan[3], [], editablePaths(plan[3], plan)).length, 1);
  assert.equal(scopeViolations(['tests/a.test.ts'], { ...plan[3], tdd: false }, [], ['scripts/']).length, 0);
});
test('citedFiles: file paths from evaluator citations, not labels', () => {
  assert.deepEqual(citedFiles(['src/main.ts:4', 'Dockerfile:1-8 (CMD)', 'TDD-waiver', "tests/deploy.test.ts:73 (test 'x' is skipped)", 'package.json:7']).sort(), ['Dockerfile', 'package.json', 'src/main.ts', 'tests/deploy.test.ts']);
});
test('classifyFailure: citations only in files the task cannot edit, or the same citations twice, are plan defects; unusable verdicts are harness; the rest is the generators', () => {
  const ed = ['Dockerfile'];
  assert.equal(classifyFailure({ messages: [], citations: ['src/main.ts:4'], editable: ed }).cls, 'plan'); // bh11 t3
  assert.equal(classifyFailure({ messages: [], citations: ['Dockerfile:1', 'src/main.ts:4'], editable: ed }).cls, 'generator'); // something it can fix
  assert.equal(classifyFailure({ messages: [], citations: ['Dockerfile:1'], editable: ed, history: [['Dockerfile:1'], ['Dockerfile:1']] }).cls, 'plan'); // same finding three times
  assert.equal(classifyFailure({ messages: [], citations: ['Dockerfile:1'], editable: ed, history: [['Dockerfile:1']] }).cls, 'generator'); // twice is still worth a retry
  assert.equal(classifyFailure({ messages: ['the evaluator returned no usable verdict twice'], citations: [], editable: ed }).cls, 'harness');
  assert.equal(classifyFailure({ messages: ['complexity 11 > 10'], citations: [], editable: ed }).cls, 'generator');
  assert.equal(classifyFailure({ messages: [], citations: ['tests/x.test.ts:1'], editable: ed }).cls, 'generator'); // tests are always editable
});
test('evaluatorPrompt: inline rubric, AC text, facts the harness established, no waiver unless this attempt declared one', () => {
  const p = evaluatorPrompt({ task: plan[2], acText: ['AC-17: Dockerfile uses node:24-alpine'], editable: ['Dockerfile', 'src/main.ts'], diff: 'DIFF', rubric: 'RUBRIC-TEXT', waiver: '' });
  assert.match(p, /RUBRIC-TEXT/); assert.match(p, /AC-17: Dockerfile uses node:24-alpine/); assert.match(p, /already passed.*scope.*TDD|scope.*TDD.*already/is); assert.match(p, /Dockerfile, src\/main\.ts/);
  assert.doesNotMatch(p, /evaluator-rubric skill|waiver/i);
  assert.match(evaluatorPrompt({ task: plan[2], acText: [], editable: [], diff: 'D', rubric: 'R', waiver: 'old reason' }), /waiver.*old reason/is);
});
test('generatorContract: says tests are always allowed and lists inherited files', () => {
  const c = generatorContract(plan[2], plan);
  assert.match(c, /tests.*always allowed/i); assert.match(c, /src\/main\.ts/); assert.match(c, /src\/h\.ts/);
});
test('waiverFor and the red proof only count events after the given audit position', () => {
  const d = tmp(); process.env.DAYLIGHT_RUN = 'r7'; const f = auditFile(d);
  append(f, { kind: 'x_tdd_waiver', phase: 'inner', task: 't1', declared: true, reason: 'old' });
  append(f, { kind: 'x_tdd_reset', phase: 'inner', task: 't1', attempt: 1 });
  assert.equal(waiverFor(d, 't1'), 'old');
  assert.equal(waiverFor(d, 't1', 2), ''); // after the reset (line 2) the old waiver is dead
  put(d, 'README.md', 'x'); spawnSync('bash', ['-c', 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init'], { cwd: d });
});
