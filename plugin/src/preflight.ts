// Reuses: git, docker, runFast sensors. Glue: cheap checks before any model is paid for, so a broken environment fails in seconds, not minutes into a run.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './worktree.ts';

/** Host ports published by a compose file ("8080:80", "127.0.0.1:5432:5432"; a bare container port publishes nothing fixed). */
export function composePorts(yaml: string): number[] {
  return [...yaml.matchAll(/^\s*-\s*["']?(?:[\d.]+:)?(\d+):\d+(?:\/\w+)?["']?\s*$/gm)].map((m) => Number(m[1]));
}
const free = (port: number) => new Promise<boolean>((res) => { const s = createServer(); s.once('error', () => res(false)); s.listen(port, '0.0.0.0', () => s.close(() => res(true))); });

export async function preflight(cwd: string, cfg: any, o: { base: string; docker?: string; runSensors: (cwd: string) => { ok: boolean; messages: string } }): Promise<string[]> {
  const errs: string[] = [];
  const s = o.runSensors(cwd);
  if (!s.ok) errs.push('baseline is red before any change (' + s.messages.slice(0, 300) + '): every task would fail on pre-existing problems; fix the baseline first');
  if (cfg.deploy?.target === 'local') {
    const d = spawnSync(o.docker ?? process.env.DAYLIGHT_DOCKER ?? 'docker', ['info'], { cwd, encoding: 'utf8' });
    if (d.status !== 0) errs.push('docker is not available (docker info failed): start Docker before running, deploy needs it');
    const cf = join(cwd, cfg.deploy.compose_file ?? 'docker-compose.yml');
    if (existsSync(cf)) for (const p of composePorts(readFileSync(cf, 'utf8'))) if (!(await free(p))) errs.push('port ' + p + ' (published by ' + cfg.deploy.compose_file + ') is already in use: stop the process or container holding it');
  }
  if (git(cwd, ['remote']).stdout.trim() && git(cwd, ['rev-parse', '--verify', '-q', o.base]).status === 0) {
    git(cwd, ['fetch', '-q', 'origin', o.base]);
    const remote = 'origin/' + o.base;
    if (git(cwd, ['rev-parse', '--verify', '-q', remote]).status === 0 && git(cwd, ['merge-base', '--is-ancestor', remote, o.base]).status !== 0) errs.push('base ' + o.base + ' is behind ' + remote + ': pull before running so the PR does not conflict');
  }
  return errs;
}
