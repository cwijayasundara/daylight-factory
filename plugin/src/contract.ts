// Reuses: globRe from tiers.ts. Glue: the task contract in ONE place (who may edit what, who can fix a failure) so loop.ts, judge.ts and both prompts agree (deep-dive 2, root cause 2).
import { globRe } from './tiers.ts';
import type { Task } from './plan.ts';

export const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[jt]sx?$/;

/** Paths a task may edit: its own plus those of every task in its dependency closure (they ran strictly earlier, so nothing can conflict). */
export function editablePaths(t: Pick<Task, 'id' | 'paths' | 'deps'>, tasks: Pick<Task, 'id' | 'paths' | 'deps'>[]): string[] {
  const seen = new Set<string>(), walk = (id: string) => { for (const d of tasks.find((x) => x.id === id)?.deps ?? []) if (!seen.has(d)) { seen.add(d); walk(d); } };
  walk(t.id);
  return [...new Set([...t.paths, ...tasks.filter((x) => seen.has(x.id)).flatMap((x) => x.paths)])];
}
export const isEditable = (f: string, editable: string[]) => TEST_FILE.test(f) || editable.some((p) => f === p || f.startsWith(p));

/** Messages for changed files that are outside what the task may edit or on the protected list. Test files are always allowed. */
export function scopeViolations(files: string[], t: Pick<Task, 'id' | 'paths'>, protectedGlobs: string[], editable: string[] = t.paths): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (protectedGlobs.some((g) => globRe(g).test(f))) { out.push(f + ' is a protected path (rubrics, sensor config, spec): the generator may not change it'); continue; }
    if (!isEditable(f, editable)) out.push(f + ' changed by task ' + t.id + ' outside its declared paths (' + editable.join(', ') + ')');
  }
  return out;
}
/** An implementation-first first commit cannot be fixed by editing forward (history is fixed): the branch must restart. */
export const needsFreshStart = (messages: string[]) => messages.some((m) => /^first commit \w+ contains implementation/.test(m));
/** True when the previous attempt failed with at least one identical computational message. */
export const repeatsPrevious = (prev: string[] | undefined, now: string[]) => !!prev && now.some((m) => prev.includes(m));

/** File paths named by evaluator citations ("src/main.ts:4", "Dockerfile:1-8 (CMD)"); labels such as "TDD-waiver" are not files. */
export const citedFiles = (citations: string[]): string[] => [...new Set(citations.map((c) => /^([\w./-]+?)(?::\d|\s|$)/.exec(c.trim())?.[1] ?? '').filter((f) => (/[./]/.test(f) || /^(Dockerfile|Makefile)$/.test(f)) && !/^\d/.test(f)))];

export type FailureClass = 'generator' | 'plan' | 'harness';
/** Who can act on this failure. Only the generator class is worth another attempt (deep-dive 2, root cause 5). */
export function classifyFailure(o: { messages: string[]; citations?: string[]; editable: string[]; history?: string[][] }): { cls: FailureClass; reason: string } {
  if (o.messages.some((m) => /timed out after|returned no usable verdict|changed nothing/.test(m))) return { cls: 'harness', reason: 'tooling failure, not the generator' };
  const files = citedFiles(o.citations ?? []);
  if (files.length && files.every((f) => !isEditable(f, o.editable))) return { cls: 'plan', reason: 'every cited file (' + files.join(', ') + ') is outside what this task may edit: the plan or the AC assignment is wrong' };
  const cur = (o.citations ?? []).join('|'), h = o.history ?? []; // identical findings on three consecutive evaluations: the generator is not converging
  if (cur && h.length >= 2 && h.slice(-2).every((x) => x.join('|') === cur)) return { cls: 'plan', reason: 'the same evaluator citations three times in a row: retrying is not converging' };
  return { cls: 'generator', reason: 'generator can act on this feedback' };
}
