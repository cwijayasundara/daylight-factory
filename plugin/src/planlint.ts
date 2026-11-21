// Reuses: globRe (tiers.ts), acIds spec format (plan.ts). Glue: deterministic plan checks run before any task starts.
import { globRe } from './tiers.ts';
import type { Task } from './plan.ts';

const META: [RegExp, string][] = [[/\bcoverage\b/i, 'coverage'], [/\bcomplexity\b/i, 'complexity'], [/\bduplicat/i, 'duplication'], [/\b(dependency layer|layering|import boundar)/i, 'layers'], [/\b(vulnerab|advisor)/i, 'advisories']];
const overlaps = (a: string, b: string) => a.startsWith(b) || b.startsWith(a);

export function lintPlan(tasks: Task[], o: { protectedGlobs: string[]; spec: string; requiredSensors: string[]; architecture?: string; exists?: (p: string) => boolean }): string[] {
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
  // a new file the design names needs an explicit owner: a broad directory in several tasks makes each assume another creates it
  const explicit = new Set(tasks.flatMap((t) => t.paths));
  for (const p of new Set([...(o.architecture ?? '').matchAll(/`([\w.-]+(?:\/[\w.-]+)+\.[a-z]{1,4})`/g)].map((m) => m[1]))) {
    if (/^(tests?|docs)\//.test(p) || o.exists?.(p) || explicit.has(p)) continue;
    errs.push(p + ' is named in architecture.md but no task lists it explicitly in its paths: put it in the paths of the task that creates it');
  }
  // an AC that names a file only another task owns cannot be met by its own task (bh11: AC-17 named the Dockerfile and src/main.ts)
  const owns = (t: Task, f: string) => t.paths.some((p) => p === f || (p.endsWith('/') && f.startsWith(p)));
  for (const m of o.spec.matchAll(/\*\*(AC-\d+)\*\*\s*(.*)/g)) {
    const files = [...new Set([...m[2].matchAll(/(?:[\w.-]+\/)+[\w.-]+\.[a-z]{1,4}\b|\bDockerfile\b|\bdocker-compose\.yml\b/g)].map((x) => x[0]))];
    for (const t of tasks.filter((x) => x.acs.includes(m[1]))) for (const f of files) {
      const owner = tasks.find((x) => x.id !== t.id && owns(x, f));
      if (!owns(t, f) && owner) errs.push(m[1] + ' names ' + f + ' which task ' + owner.id + ' owns but its task ' + t.id + ' does not: give ' + t.id + ' that path (it already depends on the owner) or move ' + m[1] + ' to ' + owner.id);
    }
  }
  const planned = new Set(tasks.flatMap((t) => t.acs));
  for (const m of o.spec.matchAll(/\*\*(AC-\d+)\*\*\s*(.*)/g)) {
    if (!planned.has(m[1])) continue;
    for (const [re, sensor] of META) if (re.test(m[2]) && !o.requiredSensors.includes(sensor)) errs.push(m[1] + ' is about ' + sensor + ' which no test can show: add "' + sensor + '" to sensors.required so a sensor verifies it');
  }
  return errs;
}
