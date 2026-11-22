import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmp } from './helpers.ts';
import { addWorktree, git } from '../src/worktree.ts';
import { runFast } from '../src/sensors.ts';
import { capture } from '../src/review.ts';
import { triage } from '../src/triage.ts';
import { resolveConfig } from '../src/config.ts';
import { auditFile } from '../src/lib/events.ts';

function tmpRepo() {
  const dir = tmp();
  git(dir, ['init', '-q', '-b', 'main']);
  writeFileSync(join(dir, 'README.md'), 'init\n');
  git(dir, ['add', 'README.md']);
  git(dir, ['commit', '-q', '-m', 'init']);
  return dir;
}

test('addWorktree: recreates a fresh branch at HEAD when the existing branch is already merged', () => {
  const dir = tmpRepo();
  const wt1 = addWorktree(dir, 'fix1');
  writeFileSync(join(wt1.path, 'a.txt'), 'v1\n');
  git(wt1.path, ['add', 'a.txt']);
  git(wt1.path, ['commit', '-q', '-m', 'fix1 work']);
  git(dir, ['merge', '-q', '--no-edit', 'daylight/fix1']);
  // advance HEAD on main
  writeFileSync(join(dir, 'b.txt'), 'v2\n');
  git(dir, ['add', 'b.txt']);
  git(dir, ['commit', '-q', '-m', 'later commit']);
  const head = git(dir, ['rev-parse', 'HEAD']).stdout.trim();

  const wt2 = addWorktree(dir, 'fix1');
  const wtHead = git(wt2.path, ['rev-parse', 'HEAD']).stdout.trim();
  assert.equal(wtHead, head, 'merged branch must be reset to current HEAD');
});

test('runFast: excludes scripts/ from complexity/duplication but still scans scripts/ for secrets', () => {
  const dir = tmpRepo();
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  const complexScript = [
    'export function smoke(x: number) {',
    '  if (x === 1) return 1; if (x === 2) return 2; if (x === 3) return 3;',
    '  if (x === 4) return 4; if (x === 5) return 5; if (x === 6) return 6;',
    '  if (x === 7) return 7; if (x === 8) return 8; if (x === 9) return 9;',
    '  return 0;',
    '}',
  ].join('\n');
  writeFileSync(join(dir, 'scripts/smoke.ts'), complexScript);
  const cfg = resolveConfig(dir);
  const r1 = runFast(dir, cfg, ['complexity', 'duplication', 'secrets']);
  assert.equal(r1.ok, true, 'complex script in scripts/ should not fail complexity');

  writeFileSync(join(dir, 'scripts/smoke.ts'), 'const k = "sk-ant-api03-1234567890abcdefghijklmnop";\n');
  const r2 = runFast(dir, cfg, ['secrets']);
  assert.equal(r2.ok, false, 'secrets in scripts/ must still fail');
});

test('review.capture: emits x_usage event when claude returns usage/cost', () => {
  const dir = tmpRepo();
  const stub = join(dir, 'fake-claude.sh');
  writeFileSync(stub, '#!/bin/sh\necho \'{"result":"ok","usage":{"input_tokens":10,"output_tokens":5},"total_cost_usd":0.02}\'\n');
  chmodSync(stub, 0o755);
  const prev = process.env.DAYLIGHT_CLAUDE;
  process.env.DAYLIGHT_CLAUDE = stub;
  try {
    const res = capture(dir, 'code-review');
    assert.equal(res.status, 0);
    const evs = readFileSync(auditFile(dir), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const usageEv = evs.find((e) => e.kind === 'x_usage' && e.phase === 'review');
    assert.ok(usageEv, 'expected x_usage event for review');
    assert.equal(usageEv.cost_usd, 0.02);
  } finally {
    if (prev === undefined) delete process.env.DAYLIGHT_CLAUDE; else process.env.DAYLIGHT_CLAUDE = prev;
  }
});

test('triage: sizes PRD by unique AC count when no paths are given', () => {
  const dir = tmpRepo();
  const cfg = resolveConfig(dir);
  const longProse = 'Background context. '.repeat(60);
  const body = longProse + '\n- AC-1 [test] one\n- AC-2 [test] two\n- AC-3 [run] three\n';
  const res = triage({ id: 'w1', source: 'prd', title: 'Small feature', body, paths: [], evidence: [] }, cfg, dir);
  assert.equal(res.size, 'small');
  assert.equal(res.tier, 'low');
});
