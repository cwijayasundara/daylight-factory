// Reuses: gh (PR create/merge), /code-review + /security-review artefacts, the audit log. Glue: required-section assembly and the head-SHA merge check.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { auditFile, runId } from './lib/events.ts';
import { load } from './metrics.ts';
import { render } from './trace.ts';
import { prSatisfied } from './gate.ts';
import { git } from './worktree.ts';
import { parseFindings, classify } from './review.ts';

export function buildBody(cwd: string): { body: string; missing: string[] } {
  const evs = load(auditFile(cwd)), missing: string[] = [];
  const parts: string[] = [];
  const tr = join(cwd, '.daylight/trace.json');
  if (existsSync(tr)) parts.push('## Traceability matrix\n' + render(JSON.parse(readFileSync(tr, 'utf8')).rows)); else missing.push('Traceability matrix (.daylight/trace.json)');
  const sensors = new Map<string, any>(); for (const e of evs.filter((x) => x.kind === 'sensor')) sensors.set(e.name, e);
  if (sensors.size) parts.push('## Sensors\n| sensor | result |\n|---|---|\n' + [...sensors.values()].map((e) => '| ' + e.name + ' | ' + (e.ok ? 'pass' : 'FAIL') + ' |').join('\n') + '\n'); else missing.push('Sensor results');
  const vs = evs.filter((x) => x.kind === 'verdict');
  if (vs.length) parts.push('## Evaluator verdicts\n' + vs.map((e) => '- ' + e.role + (e.task ? ' (' + e.task + ')' : '') + ': ' + e.verdict + (e.degraded ? ' [DEGRADED evaluator: fallback model, not a full approval]' : '')).join('\n') + '\n'); else missing.push('Evaluator verdicts');
  for (const k of ['code-review', 'security-review']) {
    const f = join(cwd, '.daylight/reviews', k + '.txt');
    if (existsSync(f)) parts.push('## /' + k + '\n' + readFileSync(f, 'utf8') + '\n'); else missing.push('/' + k + ' output');
  }
  const found = ['code-review', 'security-review'].flatMap((k) => { const f = join(cwd, '.daylight/reviews', k + '.txt'); return existsSync(f) ? parseFindings(readFileSync(f, 'utf8')).map((x) => ({ ...x, from: k })) : []; });
  if (found.length) {
    const { blocking, advisory } = classify(found), line = (x: any) => '- ' + (x.file ?? '?') + ':' + (x.line ?? '?') + ' [' + (x.severity ?? 'n/a') + ', ' + x.from + '] ' + String(x.summary ?? '').slice(0, 240) + (x.repro ? ' (repro: ' + x.repro + ')' : '');
    parts.push('## Review findings (blocking needs file, line and a reproducing command; everything else is advisory)\n### Blocking (' + blocking.length + ')\n' + (blocking.map(line).join('\n') || '_none_') + '\n### Advisory (' + advisory.length + ')\n' + (advisory.map(line).join('\n') || '_none_') + '\n');
  }
  if (evs.some((e) => e.kind === 'x_degraded_evaluator' || e.kind === 'degraded_evaluator')) parts.unshift('> WARNING: some verdicts were produced by the fallback evaluator model (degraded). A human decision is required.\n');
  const hist = [
    ...evs.filter((e) => e.kind === 'x_check' && e.ok === false).map((e) => '- ' + e.stage + ' check failed: ' + String(e.msg ?? '').replace(/\s+/g, ' ').slice(0, 200)),
    ...evs.filter((e) => e.kind === 'verdict' && e.verdict !== 'pass').map((e) => '- ' + e.role + (e.task ? ' (' + e.task + ')' : '') + ' verdict ' + e.verdict + (e.citations?.length ? ' citing ' + e.citations.join(', ') : '')),
    ...evs.filter((e) => e.kind === 'x_task_end' && /^fix/.test(String(e.task))).map((e) => '- ' + e.task + ' ' + e.status + ' after ' + e.attempts + ' attempt(s)'),
    ...evs.filter((e) => e.kind === 'x_tdd_waiver').map((e) => '- TDD waiver for ' + e.task + ': ' + e.reason),
  ];
  if (hist.length) parts.push('## Run history (failed checks, rejected verdicts and fix rounds in this run)\n' + hist.join('\n') + '\n');
  parts.push('Daylight-Run: ' + runId());
  return { body: parts.join('\n'), missing };
}
export function createPr(cwd: string, o: { branch: string; base: string; title: string; push: boolean; local?: boolean }) {
  const { body, missing } = buildBody(cwd);
  if (missing.length) return { error: 'PR body is missing required sections: ' + missing.join(', ') };
  if (['main', 'master', o.base].includes(o.branch)) return { error: 'refusing to open a PR from the default branch' };
  if (o.push) { const p = git(cwd, ['push', '-u', 'origin', o.branch]); if (p.status !== 0) return { error: 'push failed: ' + p.stderr }; }
  mkdirSync(join(cwd, '.daylight'), { recursive: true });
  const f = join(cwd, '.daylight/pr-body.md'); writeFileSync(f, body);
  if (o.local) return { url: 'local-pr:' + o.branch + ' (no GitHub remote; body at .daylight/pr-body.md)' };
  const r = spawnSync(process.env.DAYLIGHT_GH || 'gh', ['pr', 'create', '--base', o.base, '--head', o.branch, '--title', o.title, '--body-file', f], { cwd, encoding: 'utf8' });
  return r.status === 0 ? { url: r.stdout.trim() } : { error: 'gh pr create failed: ' + r.stderr };
}
export function updatePr(cwd: string, o: { branch: string }) {
  const { body, missing } = buildBody(cwd);
  if (missing.length) return { error: 'PR body is missing required sections: ' + missing.join(', ') };
  const p = git(cwd, ['push', 'origin', o.branch]); if (p.status !== 0) return { error: 'push failed: ' + p.stderr };
  const f = join(cwd, '.daylight/pr-body.md'); writeFileSync(f, body);
  const r = spawnSync(process.env.DAYLIGHT_GH || 'gh', ['pr', 'edit', o.branch, '--body-file', f], { cwd, encoding: 'utf8' });
  return r.status === 0 ? { updated: o.branch } : { error: 'gh pr edit failed: ' + r.stderr };
}
export async function mergePr(cwd: string, cfg: any, o: { branch: string; tier: 'low' | 'medium' | 'high'; local?: boolean; base?: string }) {
  const head = git(cwd, ['rev-parse', o.branch]).stdout.trim();
  const s = prSatisfied(cwd, cfg, o.tier, head);
  if (!s.ok) return { error: 'merge refused: ' + s.missing.join('; ') };
  const r = o.local ? git(cwd, ['merge', '--no-ff', '-m', 'Merge ' + o.branch + '\n\nDaylight-Run: ' + runId(), o.branch]) : spawnSync(process.env.DAYLIGHT_GH || 'gh', ['pr', 'merge', o.branch, '--squash'], { cwd, encoding: 'utf8' });
  if (o.local && r.status === 0) { /* merged into the checked-out base branch */ }
  if (r.status !== 0) return { error: 'gh pr merge failed: ' + r.stderr };
  if (!o.local && o.base) {
    const pl = git(cwd, ['pull', '-q', '--ff-only', 'origin', o.base]); // bring the squashed merge into the local base
    if (pl.status !== 0) return { error: 'merged on the remote, but the local ' + o.base + ' could not fast-forward (diverged?); not deploying a stale tree: ' + pl.stderr.trim() };
  }
  const { update } = await import('./wiki.ts');
  return { merged: head, wiki: await update(cwd, cfg, { sha: head }) };
}
