// Reuses: Superpowers writing-plans produces the tasks; this only checks AC coverage (AC-36).
import { readFileSync } from 'node:fs';
export interface Task { id: string; title: string; acs: string[]; paths: string[]; deps: string[]; size?: 'small' | 'medium' | 'large'; risky?: boolean; tdd?: boolean; feedback?: string }
export const loadPlan = (f: string): Task[] => JSON.parse(readFileSync(f, 'utf8')).tasks;
export const acIds = (spec: string) => [...spec.matchAll(/\*\*(AC-\d+)\*\*/g)].map((m) => m[1]);
export function checkPlan(spec: string, tasks: Task[]): string[] {
  const covered = new Set(tasks.flatMap((t) => t.acs));
  return acIds(spec).filter((a) => !covered.has(a)).map((a) => a + ' has no task');
}

/** How an AC is proven: [test] by an AC-named automated test, [run] by building and starting the service, [sensor:x] by a named sensor. Untagged ACs are [test]. */
export type AcMode = { mode: 'test' | 'run' | 'sensor'; sensor?: string };
export function acModes(spec: string): Map<string, AcMode> {
  const out = new Map<string, AcMode>();
  for (const m of spec.matchAll(/\*\*(AC-\d+)\*\*\s*(?:\[(test|run|sensor)(?::([\w-]+))?\])?/g)) out.set(m[1], m[2] === 'run' ? { mode: 'run' } : m[2] === 'sensor' ? { mode: 'sensor', sensor: m[3] } : { mode: 'test' });
  return out;
}
// Untagged specs (older designs) keep the path rule: scripts/ (smoke clients, tooling) and package.json have no test to write first
const CODE_PATH = /^(src|tests?|lib|app)\/|^(?!scripts\/).*\.(tsx?|jsx?|py|mjs|cjs)$/;
const tagged = (spec: Map<string, AcMode>, t: Pick<Task, 'acs'>) => t.acs.some((a) => spec.has(a)) && [...spec.values()].some((m) => m.mode !== 'test');
/** tdd: write failing tests first. run: proven by executing the delivery. none: nothing to prove before merge. */
export function taskMode(t: Pick<Task, 'acs' | 'paths' | 'tdd'>, modes: Map<string, AcMode> = new Map()): 'tdd' | 'run' | 'none' {
  if (t.tdd === false || !t.acs.length) return 'none';
  if (tagged(modes, t)) {
    const ms = t.acs.map((a) => modes.get(a)?.mode ?? 'test');
    return ms.includes('test') ? 'tdd' : ms.includes('run') ? 'run' : 'none';
  }
  return t.paths.some((p) => CODE_PATH.test(p)) ? 'tdd' : 'none';
}
export const tddApplies = (t: Pick<Task, 'acs' | 'paths' | 'tdd'>, modes: Map<string, AcMode> = new Map()) => taskMode(t, modes) === 'tdd';

/** Small, low-tier work: Gate 1 skips the Opus approver and the plan is one task (ADR-023). */
export const isFastPath = (t: { size: string; tier: string }, cfg: { fast_path?: boolean }) => cfg.fast_path !== false && t.size === 'small' && t.tier === 'low';
export const fastPlan = (spec: string, title: string): { tasks: Task[] } => ({ tasks: [{ id: 't1', title, acs: [...new Set(acIds(spec))], paths: ['src/', 'tests/', 'scripts/', 'docs/', 'package.json', 'README.md', 'Dockerfile', 'docker-compose.yml', '.dockerignore'], deps: [], size: 'small' }] });
