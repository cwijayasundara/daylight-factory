import test from 'node:test';
import assert from 'node:assert/strict';
import { editablePaths, scopeViolations, classifyFailure } from '../src/contract.ts';
import { taskMode, acModes } from '../src/plan.ts';

// Recorded from real runs (the run clones were later deleted; plans below are copied from the audit/plan output of each run).
const P = (id: string, acs: string[], paths: string[], deps: string[] = []) => ({ id, title: id, acs, paths, deps }) as any;
const BH11 = [P('t1', ['AC-1', 'AC-13'], ['src/json-body.ts', 'src/http-handler.ts', 'src/server.ts', 'src/main.ts']), P('t2', ['AC-7'], ['src/http-handler.ts'], ['t1']), P('t3', ['AC-17', 'AC-18'], ['Dockerfile', 'docker-compose.yml', '.dockerignore'], ['t1']), P('t4', ['AC-19', 'AC-20'], ['scripts/smoke.ts', 'package.json'])];
const BH9 = [P('t1', ['AC-1'], ['src/', 'package.json']), P('t3', ['AC-13', 'AC-14'], ['Dockerfile', 'docker-compose.yml', '.dockerignore', 'package.json'], ['t1'])];

test('corpus bh11 t3: five evaluator failures all cited src/main.ts:4 (owned by t1). Under the shared contract t3 may edit it, so the failure is generator-fixable', () => {
  const ed = editablePaths(BH11[2], BH11);
  assert.ok(ed.includes('src/main.ts'));
  assert.equal(classifyFailure({ messages: [], citations: ['src/main.ts:4'], editable: ed }).cls, 'generator');
  // the old contract (own paths only) would have been classed an unfixable plan defect on the first attempt instead of burning five
  assert.equal(classifyFailure({ messages: [], citations: ['src/main.ts:4'], editable: BH11[2].paths }).cls, 'plan');
});
test('corpus bh9 t3: creating src/main.ts (t1 owns src/) is no longer a scope violation for the Docker task', () => {
  assert.equal(scopeViolations(['Dockerfile', 'src/main.ts', 'tests/deploy.test.ts'], BH9[1], [], editablePaths(BH9[1], BH9)).length, 0);
  assert.equal(scopeViolations(['src/main.ts'], BH9[1], []).length, 1, 'own paths only: the old verdict');
});
test('corpus bh11 t4: a smoke-script-only task with tagged ACs is a run task and an untagged scripts-only task is still not TDD', () => {
  const tagged = acModes('- **AC-19** [run] smoke exits 0.\n- **AC-20** [run] smoke fails loudly.\n');
  assert.equal(taskMode(BH11[3], tagged), 'run');
  assert.equal(taskMode(BH11[3], acModes('- **AC-19** smoke exits 0.\n- **AC-20** smoke fails.\n')), 'none');
});
test('corpus greenfield: a complexity failure and a repeated generator-fixable citation are retried, not stopped early', () => {
  assert.equal(classifyFailure({ messages: ['complexity 11 > 10 in src/server.ts'], citations: [], editable: ['src/'] }).cls, 'generator');
  assert.equal(classifyFailure({ messages: [], citations: ['src/server.ts:40'], editable: ['src/'], history: [['src/server.ts:40']] }).cls, 'generator');
});
