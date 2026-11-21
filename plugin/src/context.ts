// Reuses: spec.md AC format. Glue: the facts a generator needs on attempt 1 (AC text, sensor limits, repo conventions), so it stops guessing and failing sensors it never saw.
import { tddApplies, type Task } from './plan.ts';

export function generatorContext(t: Pick<Task, 'acs'>, o: { spec: string; sensors: Record<string, unknown>; conventions: string }): string {
  const text = new Map([...o.spec.matchAll(/\*\*(AC-\d+)\*\*\s*(.*)/g)].map((m) => [m[1], m[2].trim()]));
  const lines = ['## Acceptance criteria text', ...t.acs.map((a) => '- ' + a + (text.has(a) ? ': ' + text.get(a) : ''))];
  const s = o.sensors, lim = [['coverage', 'coverage_min', 'at least', '%'], ['complexity', 'complexity_max', 'at most', ' per function'], ['duplication', 'duplication_max', 'similarity at most', '']] as const;
  const got = lim.filter(([, k]) => s[k] !== undefined).map(([n, k, w, u]) => '- ' + n + ': ' + w + ' ' + s[k] + u);
  if (got.length) lines.push('', '## Sensor limits (checked automatically after you finish; stay within them)', ...got);
  if (o.conventions.trim()) lines.push('', '## Conventions of this repository', o.conventions.trim().slice(0, 3000));
  return lines.join('\n');
}

/** The TDD paragraph of the generator prompt. Config-only tasks (no code paths) get no red step and no waiver to declare. */
export function tddInstruction(t: Task, cli: string, testCmd: string): string {
  if (!tddApplies(t)) return '\nThis task touches no code paths, so there is no red step: do not run the red command or declare a waiver. Implement the change, keep to the allowed paths, and commit.';
  return '\nFollow TDD with separate commits: (1) write failing tests whose names contain their AC id, run: node ' + cli + ' red --task ' + t.id + ' --cmd "' + testCmd + '" (it must exit 0 = recorded red; if your new tests already pass because the behaviour exists, run the same command with --waive "<reason>" instead: the waiver is logged and the evaluator will judge it), then git add -A && git commit -m "test: ..."; (2) implement until green; commit. Stay in the allowed paths.';
}
