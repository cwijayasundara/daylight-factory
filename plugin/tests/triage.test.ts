import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, hook, events, tmp, put, MIN_YAML } from './helpers.ts';

const J = (r: { out: string }) => JSON.parse(r.out);
const prd = (d: string, extra = '') => put(d, 'prd.md', '# Todo API\n\nBuild a todo REST API.\n' + extra + '\n## Non-functional requirements\n- p95 < 200ms\n');

test('AC-98 a PRD file normalises into a work item with id, source, evidence', () => {
  const d = tmp(); const f = prd(d);
  const wi = J(cli(['workitem', f], { cwd: d }));
  assert.match(wi.id, /^wi-/); assert.equal(wi.source, 'prd'); assert.equal(wi.title, 'Todo API');
  assert.equal(wi.evidence[0].ref, f);
});
test('AC-98 a GitHub issue URL is read via gh and normalised', () => {
  const d = tmp();
  const gh = put(d, 'gh', '#!/bin/bash\necho \'{"title":"Fix login redirect","body":"see src/auth/login.ts","number":7,"url":"https://github.com/o/r/issues/7"}\'\n');
  spawnSync('chmod', ['+x', gh]);
  const wi = J(cli(['workitem', 'https://github.com/o/r/issues/7'], { cwd: d, env: { DAYLIGHT_GH: gh } }));
  assert.equal(wi.source, 'issue'); assert.equal(wi.title, 'Fix login redirect');
  assert.equal(wi.evidence[0].ref, 'https://github.com/o/r/issues/7'); assert.deepEqual(wi.paths, ['src/auth/login.ts']);
});
test('AC-98 a scheduled/alert task file is normalised as source task', () => {
  const d = tmp(); const f = put(d, 'alert.md', '---\nkind: task\n---\n# Health check failing\nservice api down, see logs/api.log\n');
  const wi = J(cli(['workitem', f], { cwd: d }));
  assert.equal(wi.source, 'task'); assert.equal(wi.title, 'Health check failing');
});
test('AC-99 triage returns size, tier, spec_needed and records the rationale as an event', () => {
  const d = tmp(); const f = prd(d);
  const r = J(cli(['triage', f, '--paths', 'src/util/format.ts'], { cwd: d, env: { DAYLIGHT_RUN: 'r1' } }));
  assert.deepEqual([r.size, r.tier, r.spec_needed], ['small', 'low', true]);
  const e = events(d).find((x) => x.kind === 'triage');
  assert.ok(e && e.rationale.length > 10);
});
test('AC-100 default rules classify each sensitive path as high with no tier config', () => {
  const d = tmp(); const f = prd(d);
  for (const p of ['src/auth/login.ts', 'src/authz/policy.ts', 'config/secrets.yaml', 'db/migrations/001.sql', 'src/billing/charge.ts', '.github/workflows/ci.yml', 'Dockerfile', 'deploy/prod.yml']) {
    assert.equal(J(cli(['triage', f, '--paths', p], { cwd: d })).tier, 'high', p);
  }
});
test('AC-100 operator rules in daylight.yaml extend and override the defaults', () => {
  const d = tmp(); const f = prd(d);
  const cfg = put(d, 'daylight.yaml', MIN_YAML + 'tiers:\n  rules:\n    - { tier: medium, paths: ["src/billing/receipts/**"] }\n    - { tier: high, paths: ["src/pricing/**"] }\n');
  const t = (p: string) => J(cli(['triage', f, '--paths', p, '--config', cfg], { cwd: d })).tier;
  assert.equal(t('src/billing/receipts/pdf.ts'), 'medium');
  assert.equal(t('src/pricing/rules.ts'), 'high');
});
test('AC-100 tier rules come from the base branch, not the feature branch', () => {
  const d = tmp(); const f = prd(d);
  const sh = (c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
  put(d, 'daylight.yaml', MIN_YAML + 'tiers:\n  rules:\n    - { tier: high, paths: ["src/pricing/**"] }\n');
  sh('git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm base && git checkout -qb feat');
  put(d, 'daylight.yaml', MIN_YAML + 'tiers:\n  rules:\n    - { tier: low, paths: ["src/pricing/**"] }\n');
  assert.equal(J(cli(['triage', f, '--paths', 'src/pricing/rules.ts', '--base', 'main'], { cwd: d })).tier, 'high');
});
test('AC-101 tier sets the Gate 2 policy', () => {
  const d = tmp();
  const cfg = put(d, 'daylight.yaml', MIN_YAML.replace('pr: { approver: agent }', 'pr: { approver: agent, human_after_agent: true }'));
  const pol = (tier: string, extra: string[] = []) => J(cli(['policy', '--tier', tier, '--config', cfg, ...extra], { cwd: d }));
  assert.deepEqual([pol('low').agent_only, pol('low').human_required], [true, false]);
  assert.deepEqual([pol('medium').agent_only, pol('medium').human_required], [false, true]);
  assert.deepEqual([pol('high').agent_only, pol('high').human_required], [false, true]);
  const lenient = put(d, 'd2.yaml', MIN_YAML.replace('pr: { approver: agent }', 'pr: { approver: agent, human_after_agent: false }'));
  assert.equal(J(cli(['policy', '--tier', 'medium', '--config', lenient], { cwd: d })).human_required, false);
  assert.equal(J(cli(['policy', '--tier', 'high', '--config', lenient], { cwd: d })).human_required, true);
});
test('AC-102 a scheduled trigger creates work items and triages them headless', () => {
  const d = tmp();
  put(d, '.daylight/inbox/a.md', '---\nkind: task\n---\n# Nightly dependency bump\nupdate package.json\n');
  const r = spawnSync('node', [join(process.cwd(), 'src/cli.ts'), 'trigger', 'run', '--inbox', join(d, '.daylight/inbox')], { cwd: d, encoding: 'utf8', input: '', env: { ...process.env, DAYLIGHT_RUN: 'r1' } });
  assert.equal(r.status, 0, r.stderr);
  const files = readdirSync(join(d, '.daylight/work'));
  assert.equal(files.length, 1);
  const wi = JSON.parse(readFileSync(join(d, '.daylight/work', files[0]), 'utf8'));
  assert.ok(wi.triage.tier && wi.status === 'triaged');
  assert.ok(events(d).some((e) => e.kind === 'triage'));
});
test('AC-103 an out-of-scope item is routed to a human, logged, and not attempted', () => {
  const d = tmp(); const f = put(d, 'o.md', '# Hire two contractors\nlegal review of contracts\n');
  const r = J(cli(['triage', f], { cwd: d, env: { DAYLIGHT_RUN: 'r1' } }));
  assert.equal(r.route, 'human'); assert.equal(r.attempt, false);
  assert.ok(events(d).some((e) => e.kind === 'x_escalation' && e.reason === 'out_of_scope'));
});
test('AC-104 the guard denies credential paths, logs each denial, and scrubs prod env', () => {
  const d = tmp();
  const g = (payload: object) => { const r = spawnSync('node', [join(process.cwd(), 'src/guard.ts')], { cwd: d, input: JSON.stringify({ cwd: d, hook_event_name: 'PreToolUse', ...payload }), encoding: 'utf8', env: { ...process.env, DAYLIGHT_RUN: 'r1' } }); return r; };
  assert.equal(g({ tool_name: 'Read', tool_input: { file_path: join(d, '.env') } }).status, 2);
  assert.equal(g({ tool_name: 'Read', tool_input: { file_path: '/Users/x/.aws/credentials' } }).status, 2);
  assert.equal(g({ tool_name: 'Bash', tool_input: { command: 'cat .env.production' } }).status, 2);
  assert.equal(g({ tool_name: 'REPL', tool_input: { code: "await file('.env').text()" } }).status, 2);
  assert.equal(g({ tool_name: 'Read', tool_input: { file_path: join(d, 'src/app.ts') } }).status, 0);
  assert.equal(events(d).filter((e) => e.kind === 'x_denial').length, 4);
  const env = J(cli(['env-clean'], { cwd: d, env: { AWS_SECRET_ACCESS_KEY: 'x', PATH: process.env.PATH } }));
  assert.equal(env.AWS_SECRET_ACCESS_KEY, undefined);
});
