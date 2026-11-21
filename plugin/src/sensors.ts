// Reuses: the project's own test/tsc/eslint commands (run as configured), npm advisory data shape, gitleaks-style patterns (events.ts).
// Custom: lightweight TS complexity/duplication/layer analysers so repos need no extra installs (ADR-009: TypeScript only).
import { spawnSync, spawn } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { append, auditFile, SECRETS } from './lib/events.ts';
import { globRe } from './tiers.ts';

export interface Res { name: string; ok: boolean; messages: string[] }
const SKIP = ['node_modules', '.git', '.daylight', 'coverage', 'dist', 'tests', 'test'];
const walk = (d: string): string[] => readdirSync(d).flatMap((n) => (SKIP.includes(n) ? [] : statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
const srcFiles = (cwd: string) => walk(cwd).filter((f) => /\.(tsx?|jsx?)$/.test(f) && !f.endsWith('.d.ts') && !/\.(test|spec)\./.test(f));
const lineOf = (s: string, i: number) => s.slice(0, i).split('\n').length;

const START = /(?:function\s+([\w$]+)\s*\([^)]*\)[^{;]*\{)|(?:(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*(?::[^=>{]+)?=>\s*\{)|(?:^[ \t]*(?:(?:public|private|protected|static|async)\s+)*([\w$]+)\s*\([^)]*\)\s*(?::\s*[^{;]+)?\{)/gm;
const KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'else']);
export interface Fn { name: string; line: number; body: string }
export function functionsOf(src: string): Fn[] {
  const out: Fn[] = [];
  for (const m of src.matchAll(START)) {
    const name = m[1] ?? m[2] ?? m[3]; if (!name || KW.has(name)) continue;
    const open = m.index! + m[0].length - 1; let depth = 0, end = open;
    for (let i = open; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) { end = i; break; } }
    out.push({ name, line: lineOf(src, m.index!), body: src.slice(open, end + 1) });
  }
  return out;
}
export const complexity = (body: string) => 1 + (body.match(/\b(if|for|while|case|catch)\b|&&|\|\||\?(?![.?])/g) ?? []).length;
const shingles = (body: string) => { const t = body.match(/[\w$]+|[^\s\w]/g) ?? []; const s = new Set<string>(); for (let i = 0; i + 2 < t.length; i++) s.add(t.slice(i, i + 3).join(' ')); return s; };
const jaccard = (a: Set<string>, b: Set<string>) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n / (a.size + b.size - n || 1); };
const verLt = (a: string, b: string) => { const p = (v: string) => v.replace(/^[^\d]*/, '').split('.').map(Number); const [x, y] = [p(a), p(b)]; for (let i = 0; i < 3; i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) < (y[i] ?? 0); } return false; };

export const cmdTimeoutS = () => Number(process.env.DAYLIGHT_CMD_TIMEOUT_S) || 120;
export function runCmd(name: string, cmd: string, cwd: string): Res {
  const limit = cmdTimeoutS(), r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', timeout: limit * 1000 });
  if (r.error && (r.error as any).code === 'ETIMEDOUT') return { name, ok: false, messages: [name + ' timed out after ' + limit + 's -> a hanging command is a failure: find what blocks (open handles, watch mode, network)'] };
  if (r.status === 0) return { name, ok: true, messages: [] };
  const tail = (r.stdout + r.stderr).trim().split('\n').slice(-6).join(' | ');
  return { name, ok: false, messages: [name + ' failed (exit ' + r.status + '): ' + tail + ' -> fix the failing ' + name + ' output above'] };
}
export function runFast(cwd: string, cfg: any, only?: string[]): { ok: boolean; results: Res[] } {
  const s = cfg.sensors, files = srcFiles(cwd), results: Res[] = [];
  const want = (n: string) => !only || only.includes(n);
  const rel = (f: string) => relative(cwd, f);
  const texts = files.map((f) => ({ f: rel(f), t: readFileSync(f, 'utf8') }));
  for (const n of s.required) {
    if (!want(n) || ['secrets', 'complexity', 'duplication', 'layers', 'advisories', 'coverage'].includes(n)) continue;
    results.push(s.commands[n] ? runCmd(n, s.commands[n], cwd) : { name: n, ok: false, messages: ['required sensor "' + n + '" has no command in daylight.yaml -> set sensors.commands.' + n] });
  }
  if (s.required.includes('coverage') && want('coverage')) {
    const f = join(cwd, 'coverage/coverage-summary.json');
    const pct = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).total?.lines?.pct : undefined;
    const ok = typeof pct === 'number' && pct >= s.coverage_min;
    results.push({ name: 'coverage', ok, messages: ok ? [] : ['coverage ' + (pct ?? 'missing') + '% < ' + s.coverage_min + '% (coverage/coverage-summary.json) -> add tests for uncovered branches'] });
  }
  const fns = texts.flatMap(({ f, t }) => functionsOf(t).map((fn) => ({ ...fn, file: f })));
  if (want('complexity')) {
    const m = fns.map((fn) => ({ fn, c: complexity(fn.body) })).filter((x) => x.c > s.complexity_max).map(({ fn, c }) => fn.file + ':' + fn.line + ' complexity ' + c + ' > ' + s.complexity_max + ' in ' + fn.name + ' -> extract helper functions or split the branches');
    results.push({ name: 'complexity', ok: !m.length, messages: m });
  }
  if (want('duplication')) {
    const m: string[] = [], big = fns.filter((f) => f.body.split('\n').length >= 5).map((f) => ({ f, s: shingles(f.body) }));
    for (let i = 0; i < big.length && m.length < 50; i++) for (let j = 0; j < i && m.length < 50; j++) { const sim = jaccard(big[i].s, big[j].s); if (sim >= s.duplication_max) m.push(big[i].f.file + ':' + big[i].f.line + ' duplicate of ' + big[j].f.file + ':' + big[j].f.line + ' (similarity ' + sim.toFixed(2) + ' >= ' + s.duplication_max + ') -> extract the shared logic into one function'); }
    results.push({ name: 'duplication', ok: !m.length, messages: m });
  }
  if (want('layers') && s.layers.length) {
    const m: string[] = [];
    for (const { f, t } of texts) for (const L of s.layers) if (globRe(L.from).test(f)) for (const im of t.matchAll(/(?:from|require\()\s*['"](\.[^'"]+)['"]/g)) {
      const target = posix.normalize(posix.join(dirname(f), im[1]));
      if (globRe(L.cannot_import).test(target) || globRe(L.cannot_import).test(target + '.ts')) m.push(f + ':' + lineOf(t, im.index!) + ' layer violation: imports ' + im[1] + ' (' + L.from + ' must not import ' + L.cannot_import + ') -> depend on an abstraction owned by the inner layer');
    }
    results.push({ name: 'layers', ok: !m.length, messages: m });
  }
  if (want('advisories') && s.advisories.length) {
    const pj = join(cwd, 'package.json'), m: string[] = [];
    const deps = existsSync(pj) ? { ...JSON.parse(readFileSync(pj, 'utf8')).dependencies, ...JSON.parse(readFileSync(pj, 'utf8')).devDependencies } : {};
    for (const a of s.advisories) if (deps[a.name] && verLt(deps[a.name], a.below)) m.push('package.json ' + a.name + '@' + deps[a.name] + ' is vulnerable (' + (a.id ?? 'advisory') + ', fixed in ' + a.below + ') -> upgrade ' + a.name);
    results.push({ name: 'advisories', ok: !m.length, messages: m });
  }
  if (want('secrets')) {
    const m: string[] = [];
    for (const { f, t } of texts) for (const re of SECRETS) { const x = new RegExp(re.source, re.flags.replace('g', '')).exec(t); if (x) m.push(f + ':' + lineOf(t, x.index) + ' secret pattern -> remove it and read it from the environment'); }
    results.push({ name: 'secrets', ok: !m.length, messages: m });
  }
  for (const r of results) append(auditFile(cwd), { kind: 'sensor', phase: 'sensors', name: r.name, ok: r.ok, messages: r.messages.slice(0, 5) });
  return { ok: results.every((r) => r.ok), results };
}
export function format(results: Res[], cap: number): string {
  const all = results.flatMap((r) => r.messages);
  return all.slice(0, cap).join('\n') + (all.length > cap ? '\n... ' + (all.length - cap) + ' more (see audit log)' : '');
}
const sdir = (cwd: string) => join(cwd, '.daylight/sensors');
const status = (cwd: string, n: string, v: object) => { mkdirSync(sdir(cwd), { recursive: true }); writeFileSync(join(sdir(cwd), n + '.json'), JSON.stringify(v)); };
export function startSlow(cwd: string, name: string) {
  status(cwd, name, { status: 'running', started: Date.now() });
  const c = spawn('node', [join(dirname(fileURLToPath(import.meta.url)), 'cli.ts'), 'sensors', '_exec', '--name', name], { cwd, detached: true, stdio: 'ignore' });
  c.unref();
}
export function execSlow(cwd: string, name: string, cfg: any) {
  const r = spawnSync('bash', ['-c', cfg.sensors.commands[name]], { cwd, encoding: 'utf8', timeout: cfg.sensors.slow_timeout_s * 1000 });
  const st = r.error ? 'timeout' : r.status === 0 ? 'done' : 'failed';
  status(cwd, name, { status: st, exit: r.status, tail: (r.stdout + r.stderr).slice(-400) });
  append(auditFile(cwd), { kind: 'sensor', phase: 'sensors', name, ok: st === 'done', slow: true, messages: [st] });
}
export async function waitSlow(cwd: string, name: string, maxS: number): Promise<number> {
  const f = join(sdir(cwd), name + '.json'), end = Date.now() + maxS * 1000;
  while (Date.now() < end) { const s = JSON.parse(readFileSync(f, 'utf8')); if (s.status !== 'running') return s.status === 'done' ? 0 : 1; await new Promise((r) => setTimeout(r, 200)); }
  return 2;
}
