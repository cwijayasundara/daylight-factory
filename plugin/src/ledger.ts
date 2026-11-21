// Reuses: node:fs only. Enforces AC-8 (reuse headers + custom-line budget) and AC-6 (no Code Mode variable set by the plugin).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadConfig } from './config.ts';

export interface Row { file: string; lines: number; reuses: string }
const walk = (d: string, skip = ['node_modules', '.git']): string[] =>
  readdirSync(d).flatMap((n) => (skip.includes(n) ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n), skip) : [join(d, n)]));

export function scan(root: string): Row[] {
  const src = join(root, 'src');
  if (!existsSync(src)) return [];
  return walk(src).filter((f) => f.endsWith('.ts')).map((f) => {
    const text = readFileSync(f, 'utf8');
    const head = text.split('\n').slice(0, 5).join('\n');
    const m = head.match(/Reuses:\s*(.+)/);
    const lines = text.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length;
    return { file: relative(root, f), lines, reuses: m ? m[1].trim() : '' };
  });
}
export function check(root: string, budget?: number) {
  const rows = scan(root);
  const cfgFile = join(root, 'daylight.yaml');
  const b = budget ?? (existsSync(cfgFile) ? loadConfig(cfgFile).config?.ledger.max_custom_lines : undefined) ?? 4000;
  const total = rows.reduce((s, r) => s + r.lines, 0);
  const errors = rows.filter((r) => !r.reuses).map((r) => r.file + ': missing "Reuses:" header');
  if (total > b) errors.push('custom lines ' + total + ' exceed budget ' + b);
  return { rows, total, budget: b, errors };
}
export const table = (rows: Row[], total: number) =>
  '| Custom file | Lines | Reuses |\n|---|---|---|\n' + rows.map((r) => '| ' + r.file + ' | ' + r.lines + ' | ' + r.reuses + ' |').join('\n') + '\n| **Total** | ' + total + ' | |\n';

export function noCodeModeVar(root: string): string[] {
  const name = ['CLAUDE_CODE', 'EXPERIMENTAL', 'CODE_MODE'].join('_');
  return walk(root).filter((f) => !/\.(png|jpg)$/.test(f)).filter((f) => readFileSync(f, 'utf8').includes(name)).map((f) => relative(root, f));
}
