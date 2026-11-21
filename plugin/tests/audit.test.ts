import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cli, hook, events, tmp, put } from './helpers.ts';

const base = { session_id: 's1', model: 'claude-sonnet-5-5' };
const REPL_CODE = "const a = await sh('ls'); a";

test('AC-9 Pre and Post events carry run, ts, tool, model and capped summary', () => {
  const d = tmp();
  hook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'x'.repeat(5000) }, tool_use_id: 't1' }, d);
  hook({ ...base, hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, tool_response: { stdout: 'y'.repeat(9000) }, tool_use_id: 't1' }, d);
  const [pre, post] = events(d);
  assert.equal(pre.kind, 'tool_pre'); assert.equal(post.kind, 'tool_post');
  for (const e of [pre, post]) { assert.equal(e.run, 'r1'); assert.ok(e.ts); assert.equal(e.tool, 'Bash'); assert.equal(e.model, 'claude-sonnet-5-5'); }
  assert.ok(JSON.stringify(pre.summary).length < 2500);
  assert.ok(JSON.stringify(post.summary).length < 5000);
});
test('AC-10 REPL events hold the full code and stdout, stderr, result, toolsUsed', () => {
  const d = tmp();
  const code = REPL_CODE + '\n' + '// pad\n'.repeat(900);
  hook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'REPL', tool_input: { code }, tool_use_id: 'r' }, d);
  hook({ ...base, hook_event_name: 'PostToolUse', tool_name: 'REPL', tool_input: { code }, tool_response: { code, result: 'R', stdout: 'O', stderr: 'E', toolsUsed: ['Bash', 'Read'] }, tool_use_id: 'r' }, d);
  const [pre, post] = events(d);
  assert.equal(pre.kind, 'repl_pre'); assert.equal(pre.code, code);
  assert.equal(post.kind, 'repl_post');
  assert.deepEqual([post.result, post.stdout, post.stderr, post.toolsUsed], ['R', 'O', 'E', ['Bash', 'Read']]);
});
test('AC-10 a failed or stopped REPL is still recorded', () => {
  const d = tmp();
  hook({ ...base, hook_event_name: 'PostToolUseFailure', tool_name: 'REPL', tool_input: { code: 'throw 1' }, error: 'boom', tool_use_id: 'r2' }, d);
  const [e] = events(d);
  assert.equal(e.kind, 'repl_post'); assert.equal(e.code, 'throw 1'); assert.equal(e.error, 'boom');
});
test('AC-11 inner calls during an open REPL batch link to the parent event', () => {
  const d = tmp();
  hook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'REPL', tool_input: { code: REPL_CODE }, tool_use_id: 'r' }, d);
  hook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 'in' }, d);
  hook({ ...base, hook_event_name: 'PostToolUse', tool_name: 'REPL', tool_input: { code: REPL_CODE }, tool_response: { result: '' }, tool_use_id: 'r' }, d);
  hook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' }, tool_use_id: 'out' }, d);
  const ev = events(d);
  assert.equal(ev[1].parent_id, ev[0].id);
  assert.equal(ev[3].parent_id, undefined);
});
test('AC-12 subagent events record role, model, effort and token counts', () => {
  const d = tmp();
  const tr = put(d, 'agent.jsonl', JSON.stringify({ message: { usage: { input_tokens: 10, output_tokens: 5 } } }) + '\n' + JSON.stringify({ message: { usage: { input_tokens: 3, output_tokens: 2 } } }) + '\n');
  hook({ ...base, hook_event_name: 'SubagentStart', agent_type: 'generator', agent_id: 'a1', effort: { level: 'medium' } }, d);
  hook({ ...base, hook_event_name: 'SubagentStop', agent_type: 'generator', agent_id: 'a1', agent_transcript_path: tr, effort: { level: 'medium' } }, d);
  const [s, e] = events(d);
  assert.equal(s.kind, 'subagent_start'); assert.equal(s.role, 'generator'); assert.equal(s.effort, 'medium');
  assert.equal(e.kind, 'subagent_stop'); assert.deepEqual(e.tokens, { input: 13, output: 7 });
});
test('AC-13 audit verify detects edits and removal of earlier lines', () => {
  const d = tmp();
  for (let i = 0; i < 3; i++) hook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'c' + i }, tool_use_id: 't' + i }, d);
  const f = join(d, '.daylight/audit/r1.jsonl');
  assert.equal(cli(['audit', 'verify', f]).code, 0);
  const orig = readFileSync(f, 'utf8');
  writeFileSync(f, orig.replace('c0', 'zz'));
  assert.notEqual(cli(['audit', 'verify', f]).code, 0);
  writeFileSync(f, orig.split('\n').slice(1).join('\n'));
  assert.notEqual(cli(['audit', 'verify', f]).code, 0);
  writeFileSync(f, orig.split('\n').slice(0, 2).join('\n') + '\n');
  assert.notEqual(cli(['audit', 'verify', f]).code, 0, 'tail truncation');
});
test('AC-14 sensor, verdict and gate events validate; malformed ones fail', () => {
  const d = tmp(); const env = { DAYLIGHT_RUN: 'r1' };
  const emit = (kind: string, data: object) => cli(['audit', 'emit', '--kind', kind, '--data', JSON.stringify(data)], { cwd: d, env });
  assert.equal(emit('sensor', { name: 'tests', ok: true }).code, 0);
  assert.equal(emit('verdict', { role: 'evaluator', verdict: 'pass' }).code, 0);
  assert.equal(emit('gate', { gate: 'design', decision: 'approved', source: 'agent' }).code, 0);
  const f = join(d, '.daylight/audit/r1.jsonl');
  assert.equal(cli(['audit', 'validate', f]).code, 0);
  assert.equal(emit('sensor', { name: 'tests' }).code, 0);
  const bad = cli(['audit', 'validate', f]);
  assert.notEqual(bad.code, 0); assert.match(bad.err, /sensor.*ok|ok.*sensor/);
});
test('AC-15 secrets are redacted before write', () => {
  const d = tmp();
  hook({ ...base, hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'export AWS=AKIAABCDEFGHIJKLMNOP; token=ghp_' + 'a'.repeat(36) + ' sk-ant-' + 'b'.repeat(30) } , tool_use_id: 't' }, d);
  const raw = readFileSync(join(d, '.daylight/audit/r1.jsonl'), 'utf8');
  assert.doesNotMatch(raw, /AKIAABCDEFGHIJKLMNOP|ghp_a{36}|sk-ant-b{30}/);
  assert.match(raw, /\[REDACTED\]/);
});
