import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmp, put, PLUGIN, events } from './helpers.ts';

const STUB = "#!/usr/bin/env node\nconst fs = require('fs'), cp = require('child_process');\nconst a = process.argv.slice(2), prompt = a[a.indexOf('-p') + 1] || '';\nconst log = (r) => fs.appendFileSync(process.env.STUB_LOG, r + '\\n');\nconst out = (o) => process.stdout.write(JSON.stringify({ result: typeof o === 'string' ? o : JSON.stringify(o), usage: { input_tokens: 100, output_tokens: 10 }, total_cost_usd: 0.01 }));\nconst cleanEnv = () => { const e = { ...process.env }; delete e.NODE_TEST_CONTEXT; return e; };\nif (prompt.startsWith('/code-review') || prompt.startsWith('/security-review')) { log('review'); out('No findings.'); }\nelse if (a.includes('daylight:generator')) {\n  const id0 = (prompt.match(/^Task (\\w+):/) || [])[1]; if (process.env.STUB_BREAK === id0) { log('generator:' + id0 + ':broken'); out('done'); process.exit(0); }\n  const id = (prompt.match(/^Task (\\w+):/) || [])[1], ac = (prompt.match(/Acceptance criteria: (AC-\\d+)/) || [])[1], d = id === 't1' ? 'a' : 'b';\n  fs.mkdirSync('tests', { recursive: true });\n  fs.writeFileSync('tests/' + id + '.test.ts', \"import test from 'node:test';\\nimport assert from 'node:assert/strict';\\nimport { v } from '../src/\" + d + '/' + id + \".ts';\\ntest('\" + ac + ' ' + id + \" works', () => assert.equal(v, 1));\\n\");\n  const git = (...x) => cp.spawnSync('git', ['-c', 'user.name=g', '-c', 'user.email=g@g', ...x], { encoding: 'utf8' });\n  const red = cp.spawnSync('node', [process.env.STUB_CLI, 'red', '--task', id, '--cmd', 'node --test tests/'], { encoding: 'utf8', env: cleanEnv() });\n  log('generator:' + id + ':red=' + red.status);\n  git('add', '-A'); git('commit', '-q', '-m', 'test: failing tests for ' + ac);\n  fs.mkdirSync('src/' + d, { recursive: true }); fs.writeFileSync('src/' + d + '/' + id + '.ts', 'export const v = 1;\\n');\n  git('add', '-A'); git('commit', '-q', '-m', 'feat: implement ' + ac); out('done');\n}\nelse if (a.includes('daylight:evaluator')) { log('evaluator'); out({ verdict: 'pass', criteria: [] }); }\nelse if (a.includes('daylight:judge')) { log('judge'); out({ verdict: 'pass', criteria: [] }); }\nelse if (prompt.includes('design-rubric')) { log('gate1'); out({ decision: 'approve', scores: { testable: 5 }, feedback: '' }); }\nelse if (prompt.includes('daylight design skill')) {\n  log('design');\n  const dir = (prompt.match(/architecture\\.md in (\\S+?)\\.(?:\\s|$)/) || [])[1]; fs.mkdirSync(dir, { recursive: true });\n  fs.writeFileSync(dir + '/intent.md', '# Intent\\n\\n## Why\\nDemo.\\n\\n## Success criteria\\n- 95% of checks pass\\n');\n  fs.writeFileSync(dir + '/spec.md', '# Spec\\n\\n- **AC-1** module a returns 1 when imported.\\n' + (process.env.STUB_ONE_AC ? '' : '- **AC-2** module b returns 1 when imported.\\n'));\n  fs.writeFileSync(dir + '/architecture.md', '# Architecture\\n\\n### ADR-001 Plain modules\\n- **Status** accepted\\n- **Context** demo\\n- **Decision** plain modules\\n- **Consequences** none\\n\\n## NFR mapping\\n| NFR | Mechanism |\\n|---|---|\\n| NFR-1 | plain modules |\\n| NFR-2 | plain modules |\\n');\n  out('done');\n}\nelse if (prompt.includes('Write .daylight/plan.json')) {\n  log('plan'); fs.mkdirSync('.daylight', { recursive: true });\n  fs.writeFileSync('.daylight/plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 'module a', acs: ['AC-1'], paths: ['src/a/'], deps: [], size: 'small' }, { id: 't2', title: 'module b', acs: ['AC-2'], paths: ['src/b/'], deps: [], size: 'small' }] }));\n  out('done');\n}\nelse if (prompt.includes('pr-rubric')) { log('gate2'); out({ decision: 'approve', scores: { traceable: 5 }, feedback: '' }); }\nelse { log('unknown'); out('?'); }\n";
const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
const PRD = '# Demo\n\nBuild two modules.\n\n## Non-functional requirements\n- fast\n- small\n';

function fixture(fast = false) {
  const d = tmp(), aux = tmp();
  put(d, 'prd.md', PRD); put(d, 'README.md', 'demo'); put(d, '.gitignore', '.daylight/\nready.flag\n');
  put(d, 'daylight.yaml', 'fast_path: ' + fast + '\ngates:\n  design: { approver: agent }\n  pr: { approver: agent, human_after_agent: false }\ndeploy:\n  target: local\n  health_timeout_s: 5\n  health_command: "test -f ready.flag"\n  smoke_command: "true"\nsensors:\n  required: [tests, secrets]\n  commands:\n    tests: "node --test tests/"\nretries:\n  task: 1\n  design: 2\n');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  const claude = put(aux, 'claude-stub.cjs', STUB); chmodSync(claude, 0o755);
  const docker = put(aux, 'docker-stub', '#!/bin/bash\necho "$@" >> ' + join(aux, 'docker.log') + '\nif [[ "$*" == *" up "* ]]; then touch ready.flag; fi\n'); chmodSync(docker, 0o755);
  const log = join(aux, 'calls.log');
  const run = (args: string[] = [], run = 'e1', extra: Record<string, string> = {}) => {
    const env: Record<string, string> = { ...process.env, DAYLIGHT_RUN: run, DAYLIGHT_CLAUDE: claude, DAYLIGHT_DOCKER: docker, STUB_LOG: log, STUB_CLI: join(PLUGIN, 'src/cli.ts'), ...extra } as any;
    delete env.NODE_TEST_CONTEXT; delete env.DAYLIGHT_AUDIT_ROOT;
    const r = spawnSync('node', [join(PLUGIN, 'src/cli.ts'), 'run', 'prd.md', '--agents', ...args], { cwd: d, env, encoding: 'utf8', timeout: 240000 });
    let res: any = {}; try { res = JSON.parse(r.stdout.trim().split('\n').pop()!); } catch { /* keep empty */ }
    return { code: r.status, res, err: r.stderr, out: r.stdout };
  };
  const count = (k: string) => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter((l) => l === k || l.startsWith(k + ':')).length : 0);
  return { d, run, count, aux };
}

test('AC-92 stubbed pipeline: PRD to design, plan, parallel tasks, PR, Gate 2, merge, deploy and smoke with 0 human touchpoints', () => {
  const f = fixture(); const r = f.run();
  assert.equal(r.res.ok, true, JSON.stringify(r.res) + r.err);
  assert.equal(r.res.stage, 'done');
  assert.deepEqual([f.count('design'), f.count('gate1'), f.count('plan'), f.count('generator'), f.count('evaluator'), f.count('judge'), f.count('review'), f.count('gate2')], [1, 1, 1, 2, 2, 1, 2, 0]); // ADR-022: low tier Gate 2 is deterministic, no Opus approver call
  assert.match(sh(f.d, 'git log --oneline main').stdout, /Merge daylight\/run-e1/);
  assert.ok(existsSync(join(f.d, 'ready.flag')), 'docker stub ran up and health passed');
  assert.ok(existsSync(join(f.d, 'src/a/t1.ts')) && existsSync(join(f.d, 'src/b/t2.ts')));
  const ph = events(f.d, 'e1').filter((e) => e.kind === 'phase'), at = (n: string, s: string) => ph.findIndex((e) => e.name === n && e.status === s);
  assert.ok(at('judge', 'start') < at('review', 'end') && at('review', 'start') < at('judge', 'end'), 'judge and reviews run concurrently');
  const tp = spawnSync('node', [join(PLUGIN, 'src/cli.ts'), 'touchpoints'], { cwd: f.d, env: { ...process.env, DAYLIGHT_RUN: 'e1' }, encoding: 'utf8' });
  assert.equal(JSON.parse(tp.stdout).count, 0);
});
test('ADR-020 resume: a run stopped after plan resumes with no design, gate or plan call', () => {
  const f = fixture();
  const a = f.run(['--stop-after', 'plan']); assert.equal(a.res.ok, true, JSON.stringify(a.res) + a.err); assert.equal(a.res.stage, 'plan');
  assert.deepEqual([f.count('design'), f.count('plan'), f.count('generator')], [1, 1, 0]);
  const b = f.run(['--resume']); assert.equal(b.res.ok, true, JSON.stringify(b.res) + b.err); assert.equal(b.res.stage, 'done');
  assert.deepEqual([f.count('design'), f.count('gate1'), f.count('plan'), f.count('generator')], [1, 1, 1, 2]);
});
test('ADR-020 resume: a run stopped after the inner loop resumes with no generator or evaluator call', () => {
  const f = fixture();
  const a = f.run(['--stop-after', 'inner']); assert.equal(a.res.stage, 'inner', JSON.stringify(a.res) + a.err);
  assert.deepEqual([f.count('generator'), f.count('evaluator')], [2, 2]);
  const b = f.run(['--resume']); assert.equal(b.res.stage, 'done', JSON.stringify(b.res) + b.err);
  assert.deepEqual([f.count('design'), f.count('plan'), f.count('generator'), f.count('evaluator'), f.count('review')], [1, 1, 2, 2, 2]);
});
test('ADR-020 resume: a changed PRD invalidates the checkpoints and design runs again', () => {
  const f = fixture();
  f.run(['--stop-after', 'plan']);
  put(f.d, 'prd.md', PRD + '\n## Notes\nAlso handle edge cases.\n');
  const b = f.run(['--resume']); assert.equal(b.res.stage, 'done', JSON.stringify(b.res) + b.err);
  assert.equal(f.count('design'), 2); assert.equal(f.count('plan'), 2);
});
test('ADR-020 starting a run whose id already has a branch without --resume is refused clearly', () => {
  const f = fixture(); f.run(['--stop-after', 'plan']);
  const b = f.run([]); assert.equal(b.res.ok, false); assert.match(b.res.msg, /--resume/);
});
test('ADR-020 resume after an escalated task re-runs only that task; passed tasks are not repeated', () => {
  const f = fixture();
  const a = f.run([], 'e1', { STUB_BREAK: 't2' });
  assert.equal(a.res.ok, false); assert.equal(a.res.stage, 'inner'); assert.match(a.res.msg, /"t1":"passed"/); assert.match(a.res.msg, /"t2":"escalated"/);
  const before = f.count('generator');
  const b = f.run(['--resume']);
  assert.equal(b.res.ok, true, JSON.stringify(b.res) + b.err); assert.equal(b.res.stage, 'done');
  assert.equal(f.count('generator') - before, 1, 'only t2 ran again');
  assert.equal(f.count('design'), 1); assert.equal(f.count('plan'), 1);
  assert.ok(existsSync(join(f.d, 'src/a/t1.ts')) && existsSync(join(f.d, 'src/b/t2.ts')));
});
test('ADR-023 preflight: docker down stops the run before any model call', () => {
  const f = fixture(); const r = f.run([], 'e1', { DAYLIGHT_DOCKER: 'false' });
  assert.equal(r.res.ok, false); assert.equal(r.res.stage, 'preflight'); assert.match(r.res.msg, /docker/i);
  assert.deepEqual([f.count('design'), f.count('plan'), f.count('generator')], [0, 0, 0]);
});
test('ADR-024 fast path: a small low-tier PRD skips the Opus design gate and the planner and runs one task', () => {
  const f = fixture(true); const r = f.run([], 'e1', { STUB_ONE_AC: '1' });
  assert.equal(r.res.ok, true, JSON.stringify(r.res) + r.err); assert.equal(r.res.stage, 'done');
  assert.deepEqual([f.count('design'), f.count('gate1'), f.count('plan'), f.count('generator'), f.count('evaluator'), f.count('gate2')], [1, 0, 0, 1, 1, 0]);
  assert.ok(events(f.d, 'e1').some((e) => e.kind === 'x_fast_path'));
});
test('frozen run: --design-from and --plan-from skip design, Gate 1 and plan (no model calls), lint still gates, and the inner loop runs', () => {
  const src = fixture(); const a = src.run(['--stop-after', 'plan']); assert.equal(a.res.stage, 'plan', JSON.stringify(a.res) + a.err);
  const designDir = join(src.aux, 'frozen-design'); sh(src.d, 'mkdir -p ' + designDir + ' && cp docs/design/*.md ' + designDir + '/');
  const f = fixture(); const r = f.run(['--design-from', designDir, '--plan-from', join(src.d, '.daylight/plan.json')]);
  assert.equal(r.res.ok, true, JSON.stringify(r.res) + r.err);
  assert.deepEqual([f.count('design'), f.count('gate1'), f.count('plan'), f.count('generator')], [0, 0, 0, 2]);
  assert.ok(events(f.d, 'e1').some((e) => e.kind === 'x_frozen' && e.design && e.plan));
});
test('frozen run: a frozen plan that fails plan lint stops the run instead of running it', () => {
  const src = fixture(); src.run(['--stop-after', 'plan']);
  const designDir = join(src.aux, 'frozen-design'); sh(src.d, 'mkdir -p ' + designDir + ' && cp docs/design/*.md ' + designDir + '/');
  const bad = JSON.parse(readFileSync(join(src.d, '.daylight/plan.json'), 'utf8')); bad.tasks[0].deps = ['nope']; const pf = put(src.aux, 'bad-plan.json', JSON.stringify(bad));
  const f = fixture(); const r = f.run(['--design-from', designDir, '--plan-from', pf]);
  assert.equal(r.res.ok, false); assert.equal(r.res.stage, 'plan'); assert.match(r.res.msg, /unknown task/);
  assert.equal(f.count('generator'), 0);
});
