// Reuses: Claude Code PreToolUse hook protocol (exit 2 = deny). Deny patterns come from daylight.yaml (base branch) defaults.
import { readFileSync } from 'node:fs';
import { resolveConfig } from './config.ts';
import { append, auditFile } from './lib/events.ts';
import { globRe } from './tiers.ts';

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
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
/** AC-47: the generator may not change its own judges. Bash writes are matched on the command text (best effort). */
export function protectedHit(p: any, cwd: string): string | null {
  if (p.agent_type !== 'generator' && process.env.DAYLIGHT_ROLE !== 'generator') return null;
  const cfg = resolveConfig(cwd, { base: process.env.DAYLIGHT_BASE });
  const pats: string[] = cfg.guard.protected_paths;
  const i = p.tool_input ?? {};
  if (EDIT_TOOLS.includes(p.tool_name)) {
    const rel = String(i.file_path ?? i.notebook_path ?? '').replace(cwd + '/', '');
    return pats.some((g) => globRe(g).test(rel)) ? rel : null;
  }
  if (p.tool_name === 'Bash' && /(>|\btee\b|sed -i|\bmv\b|\bcp\b|\brm\b)[^|;&]*(daylight\.yaml|spec\.md|rubrics\/)/.test(String(i.command))) return String(i.command).slice(0, 120);
  return null;
}
export const PROD_ENV = /^(AWS_|AZURE_|GCP_|GOOGLE_APPLICATION_CREDENTIALS|PROD_|DATABASE_URL|STRIPE_)/;
export const cleanEnv = (env: Record<string, string | undefined>) => Object.fromEntries(Object.entries(env).filter(([k]) => !PROD_ENV.test(k)));

if (process.argv[1]?.endsWith('guard.ts')) {
  try {
    const p = JSON.parse(readFileSync(0, 'utf8'));
    const cwd = p.cwd ?? process.cwd();
    const prot = protectedHit(p, cwd);
    if (prot) {
      append(auditFile(cwd), { kind: 'x_denial', phase: 'guard', tool: p.tool_name, reason: 'protected_path', summary: prot });
      console.error('Daylight guard: the generator cannot modify rubrics, sensor config or spec (' + prot + ').');
      process.exit(2);
    }
    const why = decide(p, cwd);
    if (why) {
      append(auditFile(cwd), { kind: 'x_denial', phase: 'guard', tool: p.tool_name, reason: 'credential_path', summary: scanText(p).slice(0, 200) });
      console.error(why);
      process.exit(2);
    }
  } catch (e) { console.error('guard error: ' + (e as Error).message); }
}
