// Reuses: docker compose (deploy), the project's own smoke command, S4's PreToolUse-hook deploy-guard pattern. Glue: gate check, health wait, regression-to-task.
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { load } from './state.ts';
import { append, auditFile, runId } from './lib/events.ts';

const docker = () => process.env.DAYLIGHT_DOCKER || 'docker';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function deploy(cwd: string, cfg: any, head: string): Promise<{ ok: boolean; msg: string }> {
  const f = auditFile(cwd), log = (stage: string, ok: boolean, extra: object = {}) => append(f, { kind: 'x_deploy', phase: 'deploy', stage, ok, head, ...extra });
  const g = load(cwd).gates.pr;
  if (!(g?.status === 'approved' && g.head === head)) return { ok: false, msg: 'refusing to deploy: no Gate 2 approval recorded for head ' + head };
  const up = spawnSync(docker(), ['compose', '-f', cfg.deploy.compose_file, 'up', '-d', '--build'], { cwd, encoding: 'utf8' });
  if (up.status !== 0) { log('up', false); return { ok: false, msg: 'docker compose up failed: ' + up.stderr }; }
  if (cfg.deploy.health_command) {
    const end = Date.now() + cfg.deploy.health_timeout_s * 1000; let healthy = false;
    while (Date.now() < end && !(healthy = spawnSync('bash', ['-c', cfg.deploy.health_command], { cwd }).status === 0)) await sleep(250);
    if (!healthy) {
      const logs = spawnSync(docker(), ['compose', '-f', cfg.deploy.compose_file, 'logs', '--no-color', '--tail', '200'], { cwd, encoding: 'utf8' });
      mkdirSync(join(cwd, '.daylight'), { recursive: true }); writeFileSync(join(cwd, '.daylight/deploy-logs.txt'), logs.stdout + logs.stderr);
      log('health', false); return { ok: false, msg: 'health check not passing after ' + cfg.deploy.health_timeout_s + 's; logs in .daylight/deploy-logs.txt' };
    }
  }
  log('health', true);
  const smoke = spawnSync('bash', ['-c', cfg.deploy.smoke_command], { cwd, encoding: 'utf8' });
  log('smoke', smoke.status === 0, { tail: (smoke.stdout + smoke.stderr).slice(-400) });
  return smoke.status === 0 ? { ok: true, msg: 'deployed and smoke tests passed' } : { ok: false, msg: 'smoke tests failed: ' + (smoke.stdout + smoke.stderr).slice(-300) };
}
/** AC-73: a failing health check or smoke run becomes a task file that re-enters triage like any other work item. */
export function monitor(cwd: string, cfg: any): string | null {
  const checks: [string, string | undefined][] = [['health', cfg.deploy.health_command], ['smoke', cfg.deploy.smoke_command]];
  for (const [name, cmd] of checks) {
    if (!cmd) continue;
    const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8' });
    if (r.status === 0) continue;
    const dir = join(cwd, '.daylight/inbox'); mkdirSync(dir, { recursive: true });
    const file = join(dir, 'monitor-' + name + '-' + Date.now() + '.md');
    writeFileSync(file, '---\nkind: task\norigin_run: ' + runId() + '\n---\n# Regression: ' + name + ' check failing after deploy\n\nOriginating run: ' + runId() + '\nCommand: ' + cmd + '\nFailing evidence (exit ' + r.status + '):\n' + (r.stdout + r.stderr).slice(-500) + '\n');
    append(auditFile(cwd), { kind: 'x_monitor', phase: 'monitor', check: name, ok: false, task_file: file });
    return file;
  }
  append(auditFile(cwd), { kind: 'x_monitor', phase: 'monitor', ok: true });
  return null;
}
