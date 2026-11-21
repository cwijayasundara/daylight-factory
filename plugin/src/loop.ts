// Reuses: claude -p subagents (--agent daylight:generator|evaluator), git worktrees, Superpowers SDD loop shape. Glue: retry cap, fresh context, escalation, parallel scheduling.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, addWorktree } from './worktree.ts';
import { normalize } from './verdict.ts';
import { tddCheck } from './tdd.ts';
import { append, auditFile } from './lib/events.ts';
import type { Task } from './plan.ts';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
export interface Sensor { ok: boolean; messages: string }
export interface Opts { sensors?: (wt: string, t: Task) => Promise<Sensor>; evaluatorExtra?: (wt: string, t: Task) => Promise<string> }

export const claude = (args: string[], cwd: string, env: Record<string, string> = {}) => new Promise<{ code: number; stdout: string; stderr: string }>((res) => {
  const c = spawn(process.env.DAYLIGHT_CLAUDE || 'claude', args, { cwd, env: { ...process.env, ...env } });
  let stdout = '', stderr = '';
  c.stdout.on('data', (d) => (stdout += d)); c.stderr.on('data', (d) => (stderr += d));
  c.on('close', (code) => res({ code: code ?? -1, stdout, stderr }));
});
const parseResult = (stdout: string) => { try { const j = JSON.parse(stdout); return { text: String(j.result ?? ''), usage: j.usage ?? null, cost: j.total_cost_usd ?? null }; } catch { return { text: stdout, usage: null, cost: null }; } };
export const effortFor = (t: Task, attempt: number, cfg: any) => (t.risky || attempt >= 3 ? cfg.effort.generator_risky : t.size === 'small' ? cfg.effort.generator_small : cfg.effort.generator_default);

export async function runTask(cwd: string, t: Task, cfg: any, opts: Opts = {}): Promise<'passed' | 'escalated'> {
  const file = auditFile(cwd);
  const wt = addWorktree(cwd, t.id);
  append(file, { kind: 'x_task_start', phase: 'inner', task: t.id });
  let feedback = '', diff = '';
  const attempts = 1 + cfg.retries.task;
  for (let n = 1; n <= attempts; n++) {
    const effort = effortFor(t, n, cfg);
    const prompt = 'Task ' + t.id + ': ' + t.title + '\nAcceptance criteria: ' + t.acs.join(', ') + '\nAllowed paths: ' + t.paths.join(', ') +
      '\nFollow TDD: commit failing AC-tagged tests first, then implement.' + (n > 1 ? '\n\n## Diff so far\n' + diff + '\n\n## Cited feedback to fix\n' + feedback : '');
    append(file, { kind: 'x_context', phase: 'inner', task: t.id, attempt: n, role: 'generator', tokens: Math.ceil(prompt.length / 4), chars: prompt.length });
    append(file, { kind: 'x_dispatch', phase: 'inner', task: t.id, attempt: n, role: 'generator', model: cfg.models.generator, effort });
    const g = await claude(['-p', prompt, '--agent', 'daylight:generator', '--model', cfg.models.generator, '--effort', effort, '--plugin-dir', PLUGIN, '--output-format', 'json', '--allowedTools', 'Read,Write,Edit,Bash,Grep,Glob'], wt.path, { DAYLIGHT_ROLE: 'generator', DAYLIGHT_RUN: process.env.DAYLIGHT_RUN ?? '' });
    const gr = parseResult(g.stdout);
    append(file, { kind: 'x_usage', phase: 'inner', task: t.id, role: 'generator', model: cfg.models.generator, usage: gr.usage, cost_usd: gr.cost });
    git(wt.path, ['add', '-A']); git(wt.path, ['commit', '-q', '-m', 'daylight: ' + t.id + ' attempt ' + n]);
    diff = git(wt.path, ['diff', wt.base, 'HEAD']).stdout.slice(0, 20000);
    const computational: string[] = [];
    if (t.tdd !== false) computational.push(...tddCheck(cwd, wt.base, wt.branch, t.id));
    if (opts.sensors) { const s = await opts.sensors(wt.path, t); if (!s.ok) computational.push(s.messages); }
    const extra = opts.evaluatorExtra ? await opts.evaluatorExtra(wt.path, t) : '';
    const ep = 'Evaluate task ' + t.id + ' against the evaluator-rubric skill.\nAC: ' + t.acs.join(', ') + '\n' + extra + '\n## Diff\n' + diff + '\nReply ONLY JSON {"verdict":"pass|fail","criteria":[{"id":"..","result":"pass|fail","cite":"file:line or test name"}],"feedback":".."}';
    const eEffort = n >= 3 ? 'high' : cfg.effort.evaluator;
    append(file, { kind: 'x_dispatch', phase: 'inner', task: t.id, attempt: n, role: 'evaluator', model: cfg.models.evaluator, effort: eEffort });
    const e = await claude(['-p', ep, '--agent', 'daylight:evaluator', '--model', cfg.models.evaluator, '--effort', eEffort, '--plugin-dir', PLUGIN, '--output-format', 'json', '--allowedTools', 'Read,Grep,Glob'], wt.path);
    const er = parseResult(e.stdout);
    append(file, { kind: 'x_usage', phase: 'inner', task: t.id, role: 'evaluator', model: cfg.models.evaluator, usage: er.usage, cost_usd: er.cost });
    let v: any;
    try { v = normalize(JSON.parse(er.text.replace(/^```(?:json)?\n?|```$/g, ''))); } catch (err) { v = { effective: 'inconclusive', criteria: [], feedback: String((err as Error).message) }; }
    const effective = computational.length ? 'fail' : v.effective; // ADR-002: computational failures are never overridden
    append(file, { kind: 'verdict', phase: 'inner', role: 'evaluator', task: t.id, attempt: n, verdict: effective, evaluator_verdict: v.effective, model: cfg.models.evaluator, citations: v.citations ?? [], computational });
    if (effective !== 'fail') { append(file, { kind: 'x_task_end', phase: 'inner', task: t.id, status: 'passed', attempts: n }); return 'passed'; }
    feedback = [...computational, ...(v.criteria ?? []).filter((c: any) => c.result === 'fail').map((c: any) => '- ' + c.cite + ': ' + (c.id ?? '')), v.feedback ?? ''].join('\n');
  }
  mkdirSync(join(cwd, '.daylight/escalations'), { recursive: true });
  writeFileSync(join(cwd, '.daylight/escalations', t.id + '.md'), '# Escalation: task ' + t.id + '\n\n' + t.title + '\n\nRetry cap (' + cfg.retries.task + ') reached after ' + attempts + ' attempts.\n\n## Last cited feedback\n' + feedback + '\n\n## Branch\n' + wt.branch + ' (' + wt.path + ')\n');
  append(file, { kind: 'x_escalation', phase: 'inner', task: t.id, reason: 'retry_cap', route: 'human' });
  append(file, { kind: 'x_task_end', phase: 'inner', task: t.id, status: 'escalated', attempts });
  return 'escalated';
}

export async function runInner(cwd: string, tasks: Task[], cfg: any, opts: Opts = {}) {
  const status: Record<string, string> = {};
  let pending = [...tasks];
  while (pending.length) {
    for (const t of pending) if (t.deps.some((d) => ['escalated', 'blocked'].includes(status[d]))) { status[t.id] = 'blocked'; }
    pending = pending.filter((t) => !status[t.id]);
    const ready = pending.filter((t) => t.deps.every((d) => status[d] === 'passed'));
    if (!ready.length) break;
    await Promise.all(ready.map(async (t) => { status[t.id] = await runTask(cwd, t, cfg, opts); }));
    pending = pending.filter((t) => !status[t.id]);
  }
  return status;
}
