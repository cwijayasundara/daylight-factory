import test from 'node:test';
import assert from 'node:assert/strict';
import { tddApplies } from '../src/plan.ts';
import { tddInstruction } from '../src/context.ts';

const t = (paths: string[], tdd?: boolean) => ({ id: 't', title: 'x', acs: [], paths, deps: [], tdd });
test('tddApplies: code paths keep TDD', () => {
  assert.equal(tddApplies(t(['src/a.ts'])), true);
  assert.equal(tddApplies(t(['scripts/', 'package.json'])), true);
});
test('tddApplies: a config-only task (Dockerfile, compose, docs) has nothing to test first', () => {
  assert.equal(tddApplies(t(['Dockerfile', 'docker-compose.yml', '.dockerignore'])), false);
  assert.equal(tddApplies(t(['docs/', 'README.md'])), false);
});
test('tddApplies: planner opt-out is honoured', () => {
  assert.equal(tddApplies(t(['src/a.ts'], false)), false);
});
test('tddInstruction: code tasks get the red/waiver steps, config-only tasks get neither', () => {
  assert.match(tddInstruction(t(['src/a.ts']), 'cli.ts', 'npm test'), /red --task t --cmd "npm test"/);
  const c = tddInstruction(t(['Dockerfile']), 'cli.ts', 'npm test');
  assert.doesNotMatch(c, /--waive|red --task/); assert.match(c, /no code paths/);
});
