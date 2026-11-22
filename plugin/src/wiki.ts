// Reuses: git (HEAD sha), the design artefacts (intent/spec/ADRs) for the why-trail, claude -p for optional summaries (Sonnet, low effort).
// Custom: a manifest-driven incremental generator (ADR-014: replicated minimally; CodeWiki pilot recorded in docs/adr).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { git } from './worktree.ts';
import { claude, parseResult } from './loop.ts';
import { append, auditFile } from './lib/events.ts';

const h = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
const walk = (d: string): string[] => (existsSync(d) ? readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)])) : []);
export function modulesOf(cwd: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const f of walk(join(cwd, 'src')).filter((x) => /\.(tsx?|jsx?|py|rs)$/.test(x) && !x.endsWith('.d.ts'))) {
    const rel = relative(cwd, f), parts = rel.split('/'), name = parts.length > 2 ? parts[1] : 'core';
    (out[name] ??= []).push(rel);
  }
  return out;
}
const read = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

export async function update(cwd: string, cfg: any, o: { sha?: string; summarize?: boolean } = {}): Promise<string> {
  if (!cfg.wiki.enabled) return 'wiki disabled: nothing written';
  const wdir = join(cwd, cfg.wiki.dir), ddir = join(cwd, cfg.design_dir), mf = join(wdir, '.manifest.json');
  const man = existsSync(mf) ? JSON.parse(readFileSync(mf, 'utf8')) : { sha: '', pages: {}, overview: '' };
  const sha = o.sha ?? (git(cwd, ['rev-parse', 'HEAD']).stdout.trim() || 'none');
  const spec = read(join(ddir, 'spec.md')), arch = read(join(ddir, 'architecture.md'));
  const mods = modulesOf(cwd), specLine = (id: string) => (spec.match(new RegExp('\\*\\*' + id + '\\*\\*\\s*(.*)')) ?? [])[1];
  const unexplained: string[] = [], regenerated: string[] = [];
  mkdirSync(join(wdir, 'modules'), { recursive: true });
  for (const [name, files] of Object.entries(mods)) {
    const texts = files.map((f) => read(join(cwd, f)));
    const tests = files.map((f) => 'tests/' + f.split('/').pop()!.replace(/\.(\w+)$/, '.test.$1')).map((t) => read(join(cwd, t)));
    const refs = [...new Set([...texts, ...tests].join('\n').match(/\b(?:AC|ADR)-\d+\b/g) ?? [])].sort();
    const why = refs.map((r) => (r.startsWith('AC') ? (specLine(r) !== undefined ? '- [' + r + '](' + relative(join(wdir, 'modules'), join(ddir, 'spec.md')) + ') ' + specLine(r) : null) : arch.includes(r) ? '- [' + r + '](' + relative(join(wdir, 'modules'), join(ddir, 'architecture.md')) + ')' : null)).filter(Boolean) as string[];
    if (!why.length) unexplained.push(name);
    const hash = h(texts.join('\n--file--\n') + why.join('\n'));
    if (man.pages[name]?.hash === hash && existsSync(join(wdir, 'modules', name + '.md'))) continue;
    const exports = files.map((f, i) => '- ' + f + ': ' + ([...texts[i].matchAll(/^export\s+(?:async\s+)?(?:function|class|const|interface|type|enum)\s+([\w$]+)/gm)].map((m) => m[1]).join(', ') || '(none)')).join('\n');
    let summary = '';
    if (o.summarize) {
      const r = await claude(['-p', 'In two sentences describe module ' + name + ' with exports:\n' + exports, '--model', cfg.models.wiki, '--effort', 'low', '--output-format', 'json'], cwd);
      const pr = parseResult(r.stdout); summary = '## Summary\n' + pr.text.trim() + '\n\n';
      append(auditFile(cwd), { kind: 'x_usage', phase: 'wiki', model: cfg.models.wiki, usage: pr.usage, cost_usd: pr.cost });
    }
    const page = '# Module: ' + name + '\n\n' + summary + '## Files\n' + files.map((f) => '- [' + f + '](' + relative(join(wdir, 'modules'), join(cwd, f)) + ')').join('\n') + '\n\n## Exports\n' + exports + '\n\n## Why\n' + (why.join('\n') || '_No intent/spec/ADR reference found._') + '\n';
    writeFileSync(join(wdir, 'modules', name + '.md'), page);
    man.pages[name] = { hash, sha, sources: files }; regenerated.push(name);
  }
  for (const gone of Object.keys(man.pages).filter((p) => !mods[p])) { rmSync(join(wdir, 'modules', gone + '.md'), { force: true }); delete man.pages[gone]; regenerated.push('-' + gone); }
  const ovHash = h(arch + Object.keys(mods).join() + unexplained.join());
  if (man.overview !== ovHash || !existsSync(join(wdir, 'overview.md'))) {
    const adrs = [...arch.matchAll(/^###\s+(ADR-\d+[^\n]*)/gm)].map((m) => '- [' + m[1] + '](' + relative(wdir, join(ddir, 'architecture.md')) + ')');
    writeFileSync(join(wdir, 'overview.md'), '# Architecture overview\n\n## Decisions\n' + (adrs.join('\n') || '_none recorded_') + '\n\n## Modules\n' + Object.keys(mods).map((m) => '- [' + m + '](modules/' + m + '.md)').join('\n') + '\n\n## Unexplained pages\n' + (unexplained.map((u) => '- ' + u).join('\n') || '_none_') + '\n');
    man.overview = ovHash; regenerated.push('overview');
  }
  man.sha = sha; writeFileSync(mf, JSON.stringify(man, null, 2));
  return 'wiki updated at ' + sha.slice(0, 8) + ': ' + (regenerated.join(', ') || 'no pages changed');
}
export function links(cwd: string, cfg: any): string[] {
  const wdir = join(cwd, cfg.wiki.dir), errs: string[] = [];
  for (const f of walk(wdir).filter((x) => x.endsWith('.md'))) for (const m of readFileSync(f, 'utf8').matchAll(/\]\(([^)#\s]+)/g)) {
    if (/^[a-z]+:/.test(m[1])) continue;
    if (!existsSync(join(dirname(f), m[1]))) errs.push(relative(cwd, f) + ': broken link ' + m[1]);
  }
  return errs;
}
export const current = (cwd: string, cfg: any, sha: string) => { const mf = join(cwd, cfg.wiki.dir, '.manifest.json'); return existsSync(mf) && JSON.parse(readFileSync(mf, 'utf8')).sha === sha; };
