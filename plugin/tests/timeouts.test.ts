import test from 'node:test';
import assert from 'node:assert/strict';
import { tmp, put, cli, MIN_YAML } from './helpers.ts';
import { recordRed } from '../src/tdd.ts';
import { runCmd } from '../src/sensors.ts';

test('recordRed: a hanging test command times out with a clear message instead of blocking', () => {
  process.env.DAYLIGHT_CMD_TIMEOUT_S = '1';
  try {
    const d = tmp(); const t0 = Date.now();
    const msg = recordRed(d, 't1', 'sleep 10', undefined);
    assert.match(String(msg), /timed out after 1s/);
    assert.ok(Date.now() - t0 < 5000);
  } finally { delete process.env.DAYLIGHT_CMD_TIMEOUT_S; }
});
test('runCmd: a hanging sensor command fails with a timeout message', () => {
  process.env.DAYLIGHT_CMD_TIMEOUT_S = '1';
  try {
    const r = runCmd('tests', 'sleep 10', tmp());
    assert.equal(r.ok, false); assert.match(r.messages[0], /timed out after 1s/);
  } finally { delete process.env.DAYLIGHT_CMD_TIMEOUT_S; }
});
