// Reuses: git diff / git show; yaml parser. The Daylight definition is code (ADR-017).
import { parse } from 'yaml';
import { git } from './worktree.ts';

const PATHS = ['daylight.yaml', 'rubrics', 'skills', 'agents', 'rules', 'CLAUDE.md', 'hooks'];
const flat = (o: any, p = ''): Record<string, string> => (o && typeof o === 'object' && !Array.isArray(o) ? Object.assign({}, ...Object.entries(o).map(([k, v]) => flat(v, p ? p + '.' + k : k))) : { [p]: JSON.stringify(o) });
export function definitionDiff(cwd: string, a: string, b: string): string {
  const ns = git(cwd, ['diff', '--name-status', a, b, '--', ...PATHS]).stdout.trim();
  const y = (ref: string) => { const r = git(cwd, ['show', ref + ':daylight.yaml']); return r.status === 0 ? flat(parse(r.stdout) ?? {}) : {}; };
  const [x, z] = [y(a), y(b)], keys = [...new Set([...Object.keys(x), ...Object.keys(z)])].sort();
  const changes = keys.filter((k) => x[k] !== z[k]).map((k) => '  ' + k + ': ' + (x[k] ?? '(unset)') + ' -> ' + (z[k] ?? '(unset)'));
  return ns + (changes.length ? '\nconfig changes:\n' + changes.join('\n') : '') + '\n';
}
