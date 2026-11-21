// Reuses: every Daylight module (this is only the sequencing, G16), claude -p for authoring/approvals, git, docker via deploy.ts.
import { spawnSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, stringify } from 'yaml';
import { deepMerge, resolveConfig } from './config.ts';
import { normalize } from './workitem.ts';
import { triage } from './triage.ts';
import { extractJson } from './lib/json.ts';
import { gate2, type Evidence } from './gate2.ts';
import { preflight } from './preflight.ts';
import { prdCheck } from './design.ts';
import { ingest } from './ingest.ts';
import { request, agentDecide, decide, verifyGate } from './gate.ts';
import { load } from './state.ts';
import { loadPlan, isFastPath, fastPlan } from './plan.ts';
import { runInner, claude, parseResult } from './loop.ts';
import { runFast } from './sensors.ts';
import { classify } from './tiers.ts';
import { git } from './worktree.ts';
import { append, auditFile, runId } from './lib/events.ts';
import { load as loadEvents, touchpoints } from './metrics.ts';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..'), CLI = join(PLUGIN, 'src/cli.ts');
const authorTools = 'Read,Write,Edit,Glob,Grep,Bash';
export interface Result { ok: boolean; stage: string; msg: string }

export async function runPipeline(cwd: string, arg: string, cfg: any, o: { base: string; agents: boolean; resume?: boolean; stopAfter?: string }): Promise<Result> {
  const f = auditFile(cwd), run = runId(), branch = 'daylight/run-' + run;
  // ADR-020: coarse checkpoints (design, plan, inner) in .daylight/run-state.json so a retry resumes instead of restarting from design
  const rsFile = join(cwd, '.daylight/run-state.json');
  const oldRs = existsSync(rsFile) ? JSON.parse(readFileSync(rsFile, 'utf8')) : null;
  if (oldRs?.run === run && o.base.startsWith('daylight/run-')) o = { ...o, base: oldRs.base }; // resumed from inside the run branch: the real base is recorded
  const input = createHash('sha256').update(readFileSync(arg, 'utf8') + '\n' + o.base).digest('hex');
  let rs: any = { run, base: o.base, input, phases: {}, tasks: {} };
  if (o.resume && oldRs?.run === run) { if (oldRs.input === input) rs = oldRs; else append(f, { kind: 'x_resume_invalid', phase: 'resume', reason: 'PRD or base changed; checkpoints discarded' }); }
  const save = () => { mkdirSync(dirname(rsFile), { recursive: true }); writeFileSync(rsFile, JSON.stringify(rs, null, 2)); };
  const mark = (n: string) => { rs.phases[n] = true; save(); };
  const stopIf = (n: string): Result | null => (o.stopAfter === n ? { ok: true, stage: n, msg: 'stopped after ' + n } : null);
  save();
  const cmd = (args: string[]) => spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  const cmdAsync = (args: string[]) => new Promise<{ status: number; stdout: string; stderr: string }>((res) => { const c = spawn('node', [CLI, ...args], { cwd }); let stdout = '', stderr = ''; c.stdout.on('data', (d) => (stdout += d)); c.stderr.on('data', (d) => (stderr += d)); c.on('close', (code) => res({ status: code ?? 1, stdout, stderr })); });
  const ph = async <T>(name: string, fn: () => Promise<T> | T): Promise<T> => { append(f, { kind: 'phase', name, phase: name, status: 'start' }); const r = await fn(); append(f, { kind: 'phase', name, phase: name, status: 'end' }); return r; };
  const stop = (stage: string, msg: string): Result => { append(f, { kind: 'x_stop_run', phase: stage, msg }); return { ok: false, stage, msg }; };
  const ask = async (phase: string, model: string, effort: string, prompt: string, tools = authorTools) => {
    const r = await claude(['-p', prompt, '--model', model, '--effort', effort, '--plugin-dir', PLUGIN, '--output-format', 'json', '--allowedTools', tools], cwd, { DAYLIGHT_AUDIT_ROOT: cwd, DAYLIGHT_RUN: run });
    const p = parseResult(r.stdout); append(f, { kind: 'x_usage', phase, model, usage: p.usage, cost_usd: p.cost }); return p.text;
  };
  if (o.agents) { cfg.gates.design.approver = 'agent'; cfg.gates.pr.approver = 'agent'; }
  const wi = normalize(arg);
  const prdErr = prdCheck(readFileSync(arg, 'utf8')); if (prdErr.length) return stop('triage', prdErr.join('; '));
  const t = await ph('triage', () => triage(wi, cfg, cwd)); if (t.route === 'human') return stop('triage', 'routed to a human: ' + t.rationale);

  const fast = isFastPath(t, cfg); if (fast) append(f, { kind: 'x_fast_path', phase: 'triage', size: t.size, tier: t.tier });
  const ing = await ph('ingest', () => ingest(cwd, cfg, { auto: true }));
  append(f, { kind: 'x_ingest', phase: 'ingest', out: ing.out });
  const branchExists = git(cwd, ['rev-parse', '--verify', '-q', branch]).status === 0;
  if (branchExists && !o.resume) return stop('start', 'branch ' + branch + ' already exists for this run id; use --resume to continue it, or set a new DAYLIGHT_RUN');
  git(cwd, branchExists ? ['checkout', '-q', branch] : ['checkout', '-q', '-b', branch]); // everything below is committed on the run branch, so the base stays identical to its remote
  const proposed = join(cwd, '.daylight/ingest/daylight.proposed.yaml');
  if (existsSync(proposed) && existsSync(join(cwd, 'daylight.yaml'))) {
    // AC-33: proposals are not applied until accepted. With agent approvers the operator profile accepts the sensor section; existing operator keys win.
    const merged = deepMerge(parse(readFileSync(proposed, 'utf8')), parse(readFileSync(join(cwd, 'daylight.yaml'), 'utf8')));
    writeFileSync(join(cwd, 'daylight.yaml'), stringify(merged));
    git(cwd, ['add', 'daylight.yaml']); git(cwd, ['commit', '-q', '-m', 'daylight: accept ingest-proposed sensor config\n\nDaylight-Run: ' + run]);
    Object.assign(cfg, resolveConfig(cwd));
    append(f, { kind: 'x_config_accept', phase: 'ingest', via: 'agent-profile', sensors: merged.sensors });
  }

  if (!rs.phases.design) { // ADR-023: environment checks before any model is paid for
    const brown = existsSync(join(cwd, '.daylight/ingest/conventions.md'));
    const pf = await ph('preflight', () => preflight(cwd, cfg, { base: o.base, title: wi.title, runSensors: (d) => (brown ? (() => { const r = runFast(d, cfg); return { ok: r.ok, messages: r.results.flatMap((x) => x.messages).join(' | ') }; })() : { ok: true, messages: '' }) }));
    append(f, { kind: 'x_preflight', phase: 'preflight', ok: !pf.length, errors: pf });
    if (pf.length) return stop('preflight', pf.join('\n'));
  }
  const dir = join(cwd, cfg.design_dir);
  const designDone = !!rs.phases.design && existsSync(join(dir, 'spec.md')) && verifyGate(cwd, 'design', dir) === null;
  const design: any = designDone ? load(cwd).gates.design : await ph('design', async () => {
    let feedback = '';
    for (let rev = 0; rev < cfg.retries.design; rev++) {
      const brown = existsSync(join(cwd, '.daylight/ingest/conventions.md'));
      await ask('design', cfg.models.design, cfg.effort.design,
        'Follow the daylight design skill (' + join(PLUGIN, 'skills/design/SKILL.md') + '). PRD: ' + arg + '. Write intent.md, spec.md and architecture.md in ' + dir + '.' +
        (brown ? ' This is a BROWNFIELD repo: read .daylight/ingest/conventions.md and docs/wiki/overview.md first and keep its conventions.' : '') +
        ' Spec ACs must be a bullet "- **AC-n** <observable condition>" each, covering behaviour, health endpoint, Docker deployment and smoke script. Architecture needs an ADR (Status/Context/Decision/Consequences) and a table with one row "| NFR-n | mechanism |" per PRD NFR (number the PRD NFRs in order). Then run: node ' + CLI + ' design lint --prd ' + arg + ' and fix every error until it prints ok.' + (feedback ? '\nAddress this reviewer feedback: ' + feedback : ''));
      const l = cmd(['design', 'lint', '--dir', dir, '--prd', arg]);
      if (l.status !== 0) { feedback = l.stderr; continue; }
      request(cwd, 'design');
      if (fast) decide(cwd, 'design', { decision: 'approve', source: 'agent', feedback: '', scores: {}, dir, cap: cfg.retries.design, model: 'deterministic' }); // ADR-024: lint already passed; no Opus approver for small low-tier work
      else { const err = agentDecide(cwd, 'design', dir, cfg); if (err) return stop('gate1', err); }
      const g = load(cwd).gates.design;
      if (g.status === 'approved') return g;
      if (g.status === 'escalated') return stop('gate1', 'design escalated to a human after ' + g.rejections + ' rejections');
      feedback = g.feedback ?? '';
    }
    return stop('gate1', 'design not approved within the retry cap');
  });
  if ('ok' in design && design.ok === false) return design as Result;
  if (!designDone) { git(cwd, ['add', '-A', cfg.design_dir, 'docs/wiki']); git(cwd, ['commit', '-q', '-m', 'daylight: approved design artefacts\n\nDaylight-Run: ' + run]); }
  mark('design'); { const s = stopIf('design'); if (s) return s; }

  const planDone = !!rs.phases.plan && existsSync(join(cwd, '.daylight/plan.json'));
  if (!planDone && fast) { mkdirSync(join(cwd, '.daylight'), { recursive: true }); writeFileSync(join(cwd, '.daylight/plan.json'), JSON.stringify(fastPlan(readFileSync(join(dir, 'spec.md'), 'utf8'), wi.title), null, 2)); }
  else if (!planDone) await ph('plan', async () => {
    let err = '';
    for (let i = 0; i < 3; i++) {
      await ask('plan', cfg.models.triage, cfg.effort.generator_default,
        'Read ' + join(dir, 'spec.md') + ' and (if present) .daylight/ingest/conventions.md. Write .daylight/plan.json: {"tasks":[{"id":"t1","title":"..","acs":["AC-1"],"paths":["src/","tests/"],"deps":[],"size":"small|medium|large","risky":false}]}. Rules: every AC in spec.md appears in some task; paths are repo-relative prefixes covering EVERY non-test file the task creates or edits (source, Dockerfile, compose, scripts, package.json); tests belonging to the task are always allowed; a task that wires into or edits a file another task creates must list that file in its paths and depend on that task; make tasks independent where possible, add deps only when a task needs another task\'s code; 3-5 tasks. Do NOT create a task that only adds tests for behaviour another task implements (its tests could never be red): every task implements behaviour AND its own failing-first tests; fold performance/logging/docs checks into the task that implements them. Only a task that has no new behaviour may set "tdd":false (this is logged as a waiver). Then run node ' + CLI + ' plan check --spec ' + join(dir, 'spec.md') + ' --plan .daylight/plan.json' + (err ? '\nFix: ' + err : ''), 'Read,Write,Edit,Glob,Grep,Bash');
      const c = cmd(['plan', 'check', '--spec', join(dir, 'spec.md'), '--plan', join(cwd, '.daylight/plan.json')]);
      if (c.status === 0) { const l = cmd(['plan', 'lint', '--spec', join(dir, 'spec.md'), '--plan', join(cwd, '.daylight/plan.json')]); if (l.status === 0) return; append(f, { kind: 'x_plan_lint', phase: 'plan', errors: l.stderr.slice(0, 400) }); err = l.stderr; } else err = c.stderr;
    }
  });
  if (!existsSync(join(cwd, '.daylight/plan.json'))) return stop('plan', 'no plan produced');
  mark('plan'); { const s = stopIf('plan'); if (s) return s; }
  const tasks = loadPlan(join(cwd, '.daylight/plan.json'));

  const status = rs.phases.inner ? Object.fromEntries(tasks.map((t) => [t.id, 'passed'])) : await ph('inner', () => runInner(cwd, tasks, cfg, { spec: join(dir, 'spec.md'), integrate: true, done: Object.keys(rs.tasks).filter((id) => rs.tasks[id] === 'passed'), onTask: (id: string, s: string) => { rs.tasks[id] = s; save(); }, sensors: async (wt) => { const r = runFast(wt, cfg); return { ok: r.ok, messages: r.results.flatMap((x) => x.messages).join('\n') }; } }));
  if (Object.values(status).some((s) => s !== 'passed')) return stop('inner', 'tasks not passed: ' + JSON.stringify(status));
  mark('inner'); { const s = stopIf('inner'); if (s) return s; }

  const remote = git(cwd, ['remote']).stdout.trim() !== '';
  const planFile = join(cwd, '.daylight/plan.json');
  const checks = async (): Promise<Result | null> => {
    const noteFail = (r: Result | null) => { if (r) append(f, { kind: 'x_check', phase: r.stage, stage: r.stage, ok: false, msg: r.msg.slice(0, 400) }); return r; };
    const gate = await ph('sensors', () => { const r = runFast(cwd, cfg); return { ok: r.ok, msg: r.results.flatMap((x) => x.messages).join('\n') }; });
    if (!gate.ok) return noteFail({ ok: false, stage: 'sensors', msg: gate.msg });
    const tr = await ph('trace', () => cmd(['trace', '--spec', join(dir, 'spec.md')])); if (tr.status !== 0) return noteFail({ ok: false, stage: 'trace', msg: tr.stdout });
    const sc = cmd(['scope', 'check', '--plan', planFile, '--base', o.base]); if (sc.status !== 0) return { ok: false, stage: 'scope', msg: sc.stderr };
    // the judge and both reviews read the same finished branch and do not depend on each other: run them concurrently
    const [j] = await Promise.all([
      ph('judge', () => cmdAsync(['judge', '--spec', join(dir, 'spec.md'), '--task', 'run', '--base', o.base])),
      ph('review', () => Promise.all(['code-review', 'security-review'].map((k) => cmdAsync(['review', 'capture', '--kind', k, '--target', branch])))),
    ]);
    if (j.status !== 0) return noteFail({ ok: false, stage: 'judge', msg: j.stdout });
    return null;
  };
  const reviewText = () => ['code-review', 'security-review'].map((k) => { const f = join(cwd, '.daylight/reviews', k + '.txt'); return existsSync(f) ? '## ' + k + '\n' + readFileSync(f, 'utf8').slice(0, 6000) : ''; }).join('\n');
  const fixTask = async (round: number, feedback: string): Promise<boolean> => {
    // ADR-019: a fix task is a normal task (generator + evaluator + sensors) fed the cited findings; broad paths, TDD waiver logged.
    const t = { id: 'fix' + round, title: 'Address review findings (round ' + round + ')', acs: [] as string[], paths: ['src/', 'tests/', 'scripts/', 'docs/', 'package.json', 'README.md', 'Dockerfile', 'docker-compose.yml', '.dockerignore'], deps: [] as string[], size: 'medium' as const, tdd: false, feedback };
    writeFileSync(planFile, JSON.stringify({ tasks: [...loadPlan(planFile), t] }, null, 2));
    const s = await ph('fix', () => runInner(cwd, [t], cfg, { spec: join(dir, 'spec.md'), integrate: true, sensors: async (wt) => { const r = runFast(wt, cfg); return { ok: r.ok, messages: r.results.flatMap((x) => x.messages).join('\n') }; } }));
    return s[t.id] === 'passed';
  };
  const gate2Evidence = (): Evidence => {
    const rd = (p: string) => (existsSync(join(cwd, p)) ? readFileSync(join(cwd, p), 'utf8') : undefined);
    const tr = rd('.daylight/trace.json');
    const judge = [...loadEvents(f)].reverse().find((e) => e.kind === 'verdict' && e.role === 'judge')?.verdict;
    return { matrix: tr ? JSON.parse(tr).rows : [], sensorsOk: true, scopeErrors: [], judge: judge === 'pass' || judge === 'fail' || judge === 'inconclusive' ? judge : 'missing', reviews: { 'code-review': rd('.daylight/reviews/code-review.txt'), 'security-review': rd('.daylight/reviews/security-review.txt') } };
  };
  const rounds = Math.min(2, cfg.retries.design);
  let tier: 'low' | 'medium' | 'high' = 'low', head = '', prDone = false;
  for (let round = 0; round <= rounds; round++) {
    const bad = await checks();
    if (bad) { if (bad.stage === 'scope' || round === rounds) return stop(bad.stage, bad.msg); if (!(await fixTask(round + 1, bad.stage + ' failed:\n' + bad.msg))) return stop('fix', 'fix task not passed'); continue; }
    const changed = git(cwd, ['diff', '--name-only', o.base + '...HEAD']).stdout.split('\n').filter(Boolean);
    tier = classify(changed, '', cfg).tier ?? 'low';
    append(f, { kind: 'x_tier', phase: 'pr', tier, changed: changed.length });
    const pr = await ph('pr', () => (prDone ? cmd(['pr', 'update', '--branch', branch]) : cmd(['pr', 'create', '--branch', branch, '--base', o.base, '--title', 'Daylight: ' + wi.title, ...(remote ? [] : ['--local', '--no-push'])])));
    if (pr.status !== 0) return stop('pr', pr.stderr);
    prDone = true; append(f, { kind: 'x_pr', phase: 'pr', out: pr.stdout.trim().slice(0, 200) });
    head = git(cwd, ['rev-parse', 'HEAD']).stdout.trim();
    let d: any = { decision: 'reject', feedback: 'unparseable approver output' };
    // ADR-022: Gate 2 is deterministic over the evidence; the Opus approver is consulted only for the high tier
    const ev = gate2Evidence();
    const g2 = gate2(ev);
    append(f, { kind: 'x_gate2_eval', phase: 'gate2', decision: g2.decision, reasons: g2.reasons, blocking: g2.blocking.length, advisory: g2.advisory.length, tier });
    if (g2.decision === 'reject') {
      if (!g2.blocking.length) return stop('gate2', 'Gate 2 evidence incomplete: ' + g2.reasons.join('; '));
      d = { decision: 'reject', feedback: g2.blocking.map((x: any) => '- ' + x.file + ':' + x.line + ' ' + (x.summary ?? '') + ' (repro: ' + x.repro + ')').join('\n') };
      decide(cwd, 'pr', { decision: 'reject', source: 'agent', feedback: d.feedback, dir, cap: cfg.retries.design, model: 'deterministic', head });
    } else if (tier !== 'high') {
      decide(cwd, 'pr', { decision: 'approve', source: 'agent', feedback: '', scores: {}, dir, cap: cfg.retries.design, model: 'deterministic', head });
    } else await ph('gate2', async () => {
      const text = await ask('gate2', cfg.models.approver, 'high', 'Apply the pr-rubric skill (' + join(PLUGIN, 'skills/pr-rubric/SKILL.md') + ') to this PR. Body: .daylight/pr-body.md. Diff stat:\n' + git(cwd, ['diff', '--stat', o.base + '...HEAD']).stdout + '\nReply ONLY JSON {"decision":"approve|reject","scores":{},"feedback":""}', 'Read,Grep,Glob');
      try { d = extractJson(text); } catch { /* keep reject */ }
      decide(cwd, 'pr', { decision: d.decision, source: 'agent', feedback: d.feedback, scores: d.scores, dir, cap: cfg.retries.design, model: cfg.models.approver, head });
    });
    const st = load(cwd).gates.pr.status;
    if (st === 'escalated') return stop('gate2', 'Gate 2 escalated to a human after repeated rejections');
    if (st === 'approved') break;
    if (round === rounds) return stop('gate2', 'Gate 2 still rejecting after ' + rounds + ' fix rounds: ' + d.feedback);
    if (!(await fixTask(round + 1, 'Gate 2 reviewer rejected:\n' + d.feedback + '\n' + reviewText()))) return stop('fix', 'fix task not passed');
  }
  const sat = cmd(['gate', 'satisfied', 'pr', '--tier', tier, '--head', head]);
  if (sat.status !== 0) return stop('gate2', 'Gate 2 not satisfied (a human decision is needed): ' + sat.stdout);
  git(cwd, ['checkout', '-q', o.base]);
  const mg = await ph('merge', () => cmd(['pr', 'merge', '--branch', branch, '--tier', tier, '--base', o.base, ...(remote ? [] : ['--local'])]));
  if (mg.status !== 0) return stop('merge', mg.stderr);
  const dep = await ph('deploy', () => cmd(['deploy', '--head', head]));
  append(f, { kind: 'x_deploy_result', phase: 'deploy', ok: dep.status === 0, out: (dep.stdout + dep.stderr).slice(-300) });
  await ph('reflect', () => cmd(['reflect', '--run', run]));
  return dep.status === 0 ? { ok: true, stage: 'done', msg: 'deployed; ' + dep.stdout.trim() } : stop('deploy', dep.stdout + dep.stderr);
}

/** Per-phase seconds, tokens and the demo evidence summary, computed from the audit log only. */
export function summarize(file: string, extra: object = {}) {
  const evs = loadEvents(file), phases: any[] = [];
  for (const name of [...new Set(evs.filter((e) => e.kind === 'phase').map((e) => e.name))]) {
    let seconds = 0, open = 0;
    for (const x of evs.filter((e) => e.kind === 'phase' && e.name === name)) { if (x.status === 'start') open = Date.parse(x.ts); else if (open) { seconds += (Date.parse(x.ts) - open) / 1000; open = 0; } }
    const tokens: Record<string, { in: number; out: number }> = {};
    for (const u of evs.filter((x) => x.kind === 'x_usage' && x.phase === name)) { const t = (tokens[u.model] ??= { in: 0, out: 0 }); t.in += (u.usage?.input_tokens ?? 0) + (u.usage?.cache_creation_input_tokens ?? 0); t.out += u.usage?.output_tokens ?? 0; }
    phases.push({ phase: name, seconds, tokens, cost_usd: evs.filter((x) => x.kind === 'x_usage' && x.phase === name).reduce((a, x) => a + (x.cost_usd ?? 0), 0) });
  }
  const dep = evs.find((e) => e.kind === 'x_deploy_result'), sm = [...evs].reverse().find((e) => e.kind === 'x_deploy' && e.stage === 'smoke');
  const gates = Object.fromEntries(['design', 'pr'].map((g) => [g, [...evs].reverse().find((e) => e.kind === 'gate' && e.gate === g && e.decision !== 'invalidated')?.source ?? null]));
  const reviewed = (r: string) => evs.some((e) => e.kind === 'x_review' && e.review === r), prEv = [...evs].reverse().find((e) => e.kind === 'x_pr');
  let url: string | null = null; try { url = prEv ? JSON.parse(prEv.out).url ?? null : null; } catch { /* PR output was not JSON */ }
  const run = (extra as { run?: string }).run ?? evs[0]?.run;
  return { phases, touchpoints: touchpoints(file).count, gates, deploy: { ok: !!dep?.ok }, smoke: { ok: !!sm?.ok }, pr: { url, branch: 'daylight/run-' + run, code_review: reviewed('code-review'), security_review: reviewed('security-review') }, ...extra };
}
