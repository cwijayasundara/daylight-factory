// Reuses: node argv parsing only; dispatches to config/doctor/ledger modules.
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.ts';
import { doctor } from './doctor.ts';
import { check, table, noCodeModeVar } from './ledger.ts';

const [cmd, ...rest] = process.argv.slice(2);
const flag = (n: string) => rest.includes('--' + n);
const opt = (n: string) => { const i = rest.indexOf('--' + n); return i >= 0 ? rest[i + 1] : undefined; };
const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (m: string) => { console.error(m); process.exit(1); };

if (cmd === 'config') {
  const file = opt('file') ?? join(process.cwd(), 'daylight.yaml');
  if (!existsSync(file)) fail('daylight.yaml not found at ' + file);
  const { errors, config } = loadConfig(file);
  if (errors.length) fail(errors.join('\n'));
  console.log(flag('resolved') ? JSON.stringify(config, null, 2) : 'ok');
} else if (cmd === 'doctor') {
  const r = doctor(process.cwd());
  console.log(flag('json') ? JSON.stringify(r) : 'Code Mode: ' + r.codeMode + (r.instruction ? '\n' + r.instruction : ''));
} else if (cmd === 'ledger') {
  const root = opt('root') ?? PLUGIN;
  const c = check(root, opt('budget') ? Number(opt('budget')) : undefined);
  console.log(table(c.rows, c.total));
  if (flag('check') && c.errors.length) fail(c.errors.join('\n'));
} else if (cmd === 'audit') {
  const [sub, f] = rest;
  if (sub === 'emit') {
    const { append, auditFile } = await import('./lib/events.ts');
    append(auditFile(process.cwd()), { kind: opt('kind')!, ...JSON.parse(opt('data') ?? '{}') });
  } else {
    const { verify, validateLog } = await import('./lib/events.ts');
    const errs = sub === 'verify' ? verify(f) : sub === 'validate' ? validateLog(f) : ['usage: audit <verify|validate|emit>'];
    if (errs.length) fail(errs.join('\n'));
    console.log('ok');
  }
} else if (cmd === 'workitem') {
  const { normalize } = await import('./workitem.ts');
  console.log(JSON.stringify(normalize(rest[0]), null, 2));
} else if (cmd === 'triage') {
  const { normalize } = await import('./workitem.ts');
  const { triage } = await import('./triage.ts');
  const { resolveConfig } = await import('./config.ts');
  const cfg = resolveConfig(process.cwd(), { config: opt('config'), base: opt('base') });
  console.log(JSON.stringify(triage(normalize(rest[0]), cfg, process.cwd(), (opt('paths') ?? '').split(',').filter(Boolean)), null, 2));
} else if (cmd === 'policy') {
  const { gatePolicy } = await import('./tiers.ts');
  const { resolveConfig } = await import('./config.ts');
  console.log(JSON.stringify(gatePolicy(opt('tier') as any, resolveConfig(process.cwd(), { config: opt('config'), base: opt('base') }), flag('degraded'))));
} else if (cmd === 'trigger' && rest[0] === 'run') {
  const { readdirSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { normalize } = await import('./workitem.ts');
  const { triage } = await import('./triage.ts');
  const { resolveConfig } = await import('./config.ts');
  const inbox = opt('inbox') ?? join(process.cwd(), '.daylight/inbox');
  const cfg = resolveConfig(process.cwd(), { base: opt('base') });
  mkdirSync(join(process.cwd(), '.daylight/work'), { recursive: true });
  for (const f of readdirSync(inbox).filter((n) => n.endsWith('.md'))) {
    const wi = normalize(join(inbox, f));
    const t = triage(wi, cfg, process.cwd());
    writeFileSync(join(process.cwd(), '.daylight/work', wi.id + '.json'), JSON.stringify({ ...wi, triage: t, status: t.route === 'human' ? 'needs_human' : 'triaged' }, null, 2));
  }
  console.log('ok');
} else if (cmd === 'env-clean') {
  const { cleanEnv } = await import('./guard.ts');
  console.log(JSON.stringify(cleanEnv(process.env)));
} else if (cmd === 'prd' && rest[0] === 'check') {
  const { prdCheck } = await import('./design.ts');
  const { readFileSync } = await import('node:fs');
  const e = prdCheck(readFileSync(rest[1], 'utf8')); if (e.length) fail(e.join('\n')); console.log('ok');
} else if (cmd === 'design') {
  const d = await import('./design.ts');
  const { resolveConfig } = await import('./config.ts');
  const { readFileSync } = await import('node:fs');
  const dir = opt('dir') ?? join(process.cwd(), resolveConfig(process.cwd()).design_dir);
  if (rest[0] === 'stamp') { d.stamp(dir, (await import('./state.ts')).load(process.cwd()).gates.design?.revision ?? 0); console.log('ok'); }
  else { const e = d.lint(dir, opt('prd') ? readFileSync(opt('prd')!, 'utf8') : undefined); if (e.length) fail(e.join('\n')); console.log('ok'); }
} else if (cmd === 'gate' || cmd === 'inner-start') {
  const g = await import('./gate.ts');
  const { resolveConfig } = await import('./config.ts');
  const cfg = resolveConfig(process.cwd(), { config: opt('config') });
  const cwd = process.cwd();
  const dir = opt('dir') ?? join(cwd, cfg.design_dir);
  const [sub, name = 'design'] = cmd === 'gate' ? rest : ['verify'];
  let err: string | null = null;
  if (sub === 'verify' && name === 'pr') err = g.verifyPr(cwd, opt('head')!);
  else if (sub === 'satisfied') { const r = g.prSatisfied(cwd, cfg, opt('tier') as any, opt('head')!); console.log(JSON.stringify(r)); if (!r.ok) process.exit(1); }
  else if (cmd === 'inner-start' || sub === 'verify') err = g.verifyGate(cwd, 'design', dir);
  else if (sub === 'request') g.request(cwd, name);
  else if (sub === 'present') console.log(g.present(dir));
  else if (sub === 'context') console.log(g.context(cwd, name));
  else if (sub === 'decide') err = g.decide(cwd, name, { decision: opt('decision')!, source: opt('source') ?? 'human', feedback: opt('feedback'), dir, cap: cfg.retries.design, head: opt('head'), degraded: flag('degraded') });
  else if (sub === 'agent') err = g.agentDecide(cwd, name, dir, cfg);
  if (err) fail(err);
} else if (cmd === 'plan' && rest[0] === 'check') {
  const { checkPlan, loadPlan } = await import('./plan.ts');
  const { readFileSync } = await import('node:fs');
  const e = checkPlan(readFileSync(opt('spec')!, 'utf8'), loadPlan(opt('plan')!)); if (e.length) fail(e.join('\n')); console.log('ok');
} else if (cmd === 'worktree' && rest[0] === 'add') {
  const { addWorktree } = await import('./worktree.ts'); console.log(JSON.stringify(addWorktree(process.cwd(), rest[1])));
} else if (cmd === 'tdd' && rest[0] === 'check') {
  const { tddCheck } = await import('./tdd.ts');
  const e = tddCheck(process.cwd(), opt('base') ?? 'main', opt('branch')!, opt('task')); if (e.length) fail(e.join('\n')); console.log('ok');
} else if (cmd === 'red') {
  const { recordRed } = await import('./tdd.ts'); const e = recordRed(process.cwd(), opt('task')!, opt('cmd')!); if (e) fail(e); console.log('ok');
} else if (cmd === 'verdict' && rest[0] === 'normalize') {
  const { normalize } = await import('./verdict.ts'); const { readFileSync } = await import('node:fs');
  try { const { withMatrix } = await import('./verdict.ts'); const v = normalize(JSON.parse(readFileSync(rest[1], 'utf8'))); console.log(JSON.stringify(opt('matrix') ? withMatrix(v, JSON.parse(readFileSync(opt('matrix')!, 'utf8'))) : v)); } catch (e) { fail((e as Error).message); }
} else if (cmd === 'inner' && rest[0] === 'run') {
  const { runInner } = await import('./loop.ts'); const { loadPlan } = await import('./plan.ts'); const { resolveConfig } = await import('./config.ts');
  const cfg = resolveConfig(process.cwd(), { config: opt('config'), base: opt('base') });
  const { runFast } = await import('./sensors.ts');
  console.log(JSON.stringify(await runInner(process.cwd(), loadPlan(opt('plan')!), cfg, { sensors: async (wt) => { const r = runFast(wt, cfg); return { ok: r.ok, messages: r.results.flatMap((x) => x.messages).join('\n') }; } })));
} else if (cmd === 'sensors') {
  const S = await import('./sensors.ts'); const { resolveConfig } = await import('./config.ts');
  const cwd = process.cwd(), cfg = resolveConfig(cwd, { config: opt('config'), base: opt('base') });
  if (rest[0] === 'wait') process.exit(await S.waitSlow(cwd, opt('name')!, Number(opt('max') ?? 540)));
  else if (rest[0] === '_exec') S.execSlow(cwd, opt('name')!, cfg);
  else if (flag('slow')) { S.startSlow(cwd, opt('name')!); console.log('started ' + opt('name') + ' in the background'); }
  else { const r = S.runFast(cwd, cfg); if (!r.ok) fail(S.format(r.results, cfg.sensors.output_line_cap)); console.log('ok'); }
} else if (cmd === 'trace') {
  const T = await import('./trace.ts'); const { resolveConfig } = await import('./config.ts'); const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
  const cfg = resolveConfig(process.cwd(), { config: opt('config') });
  const cmdline = opt('cmd') ?? (cfg.sensors.commands.tests ?? 'node --test') + (/test-reporter/.test(cfg.sensors.commands.tests ?? '') ? '' : ' --test-reporter=tap');
  const rows = T.matrix(readFileSync(opt('spec')!, 'utf8'), T.runTests(process.cwd(), cmdline));
  mkdirSync(join(process.cwd(), '.daylight'), { recursive: true }); writeFileSync(join(process.cwd(), '.daylight/trace.json'), JSON.stringify({ rows }, null, 2));
  console.log(T.render(rows)); if (rows.some((r) => r.result !== 'PASS')) process.exit(1);
} else if (cmd === 'review') {
  const R = await import('./review.ts'); const { readFileSync } = await import('node:fs');
  if (rest[0] === 'capture') { const r = R.capture(process.cwd(), opt('kind') as any, opt('level')); console.log(r.file); }
  else console.log(JSON.stringify(R.classify(JSON.parse(readFileSync(rest[1], 'utf8')))));
} else if (cmd === 'judge') {
  const J = await import('./judge.ts'); const { resolveConfig } = await import('./config.ts');
  const v = await J.judge(process.cwd(), resolveConfig(process.cwd(), { base: opt('base-config') }), { spec: opt('spec')!, task: opt('task'), base: opt('base') });
  console.log(JSON.stringify(v)); if (v.effective === 'fail') process.exit(1);
} else if (cmd === 'scope' && rest[0] === 'check') {
  const J = await import('./judge.ts'); const e = J.scopeCheck(process.cwd(), opt('plan')!, opt('base') ?? 'main'); if (e.length) fail(e.join('\n')); console.log('ok');
} else if (cmd === 'recovery' && rest[0] === 'record') {
  const { append, auditFile } = await import('./lib/events.ts'); append(auditFile(process.cwd()), { kind: 'x_recovery', phase: 'judge', task: opt('task'), recovered: opt('passed') === 'true' });
} else if (cmd === 'pr') {
  const PR = await import('./pr.ts'); const { resolveConfig } = await import('./config.ts');
  const r: any = await (rest[0] === 'create' ? PR.createPr(process.cwd(), { branch: opt('branch')!, base: opt('base') ?? 'main', title: opt('title') ?? 'Daylight change', push: !flag('no-push') })
    : PR.mergePr(process.cwd(), resolveConfig(process.cwd(), { base: opt('base-config') }), { branch: opt('branch')!, tier: (opt('tier') ?? 'medium') as any }));
  if (r.error) fail(r.error); console.log(JSON.stringify(r));
} else if (cmd === 'touchpoints') {
  const { touchpoints } = await import('./metrics.ts'); const { auditFile } = await import('./lib/events.ts');
  console.log(JSON.stringify(touchpoints(auditFile(process.cwd()))));
} else if (cmd === 'report') {
  const { render } = await import('./report.ts'); const { auditFile } = await import('./lib/events.ts'); const { writeFileSync } = await import('node:fs');
  const out = opt('out') ?? join(process.cwd(), '.daylight/report-' + rest[0] + '.html');
  writeFileSync(out, render(auditFile(process.cwd(), rest[0]), rest[0], opt('repo'))); console.log(out);
} else if (cmd === 'wiki') {
  const W = await import('./wiki.ts'); const { resolveConfig } = await import('./config.ts');
  const cwd = process.cwd(), cfg = resolveConfig(cwd);
  if (rest[0] === 'links') { const e = W.links(cwd, cfg); if (e.length) fail(e.join('\n')); console.log('ok'); }
  else if (rest[0] === 'current') { if (!W.current(cwd, cfg, opt('sha')!)) fail('wiki is not current for ' + opt('sha')); console.log('ok'); }
  else console.log(await W.update(cwd, cfg, { sha: opt('sha'), summarize: flag('summarize') }));
} else if (cmd === 'ingest') {
  const { ingest } = await import('./ingest.ts'); const { resolveConfig } = await import('./config.ts');
  const r = await ingest(process.cwd(), resolveConfig(process.cwd()), { auto: flag('auto'), accept: flag('accept') });
  if (r.code) fail(r.out); console.log(r.out);
} else if (cmd === 'selfcheck' && rest[0] === 'no-codemode-var') {
  const hits = noCodeModeVar(PLUGIN);
  if (hits.length) fail('Code Mode variable referenced in: ' + hits.join(', '));
  console.log('ok');
} else {
  fail('usage: daylight <config|doctor|ledger|selfcheck> [options]');
}
