// Reuses: claude -p subagents (--agent daylight:generator|evaluator), git worktrees, Superpowers SDD loop shape. Glue: retry cap, fresh context, escalation, parallel scheduling.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, addWorktree } from './worktree.ts';
import { normalize } from './verdict.ts';
import { extractJson } from './lib/json.ts';
import { generatorContext } from './context.ts';
import { scopeViolations, repeatsPrevious, classifyFailure, editablePaths } from './contract.ts';
import { redAtBase } from './tdd.ts';
import { append, auditFile } from './lib/events.ts';
import { taskMode, acModes, type Task } from './plan.ts';
import { verifyDelivery } from './delivery.ts';
import { tddInstruction, generatorContract, evaluatorPrompt } from './context.ts';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
export interface Sensor { ok: boolean; messages: string }
export interface Opts { done?: string[]; onTask?: (id: string, status: string) => void; integrate?: boolean; sensors?: (wt: string, t: Task) => Promise<Sensor>; evaluatorExtra?: (wt: string, t: Task) => Promise<string>; spec?: string; tasks?: Task[]; failFast?: boolean }

export const claude = (args: string[], cwd: string, env: Record<string, string> = {}) => new Promise<{ code: number; stdout: string; stderr: string }>((res) => {
  const e = { ...process.env, ...env };
  delete e[['CLAUDE_CODE', 'EXPERIMENTAL', 'CODE_MODE'].join('_')]; // every spawned claude -p is headless: Code Mode does not exist there (ADR-003)
  const c = spawn(process.env.DAYLIGHT_CLAUDE || 'claude', args, { cwd, env: e });
  let stdout = '', stderr = '';
  c.stdout.on('data', (d) => (stdout += d)); c.stderr.on('data', (d) => (stderr += d));
  c.on('close', (code) => res({ code: code ?? -1, stdout, stderr }));
});
export const parseResult = (stdout: string) => { try { const j = JSON.parse(stdout); return { text: String(j.result ?? ''), usage: j.usage ?? null, cost: j.total_cost_usd ?? null }; } catch { return { text: stdout, usage: null, cost: null }; } };
export const effortFor = (t: Task, attempt: number, cfg: any) => (t.risky || attempt >= 3 ? cfg.effort.generator_risky : t.size === 'small' ? cfg.effort.generator_small : cfg.effort.generator_default);

export async function runTask(cwd: string, t: Task, cfg: any, opts: Opts = {}): Promise<'passed' | 'escalated'> {
  const file = auditFile(cwd);
  const wt = addWorktree(cwd, t.id);
  append(file, { kind: 'x_task_start', phase: 'inner', task: t.id, base: wt.base });
  const specText = opts.spec && existsSync(opts.spec) ? readFileSync(opts.spec, 'utf8') : '', mode = taskMode(t, acModes(specText)), tdd = mode === 'tdd';
  if (!tdd) append(file, { kind: 'x_tdd_waiver', phase: 'inner', task: t.id, reason: mode === 'run' ? 'delivery task: proven by running it, not by a unit test' : 'no behaviour ACs to test first' });
  let feedback = '', diff = '', prevComp: string[] | undefined, citeHistory: string[][] = [], fail: { cls: string; reason: string } = { cls: 'generator', reason: 'retry cap reached' };
  const editable = editablePaths(t, opts.tasks ?? [t]);
  const rubric = readFileSync(join(PLUGIN, 'skills/evaluator-rubric/SKILL.md'), 'utf8').replace(/^---[\s\S]*?---\s*/, '');
  const rd = (p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
  const ctx = generatorContext(t, { spec: opts.spec ? rd(opts.spec) : '', sensors: cfg.sensors ?? {}, conventions: rd(join(cwd, '.daylight/ingest/conventions.md')) });
  const attempts = 1 + cfg.retries.task;
  for (let n = 1; n <= attempts; n++) {
    const effort = effortFor(t, n, cfg);
    const prompt = 'Task ' + t.id + ': ' + t.title + '\nAcceptance criteria: ' + t.acs.join(', ') + '\n' + generatorContract(t, opts.tasks ?? [t]) + '\n\n' + ctx + '\n' +
      tddInstruction(t, join(PLUGIN, 'src/cli.ts'), cfg.sensors.commands.tests ?? 'npm test', mode) + (t.feedback ? '\n\n## Review findings to fix\n' + t.feedback : '') + (n > 1 ? '\n\n## Diff so far\n' + diff + '\n\n## Cited feedback to fix\n' + feedback : '');
    append(file, { kind: 'x_context', phase: 'inner', task: t.id, attempt: n, role: 'generator', tokens: Math.ceil(prompt.length / 4), chars: prompt.length, budget: cfg.context.budget_tokens, over_budget: Math.ceil(prompt.length / 4) > cfg.context.budget_tokens });
    append(file, { kind: 'x_dispatch', phase: 'inner', task: t.id, attempt: n, role: 'generator', model: cfg.models.generator, effort });
    const g = await claude(['-p', prompt, '--agent', 'daylight:generator', '--model', cfg.models.generator, '--effort', effort, '--plugin-dir', PLUGIN, '--output-format', 'json', '--allowedTools', 'Read,Write,Edit,Bash,Grep,Glob'], wt.path, { DAYLIGHT_ROLE: 'generator', DAYLIGHT_RUN: process.env.DAYLIGHT_RUN ?? '', DAYLIGHT_AUDIT_ROOT: cwd });
    const gr = parseResult(g.stdout);
    append(file, { kind: 'x_usage', phase: 'inner', task: t.id, role: 'generator', model: cfg.models.generator, usage: gr.usage, cost_usd: gr.cost });
    git(wt.path, ['add', '-A']); git(wt.path, ['commit', '-q', '-m', 'daylight: ' + t.id + ' attempt ' + n]);
    diff = git(wt.path, ['diff', wt.base, 'HEAD']).stdout.slice(0, 20000);
    const computational: string[] = [];
    computational.push(...scopeViolations(git(wt.path, ['diff', '--name-only', git(wt.path, ['merge-base', wt.base, 'HEAD']).stdout.trim() || wt.base, 'HEAD']).stdout.split('\n').filter(Boolean), t, cfg.guard?.protected_paths ?? [], editable));
    if (mode !== 'run' && !diff.trim()) computational.push('the attempt changed nothing relative to the task start: there is nothing to evaluate (behaviour already present, or the task has no work)');
    if (tdd && diff.trim()) { // TDD by evidence: the new tests must fail on the base tree (commit order is irrelevant)
      const rb = redAtBase(cwd, wt.base, wt.branch, cfg.sensors.commands.tests ?? 'npm test'); append(file, { kind: 'x_red_at_base', phase: 'inner', task: t.id, attempt: n, ok: rb.ok, outcome: rb.kind, msg: rb.msg });
      if (!rb.ok) computational.push(rb.msg);
    }
    if (opts.sensors) { const s = await opts.sensors(wt.path, t); if (!s.ok) computational.push(s.messages); }
    if (mode === 'run' && !computational.length) { // a delivery is proven by running it: build, health, smoke (no LLM can judge that)
      const dv = await verifyDelivery(wt.path, cfg); append(file, { kind: 'x_delivery', phase: 'inner', task: t.id, attempt: n, ok: dv.ok, msg: dv.msg.slice(0, 300) });
      if (!dv.ok) computational.push('delivery check failed: ' + dv.msg);
      else { append(file, { kind: 'verdict', phase: 'inner', role: 'harness', task: t.id, attempt: n, verdict: 'pass', evaluator_verdict: 'skipped', computational: [] }); append(file, { kind: 'x_task_end', phase: 'inner', task: t.id, status: 'passed', attempts: n }); return 'passed'; }
    }
    if (computational.length) { // contract failed: the verdict is already fail (ADR-002), so skip the paid evaluator and feed the messages back
      append(file, { kind: 'verdict', phase: 'inner', role: 'harness', task: t.id, attempt: n, verdict: 'fail', evaluator_verdict: 'skipped', computational });
      const repeated = repeatsPrevious(prevComp, computational); prevComp = computational;
      feedback = computational.join('\n');
      const cc = classifyFailure({ messages: computational, editable });
      if (cc.cls !== 'generator') { fail = cc; break; }
      if (repeated) { append(file, { kind: 'x_repeat_failure', phase: 'inner', task: t.id, attempt: n }); feedback += '\n(the same failure repeated on consecutive attempts)'; fail = { cls: 'generator', reason: 'the same computational failure twice' }; break; }
      continue;
    }
    prevComp = undefined;
    const acText = t.acs.map((a) => { const m = new RegExp('\\*\\*' + a + '\\*\\*\\s*(.*)').exec(opts.spec ? rd(opts.spec) : ''); return a + (m ? ': ' + m[1].trim() : ''); });
    const ep = evaluatorPrompt({ task: t, acText, editable, diff, rubric, extra: (opts.evaluatorExtra ? await opts.evaluatorExtra(wt.path, t) : '') + (t.feedback ? '\nFindings this task must fix:\n' + t.feedback : '') });
    const eEffort = n >= 3 ? 'high' : cfg.effort.evaluator;
    append(file, { kind: 'x_dispatch', phase: 'inner', task: t.id, attempt: n, role: 'evaluator', model: cfg.models.evaluator, effort: eEffort });
    const evalArgs = (m: string) => ['-p', ep, '--agent', 'daylight:evaluator', '--model', m, '--effort', eEffort, '--plugin-dir', PLUGIN, '--output-format', 'json', '--allowedTools', 'Read,Grep,Glob'];
    const evaluate = async () => {
      let evalModel = cfg.models.evaluator, degraded = false;
      let e = await claude(evalArgs(evalModel), wt.path, { DAYLIGHT_AUDIT_ROOT: cwd, DAYLIGHT_RUN: process.env.DAYLIGHT_RUN ?? '' });
      if ((e.code !== 0 || /usage limit|rate limit|overloaded|unavailable/i.test(e.stdout + e.stderr)) && cfg.models.evaluator_fallback !== evalModel) {
        degraded = true; // ADR-016: loud, bounded fallback; never silent
        append(file, { kind: 'degraded_evaluator', phase: 'inner', task: t.id, from: evalModel, to: cfg.models.evaluator_fallback, reason: (e.stderr || e.stdout).slice(0, 120) });
        mkdirSync(join(cwd, '.daylight/state'), { recursive: true }); writeFileSync(join(cwd, '.daylight/state/degraded'), 'task ' + t.id + ' graded by ' + cfg.models.evaluator_fallback + '\n');
        evalModel = cfg.models.evaluator_fallback; e = await claude(evalArgs(evalModel), wt.path, { DAYLIGHT_AUDIT_ROOT: cwd, DAYLIGHT_RUN: process.env.DAYLIGHT_RUN ?? '' });
      }
      const er = parseResult(e.stdout);
      append(file, { kind: 'x_usage', phase: 'inner', task: t.id, role: 'evaluator', model: evalModel, usage: er.usage, cost_usd: er.cost });
      let v: any;
      try { v = normalize(extractJson(er.text)); } catch (err) { v = { effective: 'inconclusive', criteria: [], feedback: String((err as Error).message), unparseable: true }; }
      return { v, evalModel, degraded };
    };
    let { v, evalModel, degraded } = await evaluate();
    if (v.unparseable) { // re-ask once on an unparseable reply; an evaluator that still cannot answer is a failure, never a silent pass
      append(file, { kind: 'x_evaluator_reask', phase: 'inner', task: t.id, attempt: n, reason: v.feedback });
      ({ v, evalModel, degraded } = await evaluate());
      if (v.unparseable) v = { ...v, effective: 'fail', feedback: 'the evaluator returned no usable verdict twice: ' + v.feedback, harness: true };
    }
    const effective = computational.length ? 'fail' : v.effective; // ADR-002: computational failures are never overridden
    append(file, { kind: 'verdict', phase: 'inner', role: 'evaluator', task: t.id, attempt: n, verdict: effective, evaluator_verdict: v.effective, model: evalModel, degraded, citations: v.citations ?? [], computational });
    if (effective !== 'fail') { append(file, { kind: 'x_task_end', phase: 'inner', task: t.id, status: 'passed', attempts: n }); return 'passed'; }
    const vc = classifyFailure({ messages: v.harness ? [String(v.feedback)] : [], citations: v.citations ?? [], editable, history: citeHistory }); citeHistory.push(v.citations ?? []);
    if (vc.cls !== 'generator') { fail = vc; feedback = (v.criteria ?? []).filter((c: any) => c.result === 'fail').map((c: any) => '- ' + c.cite + ': ' + (c.id ?? '')).join('\n') + '\n' + (v.feedback ?? ''); break; }
    feedback = [...computational, ...(v.criteria ?? []).filter((c: any) => c.result === 'fail').map((c: any) => '- ' + c.cite + ': ' + (c.id ?? '')), v.feedback ?? ''].join('\n');
  }
  mkdirSync(join(cwd, '.daylight/escalations'), { recursive: true });
  writeFileSync(join(cwd, '.daylight/escalations', t.id + '.md'), '# Escalation: task ' + t.id + '\n\n' + t.title + '\n\nFailure class: ' + fail.cls + ' (' + fail.reason + '). ' + (fail.cls === 'generator' ? 'Retry cap (' + cfg.retries.task + ') reached.' : 'Retries stopped early: another attempt would not have changed the outcome.') + '\n\n## Last cited feedback\n' + feedback + '\n\n## Branch\n' + wt.branch + ' (' + wt.path + ')\n');
  append(file, { kind: 'x_escalation', phase: 'inner', task: t.id, reason: fail.cls === 'generator' ? 'retry_cap' : 'unfixable_by_generator', route: fail.cls === 'generator' ? 'human' : fail.cls, failure_class: fail.cls, detail: fail.reason });
  append(file, { kind: 'x_task_end', phase: 'inner', task: t.id, status: 'escalated', attempts });
  return 'escalated';
}

export async function runInner(cwd: string, tasks: Task[], cfg: any, opts: Opts = {}) {
  const status: Record<string, string> = {};
  for (const id of opts.done ?? []) status[id] = 'passed'; // resume: tasks already passed and integrated
  const running = new Map<string, Promise<string>>();
  let halted = false;
  while (true) {
    for (const t of tasks) if (!status[t.id] && !running.has(t.id) && (halted || t.deps.some((d) => ['escalated', 'blocked'].includes(status[d])))) status[t.id] = 'blocked';
    for (const t of tasks) if (!status[t.id] && !running.has(t.id) && t.deps.every((d) => status[d] === 'passed')) {
      running.set(t.id, runTask(cwd, t, cfg, { ...opts, tasks }).then((st) => {
        status[t.id] = st;
        if (opts.integrate && st === 'passed') { git(cwd, ['checkout', '--', '.']); if (git(cwd, ['merge', '--no-edit', 'daylight/' + t.id]).status !== 0) { git(cwd, ['merge', '--abort']); status[t.id] = 'escalated'; } }
        if (opts.failFast !== false && status[t.id] === 'escalated') halted = true;
        opts.onTask?.(t.id, status[t.id]);
        running.delete(t.id);
        return t.id;
      }));
    }
    if (!running.size) break;
    await Promise.race(running.values());
  }
  return status;
}
