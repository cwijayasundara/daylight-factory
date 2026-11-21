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
  if (cmd === 'inner-start' || sub === 'verify') err = g.verifyGate(cwd, 'design', dir);
  else if (sub === 'request') g.request(cwd, name);
  else if (sub === 'present') console.log(g.present(dir));
  else if (sub === 'context') console.log(g.context(cwd, name));
  else if (sub === 'decide') err = g.decide(cwd, name, { decision: opt('decision')!, source: opt('source') ?? 'human', feedback: opt('feedback'), dir, cap: cfg.retries.design });
  else if (sub === 'agent') err = g.agentDecide(cwd, name, dir, cfg);
  if (err) fail(err);
} else if (cmd === 'selfcheck' && rest[0] === 'no-codemode-var') {
  const hits = noCodeModeVar(PLUGIN);
  if (hits.length) fail('Code Mode variable referenced in: ' + hits.join(', '));
  console.log('ok');
} else {
  fail('usage: daylight <config|doctor|ledger|selfcheck> [options]');
}
