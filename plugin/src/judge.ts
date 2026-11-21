// Reuses: Superpowers SDD spec-compliance review idea; claude -p with the judge agent. Scope check is computational (ADR-013).
import { readFileSync } from 'node:fs';
import { claude, parseResult } from './loop.ts';
import { normalize } from './verdict.ts';
import { extractJson } from './lib/json.ts';
import { git } from './worktree.ts';
import { append, auditFile, readLines } from './lib/events.ts';
import { loadPlan } from './plan.ts';
import { editablePaths, isEditable } from './contract.ts';

const PLUGIN = new URL('..', import.meta.url).pathname;
export async function judge(cwd: string, cfg: any, o: { spec: string; task?: string; base?: string }) {
  const diff = git(cwd, ['diff', (o.base ?? 'main') + '...HEAD']).stdout.slice(0, 30000);
  const prompt = 'Judge this whole run against the spec: build/test status, spec match, scope adherence.\n## Spec\n' + readFileSync(o.spec, 'utf8') + '\n## Diff\n' + diff + '\nReply ONLY JSON {"verdict":"pass|fail","criteria":[{"id":"spec-match|scope|build","result":"pass|fail","cite":"file:line"}],"feedback":""}. A fail needs a citation.';
  const r = await claude(['-p', prompt, '--agent', 'daylight:judge', '--model', cfg.models.judge, '--effort', cfg.effort.judge, '--plugin-dir', PLUGIN, '--output-format', 'json', '--allowedTools', 'Read,Grep,Glob'], cwd);
  const pr = parseResult(r.stdout);
  let v: any;
  try { v = normalize(extractJson(pr.text)); } catch (e) { v = { effective: 'inconclusive', criteria: [], citations: [] }; }
  const f = auditFile(cwd);
  append(f, { kind: 'verdict', phase: 'judge', role: 'judge', task: o.task ?? null, verdict: v.effective, model: cfg.models.judge, citations: v.citations });
  append(f, { kind: 'x_usage', phase: 'judge', model: cfg.models.judge, usage: pr.usage, cost_usd: pr.cost });
  if (v.effective === 'fail') append(f, { kind: 'x_veto', phase: 'judge', task: o.task ?? null, citations: v.citations });
  return v;
}
const startOf = (cwd: string, task: string): string => {
  try { return readLines(auditFile(cwd)).map((l) => JSON.parse(l)).filter((e) => e.kind === 'x_task_start' && e.task === task && e.base).pop()?.base ?? ''; } catch { return ''; }
};
export function scopeCheck(cwd: string, planFile: string, base: string): string[] {
  const errs: string[] = [];
  const tasks = loadPlan(planFile);
  for (const t of tasks) {
    if (git(cwd, ['rev-parse', '--verify', '-q', 'daylight/' + t.id]).status !== 0) continue;
    {
      const rec = startOf(cwd, t.id), from = (rec && git(cwd, ['merge-base', rec, 'daylight/' + t.id]).stdout.trim()) || git(cwd, ['reflog', 'show', '--format=%H', 'daylight/' + t.id]).stdout.trim().split('\n').pop() || base; // where the latest attempt started (a resumed task is rebased onto the run head), else where the branch was created
      for (const f of git(cwd, ['diff', '--name-only', from + '..daylight/' + t.id]).stdout.split('\n').filter(Boolean))
      if (!isEditable(f, editablePaths(t, tasks))) errs.push(f + ' changed by task ' + t.id + ' outside its declared paths (' + editablePaths(t, tasks).join(', ') + ')');
    }
  }
  return errs;
}
