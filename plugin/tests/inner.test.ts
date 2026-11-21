import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, tmp, put, events, hook, PLUGIN, MIN_YAML } from './helpers.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
const STUB = String.raw`#!/bin/bash
printf '=== CALL\n%s\n' "$*" >> "$STUB_LOG"
if [[ "$*" == *daylight:evaluator* ]]; then
  case "$STUB_EVAL" in
    fail) echo '{"result":"{\"verdict\":\"fail\",\"criteria\":[{\"id\":\"c1\",\"result\":\"fail\",\"cite\":\"src/a.ts:3\"}],\"feedback\":\"fix src/a.ts:3\"}","usage":{"input_tokens":5,"output_tokens":5}}';;
    uncited) echo '{"result":"{\"verdict\":\"fail\",\"criteria\":[{\"id\":\"c1\",\"result\":\"fail\"}],\"feedback\":\"vague\"}"}';;
    *) echo '{"result":"{\"verdict\":\"pass\",\"criteria\":[{\"id\":\"c1\",\"result\":\"pass\"}],\"feedback\":\"\"}"}';;
  esac
else
  sleep 0.4; echo x > "gen-$$.txt"; echo '{"result":"done","usage":{"input_tokens":10,"output_tokens":5}}'
fi
`;
function repo(retries = 1, extra = '') {
  const d = tmp();
  put(d, 'daylight.yaml', MIN_YAML + 'retries:\n  task: ' + retries + '\n' + extra);
  put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  const stub = put(d, '../stub-' + Math.random().toString(36).slice(2), STUB); chmodSync(stub, 0o755);
  return { d, stub, log: stub + '.log' };
}
const plan = (d: string, tasks: object[]) => put(d, 'plan.json', JSON.stringify({ tasks }));
const T = (id: string, o: object = {}) => ({ id, title: 'task ' + id, acs: ['AC-1'], paths: ['src/'], deps: [], size: 'medium', tdd: false, ...o });
const run = (d: string, stub: string, log: string, evalMode: string) =>
  cli(['inner', 'run', '--plan', join(d, 'plan.json')], { cwd: d, env: { DAYLIGHT_CLAUDE: stub, STUB_LOG: log, STUB_EVAL: evalMode, DAYLIGHT_RUN: 'r1' } });
const calls = (log: string) => readFileSync(log, 'utf8').split('=== CALL\n').filter(Boolean);

test('AC-36 an AC with no task fails the plan check', () => {
  const d = tmp();
  const spec = put(d, 'spec.md', '- **AC-1** returns 200.\n- **AC-2** lists items.\n');
  const p = plan(d, [T('t1', { acs: ['AC-1'] })]);
  const r = cli(['plan', 'check', '--spec', spec, '--plan', p], { cwd: d });
  assert.notEqual(r.code, 0); assert.match(r.err, /AC-2/);
  assert.equal(cli(['plan', 'check', '--spec', spec, '--plan', plan(d, [T('t1', { acs: ['AC-1', 'AC-2'] })])], { cwd: d }).code, 0);
});
test('AC-37 each task runs in its own worktree branch; the main tree is untouched', () => {
  const { d, stub, log } = repo(); plan(d, [T('t1')]);
  const head = sh(d, 'git rev-parse HEAD').stdout;
  assert.equal(run(d, stub, log, 'pass').code, 0);
  assert.equal(sh(d, 'git rev-parse HEAD').stdout, head);
  assert.equal(sh(d, "git status --porcelain -- . ':!plan.json'").stdout.trim(), '');
  assert.ok(readdirSync(d).every((f) => !f.startsWith('gen-')));
  assert.match(sh(d, 'git branch').stdout, /daylight\/t1/);
  assert.ok(readdirSync(join(d, '.daylight/worktrees/t1')).some((f) => f.startsWith('gen-')));
});
test('AC-38 evaluator rejects a first commit with implementation but no failing test; AC tags required', () => {
  const d = tmp(); put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init && git checkout -qb f');
  const c = (msg: string) => sh(d, 'git add -A && git -c user.name=t -c user.email=t@t commit -qm ' + msg);
  put(d, 'src/a.ts', 'export const a = 1;'); c('impl first');
  put(d, 'tests/a.test.ts', "test('AC-1 a', () => {})"); c('tests');
  let r = cli(['tdd', 'check', '--base', 'main', '--branch', 'f'], { cwd: d });
  assert.notEqual(r.code, 0); assert.match(r.err, /implementation but no failing test/);
  sh(d, 'git checkout -q main && git checkout -qb g');
  put(d, 'tests/b.test.ts', "test('no tag', () => {})"); c('untagged');
  r = cli(['tdd', 'check', '--base', 'main', '--branch', 'g'], { cwd: d });
  assert.match(r.err, /AC id/);
});
test('AC-39 the red step is proven by a recorded failing test run before green', () => {
  const d = tmp(); put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init && git checkout -qb f');
  put(d, 'tests/a.test.ts', "test('AC-1 a', () => {})"); sh(d, 'git add -A && git -c user.name=t -c user.email=t@t commit -qm tests');
  const noRed = cli(['tdd', 'check', '--base', 'main', '--branch', 'f', '--task', 't1'], { cwd: d, env: { DAYLIGHT_RUN: 'r1' } });
  assert.notEqual(noRed.code, 0); assert.match(noRed.err, /red/i);
  assert.notEqual(cli(['red', '--task', 't1', '--cmd', 'true'], { cwd: d, env: { DAYLIGHT_RUN: 'r1' } }).code, 0, 'a passing run is not red');
  assert.equal(cli(['red', '--task', 't1', '--cmd', 'false'], { cwd: d, env: { DAYLIGHT_RUN: 'r1' } }).code, 0);
  assert.equal(cli(['tdd', 'check', '--base', 'main', '--branch', 'f', '--task', 't1'], { cwd: d, env: { DAYLIGHT_RUN: 'r1' } }).code, 0);
});
test('AC-40 generator is Sonnet 5.5 and evaluator Opus 5.5 by default, overridable in daylight.yaml', () => {
  const { d, stub, log } = repo(1, 'models:\n  evaluator: claude-opus-5-6\n'); plan(d, [T('t1')]);
  run(d, stub, log, 'pass');
  const c = calls(log);
  assert.match(c.find((x) => x.includes('daylight:generator'))!, /--model claude-sonnet-5-5/);
  assert.match(c.find((x) => x.includes('daylight:evaluator'))!, /--model claude-opus-5-6/);
  const ds = events(d).filter((e) => e.kind === 'x_dispatch');
  assert.deepEqual(ds.map((e) => e.model), ['claude-sonnet-5-5', 'claude-opus-5-6']);
  const fm = (f: string) => readFileSync(join(PLUGIN, 'agents', f), 'utf8');
  assert.match(fm('generator.md'), /model: claude-sonnet-5-5/); assert.match(fm('evaluator.md'), /model: claude-opus-5-5/);
});
test('AC-41 verdict JSON: a fail needs a citation, otherwise it is inconclusive and cannot block', () => {
  const d = tmp(); const n = (o: object) => cli(['verdict', 'normalize', put(d, 'v.json', JSON.stringify(o))], { cwd: d });
  assert.equal(JSON.parse(n({ verdict: 'fail', criteria: [{ id: 'c', result: 'fail', cite: 'src/a.ts:3' }] }).out).effective, 'fail');
  assert.equal(JSON.parse(n({ verdict: 'fail', criteria: [{ id: 'c', result: 'fail' }] }).out).effective, 'inconclusive');
  assert.equal(JSON.parse(n({ verdict: 'pass', criteria: [] }).out).effective, 'pass');
  assert.notEqual(n({ criteria: [] }).code, 0);
});
test('AC-42 / AC-43 retry gets a fresh minimal context with cited feedback; cap stops the next attempt', () => {
  const { d, stub, log } = repo(2); plan(d, [T('t1')]);
  const r = run(d, stub, log, 'fail');
  assert.equal(JSON.parse(r.out).t1, 'escalated');
  const gens = calls(log).filter((x) => x.includes('daylight:generator'));
  assert.equal(gens.length, 3, 'one attempt plus two retries, no fourth');
  assert.match(gens[1], /src\/a\.ts:3/); assert.match(gens[1], /diff --git/);
  assert.doesNotMatch(gens[1], /Attempt 1/);
  const ctx = events(d).filter((e) => e.kind === 'x_context');
  assert.equal(ctx.length, 3); assert.ok(ctx.every((e) => e.tokens > 0));
});
test('AC-44 escalation writes a record, pauses only that task, independent tasks continue', () => {
  const { d, stub, log } = repo(1);
  plan(d, [T('a'), T('b'), T('c', { deps: ['a'] })]);
  const r = JSON.parse(run(d, stub, log, 'fail').out);
  assert.equal(r.a, 'escalated'); assert.equal(r.c, 'blocked');
  const rec = readFileSync(join(d, '.daylight/escalations/a.md'), 'utf8');
  assert.match(rec, /a/); assert.match(rec, /src\/a\.ts:3/);
  const ev = events(d);
  assert.ok(ev.some((e) => e.kind === 'x_escalation' && e.task === 'a'));
  assert.ok(ev.some((e) => e.kind === 'x_task_end' && e.task === 'b'));
});
test('AC-45 independent tasks run in parallel (overlapping windows in the log)', () => {
  const { d, stub, log } = repo(1); plan(d, [T('p1'), T('p2'), T('p3', { deps: ['p1'] })]);
  run(d, stub, log, 'pass');
  const ev = events(d); const at = (k: string, t: string) => Date.parse(ev.find((e) => e.kind === k && e.task === t).ts);
  assert.ok(at('x_task_start', 'p2') < at('x_task_end', 'p1'), 'p1 and p2 overlap');
  assert.ok(at('x_task_start', 'p3') >= at('x_task_end', 'p1'), 'p3 waits for p1');
});
test('AC-46 effort follows the policy and is logged', () => {
  const { d, stub, log } = repo(1); plan(d, [T('s', { size: 'small' }), T('m'), T('r', { risky: true })]);
  run(d, stub, log, 'pass');
  const eff = Object.fromEntries(events(d).filter((e) => e.kind === 'x_dispatch' && e.role === 'generator').map((e) => [e.task, e.effort]));
  assert.deepEqual(eff, { s: 'low', m: 'medium', r: 'high' });
  assert.match(calls(log).find((x) => x.includes('--effort low'))!, /daylight:generator/);
});
test('AC-47 the generator cannot edit rubric, sensor config or spec; denial is logged', () => {
  const d = tmp();
  const g = (role: string | undefined, file: string, tool = 'Edit') => spawnSync('node', [join(PLUGIN, 'src/guard.ts')], { cwd: d, encoding: 'utf8', input: JSON.stringify({ cwd: d, hook_event_name: 'PreToolUse', tool_name: tool, tool_input: { file_path: file }, agent_type: role }), env: { ...process.env, DAYLIGHT_RUN: 'r1' } });
  for (const f of ['docs/design/spec.md', 'rubrics/pr.md', 'daylight.yaml']) assert.equal(g('generator', join(d, f)).status, 2, f);
  assert.equal(g('generator', join(d, 'src/app.ts')).status, 0);
  assert.equal(g(undefined, join(d, 'daylight.yaml')).status, 0, 'only the generator is restricted');
  assert.equal(events(d).filter((e) => e.kind === 'x_denial' && e.reason === 'protected_path').length, 3);
});
test('AC-48 TDD, SOLID and SRP guides exist as rules and as skill text', () => {
  const rules = readFileSync(join(PLUGIN, 'rules/guides.md'), 'utf8');
  for (const w of ['TDD', 'SOLID', 'SRP', 'red', 'green', 'refactor']) assert.match(rules, new RegExp(w));
  assert.ok(existsSync(join(PLUGIN, 'CLAUDE.md')));
  assert.match(readFileSync(join(PLUGIN, 'CLAUDE.md'), 'utf8'), /guides\.md/);
  const skill = readFileSync(join(PLUGIN, 'skills/tdd-guides/SKILL.md'), 'utf8');
  for (const w of ['TDD', 'SOLID', 'SRP']) assert.match(skill, new RegExp(w));
});
