import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, tmp, hook, events } from './helpers.ts';

const env = { DAYLIGHT_RUN: 'r1' };
function run() {
  const d = tmp();
  const emit = (kind: string, data: object) => cli(['audit', 'emit', '--kind', kind, '--data', JSON.stringify(data)], { cwd: d, env });
  const base = { session_id: 's', model: 'claude-sonnet-5-5' };
  emit('phase', { name: 'design', phase: 'design' });
  emit('gate', { gate: 'design', decision: 'approve', source: 'human', phase: 'design' });
  emit('x_dispatch', { phase: 'inner', task: 't1', attempt: 1, role: 'generator', model: 'claude-sonnet-5-5', effort: 'medium' });
  emit('x_dispatch', { phase: 'inner', task: 't1', attempt: 2, role: 'generator', model: 'claude-sonnet-5-5', effort: 'high' });
  emit('x_usage', { phase: 'inner', model: 'claude-sonnet-5-5', usage: { input_tokens: 1200, output_tokens: 300 }, cost_usd: 0.0123 });
  emit('x_usage', { phase: 'inner', model: 'claude-opus-5-5', usage: { input_tokens: 800, output_tokens: 90 }, cost_usd: 0.02 });
  emit('sensor', { phase: 'sensors', name: 'tests', ok: true }); emit('sensor', { phase: 'sensors', name: 'lint', ok: false });
  emit('verdict', { phase: 'judge', role: 'judge', verdict: 'fail', task: 't1' }); emit('x_veto', { phase: 'judge', task: 't1' });
  emit('verdict', { phase: 'judge', role: 'judge', verdict: 'pass', task: 't2' });
  emit('x_recovery', { phase: 'judge', task: 't1', recovered: true });
  const code = "const a = await sh('ls <b>');";
  hook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'REPL', tool_input: { code }, tool_use_id: 'r' }, d);
  hook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 'in' }, d);
  hook({ ...base, hook_event_name: 'PostToolUse', tool_name: 'REPL', tool_input: { code }, tool_response: { code, result: 'R', stdout: 'out', stderr: '' }, tool_use_id: 'r' }, d);
  const repo = join(d, 'repo');
  spawnSync('bash', ['-c', 'mkdir repo && cd repo && git init -q -b main && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m "a\n\nDaylight-Run: r1" && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m b'], { cwd: d });
  const out = join(d, 'report.html');
  const r = cli(['report', 'r1', '--out', out, '--repo', repo], { cwd: d, env });
  return { d, r, html: r.code === 0 ? readFileSync(out, 'utf8') : '' };
}
test('AC-16 one self-contained HTML file with no external network references', () => {
  const { r, html } = run();
  assert.equal(r.code, 0, r.err);
  assert.match(html, /^<!doctype html>/i);
  assert.doesNotMatch(html, /(src|href)\s*=\s*["']?https?:\/\/|url\(\s*["']?https?:|@import|<link[^>]+stylesheet/i);
});
test('AC-17 / AC-86 per phase: wall-clock, tokens per model, retries, sensors, verdicts, gates, touchpoints', () => {
  const { html } = run();
  for (const s of ['design', 'inner', 'sensors', 'judge', 'wall-clock', 'claude-sonnet-5-5', 'claude-opus-5-5', '1200', '300', '800', 'retries', 'tests: pass', 'lint: FAIL', 'design: approve (human)', 'Human touchpoints']) assert.ok(html.includes(s), s);
});
test('AC-86 phase wall-clock sums the segments of a phase that ran in several rounds, not first-start to last-end', () => {
  const d = tmp(); const mkl = (ts: string, status: string) => JSON.stringify({ id: 'e', ts, run: 'r1', kind: 'phase', name: 'sensors', phase: 'sensors', status, sha_prev: 'x' });
  const f = join(d, 'a.jsonl');
  writeFileSync(f, [mkl('2026-01-01T00:00:00Z', 'start'), mkl('2026-01-01T00:00:10Z', 'end'), mkl('2026-01-01T01:00:00Z', 'start'), mkl('2026-01-01T01:00:05Z', 'end')].join('\n') + '\n');
  const r = spawnSync('node', ['--input-type=module', '-e', "import {summarize} from '" + join(process.cwd(), 'src/pipeline.ts') + "'; console.log(JSON.stringify(summarize('" + f + "').phases[0]))"], { encoding: 'utf8' });
  assert.equal(JSON.parse(r.stdout).seconds, 15);
});
test('AC-18 a REPL batch expands to its code and inner tool calls (escaped)', () => {
  const { html } = run();
  assert.match(html, /<details[^>]*>[\s\S]*REPL batch[\s\S]*const a = await sh\('ls &lt;b&gt;'\)[\s\S]*Bash[\s\S]*<\/details>/);
  assert.doesNotMatch(html, /ls <b>/);
});
test('AC-108 report shows cost per PR, cycle time, touches, trailer share, veto and recovery rate', () => {
  const { html } = run();
  for (const s of ['Cost per PR', '$0.0323', 'Cycle time', 'Human touches per PR', 'Daylight-trailer share', '50%', 'Veto rate', 'Recovery rate']) assert.ok(html.includes(s), s);
  assert.match(html, /Recovery rate[^0-9]*100%/);
});
