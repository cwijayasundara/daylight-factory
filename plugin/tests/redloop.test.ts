import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, tmp, put, events, MIN_YAML } from './helpers.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
function setup(genBody: string) {
  const d = tmp(); put(d, 'daylight.yaml', MIN_YAML + 'retries:\n  task: 1\nsensors:\n  required: [tests]\n  commands:\n    tests: "test -f src/impl.ts"\n'); put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 't', acs: ['AC-1'], paths: ['src/'], deps: [] }] }));
  put(d, 'spec.md', '- **AC-1** returns 1.\n');
  const log = join(d, '../c-' + Math.random().toString(36).slice(2));
  const s = put(d, '../s-' + Math.random().toString(36).slice(2), "#!/bin/bash\necho \"$*\" >> " + log + "\nif [[ \"$*\" == *daylight:evaluator* ]]; then echo '{\"result\":\"{\\\"verdict\\\":\\\"pass\\\",\\\"criteria\\\":[]}\"}'; else " + genBody + "; echo '{\"result\":\"done\"}'; fi\n");
  chmodSync(s, 0o755);
  return { d, s, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split(/\n(?=-p )/).filter(Boolean) : []) };
}
const run = (p: { d: string; s: string }) => cli(['inner', 'run', '--plan', join(p.d, 'plan.json'), '--spec', join(p.d, 'spec.md')], { cwd: p.d, env: { DAYLIGHT_CLAUDE: p.s, DAYLIGHT_RUN: 'r1' } });

test('loop: a tdd task passes when its new AC-tagged tests fail at base and pass on the branch, in a single commit (no red command, no waiver)', () => {
  const p = setup('mkdir -p src tests; echo x > src/impl.ts; echo "// AC-1 returns 1" > tests/a.test.ts');
  const r = run(p); assert.equal(JSON.parse(r.out).t1, 'passed', r.err + r.out);
  const ev = events(p.d).find((e) => e.kind === 'x_red_at_base'); assert.equal(ev.ok, true); assert.equal(ev.outcome, 'red');
  assert.equal(p.calls().filter((c) => c.includes('daylight:generator'))[0].includes('--waive'), false);
});
test('loop: a tdd task with no new test file fails the contract before the evaluator is paid, with an actionable message', () => {
  const p = setup('mkdir -p src; echo x > src/impl.ts');
  const r = run(p); assert.equal(JSON.parse(r.out).t1, 'escalated');
  assert.equal(p.calls().filter((c) => c.includes('daylight:evaluator')).length, 0);
  assert.match(readFileSync(join(p.d, '.daylight/escalations/t1.md'), 'utf8'), /no test file/i);
});
