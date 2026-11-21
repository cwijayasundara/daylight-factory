// Reuses: Claude Code PreToolUse hook protocol (exit 2 = deny). Deny patterns come from daylight.yaml (base branch) defaults.
import { readFileSync } from 'node:fs';
import { resolveConfig } from './config.ts';
import { append, auditFile } from './lib/events.ts';

const PATH_FIELDS = ['file_path', 'path', 'pattern', 'notebook_path'];
export function scanText(p: any): string {
  const i = p.tool_input ?? {};
  if (p.tool_name === 'Bash') return String(i.command ?? '');
  if (p.tool_name === 'REPL') return String(i.code ?? '');
  return PATH_FIELDS.map((k) => i[k]).filter(Boolean).join('\n');
}
export function decide(p: any, cwd: string): string | null {
  const cfg = resolveConfig(cwd, { base: process.env.DAYLIGHT_BASE });
  const text = scanText(p).replace(/\.env\.(example|sample)/g, '');
  const hit = cfg.credentials.deny_patterns.find((re: string) => new RegExp(re).test(text));
  return hit ? 'Daylight guard: access to credential paths is denied (pattern ' + hit + ').' : null;
}
export const PROD_ENV = /^(AWS_|AZURE_|GCP_|GOOGLE_APPLICATION_CREDENTIALS|PROD_|DATABASE_URL|STRIPE_)/;
export const cleanEnv = (env: Record<string, string | undefined>) => Object.fromEntries(Object.entries(env).filter(([k]) => !PROD_ENV.test(k)));

if (process.argv[1]?.endsWith('guard.ts')) {
  try {
    const p = JSON.parse(readFileSync(0, 'utf8'));
    const cwd = p.cwd ?? process.cwd();
    const why = decide(p, cwd);
    if (why) {
      append(auditFile(cwd), { kind: 'x_denial', phase: 'guard', tool: p.tool_name, reason: 'credential_path', summary: scanText(p).slice(0, 200) });
      console.error(why);
      process.exit(2);
    }
  } catch (e) { console.error('guard error: ' + (e as Error).message); }
}
