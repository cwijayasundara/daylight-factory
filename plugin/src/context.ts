// Reuses: spec.md AC format. Glue: the facts a generator needs on attempt 1 (AC text, sensor limits, repo conventions), so it stops guessing and failing sensors it never saw.
import { tddApplies, type Task } from './plan.ts';
import { editablePaths } from './contract.ts';

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
export function tddInstruction(t: Task, cli: string, testCmd: string, mode: 'tdd' | 'run' | 'none' = tddApplies(t) ? 'tdd' : 'none'): string {
  if (mode === 'run') return '\nThis is the delivery task: it is verified by actually building and starting the service (docker compose up --build, the health command, the smoke command), not by unit tests. There is no red step and no waiver. Make it work, run those commands yourself if you can, and commit.';
  if (mode !== 'tdd') return '\nThere is no red step for this task: do not run the red command or declare a waiver. Implement the change and commit.';
  return '\nFollow TDD: write failing tests first. Test names must contain their AC id (e.g. "AC-3 returns 404"); commit the tests, then the implementation (' + testCmd + ' runs them). The harness checks that your new tests FAIL on the unchanged base tree and PASS on yours; there is no red command and no waiver. If the behaviour already exists, still add AC-tagged tests that prove it. Stay within what you may edit.';
}

/** What the generator may touch, stated once, in the same words the harness enforces. */
export function generatorContract(t: Task, tasks: Task[]): string {
  const own = t.paths, inherited = editablePaths(t, tasks).filter((p) => !own.includes(p));
  return '\n## What you may edit\n- Your own paths: ' + own.join(', ') + '\n' + (inherited.length ? '- Files of the tasks you depend on (already merged; change them if your acceptance criteria need it): ' + inherited.join(', ') + '\n' : '') + '- Test files (tests/, *.test.ts) are always allowed.\n- Anything else is a scope violation.';
}

/** The whole evaluator prompt: rubric inline (the evaluator has no Skill tool), AC text, and what the harness already decided. */
export function evaluatorPrompt(o: { task: Task; acText: string[]; editable: string[]; diff: string; rubric: string; extra?: string }): string {
  return 'Evaluate task ' + o.task.id + ': ' + o.task.title + '\n\n## Rubric\n' + o.rubric.trim() + '\n\n## Acceptance criteria of this task\n' + (o.acText.length ? o.acText.map((a) => '- ' + a).join('\n') : '- (none: judge the diff against the findings below)') +
    '\n\n## Already established by the harness (do not re-judge)\nThe scope check, the TDD evidence and the sensors (tests, types, lint, complexity) have already passed for this diff. Files this task may edit: ' + o.editable.join(', ') + ' (plus test files). architecture.md is guidance: fail only against the acceptance criteria text above. Do not read .daylight/.' +
        '\n\n## Diff\n' + o.diff + '\n\nReply ONLY JSON {"verdict":"pass|fail","criteria":[{"id":"..","result":"pass|fail","cite":"file:line or test name"}],"feedback":".."}';
}
