// Reuses: the audit log only. Human touchpoints (AC-68) and run metrics inputs.
import { readLines } from './lib/events.ts';

export const load = (file: string) => readLines(file).map((l) => JSON.parse(l));
export function reconstruct(file: string) {
  const evs = load(file);
  return evs.filter((e) => e.kind === 'repl_pre').map((p) => {
    const post = evs.find((e) => e.kind === 'repl_post' && e.tool_use_id === p.tool_use_id);
    return { id: p.id, code: p.code, result: post?.result ?? null, stdout: post?.stdout ?? null, stderr: post?.stderr ?? null, toolsUsed: post?.toolsUsed ?? null, error: post?.error ?? null, inner: evs.filter((e) => e.parent_id === p.id).map((i) => ({ tool: i.tool, summary: i.summary })) };
  });
}
export function touchpoints(file: string) {
  const evs = load(file);
  const human = evs.filter((e) => e.kind === 'gate' && e.source === 'human' && ['approve', 'reject', 'edit'].includes(e.decision) && !e.after_escalation);
  const esc = evs.filter((e) => e.kind === 'x_escalation');
  return { count: human.length + esc.length, human: human.length, escalations: esc.length };
}
