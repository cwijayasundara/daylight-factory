import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmp } from './helpers.ts';
import { summarize } from '../src/pipeline.ts';
import { append } from '../src/lib/events.ts';

test('summarize: pr evidence (url, both reviews, run branch) comes from the audit log', () => {
  const f = join(tmp(), 'run.jsonl');
  append(f, { run: 'r9', kind: 'x_review', phase: 'review', review: 'code-review' });
  append(f, { run: 'r9', kind: 'x_review', phase: 'review', review: 'security-review' });
  append(f, { run: 'r9', kind: 'x_pr', phase: 'pr', out: '{"url":"https://example.test/pull/5"}' });
  const s: any = summarize(f, { run: 'r9' });
  assert.deepEqual(s.pr, { url: 'https://example.test/pull/5', branch: 'daylight/run-r9', code_review: true, security_review: true });
});
test('summarize: no reviews or PR means false and null, not a guess', () => {
  const f = join(tmp(), 'run.jsonl'); append(f, { run: 'r9', kind: 'phase', name: 'triage', phase: 'triage', status: 'start' });
  const s: any = summarize(f, { run: 'r9' });
  assert.deepEqual(s.pr, { url: null, branch: 'daylight/run-r9', code_review: false, security_review: false });
});
