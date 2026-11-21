// Reuses: globRe (tiers.ts), acIds spec format (plan.ts). Glue: deterministic plan checks run before any task starts.
import { globRe } from './tiers.ts';
import { acModes, type Task } from './plan.ts';

const META: [RegExp, string][] = [[/\bcoverage\b/i, 'coverage'], [/\bcomplexity\b/i, 'complexity'], [/\bduplicat/i, 'duplication'], [/\b(dependency layer|layering|import boundar)/i, 'layers'], [/\b(vulnerab|advisor)/i, 'advisories']];
const overlaps = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);

export function lintPlan(tasks: Task[], o: { protectedGlobs: string[]; spec: string; requiredSensors: string[] }): string[] {
  const errs: string[] = [], ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) for (const d of t.deps) if (!ids.has(d)) errs.push('task ' + t.id + ' depends on unknown task ' + d);
  // dependency closure, also used to decide which tasks can run in parallel
  const up = new Map<string, Set<string>>();
  const closure = (id: string, seen = new Set<string>()): Set<string> => { for (const d of tasks.find((t) => t.id === id)?.deps ?? []) if (!seen.has(d)) { seen.add(d); closure(d, seen); } return seen; };
  for (const t of tasks) up.set(t.id, closure(t.id));
  for (const t of tasks) if (up.get(t.id)!.has(t.id)) errs.push('dependency cycle through task ' + t.id);
  for (const t of tasks) for (const p of t.paths) if (o.protectedGlobs.some((g) => globRe(g).test(p))) errs.push('task ' + t.id + ' lists protected path ' + p + ' (rubrics, sensor config and spec are never task-editable)');
  for (let i = 0; i < tasks.length; i++) for (let j = i + 1; j < tasks.length; j++) {
    const a = tasks[i], b = tasks[j];
    if (up.get(a.id)!.has(b.id) || up.get(b.id)!.has(a.id)) continue; // ordered by a dependency: not parallel
    const hit = a.paths.flatMap((p) => b.paths.filter((q) => overlaps(p, q)).map((q) => p + ' / ' + q))[0];
    if (hit) errs.push('independent tasks ' + a.id + ' and ' + b.id + ' have overlapping paths (' + hit + '): add a dependency or split the paths');
  }
  // [run] ACs are proven by executing the delivery: they belong in exactly one task, run last, that mixes in no test ACs
  const modes = acModes(o.spec), runTasks = tasks.filter((t) => t.acs.some((a) => modes.get(a)?.mode === 'run'));
  if (runTasks.length > 1) errs.push('[run] acceptance criteria are spread over tasks ' + runTasks.map((t) => t.id).join(', ') + ': put them all in ONE delivery task');
  for (const t of runTasks) {
    if (t.acs.some((a) => (modes.get(a)?.mode ?? 'test') === 'test')) errs.push('task ' + t.id + ' mixes [run] and [test] acceptance criteria: the delivery task holds only [run] ACs (move the [test] ones to a behaviour task)');
    const others = tasks.filter((x) => x.id !== t.id && !up.get(t.id)!.has(x.id));
    if (others.length) errs.push('delivery task ' + t.id + ' must run last: it needs to depend on ' + others.map((x) => x.id).join(', '));
  }
  const planned = new Set(tasks.flatMap((t) => t.acs));
  for (const m of o.spec.matchAll(/\*\*(AC-\d+)\*\*\s*(.*)/g)) {
    if (!planned.has(m[1])) continue;
    for (const [re, sensor] of META) if (re.test(m[2]) && !o.requiredSensors.includes(sensor)) errs.push(m[1] + ' is about ' + sensor + ' which no test can show: add "' + sensor + '" to sensors.required so a sensor verifies it');
  }
  return errs;
}
