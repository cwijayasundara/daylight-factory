// Reuses: Superpowers writing-plans produces the tasks; this only checks AC coverage (AC-36).
import { readFileSync } from 'node:fs';
export interface Task { id: string; title: string; acs: string[]; paths: string[]; deps: string[]; size?: 'small' | 'medium' | 'large'; risky?: boolean; tdd?: boolean; feedback?: string }
export const loadPlan = (f: string): Task[] => JSON.parse(readFileSync(f, 'utf8')).tasks;
export const acIds = (spec: string) => [...spec.matchAll(/\*\*(AC-\d+)\*\*/g)].map((m) => m[1]);
export function checkPlan(spec: string, tasks: Task[]): string[] {
  const covered = new Set(tasks.flatMap((t) => t.acs));
  return acIds(spec).filter((a) => !covered.has(a)).map((a) => a + ' has no task');
}
