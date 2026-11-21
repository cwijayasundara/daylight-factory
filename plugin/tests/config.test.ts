import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, tmp, put, PLUGIN, MIN_YAML, CM_VAR } from './helpers.ts';

const run = (yaml: string, args = ['config', '--check']) => {
  const d = tmp();
  put(d, 'daylight.yaml', yaml);
  return cli([...args, '--file', join(d, 'daylight.yaml')]);
};

test('AC-3 unknown key exits non-zero and names the key path', () => {
  const r = run(MIN_YAML + 'bogus: 1\n');
  assert.notEqual(r.code, 0);
  assert.match(r.err, /bogus/);
});
test('AC-3 missing required key exits non-zero and names the key', () => {
  const r = run('deploy:\n  target: local\n');
  assert.notEqual(r.code, 0);
  assert.match(r.err, /gates/);
});
test('AC-3 out-of-range value (retries.task < 1) names /retries/task', () => {
  const r = run(MIN_YAML + 'retries:\n  task: 0\n');
  assert.notEqual(r.code, 0);
  assert.match(r.err, /\/retries\/task/);
});
test('AC-4 minimal config loads and --resolved prints merged defaults', () => {
  const r = run(MIN_YAML, ['config', '--resolved']);
  assert.equal(r.code, 0, r.err);
  const cfg = JSON.parse(r.out);
  assert.equal(cfg.retries.task, 3);
  assert.equal(cfg.models.generator, 'claude-sonnet-5-5');
  assert.equal(cfg.models.evaluator, 'claude-opus-5-5');
  assert.equal(cfg.gates.design.approver, 'human');
});
test('AC-5 schema covers every brief item', () => {
  const s = JSON.parse(readFileSync(join(PLUGIN, 'config/daylight.schema.json'), 'utf8'));
  const p = s.properties;
  for (const k of ['gates', 'models', 'effort', 'retries', 'sensors', 'deploy', 'wiki', 'dream', 'ledger', 'tiers']) assert.ok(p[k], k);
  assert.ok(p.gates.properties.design.properties.approver && p.gates.properties.design.properties.rubric);
  assert.ok(p.gates.properties.pr.properties.approver && p.gates.properties.pr.properties.rubric);
  for (const k of ['generator', 'evaluator', 'evaluator_fallback', 'judge', 'design']) assert.ok(p.models.properties[k], k);
  for (const k of ['design', 'generator_small', 'generator_default', 'generator_risky', 'evaluator']) assert.ok(p.effort.properties[k], k);
  assert.ok(p.retries.properties.task && p.retries.properties.design);
  for (const k of ['coverage_min', 'complexity_max', 'duplication_max', 'output_line_cap']) assert.ok(p.sensors.properties[k], k);
  assert.ok(p.deploy.properties.target && p.wiki.properties.enabled && p.dream.properties.schedule);
});
test('AC-6 no plugin file mentions the Code Mode variable literally', () => {
  const r = cli(['selfcheck', 'no-codemode-var']);
  assert.equal(r.code, 0, r.out + r.err);
  assert.ok(CM_VAR.length > 0);
});
