import test from 'node:test';
import assert from 'node:assert/strict';
import { tddApplies } from '../src/plan.ts';

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
