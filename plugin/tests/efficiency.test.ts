import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, chmodSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, hook, events, tmp, put, PLUGIN, MIN_YAML, CM_VAR } from './helpers.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
const env = { DAYLIGHT_RUN: 'r1' };
const emit = (d: string, kind: string, data: object) => cli(['audit', 'emit', '--kind', kind, '--data', JSON.stringify(data)], { cwd: d, env });

test('AC-86 the report states tokens and wall-clock per phase and per model', () => {
  const d = tmp();
  emit(d, 'x_usage', { phase: 'inner', model: 'claude-sonnet-5-5', usage: { input_tokens: 111, output_tokens: 22 } });
  emit(d, 'x_usage', { phase: 'design', model: 'claude-opus-5-5', usage: { input_tokens: 333, output_tokens: 44 } });
  const out = join(d, 'r.html'); cli(['report', 'r1', '--out', out], { cwd: d, env });
  const html = readFileSync(out, 'utf8');
  for (const s of ['wall-clock', 'inner', 'design', 'claude-sonnet-5-5: in 111 / out 22', 'claude-opus-5-5: in 333 / out 44']) assert.ok(html.includes(s), s);
});
test('AC-87 phases are tagged and every headless phase passes through claude -p without Code Mode', () => {
  const { phases } = JSON.parse(readFileSync(join(PLUGIN, 'config/phases.json'), 'utf8'));
  assert.ok(phases.length >= 15); for (const p of phases) assert.ok(['headless', 'code-mode-capable'].includes(p.mode), p.id);
  const d = tmp();
  put(d, 'daylight.yaml', MIN_YAML + 'deploy:\n  health_command: "true"\n'.replace('deploy:\n', '').replace(/^/, '') );
  put(d, 'daylight.yaml', 'gates:\n  design: { approver: agent }\n  pr: { approver: agent }\ndeploy:\n  target: local\n  health_command: "true"\n  smoke_command: "true"\n');
  put(d, 'prd.md', '# P\nx\n\n## Non-functional requirements\n- fast\n'); put(d, 'plan.json', '{"tasks":[]}'); put(d, 'findings.json', '[]'); put(d, 'README.md', 'x'); put(d, 'src/a.ts', 'export const a = 1;\n');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  const results: string[] = [];
  for (const p of phases.filter((x: any) => x.mode === 'headless')) {
    const cmd = "bash -c 'node " + join(PLUGIN, 'src/cli.ts') + ' ' + p.smoke.args.join(' ') + " 2>&1 | tail -3; echo EXIT=\${PIPESTATUS[0]}'";
    const e: Record<string, string> = { ...process.env, ...env } as any; delete e[CM_VAR]; delete e.NODE_TEST_CONTEXT;
    const r = spawnSync('claude', ['-p', 'Run exactly this one shell command (do not modify or split it) and then reply with only the EXIT=<n> line it printed: ' + cmd, '--model', 'claude-haiku-5-5', '--allowedTools', 'Bash(bash:*)'], { cwd: d, env: e, encoding: 'utf8', timeout: 120000 });
    const m = r.stdout.match(/EXIT=(\d+)/);
    results.push(p.id + ':' + (m ? m[1] : 'none'));
    assert.ok(m, p.id + ' gave no exit code: ' + r.stdout + r.stderr);
    assert.equal(Number(m![1]), p.smoke.expect ?? 0, p.id + ' (' + cmd + ') -> ' + r.stdout);
  }
  writeFileSync(join(PLUGIN, '../docs/demos/headless-matrix.txt'), results.join('\n') + '\n');
});
const mkTranscript = (d: string, usageOut: number) => {
  const line = (type: string, text: string, ts: string, out = 0, tool = false) => JSON.stringify({ type, timestamp: ts, message: { content: tool ? [{ type: 'tool_use', name: 'REPL' }] : [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: out, cache_creation_input_tokens: 0, cache_read_input_tokens: 100 } } });
  return put(d, 't.jsonl', [line('user', 'BENCH-START', '2026-01-01T00:00:00.000Z'), line('assistant', '', '2026-01-01T00:00:10.000Z', usageOut, true), line('assistant', 'BENCH-END', '2026-01-01T00:00:20.000Z', usageOut)].join('\n') + '\n');
};
test('AC-88 benchmark compares Code Mode on/off and claims savings only when the data show it', () => {
  const d = tmp(); const off = put(d, 'off.json', JSON.stringify({ usage: { input_tokens: 50, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, num_turns: 7, duration_ms: 30000 }));
  const worse = cli(['benchmark', 'compare', '--on', mkTranscript(d, 500), '--off', off, '--start', 'BENCH-START', '--end', 'BENCH-END'], { cwd: d });
  assert.equal(worse.code, 0, worse.err);
  assert.match(worse.out, /round trips/i); assert.match(worse.out, /wall-clock/i); assert.match(worse.out, /No token savings observed/); assert.doesNotMatch(worse.out, /fewer tokens/);
  const better = cli(['benchmark', 'compare', '--on', mkTranscript(d, 5), '--off', put(d, 'off2.json', JSON.stringify({ usage: { input_tokens: 5000, output_tokens: 2000 }, num_turns: 9, duration_ms: 60000 })), '--start', 'BENCH-START', '--end', 'BENCH-END'], { cwd: d });
  assert.match(better.out, /fewer tokens/);
});
test('AC-88 the extractor anchors on the last start marker so earlier mentions do not widen the window', () => {
  const d = tmp(); const t = mkTranscript(d, 5);
  const noisy = put(d, 'noisy.jsonl', JSON.stringify({ type: 'assistant', timestamp: '2025-12-31T00:00:00.000Z', message: { content: [{ type: 'tool_use' }, { type: 'text', text: 'BENCH-START in an earlier test' }], usage: { input_tokens: 9999, output_tokens: 9999 } } }) + '\n' + readFileSync(t, 'utf8'));
  const off = put(d, 'o.json', JSON.stringify({ usage: { input_tokens: 5000, output_tokens: 2000 }, num_turns: 9, duration_ms: 60000 }));
  const r = cli(['benchmark', 'compare', '--on', noisy, '--off', off, '--start', 'BENCH-START', '--end', 'BENCH-END'], { cwd: d });
  assert.match(r.out, /\| output tokens \| 10 \|/); assert.match(r.out, /\| wall-clock \(s\) \| 20\.0 \|/);
});
test('AC-88 an arm with no data yields no comparison and no savings claim', () => {
  const d = tmp(); const empty = put(d, 'e.jsonl', JSON.stringify({ type: 'user', timestamp: '2026-01-01T00:00:00.000Z', message: { content: [{ type: 'text', text: 'BENCH-START BENCH-END' }] } }) + '\n');
  const off = put(d, 'o.json', JSON.stringify({ usage: { input_tokens: 5, output_tokens: 2 }, num_turns: 9, duration_ms: 60000 }));
  const r = cli(['benchmark', 'compare', '--on', empty, '--off', off, '--start', 'BENCH-START', '--end', 'BENCH-END'], { cwd: d });
  assert.match(r.out, /could not be measured/); assert.doesNotMatch(r.out, /fewer|less wall-clock/);
});
test('AC-89 passed-context size is logged per subagent and stays under the configured budget', () => {
  const d = tmp(); put(d, 'daylight.yaml', MIN_YAML + 'retries:\n  task: 1\ncontext:\n  budget_tokens: 12000\n'); put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 't', acs: ['AC-1'], paths: ['src/'], deps: [], tdd: false }] }));
  const stub = put(d, '../c-' + Math.random().toString(36).slice(2), "#!/bin/bash\nif [[ \"$*\" == *daylight:evaluator* ]]; then echo '{\"result\":\"{\\\"verdict\\\":\\\"pass\\\",\\\"criteria\\\":[]}\"}'; else mkdir -p src; echo x > src/g-$$.txt; echo '{\"result\":\"done\"}'; fi\n"); chmodSync(stub, 0o755);
  cli(['inner', 'run', '--plan', join(d, 'plan.json')], { cwd: d, env: { ...env, DAYLIGHT_CLAUDE: stub } });
  const c = events(d).find((e) => e.kind === 'x_context');
  assert.ok(c.tokens > 0 && c.tokens < 12000); assert.equal(c.budget, 12000); assert.equal(c.over_budget, false);
});
test('AC-90 a REPL-heavy batch is fully reconstructable from the audit log', () => {
  const d = tmp(); const base = { session_id: 's', model: 'm' };
  const code = "const [a, b] = await Promise.all([file('src/a.ts').text(), sh('npm test')]);\nsensorResult(b)";
  hook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'REPL', tool_input: { code }, tool_use_id: 'r' }, d);
  hook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: 'src/a.ts' }, tool_use_id: 'i1' }, d);
  hook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_use_id: 'i2' }, d);
  hook({ ...base, hook_event_name: 'PostToolUse', tool_name: 'REPL', tool_input: { code }, tool_response: { code, result: 'RES', stdout: 'OUT', stderr: 'ERR', toolsUsed: ['Read', 'Bash'] }, tool_use_id: 'r' }, d);
  const r = JSON.parse(cli(['audit', 'reconstruct', 'r1'], { cwd: d, env }).out);
  assert.equal(r.length, 1); assert.equal(r[0].code, code); assert.deepEqual([r[0].result, r[0].stdout, r[0].stderr], ['RES', 'OUT', 'ERR']);
  assert.deepEqual(r[0].inner.map((i: any) => i.tool), ['Read', 'Bash']); assert.match(r[0].inner[1].summary.input, /npm test/);
});
test('AC-91 gate and deploy-guard decisions do not depend on the sandbox', () => {
  const d = tmp();
  const g = (command: string) => spawnSync('node', [join(PLUGIN, 'src/guard.ts')], { cwd: d, encoding: 'utf8', input: JSON.stringify({ cwd: d, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }), env: { ...process.env, ...env, CLAUDE_CODE_SANDBOX: '0', SANDBOX_RUNTIME: 'disabled' } }).status;
  assert.equal(g('kubectl apply -f x'), 2); assert.equal(g('cat .env'), 2); assert.equal(g('git push origin main'), 2); assert.equal(g('echo ok'), 0);
  for (const f of readdirSync(join(PLUGIN, 'src'))) if (f.endsWith('.ts')) assert.doesNotMatch(readFileSync(join(PLUGIN, 'src', f), 'utf8'), /process\.env\.\w*SANDBOX/, f);
});
test('AC-112 an unavailable evaluator falls back loudly: degraded event, degraded verdicts, PR warning, prompt notice, no sole approval', () => {
  const d = tmp(); put(d, 'daylight.yaml', MIN_YAML + 'retries:\n  task: 1\n'); put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 't', acs: ['AC-1'], paths: ['src/'], deps: [], tdd: false }] }));
  const stub = put(d, '../c-' + Math.random().toString(36).slice(2), "#!/bin/bash\nif [[ \"$*\" == *daylight:evaluator* ]]; then if [[ \"$*\" == *claude-opus-5-5* ]]; then echo 'Claude usage limit reached' >&2; exit 1; fi; echo '{\"result\":\"{\\\"verdict\\\":\\\"pass\\\",\\\"criteria\\\":[]}\"}'; else mkdir -p src; echo x > src/g-$$.txt; echo '{\"result\":\"done\"}'; fi\n"); chmodSync(stub, 0o755);
  const r = cli(['inner', 'run', '--plan', join(d, 'plan.json')], { cwd: d, env: { ...env, DAYLIGHT_CLAUDE: stub } });
  assert.equal(JSON.parse(r.out).t1, 'passed');
  const ev = events(d);
  assert.ok(ev.some((e) => e.kind === 'degraded_evaluator' && e.to === 'claude-sonnet-5-5'));
  assert.equal(ev.find((e) => e.kind === 'verdict').degraded, true);
  assert.match(cli(['pr', 'body'], { cwd: d, env }).out, /DEGRADED/);
  const n = spawnSync('node', [join(PLUGIN, 'src/notice.ts')], { cwd: d, input: JSON.stringify({ cwd: d, hook_event_name: 'UserPromptSubmit' }), encoding: 'utf8' });
  assert.match(n.stdout, /degraded/i);
  const head = 'abc'; const dec = (extra: string[]) => cli(['gate', 'decide', 'pr', '--decision', 'approve', '--source', 'agent', '--head', head, ...extra], { cwd: d, env });
  dec(['--degraded']);
  for (const tier of ['medium', 'high']) assert.notEqual(cli(['gate', 'satisfied', 'pr', '--tier', tier, '--head', head], { cwd: d, env }).code, 0, tier);
});
