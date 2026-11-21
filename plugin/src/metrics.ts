// Reuses: the audit log only. Human touchpoints (AC-68) and run metrics inputs.
import { readLines } from './lib/events.ts';

export const load = (file: string) => readLines(file).map((l) => JSON.parse(l));
export function touchpoints(file: string) {
  const evs = load(file);
  const human = evs.filter((e) => e.kind === 'gate' && e.source === 'human' && ['approve', 'reject', 'edit'].includes(e.decision) && !e.after_escalation);
  const esc = evs.filter((e) => e.kind === 'x_escalation');
  return { count: human.length + esc.length, human: human.length, escalations: esc.length };
}
