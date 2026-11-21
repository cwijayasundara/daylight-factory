// Reuses: the repo's own config files as evidence (package.json, tsconfig, ESLint config), README conventions; wiki.ts for the starter wiki.
// Custom: detection + proposal diff. TypeScript only (ADR-009).
import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
import { spawnSync } from 'node:child_process';
import { stringify } from 'yaml';
import { modulesOf, update } from './wiki.ts';
import { git } from './worktree.ts';

const SKIP = ['node_modules', '.git', '.daylight', 'dist', 'coverage', 'wiki'];
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d).flatMap((n) => (SKIP.includes(n) ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)])) : []);
const LANG: Record<string, string> = { ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', py: 'Python', go: 'Go', java: 'Java', rb: 'Ruby', rs: 'Rust' };
export function detectLanguage(cwd: string) {
  const counts: Record<string, number> = {};
  for (const f of walk(cwd)) { const l = LANG[f.split('.').pop() ?? '']; if (l) counts[l] = (counts[l] ?? 0) + 1; }
  const primary = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return { counts, primary };
}
const exists = (cwd: string, ...c: string[]) => c.find((f) => existsSync(join(cwd, f)));

export async function ingest(cwd: string, cfg: any, o: { auto?: boolean; accept?: boolean }): Promise<{ code: number; out: string }> {
  const idir = join(cwd, '.daylight/ingest');
  if (o.accept) {
    const p = join(idir, 'daylight.proposed.yaml');
    if (!existsSync(p)) return { code: 1, out: 'nothing proposed: run ingest first' };
    copyFileSync(p, join(cwd, 'daylight.yaml')); return { code: 0, out: 'applied proposed daylight.yaml' };
  }
  const { primary, counts } = detectLanguage(cwd);
  if (!primary) return { code: 0, out: 'greenfield (no source files): skipping ingest' };
  if (o.auto && existsSync(join(idir, 'conventions.md'))) return { code: 0, out: 'already ingested: skipping ingest' };
  if (primary !== 'TypeScript') return { code: 1, out: 'unsupported language: ' + primary + ' is primary (' + JSON.stringify(counts) + '); Daylight v1 supports TypeScript only. No sensor config proposed.' };
  const pj = existsSync(join(cwd, 'package.json')) ? JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) : {};
  const deps = { ...pj.dependencies, ...pj.devDependencies }, scripts = pj.scripts ?? {};
  const eslint = exists(cwd, 'eslint.config.js', 'eslint.config.mjs', 'eslint.config.ts', '.eslintrc.json', '.eslintrc.js', '.eslintrc');
  const tsconfig = exists(cwd, 'tsconfig.json');
  const lock = exists(cwd, 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock');
  const runner = /node --test/.test(scripts.test ?? '') ? 'node:test' : deps.vitest ? 'vitest' : deps.jest ? 'jest' : scripts.test ? 'custom (' + scripts.test + ')' : 'unknown';
  const pm = lock === 'pnpm-lock.yaml' ? 'pnpm' : lock === 'yarn.lock' ? 'yarn' : 'npm';
  const mods = modulesOf(cwd);
  const edges: string[] = [];
  for (const [m, files] of Object.entries(mods)) for (const f of files) for (const im of readFileSync(join(cwd, f), 'utf8').matchAll(/from\s*['"](\.[^'"]+)['"]/g)) {
    const t = posix.normalize(posix.join(dirname(f), im[1])); const other = Object.entries(mods).find(([, fs]) => fs.includes(t) || fs.includes(t + '.ts'));
    if (other && (Object.keys(mods).length > 1 ? other[0] !== m : true)) edges.push('- ' + f + ' -> ' + t + ' (evidence: ' + f + ')');
  }
  const readme = existsSync(join(cwd, 'README.md')) ? readFileSync(join(cwd, 'README.md'), 'utf8') : '';
  const declared = (readme.match(/^##\s+Conventions\s*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/im) ?? [])[1]?.split('\n').filter((l) => /^[-*]\s/.test(l)) ?? [];
  const names = walk(join(cwd, 'src')).map((f) => f.split('/').pop()!.replace(/\.\w+$/, ''));
  const kebab = names.length > 0 && names.every((n) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(n));
  const rows: string[] = [
    '# Conventions report (ingest)', '',
    '- Language: TypeScript (' + counts.TypeScript + ' files) (evidence: src/**/*.ts)',
    '- Test runner: ' + runner + ' (evidence: package.json scripts.test' + (existsSync(join(cwd, 'tests')) ? ', tests/' : '') + ')',
    '- Linter: ' + (eslint ? 'ESLint' : 'none detected') + ' (evidence: ' + (eslint ?? 'no config file') + ')',
    '- Type checker: ' + (tsconfig ? 'tsc (TypeScript compiler)' : 'none detected') + ' (evidence: ' + (tsconfig ?? 'no tsconfig.json') + ')',
    '- Package manager: ' + pm + ' (evidence: ' + (lock ?? 'package.json') + ')', '',
    '## Dependency layers', ...(edges.length ? edges : Object.keys(mods).map((m) => '- ' + m + ' (evidence: ' + mods[m][0] + ')')), '',
    '## Declared conventions', ...declared.map((d) => d + ' (evidence: README.md)'), ...(kebab ? ['- File names are kebab-case (evidence: src/)'] : []), '',
  ];
  mkdirSync(idir, { recursive: true }); writeFileSync(join(idir, 'conventions.md'), rows.join('\n'));
  const complexity = eslint ? Number((readFileSync(join(cwd, eslint), 'utf8').match(/complexity\s*:\s*\[\s*['"](?:error|warn)['"]\s*,\s*(\d+)/) ?? [])[1]) : NaN;
  const commands: Record<string, string> = {}; const required: string[] = [];
  if (scripts.test) { commands.tests = 'npm test'; required.push('tests'); }
  if (tsconfig) { commands.typecheck = 'npx tsc --noEmit'; required.push('typecheck'); }
  if (eslint) { commands.lint = scripts.lint ? 'npm run lint' : 'npx eslint .'; required.push('lint'); }
  required.push('secrets');
  const proposed = { gates: { design: { approver: 'human' }, pr: { approver: 'agent' } }, deploy: { target: 'local' }, sensors: { required, ...(Number.isFinite(complexity) ? { complexity_max: complexity } : {}), commands } };
  writeFileSync(join(idir, 'daylight.proposed.yaml'), stringify(proposed));
  const d = spawnSync('diff', ['-u', existsSync(join(cwd, 'daylight.yaml')) ? join(cwd, 'daylight.yaml') : '/dev/null', join(idir, 'daylight.proposed.yaml')], { encoding: 'utf8' });
  writeFileSync(join(idir, 'daylight.yaml.diff'), d.stdout);
  const wiki = cfg.wiki.enabled ? await update(cwd, cfg, { sha: git(cwd, ['rev-parse', 'HEAD']).stdout.trim() || 'none' }) : 'wiki disabled';
  return { code: 0, out: 'ingest complete: conventions.md, proposed daylight.yaml diff (not applied), ' + wiki };
}
