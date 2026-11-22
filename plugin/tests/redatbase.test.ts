import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmp, put } from './helpers.ts';
import { redAtBase } from '../src/tdd.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
const G = 'git -c user.name=t -c user.email=t@t';
function repo() { const d = tmp(); put(d, 'README.md', 'x'); sh(d, 'git init -q -b main && git add -A && ' + G + ' commit -qm init && git checkout -qb daylight/t1'); return d; }
const commit = (d: string, m = 'w') => sh(d, 'git add -A && ' + G + ' commit -qm ' + m);
// the "test command" passes only when src/impl.ts exists, so a test file alone is red at base
const CMD = 'test -f src/impl.ts && grep -q AC-1 tests/a.test.ts';

test('redAtBase: tests that fail on the base tree and pass on the branch are accepted in ANY commit order (impl and tests in one commit)', () => {
  const d = repo(); put(d, 'tests/a.test.ts', '// AC-1 returns 1'); put(d, 'src/impl.ts', 'x'); commit(d);
  const r = redAtBase(d, 'main', 'daylight/t1', CMD);
  assert.equal(r.ok, true, r.msg); assert.equal(r.kind, 'red');
});
test('redAtBase: tests that already pass at base are accepted as already satisfied and say so', () => {
  const d = repo(); put(d, 'tests/a.test.ts', '// AC-1 returns 1'); commit(d);
  const r = redAtBase(d, 'main', 'daylight/t1', 'true');
  assert.equal(r.ok, true); assert.equal(r.kind, 'already');
});
test('redAtBase: no new test file is a failure with an actionable message', () => {
  const d = repo(); put(d, 'src/impl.ts', 'x'); commit(d);
  const r = redAtBase(d, 'main', 'daylight/t1', CMD);
  assert.equal(r.ok, false); assert.match(r.msg, /no test file/i);
});
test('redAtBase: new tests that carry no AC id are a failure', () => {
  const d = repo(); put(d, 'tests/a.test.ts', '// nothing'); put(d, 'src/impl.ts', 'x'); commit(d);
  const r = redAtBase(d, 'main', 'daylight/t1', 'false');
  assert.equal(r.ok, false); assert.match(r.msg, /AC id/);
});
test('redAtBase: cleans up its temporary worktree', () => {
  const d = repo(); put(d, 'tests/a.test.ts', '// AC-1'); put(d, 'src/impl.ts', 'x'); commit(d);
  redAtBase(d, 'main', 'daylight/t1', CMD);
  assert.equal(sh(d, 'git worktree list | wc -l').stdout.trim(), '1');
});
