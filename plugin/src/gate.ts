// Reuses: claude -p (agent approver) with a rubric skill; brainstorming's reject loop. Glue: state machine, hashes, escalation.
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ARTEFACTS } from './design.ts';
import { load, save, type GateState } from './state.ts';
import { append, auditFile } from './lib/events.ts';
import { gatePolicy } from './tiers.ts';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..');
const hashes = (dir: string) => Object.fromEntries(ARTEFACTS.map((f) => [f, createHash('sha256').update(existsSync(join(dir, f)) ? readFileSync(join(dir, f)) : '').digest('hex')]));
const get = (cwd: string, g: string): GateState => load(cwd).gates[g] ?? { status: 'pending', revision: 0, rejections: 0 };
const put = (cwd: string, g: string, v: GateState) => { const s = load(cwd); s.gates[g] = v; save(cwd, s); };

export function request(cwd: string, g: string) { const v = get(cwd, g); put(cwd, g, { ...v, status: 'pending' }); return v; }
export const present = (dir: string) => ARTEFACTS.map((f) => '- ' + join(dir, f) + ' (' + (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8').length : 0) + ' chars)').join('\n');
export const context = (cwd: string, g: string) => { const v = get(cwd, g); return 'revision ' + v.revision + (v.feedback ? '\nFeedback to address: ' + v.feedback : ''); };

export function decide(cwd: string, g: string, o: { decision: string; source: string; feedback?: string; scores?: Record<string, number>; dir: string; cap: number; model?: string; head?: string; degraded?: boolean }): string | null {
  const v = get(cwd, g);
  const wasEscalated = v.status === 'escalated';
  if (wasEscalated && o.source !== 'human') return 'Gate escalated: a human decision is required (retry cap reached)';
  const file = auditFile(cwd);
  if (o.decision === 'reject') {
    v.rejections++; v.revision++; v.feedback = o.feedback; v.status = v.rejections >= o.cap ? 'escalated' : 'rejected';
    if (v.status === 'escalated') append(file, { kind: 'x_escalation', phase: 'gate', gate: g, reason: 'retry_cap', route: 'human' });
  } else { v.status = 'approved'; if (g === 'pr') v.head = o.head; else v.hashes = hashes(o.dir); v.feedback = undefined; }
  (v.decisions ??= []).push({ source: o.source, decision: o.decision, head: o.head, degraded: o.degraded });
  v.source = o.source; v.scores = o.scores;
  put(cwd, g, v);
  append(file, { kind: 'gate', phase: g, gate: g, decision: o.decision, source: o.source, scores: o.scores ?? null, revision: v.revision, feedback: o.feedback ?? null, model: o.model ?? null, after_escalation: wasEscalated, head: o.head ?? null, degraded: o.degraded ?? false });
  return null;
}
/** Re-checks the approval subject; a changed artefact re-opens the gate. */
export function verifyGate(cwd: string, g: string, dir: string): string | null {
  const v = get(cwd, g);
  if (v.status !== 'approved') return 'Gate 1 (' + g + ') is ' + v.status + ': no inner-loop phase may start';
  const now = hashes(dir);
  const changed = ARTEFACTS.filter((f) => now[f] !== v.hashes?.[f]);
  if (changed.length) {
    put(cwd, g, { ...v, status: 'pending' });
    append(auditFile(cwd), { kind: 'gate', phase: g, gate: g, decision: 'invalidated', source: 'harness', changed });
    return 'Gate 1 (' + g + ') invalidated: ' + changed.join(', ') + ' changed after approval; gate re-opened';
  }
  return null;
}
export function agentDecide(cwd: string, g: string, dir: string, cfg: any): string | null {
  const rubric = cfg.gates[g === 'design' ? 'design' : 'pr'].rubric;
  const model = cfg.models.approver;
  const prompt = 'Apply the skill ' + rubric + ' to the artefacts in ' + dir + ' (' + ARTEFACTS.join(', ') + '). Reply with ONLY JSON: {"decision":"approve|reject","scores":{"<criterion>":1-5},"feedback":"<text>"}';
  const r = spawnSync(process.env.DAYLIGHT_CLAUDE || 'claude', ['-p', prompt, '--model', model, '--plugin-dir', PLUGIN, '--output-format', 'json', '--allowedTools', 'Read'], { cwd, encoding: 'utf8' });
  if (r.status !== 0) return 'agent approver failed: ' + r.stderr;
  let out: any;
  try { const res = JSON.parse(r.stdout); out = JSON.parse(String(res.result).replace(/^```(?:json)?\n?|```$/g, '')); append(auditFile(cwd), { kind: 'x_usage', phase: g, model, usage: res.usage ?? null, cost_usd: res.total_cost_usd ?? null }); } catch { return 'agent approver returned unparseable output'; }
  return decide(cwd, g, { decision: out.decision, source: 'agent', feedback: out.feedback, scores: out.scores, dir, cap: cfg.retries.design, model });
}

/** Gate 2 subject is the PR head SHA: a new commit re-opens the gate (AC-67). */
export function verifyPr(cwd: string, head: string): string | null {
  const v = get(cwd, 'pr');
  if (v.status !== 'approved') return 'Gate 2 is ' + v.status;
  if (v.head !== head) { put(cwd, 'pr', { ...v, status: 'pending' }); append(auditFile(cwd), { kind: 'gate', phase: 'pr', gate: 'pr', decision: 'invalidated', source: 'harness', head }); return 'Gate 2 invalidated: approved ' + v.head + ' but PR head is now ' + head; }
  return null;
}
/** Is Gate 2 satisfied for this head under the tier policy? Agent approvals never satisfy a human requirement; degraded ones never stand alone. */
export function prSatisfied(cwd: string, cfg: any, tier: 'low' | 'medium' | 'high', head: string) {
  const v = get(cwd, 'pr'), missing: string[] = [];
  if (v.status !== 'approved') missing.push('Gate 2 is ' + v.status + ' (no recorded approval)');
  else if (v.head !== head) missing.push('approval is for head ' + v.head + ' but the PR head is ' + head);
  const ds = (v.decisions ?? []).filter((d) => d.head === head && d.decision !== 'reject');
  const onlyDegraded = ds.length > 0 && ds.every((d) => d.degraded);
  const policy = gatePolicy(tier, cfg, onlyDegraded);
  if (policy.human_required && !ds.some((d) => d.source === 'human' && !d.degraded)) missing.push('a human decision is required: ' + policy.reason);
  return { ok: !missing.length, missing, policy };
}
