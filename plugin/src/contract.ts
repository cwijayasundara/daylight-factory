// Reuses: globRe from tiers.ts. Glue: pure per-attempt contract checks so loop.ts can fail cheaply before paying for an evaluator.
import { globRe } from './tiers.ts';
import type { Task } from './plan.ts';

const TEST_FILE = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\.[jt]sx?$/;

/** Messages for changed files that are outside the task's paths or on the protected list. */
export function scopeViolations(files: string[], t: Pick<Task, 'id' | 'paths' | 'tdd'>, protectedGlobs: string[]): string[] {
  const out: string[] = [];
  for (const f of files) {
    if (protectedGlobs.some((g) => globRe(g).test(f))) { out.push(f + ' is a protected path (rubrics, sensor config, spec): the generator may not change it'); continue; }
    if (!t.paths.some((p) => f.startsWith(p)) && !(t.tdd !== false && TEST_FILE.test(f))) out.push(f + ' changed by task ' + t.id + ' outside its declared paths (' + t.paths.join(', ') + ')');
  }
  return out;
}
/** True when the previous attempt failed with at least one identical computational message. */
export const repeatsPrevious = (prev: string[] | undefined, now: string[]) => !!prev && now.some((m) => prev.includes(m));
/** Who must act on a failure: the harness (fix the tooling) or the generator (retry with feedback). */
export const failureClass = (messages: string[]): 'harness' | 'generator' => (messages.some((m) => /timed out after|returned no usable verdict/.test(m)) ? 'harness' : 'generator');
