// Reuses: tiers.ts + audit events. The model-based triage skill refines size/spec-needed; this is the deterministic, headless-safe core.
import { classify, type Tier } from './tiers.ts';
import { append, auditFile } from './lib/events.ts';
import type { WorkItem } from './workitem.ts';

const OUT_OF_SCOPE = /\b(hire|hiring|recruit|legal review|procure|hardware|office lease|press release)\b/i;

export function triage(item: WorkItem, cfg: any, cwd: string, extraPaths: string[] = []) {
  const paths = [...new Set([...item.paths, ...extraPaths])];
  const size = paths.length ? (paths.length <= 2 ? 'small' : paths.length <= 8 ? 'medium' : 'large') : item.body.length < 600 ? 'small' : item.body.length < 3000 ? 'medium' : 'large';
  const c = classify(paths, item.title, cfg);
  const tier: Tier = c.tier ?? (size === 'small' ? 'low' : 'medium');
  const out = item.scope === 'out' || OUT_OF_SCOPE.test(item.title + ' ' + item.body.slice(0, 400));
  const spec_needed = !(item.source !== 'prd' && size === 'small' && tier === 'low');
  const rationale = out ? 'Out of scope for Daylight (non-software or human-owned work); routed to a human.'
    : 'size=' + size + ' (' + paths.length + ' path(s)); tier=' + tier + (c.why.length ? ' because ' + c.why.join('; ') : ' (no sensitive rule matched)') + '; spec ' + (spec_needed ? 'needed' : 'not needed') + '.';
  const file = auditFile(cwd);
  append(file, { kind: 'triage', phase: 'triage', actor: 'triage', work_item: item.id, size, tier, spec_needed, rationale });
  if (out) append(file, { kind: 'x_escalation', phase: 'triage', work_item: item.id, reason: 'out_of_scope', route: 'human' });
  return { work_item: item.id, size, tier, spec_needed, rationale, route: out ? 'human' : 'factory', attempt: !out };
}
