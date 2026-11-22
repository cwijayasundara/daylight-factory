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
  const br = 'daylight/' + id;
  const exists = git(cwd, ['rev-parse', '--verify', '-q', br]).status === 0;
  const merged = exists && git(cwd, ['merge-base', '--is-ancestor', br, 'HEAD']).status === 0;
  if (existsSync(path) && merged) git(cwd, ['worktree', 'remove', '--force', path]);
  if (!existsSync(path)) {
    git(cwd, ['worktree', 'prune']);
    const r = git(cwd, exists && !merged ? ['worktree', 'add', '-q', path, br] : ['worktree', 'add', '-q', '-B', br, path, 'HEAD']);
    if (r.status !== 0) throw new Error('worktree failed: ' + r.stderr);
  }
  if (existsSync(join(cwd, 'node_modules')) && !existsSync(join(path, 'node_modules'))) symlinkSync(join(cwd, 'node_modules'), join(path, 'node_modules'));
  return { path, branch: 'daylight/' + id, base };
}
