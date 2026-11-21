// Reuses: spec.md AC format. Glue: the facts a generator needs on attempt 1 (AC text, sensor limits, repo conventions), so it stops guessing and failing sensors it never saw.
import type { Task } from './plan.ts';

export function generatorContext(t: Pick<Task, 'acs'>, o: { spec: string; sensors: Record<string, unknown>; conventions: string }): string {
  const text = new Map([...o.spec.matchAll(/\*\*(AC-\d+)\*\*\s*(.*)/g)].map((m) => [m[1], m[2].trim()]));
  const lines = ['## Acceptance criteria text', ...t.acs.map((a) => '- ' + a + (text.has(a) ? ': ' + text.get(a) : ''))];
  const s = o.sensors, lim = [['coverage', 'coverage_min', 'at least', '%'], ['complexity', 'complexity_max', 'at most', ' per function'], ['duplication', 'duplication_max', 'similarity at most', '']] as const;
  const got = lim.filter(([, k]) => s[k] !== undefined).map(([n, k, w, u]) => '- ' + n + ': ' + w + ' ' + s[k] + u);
  if (got.length) lines.push('', '## Sensor limits (checked automatically after you finish; stay within them)', ...got);
  if (o.conventions.trim()) lines.push('', '## Conventions of this repository', o.conventions.trim().slice(0, 3000));
  return lines.join('\n');
}
