// Reuses: git history + the test runner's exit code. Enforces AC-38 (tests first, AC-tagged) and AC-39 (recorded red).
import { spawnSync } from 'node:child_process';
import { git } from './worktree.ts';
import { append, auditFile, readLines } from './lib/events.ts';

const TEST = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[jt]sx?$/;
const SRC = /\.(tsx?|jsx?|py)$/;
export function tddCheck(cwd: string, base: string, branch: string, task?: string): string[] {
  const first = git(cwd, ['rev-list', '--reverse', base + '..' + branch]).stdout.split('\n').filter(Boolean)[0];
  if (!first) return ['no commits on ' + branch];
  const files = git(cwd, ['show', '--name-only', '--pretty=format:', first]).stdout.split('\n').filter(Boolean);
  const tests = files.filter((f) => TEST.test(f)), impl = files.filter((f) => SRC.test(f) && !TEST.test(f));
  const errs: string[] = [];
  if (impl.length || !tests.length) errs.push('first commit ' + first.slice(0, 7) + ' contains implementation but no failing test (impl: ' + (impl.join(', ') || 'none') + ')');
  const tagged = tests.some((f) => /AC-\d+/.test(git(cwd, ['show', first + ':' + f]).stdout));
  if (tests.length && !tagged) errs.push('test files in the first commit carry no AC id (tag tests with AC-n)');
  if (task && !readLines(auditFile(cwd)).some((l) => { const e = JSON.parse(l); return (e.kind === 'x_red' && e.task === task && e.failing) || (e.kind === 'x_tdd_waiver' && e.task === task && e.declared); })) errs.push('no red proof recorded for task ' + task + ' (run: daylight red --task ' + task + ' --cmd "<test command>"; if your new tests already pass because the behaviour exists, add --waive "<reason>")');
  return errs;
}
export function waiverFor(cwd: string, task: string): string {
  const w = readLines(auditFile(cwd)).map((l) => JSON.parse(l)).filter((e) => e.kind === 'x_tdd_waiver' && e.task === task && e.declared).pop();
  return w ? w.reason : '';
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
