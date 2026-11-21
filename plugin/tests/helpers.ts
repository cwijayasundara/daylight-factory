import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CM_VAR = ['CLAUDE_CODE', 'EXPERIMENTAL', 'CODE_MODE'].join('_');
export const tmp = () => mkdtempSync(join(tmpdir(), 'daylight-'));
export function put(dir: string, rel: string, content: string) {
  const p = join(dir, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  return p;
}
export function cli(args: string[], opts: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
  const env = { ...process.env, ...opts.env } as Record<string, string>;
  for (const k of Object.keys(env)) if (env[k] === undefined) delete env[k];
  const r = spawnSync('node', [join(PLUGIN, 'src/cli.ts'), ...args], { cwd: opts.cwd ?? PLUGIN, env, encoding: 'utf8' });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}
export function hook(payload: object, cwd: string, env: Record<string, string> = {}) {
  const r = spawnSync('node', [join(PLUGIN, 'src/hook.ts')], { cwd, input: JSON.stringify(payload), encoding: 'utf8', env: { ...process.env, DAYLIGHT_RUN: 'r1', ...env } });
  return { code: r.status ?? -1, out: r.stdout, err: r.stderr };
}
export const events = (cwd: string, run = 'r1') =>
  readFileSync(join(cwd, '.daylight/audit', run + '.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
export const MIN_YAML = 'gates:\n  design: { approver: human }\n  pr: { approver: agent }\ndeploy:\n  target: local\n';
