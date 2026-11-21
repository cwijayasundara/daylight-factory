import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, tmp, put, events, MIN_YAML, PLUGIN } from './helpers.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
const env = { DAYLIGHT_RUN: 'r1' };
const emit = (d: string, kind: string, data: object) => cli(['audit', 'emit', '--kind', kind, '--data', JSON.stringify(data)], { cwd: d, env });
function prRepo(yamlGates = 'gates:\n  design: { approver: agent }\n  pr: { approver: agent, human_after_agent: true }\n') {
  const d = tmp();
  put(d, 'daylight.yaml', yamlGates + 'deploy:\n  target: local\n'); put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init && git checkout -qb daylight/t1');
  put(d, 'src/a.ts', 'export const a = 1;'); sh(d, 'git add -A && git -c user.name=t -c user.email=t@t commit -qm feat');
  const out = join(d, 'gh-body.txt');
  const gh = put(d, '../gh-' + Math.random().toString(36).slice(2), "#!/bin/bash\necho \"$@\" >> " + out + ".args\nwhile [ $# -gt 0 ]; do if [ \"$1\" = \"--body-file\" ]; then cp \"$2\" " + out + "; fi; shift; done\necho https://github.com/o/r/pull/1\n");
  chmodSync(gh, 0o755);
  return { d, gh, out, head: sh(d, 'git rev-parse HEAD').stdout.trim() };
}
function evidence(d: string, o: { matrix?: boolean; reviews?: string[] } = {}) {
  if (o.matrix !== false) put(d, '.daylight/trace.json', JSON.stringify({ rows: [{ ac: 'AC-1', tests: ['AC-1 one'], result: 'PASS' }] }));
  emit(d, 'sensor', { name: 'tests', ok: true }); emit(d, 'verdict', { role: 'evaluator', verdict: 'pass', task: 't1' });
  for (const k of o.reviews ?? ['code-review', 'security-review']) put(d, '.daylight/reviews/' + k + '.txt', 'RAW ' + k + ' output');
}
const create = (r: ReturnType<typeof prRepo>) => cli(['pr', 'create', '--branch', 'daylight/t1', '--base', 'main', '--title', 'T', '--no-push'], { cwd: r.d, env: { ...env, DAYLIGHT_GH: r.gh } });

test('AC-62 the PR body carries matrix, sensor table, verdicts and both review outputs', () => {
  const r = prRepo(); evidence(r.d);
  assert.equal(create(r).code, 0, create(r).err);
  const body = readFileSync(r.out, 'utf8');
  for (const s of ['## Traceability matrix', 'AC-1 one', '## Sensors', '| tests |', '## Evaluator verdicts', 'pass', '## /code-review', 'RAW code-review output', '## /security-review', 'RAW security-review output', 'Daylight-Run: r1']) assert.ok(body.includes(s), s);
  assert.match(readFileSync(r.out + '.args', 'utf8'), /--head daylight\/t1/);
});
test('AC-60 the PR body classifies review findings: blocking only with file, line and a reproducing command', () => {
  const r = prRepo(); evidence(r.d);
  const review = 'Findings:\n```json\n' + JSON.stringify([{ file: 'src/a.ts', line: 3, repro: 'npm test -- a', summary: 'crash on empty input', severity: 'important' }, { file: 'src/b.ts', line: 9, summary: 'slow path', severity: 'important' }]) + '\n```\n';
  put(r.d, '.daylight/reviews/code-review.txt', review);
  assert.equal(create(r).code, 0, create(r).err);
  const body = readFileSync(r.out, 'utf8');
  assert.match(body, /## Review findings[\s\S]*Blocking \(1\)[\s\S]*src\/a\.ts:3[\s\S]*Advisory \(1\)[\s\S]*src\/b\.ts:9/);
});
test('AC-62 the PR body carries run history: failed checks and fix rounds are disclosed automatically', () => {
  const r = prRepo(); evidence(r.d);
  emit(r.d, 'x_check', { stage: 'trace', ok: false, msg: 'AC-13 | - | NO TEST' });
  emit(r.d, 'x_task_end', { task: 'fix1', status: 'passed', attempts: 1 });
  emit(r.d, 'verdict', { role: 'judge', verdict: 'fail', task: 'run', citations: ['src/a.ts:1'] });
  assert.equal(create(r).code, 0, create(r).err);
  const body = readFileSync(r.out, 'utf8');
  assert.match(body, /## Run history[\s\S]*trace check failed[\s\S]*AC-13[\s\S]*judge[\s\S]*verdict fail[\s\S]*fix1 passed/);
});
test('AC-63 PR creation fails clearly when a section is missing', () => {
  const r = prRepo(); evidence(r.d, { reviews: ['code-review'] });
  const x = create(r);
  assert.notEqual(x.code, 0); assert.match(x.err, /\/security-review/);
  const y = prRepo(); evidence(y.d, { matrix: false });
  assert.match(create(y).err, /Traceability matrix/);
});
const dec = (r: { d: string }, who: string, head: string, extra: string[] = []) => cli(['gate', 'decide', 'pr', '--decision', 'approve', '--source', who, '--head', head, ...extra], { cwd: r.d, env });
const sat = (r: { d: string }, tier: string, head: string) => cli(['gate', 'satisfied', 'pr', '--tier', tier, '--head', head], { cwd: r.d, env });
test('AC-64 agent reviews first; human_after_agent additionally requires a human decision', () => {
  const r = prRepo();
  dec(r, 'agent', r.head);
  assert.notEqual(sat(r, 'medium', r.head).code, 0);
  assert.match(sat(r, 'medium', r.head).out, /human/);
  dec(r, 'human', r.head);
  assert.equal(sat(r, 'medium', r.head).code, 0);
  assert.ok(events(r.d).filter((e) => e.kind === 'gate').map((e) => e.source).join() === 'agent,human');
});
test('AC-65 an agent approval never satisfies human_required', () => {
  const r = prRepo('gates:\n  design: { approver: agent }\n  pr: { approver: agent, human_required: true, human_after_agent: false }\n');
  dec(r, 'agent', r.head);
  for (const tier of ['low', 'medium']) assert.notEqual(sat(r, tier, r.head).code, 0, tier);
  dec(r, 'human', r.head);
  assert.equal(sat(r, 'medium', r.head).code, 0);
});
test('AC-66 no push to the default branch and no merge without an approval for the PR head', () => {
  const r = prRepo();
  const g = (command: string) => spawnSync('node', [join(PLUGIN, 'src/guard.ts')], { cwd: r.d, encoding: 'utf8', input: JSON.stringify({ cwd: r.d, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }), env: { ...process.env, ...env } }).status;
  assert.equal(g('git push origin main'), 2); assert.equal(g('git push origin HEAD:main'), 2); assert.equal(g('git push origin daylight/t1'), 0);
  const merge = () => cli(['pr', 'merge', '--branch', 'daylight/t1', '--tier', 'low'], { cwd: r.d, env: { ...env, DAYLIGHT_GH: r.gh } });
  assert.notEqual(merge().code, 0);
  dec(r, 'agent', 'deadbeef');
  assert.match(merge().err, /head/);
  dec(r, 'agent', r.head);
  assert.equal(merge().code, 0, merge().err);
});
test('AC-66 a merge whose local base cannot fast-forward fails loudly instead of leaving a stale tree', () => {
  const r = prRepo(); const remote = tmp(); const other = tmp();
  sh(remote, 'git init -q --bare'); sh(r.d, 'git remote add origin ' + remote + ' && git push -q origin main daylight/t1');
  sh(other, 'git clone -q ' + remote + ' o && cd o && git checkout -q main && echo r > remote.txt && git add -A && git -c user.name=t -c user.email=t@t commit -qm remote-change && git push -q origin main');
  sh(r.d, 'git checkout -q main && echo l > local.txt && git add -A && git -c user.name=t -c user.email=t@t commit -qm local-only');
  dec(r, 'agent', r.head);
  const m = cli(['pr', 'merge', '--branch', 'daylight/t1', '--tier', 'low', '--base', 'main'], { cwd: r.d, env: { ...env, DAYLIGHT_GH: r.gh } });
  assert.notEqual(m.code, 0); assert.match(m.err, /fast-forward/);
});
test('AC-67 a new commit after Gate 2 approval invalidates the approval', () => {
  const r = prRepo(); dec(r, 'agent', r.head);
  assert.equal(cli(['gate', 'verify', 'pr', '--head', r.head], { cwd: r.d, env }).code, 0);
  put(r.d, 'src/b.ts', 'x'); sh(r.d, 'git add -A && git -c user.name=t -c user.email=t@t commit -qm more');
  const nh = sh(r.d, 'git rev-parse HEAD').stdout.trim();
  assert.notEqual(cli(['gate', 'verify', 'pr', '--head', nh], { cwd: r.d, env }).code, 0);
  assert.notEqual(sat(r, 'low', nh).code, 0);
});
test('AC-68 touchpoints are computed from gate events (0 with agent gates, escalations each counted)', () => {
  const t = (events: object[]) => { const d = tmp(); for (const e of events) { const { kind, ...rest } = e as any; emit(d, kind, rest); } return JSON.parse(cli(['touchpoints'], { cwd: d, env }).out).count; };
  const g = (gate: string, source: string, x: object = {}) => ({ kind: 'gate', gate, decision: 'approve', source, ...x });
  assert.equal(t([g('design', 'agent'), g('pr', 'agent')]), 0);
  assert.equal(t([g('design', 'human'), g('pr', 'human')]), 2);
  assert.equal(t([g('design', 'agent'), g('pr', 'agent'), { kind: 'x_escalation', task: 'a', reason: 'retry_cap' }]), 1);
  assert.equal(t([g('design', 'human', { after_escalation: true }), { kind: 'x_escalation', gate: 'design', reason: 'retry_cap' }]), 1);
});
