// Reuses: git history + the test runner's exit code. Enforces AC-38 (tests first, AC-tagged) and AC-39 (recorded red).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { git } from './worktree.ts';
import { append, auditFile, readLines } from './lib/events.ts';

const TEST = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[jt]sx?$/;
const SRC = /\.(tsx?|jsx?|py)$/;
const after = (e: any, since: number) => Number(String(e.id).slice(1)) > since; // audit ids are e<line>: only events after the last reset count
export function tddCheck(cwd: string, base: string, branch: string, task?: string, since = 0): string[] {
  const first = git(cwd, ['rev-list', '--reverse', base + '..' + branch]).stdout.split('\n').filter(Boolean)[0];
  if (!first) return ['no commits on ' + branch];
  const files = git(cwd, ['show', '--name-only', '--pretty=format:', first]).stdout.split('\n').filter(Boolean);
  const tests = files.filter((f) => TEST.test(f)), impl = files.filter((f) => SRC.test(f) && !TEST.test(f));
  const errs: string[] = [];
  if (impl.length || !tests.length) errs.push('first commit ' + first.slice(0, 7) + ' contains implementation but no failing test (impl: ' + (impl.join(', ') || 'none') + ')');
  const tagged = tests.some((f) => /AC-\d+/.test(git(cwd, ['show', first + ':' + f]).stdout));
  if (tests.length && !tagged) errs.push('test files in the first commit carry no AC id (tag tests with AC-n)');
  if (task && !readLines(auditFile(cwd)).some((l) => { const e = JSON.parse(l); if (!after(e, since)) return false; return (e.kind === 'x_red' && e.task === task && e.failing) || (e.kind === 'x_tdd_waiver' && e.task === task && e.declared); })) errs.push('no red proof recorded for task ' + task + ' (run: daylight red --task ' + task + ' --cmd "<test command>"; if your new tests already pass because the behaviour exists, add --waive "<reason>")');
  return errs;
}
export function recordRed(cwd: string, task: string, cmd: string, waive?: string): string | null {
  const limit = Number(process.env.DAYLIGHT_CMD_TIMEOUT_S) || 120, r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', timeout: limit * 1000 });
  if (r.error && (r.error as any).code === 'ETIMEDOUT') return 'test command timed out after ' + limit + 's: fix the hang (watch mode, open handles) before recording red';
  if (waive) {
    if (r.status !== 0) return 'tests fail: that is a real red, run without --waive';
    append(auditFile(cwd), { kind: 'x_tdd_waiver', phase: 'inner', task, declared: true, reason: waive, evidence: 'tests already pass' });
    return null;
  }
  if (r.status === 0) return 'tests passed: this is not a red step';
  append(auditFile(cwd), { kind: 'x_red', phase: 'inner', task, cmd, exit: r.status, failing: true, tail: (r.stdout + r.stderr).slice(-400) });
  return null;
}

/** TDD by evidence, not by commit order: the branch's new/changed test files must fail on the base tree (red) and, via the sensors, pass on the branch. Tests that already pass at base are accepted and reported as already satisfied. */
export function redAtBase(cwd: string, base: string, branch: string, testCmd: string): { ok: boolean; kind: 'red' | 'already' | 'fail'; msg: string } {
  const mb = git(cwd, ['merge-base', base, branch]).stdout.trim() || base;
  const files = git(cwd, ['diff', '--name-only', '--diff-filter=AM', mb + '..' + branch]).stdout.split('\n').filter((f) => f && TEST.test(f));
  if (!files.length) return { ok: false, kind: 'fail', msg: 'no test file was added or changed: write tests whose names contain their AC id for each behaviour AC (tests/ is always allowed)' };
  if (!files.some((f) => /AC-\d+/.test(git(cwd, ['show', branch + ':' + f]).stdout))) return { ok: false, kind: 'fail', msg: 'the new test files carry no AC id: name each test with the AC it proves (AC-n)' };
  const tmp = mkdtempSync(join(tmpdir(), 'daylight-red-'));
  try {
    if (git(cwd, ['worktree', 'add', '-q', '--detach', tmp, mb]).status !== 0) return { ok: false, kind: 'fail', msg: 'could not create the base worktree to check red' };
    git(tmp, ['checkout', branch, '--', ...files]);
    if (existsSync(join(cwd, 'node_modules')) && !existsSync(join(tmp, 'node_modules'))) symlinkSync(join(cwd, 'node_modules'), join(tmp, 'node_modules'));
    const limit = Number(process.env.DAYLIGHT_CMD_TIMEOUT_S) || 120, { NODE_TEST_CONTEXT: _c, ...env } = process.env;
    const r = spawnSync('bash', ['-c', testCmd], { cwd: tmp, encoding: 'utf8', timeout: limit * 1000, env });
    if (r.error && (r.error as any).code === 'ETIMEDOUT') return { ok: false, kind: 'fail', msg: 'test command timed out after ' + limit + 's on the base tree' };
    return r.status === 0 ? { ok: true, kind: 'already', msg: 'the new tests already pass on the base tree: behaviour was already present' } : { ok: true, kind: 'red', msg: 'new tests fail on the base tree (red) as required' };
  } finally { git(cwd, ['worktree', 'remove', '--force', tmp]); rmSync(tmp, { recursive: true, force: true }); }
}
