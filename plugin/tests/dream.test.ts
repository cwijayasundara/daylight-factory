import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, chmodSync, readdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cli, tmp, put, events, MIN_YAML, CM_VAR } from './helpers.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
const env = { DAYLIGHT_RUN: 'r1' };
const emit = (d: string, kind: string, data: object) => cli(['audit', 'emit', '--kind', kind, '--data', JSON.stringify(data)], { cwd: d, env });
const stubGh = (d: string) => { const out = join(d, 'gh-args.txt'); const p = put(d, '../gh-' + Math.random().toString(36).slice(2), "#!/bin/bash\necho \"$@\" >> " + out + "\nwhile [ $# -gt 0 ]; do if [ \"$1\" = \"--body-file\" ]; then cp \"$2\" " + out + ".body; fi; shift; done\necho https://example.test/pr/1\n"); chmodSync(p, 0o755); return { p, out }; };
const hashDir = (d: string) => createHash('sha256').update(sh(d, 'find . -type f -not -path "./.git/*" | sort | xargs shasum').stdout).digest('hex');

test('AC-80 / AC-111 reflection groups lessons by category citing event ids and reads improvement signals', () => {
  const d = tmp();
  emit(d, 'sensor', { name: 'lint', ok: false, messages: ['src/a.ts:3 rule'] });
  emit(d, 'x_dispatch', { task: 't1', attempt: 2, role: 'generator' });
  emit(d, 'x_finding', { file: 'src/a.ts', line: 3, summary: 'unchecked input' });
  emit(d, 'gate', { gate: 'design', decision: 'reject', source: 'human', feedback: 'add NFR for rate limit' });
  emit(d, 'x_escalation', { task: 't1', reason: 'retry_cap' });
  emit(d, 'x_veto', { task: 't2', citations: ['src/b.ts:1'] });
  assert.equal(cli(['reflect', '--run', 'r1'], { cwd: d, env }).code, 0);
  const L = JSON.parse(readFileSync(join(d, '.daylight/lessons/r1.json'), 'utf8'));
  const ids = new Set(readFileSync(join(d, '.daylight/audit/r1.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).id));
  for (const c of ['failure', 'retry', 'reviewer_finding', 'human_correction', 'improvement_signal']) {
    const ls = L.lessons.filter((l: any) => l.category === c); assert.ok(ls.length, c);
    for (const l of ls) { assert.ok(l.events.length); for (const e of l.events) assert.ok(ids.has(e), e); }
  }
  assert.equal(L.lessons.filter((l: any) => l.category === 'improvement_signal').length, 2);
});
const PROPOSALS = { proposals: [
  { path: 'skills/evaluator-rubric/SKILL.md', action: 'append', content: '\n6. **lint-clean**: no new lint errors.\n', evidence: ['e1', 'e2'], expected_effect: 'fewer lint-driven retries', revert: 'git revert the dream commit' },
  { path: 'src/cli.ts', action: 'append', content: '// hack', evidence: ['e1'], expected_effect: 'x', revert: 'y' },
  { path: 'CLAUDE.md', action: 'append', content: '\nrule', expected_effect: 'x', revert: 'y' } ] };
function dreamSetup() {
  const d = tmp(); put(d, 'daylight.yaml', MIN_YAML);
  emit(d, 'sensor', { name: 'lint', ok: false }); cli(['reflect', '--run', 'r1'], { cwd: d, env });
  const repo = tmp();
  put(repo, 'plugin/skills/evaluator-rubric/SKILL.md', '# rubric\n1. ac-met\n'); put(repo, 'plugin/CLAUDE.md', '# rules\n'); put(repo, 'plugin/src/cli.ts', '// cli\n');
  sh(repo, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  const installed = tmp(); cpSync(join(repo, 'plugin'), installed, { recursive: true });
  const claude = put(d, '../claude-' + Math.random().toString(36).slice(2), "#!/bin/bash\nenv | grep -c '" + CM_VAR + "' > " + d + "/cm-count.txt\ncat <<'EOF'\n" + JSON.stringify({ result: JSON.stringify(PROPOSALS), total_cost_usd: 0.05 }) + "\nEOF\n");
  chmodSync(claude, 0o755);
  const gh = stubGh(d);
  const run = () => cli(['dream', 'run', '--repo', repo, '--target-dir', 'plugin', '--base', 'main'], { cwd: d, env: { ...env, DAYLIGHT_CLAUDE: claude, DAYLIGHT_GH: gh.p, CLAUDE_PLUGIN_ROOT: installed, [CM_VAR]: '1' } });
  return { d, repo, installed, run, gh, claude };
}
test('AC-81 / AC-84 proposals touch only allowlisted paths; others are dropped and logged', () => {
  const s = dreamSetup(); const r = s.run(); assert.equal(r.code, 0, r.err);
  const br = sh(s.repo, 'git branch --list "dream/*"').stdout.trim().replace('* ', '');
  const files = sh(s.repo, 'git diff --name-only main ' + br).stdout.trim().split('\n');
  assert.deepEqual(files, ['plugin/skills/evaluator-rubric/SKILL.md']);
  const dropped = events(s.d).filter((e) => e.kind === 'x_dropped');
  assert.ok(dropped.some((e) => e.reason === 'outside_allowlist' && e.path === 'src/cli.ts'));
});
test('AC-82 proposals arrive as a PR; the installed plugin and the main working tree are unchanged', () => {
  const s = dreamSetup(); const before = hashDir(s.installed), head = sh(s.repo, 'git rev-parse HEAD').stdout, tree = hashDir(s.repo);
  assert.equal(s.run().code, 0);
  assert.equal(hashDir(s.installed), before); assert.equal(sh(s.repo, 'git rev-parse HEAD').stdout, head);
  assert.equal(sh(s.repo, 'git branch --show-current').stdout.trim(), 'main');
  assert.equal(sh(s.repo, 'git status --porcelain').stdout.trim(), '');
  assert.match(readFileSync(s.gh.out, 'utf8'), /pr create/);
});
test('AC-83 every proposal states evidence, expected effect and how to revert; incomplete ones are dropped', () => {
  const s = dreamSetup(); s.run();
  const body = readFileSync(s.gh.out + '.body', 'utf8');
  for (const t of ['skills/evaluator-rubric/SKILL.md', 'Evidence: e1, e2', 'Expected effect: fewer lint-driven retries', 'Revert: git revert the dream commit']) assert.ok(body.includes(t), t);
  assert.ok(!body.includes('CLAUDE.md'));
  assert.ok(events(s.d).some((e) => e.kind === 'x_dropped' && e.reason === 'incomplete' && e.path === 'CLAUDE.md'));
});
test('AC-85 the dream schedule is installable and the job runs headless without Code Mode', () => {
  const s = dreamSetup();
  const sc = cli(['dream', 'schedule', 'install', '--dry-run'], { cwd: s.d, env: { ...env, [CM_VAR]: '1' } });
  assert.equal(sc.code, 0, sc.err); assert.match(sc.out, /^0 3 \* \* 0 /m); assert.match(sc.out, /dream run/);
  assert.ok(existsSync(join(s.d, '.daylight/schedule/dream.cron')));
  s.run(); assert.equal(readFileSync(join(s.d, 'cm-count.txt'), 'utf8').trim(), '0');
});
test('AC-109 replay re-runs fixture specs under two configs and reports cost vs quality side by side', () => {
  const d = tmp();
  for (const c of ['pr1', 'pr2']) {
    put(d, 'cases/' + c + '/spec.md', '- **AC-1** returns 1.\n'); put(d, 'cases/' + c + '/README.md', 'x');
    put(d, 'cases/' + c + '/plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 't', acs: ['AC-1'], paths: ['src/'], deps: [], tdd: false }] }));
    put(d, 'cases/' + c + '/daylight.yaml', MIN_YAML);
    sh(join(d, 'cases', c), 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  }
  put(d, 'a.yaml', MIN_YAML + 'models:\n  generator: claude-sonnet-5-5\n'); put(d, 'b.yaml', MIN_YAML + 'models:\n  generator: claude-haiku-5-5\neffort:\n  generator_default: low\n');
  const stub = put(d, '../claude-rp-' + Math.random().toString(36).slice(2), "#!/bin/bash\nif [[ \"$*\" == *daylight:evaluator* ]]; then echo '{\"result\":\"{\\\"verdict\\\":\\\"pass\\\",\\\"criteria\\\":[]}\",\"total_cost_usd\":0.02}'; else mkdir -p src; echo x > src/g-$$.txt; echo '{\"result\":\"done\",\"total_cost_usd\":0.01}'; fi\n");
  chmodSync(stub, 0o755);
  const r = cli(['replay', '--cases', join(d, 'cases'), '--n', '2', '--configs', join(d, 'a.yaml') + ',' + join(d, 'b.yaml')], { cwd: d, env: { ...env, DAYLIGHT_CLAUDE: stub } });
  assert.equal(r.code, 0, r.err);
  const rows = r.out.split('\n').filter((l) => /^\| pr\d/.test(l));
  assert.equal(rows.length, 4); assert.match(rows[0], /a\.yaml/); assert.match(r.out, /cost/i); assert.match(r.out, /sensors/i); assert.match(rows[0], /\$0\.03/);
});
test('AC-110 definition diff lists changes to the Daylight definition between two refs', () => {
  const d = tmp(); put(d, 'daylight.yaml', MIN_YAML + 'retries:\n  task: 3\n'); put(d, 'rubrics/pr.md', 'v1'); put(d, 'src/app.ts', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm v1 && git tag v1');
  put(d, 'daylight.yaml', MIN_YAML + 'retries:\n  task: 2\n'); put(d, 'rubrics/pr.md', 'v2'); put(d, 'src/app.ts', 'y');
  sh(d, 'git add -A && git -c user.name=t -c user.email=t@t commit -qm v2 && git tag v2');
  const r = cli(['definition', 'diff', 'v1', 'v2'], { cwd: d });
  assert.equal(r.code, 0, r.err); assert.match(r.out, /M\s+rubrics\/pr\.md/); assert.match(r.out, /M\s+daylight\.yaml/); assert.match(r.out, /retries\.task: 3 -> 2/); assert.doesNotMatch(r.out, /src\/app\.ts/);
});
