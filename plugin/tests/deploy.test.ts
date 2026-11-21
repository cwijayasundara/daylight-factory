import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, chmodSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, tmp, put, events, PLUGIN } from './helpers.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
const base = { DAYLIGHT_RUN: 'r1' };
function dep(extra = '') {
  const d = tmp();
  put(d, 'daylight.yaml', 'gates:\n  design: { approver: agent }\n  pr: { approver: agent }\ndeploy:\n  target: local\n  health_timeout_s: 1\n  health_command: "test -f ready.flag"\n  smoke_command: "true"\n' + extra);
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  const log = join(d, 'docker.log');
  const stub = put(d, '../docker-' + Math.random().toString(36).slice(2), '#!/bin/bash\necho "$@" >> ' + log + '\nif [[ "$*" == *" up "* ]]; then touch ready.flag; fi\nif [[ "$*" == *logs* ]]; then echo LOGLINE; fi\n');
  chmodSync(stub, 0o755);
  const head = sh(d, 'git rev-parse HEAD').stdout.trim();
  const env = { ...base, DAYLIGHT_DOCKER: stub };
  const approve = (h = head) => cli(['gate', 'decide', 'pr', '--decision', 'approve', '--source', 'agent', '--head', h], { cwd: d, env });
  const deploy = () => cli(['deploy', '--head', head], { cwd: d, env });
  return { d, log, head, env, approve, deploy };
}
test('AC-69 deploy runs docker compose up and waits for health; on timeout it fails and collects logs', () => {
  const a = dep(); a.approve();
  const r = a.deploy(); assert.equal(r.code, 0, r.err);
  assert.match(readFileSync(a.log, 'utf8'), /compose -f docker-compose\.yml up -d --build/);
  const b = dep('  compose_file: docker-compose.yml\n'); b.approve();
  sh(b.d, 'sed -i.bak "s/test -f ready.flag/test -f never.flag/" daylight.yaml');
  const f = b.deploy(); assert.notEqual(f.code, 0); assert.match(f.err, /health/);
  assert.match(readFileSync(join(b.d, '.daylight/deploy-logs.txt'), 'utf8'), /LOGLINE/);
});
test('AC-70 smoke suite runs after deploy and a smoke failure fails the deploy phase', () => {
  const a = dep(); a.approve(); a.deploy();
  assert.ok(events(a.d).some((e) => e.kind === 'x_deploy' && e.stage === 'smoke' && e.ok === true));
  const b = dep(); b.approve();
  sh(b.d, 'sed -i.bak "s/smoke_command: \\"true\\"/smoke_command: \\"echo SMOKEFAIL; false\\"/" daylight.yaml');
  const r = b.deploy(); assert.notEqual(r.code, 0); assert.match(r.err, /smoke/);
});
test('AC-71 the deploy guard blocks foreign targets and logs the block', () => {
  const d = tmp();
  const g = (command: string) => spawnSync('node', [join(PLUGIN, 'src/guard.ts')], { cwd: d, encoding: 'utf8', input: JSON.stringify({ cwd: d, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }), env: { ...process.env, ...base } }).status;
  for (const bad of ['kubectl apply -f x.yaml', 'docker -H tcp://prod:2375 compose up', 'docker compose -f prod.yml up -d', 'docker push registry/app', 'fly deploy', 'terraform apply']) assert.equal(g(bad), 2, bad);
  assert.equal(g('docker compose up -d --build'), 0); assert.equal(g('docker compose -f docker-compose.yml up -d'), 0);
  assert.ok(events(d).filter((e) => e.kind === 'x_denial' && e.reason === 'deploy_guard').length >= 6);
});
test('AC-72 deploy refuses without a Gate 2 approval for the head commit', () => {
  const a = dep(); const r = a.deploy();
  assert.notEqual(r.code, 0); assert.match(r.err, /Gate 2/);
  assert.ok(!existsSync(a.log), 'docker never ran');
  a.approve('deadbeef'); assert.notEqual(a.deploy().code, 0); assert.ok(!existsSync(a.log));
});
test('AC-73 / AC-74 a failing health check becomes a new task that re-enters triage', () => {
  const a = dep(); 
  const m = cli(['monitor'], { cwd: a.d, env: a.env }); assert.equal(m.code, 0);
  const f = readdirSync(join(a.d, '.daylight/inbox'))[0];
  const t = readFileSync(join(a.d, '.daylight/inbox', f), 'utf8');
  assert.match(t, /kind: task/); assert.match(t, /origin_run: r1/); assert.match(t, /health/);
  const tr = cli(['trigger', 'run'], { cwd: a.d, env: a.env }); assert.equal(tr.code, 0, tr.err);
  const wi = JSON.parse(readFileSync(join(a.d, '.daylight/work', readdirSync(join(a.d, '.daylight/work'))[0]), 'utf8'));
  assert.equal(wi.source, 'task'); assert.ok(wi.evidence.some((e: any) => e.ref === 'r1')); assert.equal(wi.status, 'triaged');
  assert.ok(events(a.d).some((e) => e.kind === 'triage'));
});
