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
} else if (cmd === 'selfcheck' && rest[0] === 'no-codemode-var') {
  const hits = noCodeModeVar(PLUGIN);
  if (hits.length) fail('Code Mode variable referenced in: ' + hits.join(', '));
  console.log('ok');
} else {
  fail('usage: daylight <config|doctor|ledger|selfcheck> [options]');
}
