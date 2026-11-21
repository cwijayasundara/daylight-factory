import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, tmp, put, events, MIN_YAML } from './helpers.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
const proj = (sensors: string, files: Record<string, string> = {}, extraYaml = '') => {
  const d = tmp();
  put(d, 'daylight.yaml', MIN_YAML + 'sensors:\n' + sensors + extraYaml);
  for (const [f, c] of Object.entries(files)) put(d, f, c);
  return d;
};
const run = (d: string, extra: string[] = [], env: Record<string, string> = {}) => cli(['sensors', 'run', ...extra], { cwd: d, env: { DAYLIGHT_RUN: 'r1', ...env } });
const branchy = (n: number) => 'export function f(x: number) {\n' + '  if (x > 1) { x++; }\n'.repeat(n) + '  return x;\n}\n';

test('AC-49 fast sensors run by script without the model and results are logged', () => {
  const d = proj('  required: [tests]\n  commands:\n    tests: "echo ok"\n');
  assert.equal(run(d).code, 0);
  assert.ok(events(d).some((e) => e.kind === 'sensor' && e.name === 'tests' && e.ok === true));
  const bad = proj('  required: [tests]\n  commands:\n    tests: "exit 1"\n');
  assert.notEqual(run(bad).code, 0);
});
test('AC-50 thresholds come from daylight.yaml and change pass/fail', () => {
  const files = { 'src/a.ts': branchy(6) };
  assert.equal(run(proj('  required: []\n  complexity_max: 20\n', files)).code, 0);
  assert.notEqual(run(proj('  required: []\n  complexity_max: 3\n', files)).code, 0);
});
test('AC-51 a failing sensor prints file, rule and a suggestion, capped at the line cap', () => {
  const many = Array.from({ length: 200 }, (_, i) => branchy(12).replace('f(', 'f' + i + '(')).join('\n');
  const r = run(proj('  required: []\n  complexity_max: 3\n  output_line_cap: 10\n', { 'src/big.ts': many }));
  const lines = r.err.trim().split('\n');
  assert.ok(lines.length <= 11, 'got ' + lines.length);
  assert.match(lines[0], /src\/big\.ts:\d+/); assert.match(lines[0], /complexity/); assert.match(lines[0], /split|extract/i);
  assert.match(r.err, /more/);
});
test('AC-52 coverage below threshold fails, at or above passes', () => {
  const f = (pct: number) => ({ 'coverage/coverage-summary.json': JSON.stringify({ total: { lines: { pct } } }) });
  assert.notEqual(run(proj('  required: [coverage]\n  coverage_min: 80\n', f(79))).code, 0);
  assert.equal(run(proj('  required: [coverage]\n  coverage_min: 80\n', f(80))).code, 0);
});
test('AC-53 complexity and duplication limits fail a fixture function', () => {
  const dup = branchy(8) + '\n' + branchy(8).replace('function f(', 'function g(');
  const r = run(proj('  required: []\n  complexity_max: 50\n  duplication_max: 0.8\n', { 'src/d.ts': dup }));
  assert.notEqual(r.code, 0); assert.match(r.err, /duplicat|similar/i);
});
test('AC-54 dependency-layer violations and known-vulnerable dependencies fail', () => {
  const layers = '  required: []\n  layers:\n    - { from: "src/domain/**", cannot_import: "src/infra/**" }\n';
  const files = { 'src/domain/a.ts': "import { db } from '../infra/db.ts';\nexport const a = db;\n", 'src/infra/db.ts': 'export const db = 1;\n' };
  const r = run(proj(layers, files));
  assert.notEqual(r.code, 0); assert.match(r.err, /src\/domain\/a\.ts/); assert.match(r.err, /layer/i);
  assert.equal(run(proj(layers, { 'src/domain/a.ts': 'export const a = 1;\n' })).code, 0);
  const vuln = proj('  required: []\n  advisories:\n    - { name: lodash, below: "4.17.21", id: GHSA-test }\n', { 'package.json': JSON.stringify({ dependencies: { lodash: '4.17.15' } }) });
  const v = run(vuln); assert.notEqual(v.code, 0); assert.match(v.err, /lodash/);
});
test('AC-55 slow sensors run in the background and are never one long wait', () => {
  const d = proj('  required: []\n  commands:\n    mutation: "sleep 1.5; echo mutated"\n');
  const t0 = Date.now();
  const r = run(d, ['--slow', '--name', 'mutation']);
  assert.equal(r.code, 0); assert.ok(Date.now() - t0 < 1200, 'returned immediately');
  const st = JSON.parse(readFileSync(join(d, '.daylight/sensors/mutation.json'), 'utf8'));
  assert.equal(st.status, 'running');
  const w = cli(['sensors', 'wait', '--name', 'mutation', '--max', '10'], { cwd: d, env: { DAYLIGHT_RUN: 'r1' } });
  assert.equal(w.code, 0, w.err);
  assert.equal(JSON.parse(readFileSync(join(d, '.daylight/sensors/mutation.json'), 'utf8')).status, 'done');
  const cap = cli(['config', '--check', '--file', put(d, 'x.yaml', MIN_YAML + 'sensors:\n  slow_timeout_s: 600\n')], { cwd: d });
  assert.notEqual(cap.code, 0);
});
test('AC-56 a computational failure is final: the evaluator is skipped and cannot override it', () => {
  const d = proj('  required: [tests]\n  commands:\n    tests: "false"\n', {}, 'retries:\n  task: 1\n');
  put(d, 'README.md', 'x'); put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 't', acs: ['AC-1'], paths: ['src/'], deps: [], tdd: false }] }));
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  const stub = put(d, '../stub-pass-' + Math.random().toString(36).slice(2), String.raw`#!/bin/bash
if [[ "$*" == *daylight:evaluator* ]]; then echo '{"result":"{\"verdict\":\"pass\",\"criteria\":[{\"id\":\"c\",\"result\":\"pass\"}],\"feedback\":\"\"}"}'; else mkdir -p src; echo x > src/gen-$$.txt; echo '{"result":"done"}'; fi
`);
  chmodSync(stub, 0o755);
  const r = cli(['inner', 'run', '--plan', join(d, 'plan.json')], { cwd: d, env: { DAYLIGHT_CLAUDE: stub, DAYLIGHT_RUN: 'r1' } });
  assert.equal(JSON.parse(r.out).t1, 'escalated');
  const v = events(d).find((e) => e.kind === 'verdict');
  assert.equal(v.verdict, 'fail'); assert.equal(v.evaluator_verdict, 'skipped'); // the evaluator is not even paid for when the contract already failed
});
const TESTS = "import test from 'node:test';\ntest('AC-1 one', () => {});\ntest('AC-2 two', () => { throw new Error('x'); });\n";
test('AC-57 traceability matrix: AC -> tests -> result; unmapped or failing ACs fail the check', () => {
  const d = tmp();
  put(d, 'spec.md', '- **AC-1** returns 1.\n- **AC-2** returns 2.\n- **AC-3** returns 3.\n'); put(d, 'tests/x.test.ts', TESTS);
  const r = cli(['trace', '--spec', join(d, 'spec.md'), '--cmd', 'node --test --test-reporter=tap tests/'], { cwd: d });
  assert.notEqual(r.code, 0);
  assert.match(r.out, /AC-1.*AC-1 one.*PASS/); assert.match(r.out, /AC-2.*FAIL/); assert.match(r.out, /AC-3.*NO TEST/);
  put(d, 'spec.md', '- **AC-1** returns 1.\n'); put(d, 'tests/x.test.ts', "import test from 'node:test';\ntest('AC-1 one', () => {});\n");
  assert.equal(cli(['trace', '--spec', join(d, 'spec.md'), '--cmd', 'node --test --test-reporter=tap tests/'], { cwd: d }).code, 0);
});
test('AC-57 the matrix also reads spec-style runner output (npm test default reporter)', () => {
  const d = tmp(); put(d, 'spec.md', '- **AC-1** returns 1.\n- **AC-2** returns 2.\n');
  const r = cli(['trace', '--spec', join(d, 'spec.md'), '--cmd', "printf '  ✔ AC-1 one (0.5ms)\\n  ✖ AC-2 two (1.2ms)\\n'"], { cwd: d });
  assert.notEqual(r.code, 0); assert.match(r.out, /AC-1.*AC-1 one.*PASS/); assert.match(r.out, /AC-2.*FAIL/);
});
test('AC-58 the evaluator cannot mark an unmapped AC as covered', () => {
  const d = tmp();
  const m = put(d, 'm.json', JSON.stringify({ rows: [{ ac: 'AC-1', tests: ['t'], result: 'PASS' }, { ac: 'AC-2', tests: [], result: 'NO TEST' }] }));
  const v = put(d, 'v.json', JSON.stringify({ verdict: 'pass', criteria: [], covered: ['AC-1', 'AC-2'] }));
  const r = JSON.parse(cli(['verdict', 'normalize', v, '--matrix', m], { cwd: d }).out);
  assert.equal(r.effective, 'fail'); assert.deepEqual(r.covered, ['AC-1']); assert.match(r.citations.join(), /matrix:AC-2/);
});
test('AC-59 /code-review and /security-review raw outputs are stored as artefacts', () => {
  const d = tmp();
  const stub = put(d, 'claude', String.raw`#!/bin/bash
echo "{\"result\":\"RAW for $2\"}"
`);
  chmodSync(stub, 0o755);
  for (const k of ['code-review', 'security-review']) {
    assert.equal(cli(['review', 'capture', '--kind', k], { cwd: d, env: { DAYLIGHT_CLAUDE: stub, DAYLIGHT_RUN: 'r1' } }).code, 0);
    assert.match(readFileSync(join(d, '.daylight/reviews', k + '.txt'), 'utf8'), new RegExp('RAW for /' + k));
  }
  assert.equal(events(d).filter((e) => e.kind === 'x_review').length, 2);
});
test('AC-60 only reproducibly-cited findings block; others are advisory', () => {
  const d = tmp();
  const f = put(d, 'f.json', JSON.stringify([{ file: 'a.ts', line: 3, repro: 'npm test -- a', summary: 's1' }, { file: 'b.ts', summary: 's2' }, { line: 1, repro: 'x', summary: 's3' }]));
  const r = JSON.parse(cli(['review', 'classify', f], { cwd: d }).out);
  assert.deepEqual(r.blocking.map((x: any) => x.summary), ['s1']); assert.equal(r.advisory.length, 2);
});
test('AC-61 sensor config is read from the base branch, not the feature branch', () => {
  const d = proj('  required: []\n  complexity_max: 20\n', { 'src/a.ts': branchy(6) });
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm base && git checkout -qb feat');
  put(d, 'daylight.yaml', MIN_YAML + 'sensors:\n  required: []\n  complexity_max: 2\n');
  assert.notEqual(run(d).code, 0, 'feature-branch value applies without --base');
  assert.equal(run(d, ['--base', 'main']).code, 0, 'base-branch value wins');
});
const judgeStub = (d: string, body: string) => { const s = put(d, 'claude', "#!/bin/bash\necho '" + body + "'\n"); chmodSync(s, 0o755); return s; };
test('AC-105 the run judge (Opus) vetoes only with a citation', () => {
  const d = tmp(); put(d, 'spec.md', '- **AC-1** returns 1.\n');
  const cited = judgeStub(d, '{"result":"{\\"verdict\\":\\"fail\\",\\"criteria\\":[{\\"id\\":\\"spec-match\\",\\"result\\":\\"fail\\",\\"cite\\":\\"src/a.ts:1\\"}],\\"feedback\\":\\"x\\"}"}');
  const r = cli(['judge', '--spec', join(d, 'spec.md'), '--task', 't1'], { cwd: d, env: { DAYLIGHT_CLAUDE: cited, DAYLIGHT_RUN: 'r1' } });
  assert.notEqual(r.code, 0);
  const v = events(d).find((e) => e.kind === 'verdict' && e.role === 'judge');
  assert.equal(v.model, 'claude-opus-5-5'); assert.ok(events(d).some((e) => e.kind === 'x_veto' && e.task === 't1'));
  const unc = judgeStub(d, '{"result":"{\\"verdict\\":\\"fail\\",\\"criteria\\":[{\\"id\\":\\"spec-match\\",\\"result\\":\\"fail\\"}],\\"feedback\\":\\"x\\"}"}');
  assert.equal(cli(['judge', '--spec', join(d, 'spec.md'), '--task', 't2'], { cwd: d, env: { DAYLIGHT_CLAUDE: unc, DAYLIGHT_RUN: 'r1' } }).code, 0);
});
test('AC-106 scope check lists files changed outside declared task paths with no model call', () => {
  const d = tmp(); put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init && git checkout -qb daylight/t1');
  put(d, 'src/a/ok.ts', '1'); put(d, 'src/b/stray.ts', '2'); sh(d, 'git add -A && git -c user.name=t -c user.email=t@t commit -qm w');
  const p = put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 't', acs: [], paths: ['src/a/'], deps: [] }] }));
  const r = cli(['scope', 'check', '--plan', p, '--base', 'main'], { cwd: d });
  assert.notEqual(r.code, 0); assert.match(r.err, /src\/b\/stray\.ts/); assert.doesNotMatch(r.err, /src\/a\/ok\.ts/);
});
test('AC-106 scope is measured from where the task branched, not from main (design commits on the run branch are not drift)', () => {
  const d = tmp(); put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init && git checkout -qb daylight/run-1');
  put(d, 'docs/design/spec.md', 'design'); put(d, 'docs/wiki/overview.md', 'wiki'); sh(d, 'git add -A && git -c user.name=t -c user.email=t@t commit -qm design');
  sh(d, 'git checkout -qb daylight/t1'); put(d, 'src/a/ok.ts', '1'); sh(d, 'git add -A && git -c user.name=t -c user.email=t@t commit -qm task');
  const p = put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 't', acs: [], paths: ['src/a/'], deps: [] }] }));
  const r = cli(['scope', 'check', '--plan', p, '--base', 'main'], { cwd: d });
  assert.equal(r.code, 0, r.err);
});
test('AC-106 any task may add test files (the plan flag no longer matters); source outside paths is still flagged', () => {
  const d = tmp(); put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  for (const id of ['t1', 't2']) { sh(d, 'git checkout -q main && git checkout -qb daylight/' + id); put(d, 'tests/' + id + '.test.ts', '1'); put(d, 'Dockerfile', id); sh(d, 'git add -A && git -c user.name=t -c user.email=t@t commit -qm w'); }
  const plan = (tdd: boolean) => put(d, 'plan.json', JSON.stringify({ tasks: ['t1', 't2'].map((id) => ({ id, title: 't', acs: [], paths: ['Dockerfile'], deps: [], tdd })) }));
  assert.equal(cli(['scope', 'check', '--plan', plan(true), '--base', 'main'], { cwd: d }).code, 0);
  assert.equal(cli(['scope', 'check', '--plan', plan(false), '--base', 'main'], { cwd: d }).code, 0);
  put(d, 'src/stray.ts', '1'); sh(d, 'git checkout -q daylight/t1 && git add -A && git -c user.name=t -c user.email=t@t commit -qm stray');
  assert.match(cli(['scope', 'check', '--plan', plan(true), '--base', 'main'], { cwd: d }).err, /src\/stray\.ts/);
});
test('AC-107 vetoes and later recovery are recorded as events', () => {
  const d = tmp(); const env = { DAYLIGHT_RUN: 'r1' };
  cli(['audit', 'emit', '--kind', 'x_veto', '--data', '{"task":"t1"}'], { cwd: d, env });
  cli(['recovery', 'record', '--task', 't1', '--passed', 'true'], { cwd: d, env });
  const ev = events(d);
  assert.ok(ev.some((e) => e.kind === 'x_veto')); assert.ok(ev.some((e) => e.kind === 'x_recovery' && e.task === 't1' && e.recovered === true));
});
