// Reuses: docker compose and the project's own health/smoke commands (same ones deploy uses). Glue: prove a delivery task by RUNNING it before merge, always cleaning up (deep-dive 2, root cause 1).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const docker = () => process.env.DAYLIGHT_DOCKER || 'docker';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function verifyDelivery(cwd: string, cfg: any): Promise<{ ok: boolean; msg: string }> {
  const d = cfg.deploy ?? {};
  if (d.target !== 'local') return { ok: true, msg: 'no local deploy configured: nothing to run' };
  const compose = d.compose_file ?? 'docker-compose.yml', run = (a: string[]) => spawnSync(docker(), ['compose', '-f', compose, ...a], { cwd, encoding: 'utf8' });
  if (!existsSync(join(cwd, compose))) return { ok: false, msg: compose + ' does not exist: the delivery task must create it' };
  try {
    const up = run(['up', '-d', '--build']);
    if (up.status !== 0) return { ok: false, msg: 'docker compose up --build failed:\n' + (up.stderr + up.stdout).slice(-800) };
    if (d.health_command) {
      const end = Date.now() + (d.health_timeout_s ?? 60) * 1000; let healthy = false;
      while (Date.now() < end && !(healthy = spawnSync('bash', ['-c', d.health_command], { cwd }).status === 0)) await sleep(250);
      if (!healthy) { const logs = run(['logs', '--no-color', '--tail', '60']); mkdirSync(join(cwd, '.daylight'), { recursive: true }); writeFileSync(join(cwd, '.daylight/delivery-logs.txt'), logs.stdout + logs.stderr); return { ok: false, msg: 'health check (' + d.health_command + ') not passing after ' + (d.health_timeout_s ?? 60) + 's. Container logs:\n' + (logs.stdout + logs.stderr).slice(-800) }; }
    }
    if (d.smoke_command) { const s = spawnSync('bash', ['-c', d.smoke_command], { cwd, encoding: 'utf8' }); if (s.status !== 0) return { ok: false, msg: 'smoke command (' + d.smoke_command + ') failed:\n' + (s.stdout + s.stderr).slice(-800) }; }
    return { ok: true, msg: 'delivery verified: built, healthy, smoke passed' };
  } finally { run(['down', '-v', '--remove-orphans']); }
}
