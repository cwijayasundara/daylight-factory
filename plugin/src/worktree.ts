// Reuses: git worktree. Daylight creates worktrees itself and never combines with claude --worktree (spike 6).
import { spawnSync } from 'node:child_process';
import { existsSync, appendFileSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

export const git = (cwd: string, args: string[]) => spawnSync('git', ['-c', 'user.name=Daylight', '-c', 'user.email=daylight@local', ...args], { cwd, encoding: 'utf8' });
export function addWorktree(cwd: string, id: string) {
  const ex = join(cwd, '.git/info/exclude');
  if (existsSync(ex) && !readFileSync(ex, 'utf8').includes('.daylight/')) appendFileSync(ex, '\n.daylight/\n');
  const path = join(cwd, '.daylight/worktrees', id);
  const base = git(cwd, ['rev-parse', 'HEAD']).stdout.trim();
  if (!existsSync(path)) {
    git(cwd, ['worktree', 'prune']);
    const exists = git(cwd, ['rev-parse', '--verify', '-q', 'daylight/' + id]).status === 0; // resume: reattach to the task's existing branch
    const r = git(cwd, exists ? ['worktree', 'add', '-q', path, 'daylight/' + id] : ['worktree', 'add', '-q', '-b', 'daylight/' + id, path, 'HEAD']);
    if (r.status !== 0) throw new Error('worktree failed: ' + r.stderr);
  }
  if (existsSync(join(cwd, 'node_modules')) && !existsSync(join(path, 'node_modules'))) symlinkSync(join(cwd, 'node_modules'), join(path, 'node_modules'));
  return { path, branch: 'daylight/' + id, base };
}
