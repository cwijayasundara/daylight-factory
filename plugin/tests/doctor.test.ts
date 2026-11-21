import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cli, tmp, CM_VAR } from './helpers.ts';

const doctor = (v: string | undefined) => {
  const d = tmp();
  const r = cli(['doctor', '--json'], { cwd: d, env: { [CM_VAR]: v } });
  return { d, r };
};
test('AC-7 doctor reports on when Code Mode var is 1', () => {
  const { r } = doctor('1');
  assert.equal(JSON.parse(r.out).codeMode, 'on');
});
test('AC-7 doctor reports off and prints the user-level setup instruction', () => {
  const { r } = doctor(undefined);
  assert.equal(JSON.parse(r.out).codeMode, 'off');
  assert.match(JSON.parse(r.out).instruction, /~\/\.claude\/settings\.json/);
});
test('AC-7 doctor reports unknown for an unrecognised value', () => {
  assert.equal(JSON.parse(doctor('maybe').r.out).codeMode, 'unknown');
});
test('AC-7 doctor writes the result as an audit event', () => {
  const { d } = doctor('1');
  const dir = join(d, '.daylight/audit');
  const f = readdirSync(dir)[0];
  const ev = JSON.parse(readFileSync(join(dir, f), 'utf8').trim().split('\n')[0]);
  assert.equal(ev.kind, 'doctor');
  assert.equal(ev.summary.codeMode, 'on');
  assert.ok(ev.sha_prev);
});
