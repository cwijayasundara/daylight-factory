import test from 'node:test';
import assert from 'node:assert/strict';
import { gate2, type Evidence } from '../src/gate2.ts';

const good: Evidence = {
  matrix: [{ ac: 'AC-1', result: 'PASS' }, { ac: 'AC-2', result: 'PASS' }],
  sensorsOk: true, scopeErrors: [], judge: 'pass',
  reviews: { 'code-review': 'No findings.', 'security-review': 'No findings.' },
};
const bug = '[{"file":"src/a.ts","line":3,"repro":"call a(null)","summary":"crash"}]';
const adv = '[{"file":"src/a.ts","summary":"style nit"}]';

test('gate2: all evidence green approves with no reasons', () => {
  const r = gate2(good); assert.equal(r.decision, 'approve'); assert.deepEqual(r.reasons, []);
});
test('gate2: advisory findings (no file+line+repro) never block (AC-60)', () => {
  const r = gate2({ ...good, reviews: { ...good.reviews, 'code-review': adv } });
  assert.equal(r.decision, 'approve'); assert.equal(r.advisory.length, 1);
});
test('gate2: a reproducibly-cited finding blocks and is returned for the fix task', () => {
  const r = gate2({ ...good, reviews: { ...good.reviews, 'security-review': 'text\n' + bug } });
  assert.equal(r.decision, 'reject'); assert.equal(r.blocking.length, 1); assert.equal(r.blocking[0].file, 'src/a.ts');
});
test('gate2: any non-PASS matrix row rejects; an empty matrix rejects', () => {
  assert.equal(gate2({ ...good, matrix: [{ ac: 'AC-1', result: 'PASS' }, { ac: 'AC-2', result: 'NO TEST' }] }).decision, 'reject');
  assert.equal(gate2({ ...good, matrix: [] }).decision, 'reject');
});
test('gate2: red sensors, scope drift, judge fail or inconclusive each reject', () => {
  assert.equal(gate2({ ...good, sensorsOk: false }).decision, 'reject');
  assert.equal(gate2({ ...good, scopeErrors: ['x'] }).decision, 'reject');
  assert.equal(gate2({ ...good, judge: 'fail' }).decision, 'reject');
  assert.equal(gate2({ ...good, judge: 'inconclusive' }).decision, 'reject');
  assert.equal(gate2({ ...good, judge: 'missing' }).decision, 'reject');
});
test('gate2: a missing review rejects', () => {
  const r = gate2({ ...good, reviews: { 'code-review': 'No findings.' } });
  assert.equal(r.decision, 'reject'); assert.match(r.reasons.join(' '), /security-review/);
});
test('gate2: reasons list every failure, not just the first', () => {
  const r = gate2({ ...good, sensorsOk: false, judge: 'fail' }); assert.equal(r.reasons.length, 2);
});
