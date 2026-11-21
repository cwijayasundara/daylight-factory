// Reuses: the audit log only; pstack /reflect and /correct provide the human-facing flow, this is the machine-readable lesson file the dream job reads.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { load } from './metrics.ts';
import { auditFile } from './lib/events.ts';

export interface Lesson { category: string; summary: string; events: string[] }
export function reflect(cwd: string, run: string) {
  const evs = load(auditFile(cwd, run)), L: Lesson[] = [];
  const add = (category: string, summary: string, e: any) => L.push({ category, summary, events: [e.id] });
  for (const e of evs) {
    if (e.kind === 'sensor' && e.ok === false) add('failure', 'sensor ' + e.name + ' failed: ' + (e.messages?.[0] ?? ''), e);
    if (e.kind === 'verdict' && e.verdict === 'fail') add('failure', e.role + ' verdict fail for ' + (e.task ?? 'run') + ' citing ' + (e.citations ?? []).join(', '), e);
    if (e.kind === 'x_deploy' && e.ok === false) add('failure', 'deploy stage ' + e.stage + ' failed', e);
    if (e.kind === 'x_dispatch' && e.role === 'generator' && e.attempt > 1) add('retry', 'task ' + e.task + ' needed attempt ' + e.attempt, e);
    if (e.kind === 'x_finding') add('reviewer_finding', (e.file ?? '') + ':' + (e.line ?? '') + ' ' + (e.summary ?? ''), e);
    if (e.kind === 'gate' && e.source === 'human' && (e.decision === 'reject' || e.decision === 'edit')) add('human_correction', e.gate + ' ' + e.decision + ': ' + (e.feedback ?? ''), e);
    if (e.kind === 'x_escalation' || e.kind === 'x_veto') add('improvement_signal', e.kind === 'x_veto' ? 'judge veto for ' + e.task : 'escalation (' + e.reason + ') for ' + (e.task ?? e.gate), e);
  }
  mkdirSync(join(cwd, '.daylight/lessons'), { recursive: true });
  writeFileSync(join(cwd, '.daylight/lessons', run + '.json'), JSON.stringify({ run, lessons: L }, null, 2));
  return L;
}
