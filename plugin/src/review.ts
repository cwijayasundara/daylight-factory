// Reuses: /code-review and /security-review (run headless via claude -p) and the artefacts they print. Glue: capture + blocking rule (AC-60).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { append, auditFile } from './lib/events.ts';

export function capture(cwd: string, kind: 'code-review' | 'security-review', level = 'medium', target = '') {
  const cmd = kind === 'code-review' ? ('/code-review ' + level + ' ' + target).trim() : '/security-review';
  const r = spawnSync(process.env.DAYLIGHT_CLAUDE || 'claude', ['-p', cmd, '--output-format', 'json', '--allowedTools', 'Read,Grep,Glob,Bash'], { cwd, encoding: 'utf8' });
  let text = r.stdout, usage = null, cost = null;
  try { const j = JSON.parse(r.stdout); text = String(j.result ?? ''); usage = j.usage ?? null; cost = j.total_cost_usd ?? null; } catch { /* raw */ }
  mkdirSync(join(cwd, '.daylight/reviews'), { recursive: true });
  const file = join(cwd, '.daylight/reviews', kind + '.txt');
  writeFileSync(file, text);
  append(auditFile(cwd), { kind: 'x_review', phase: 'review', review: kind, file, bytes: text.length, usage, cost_usd: cost });
  return { file, status: r.status ?? 1 };
}
export function classify(findings: any[]) {
  const blocking = findings.filter((f) => f.file && f.line && f.repro);
  return { blocking, advisory: findings.filter((f) => !blocking.includes(f)) };
}
