import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, tmp, put, events, MIN_YAML } from './helpers.ts';
import { needsFreshStart } from '../src/contract.ts';

test('needsFreshStart: only an implementation-first history is unfixable by editing forward', () => {
  assert.equal(needsFreshStart(['first commit 365ff17 contains implementation but no failing test (impl: scripts/smoke.ts)']), true);
  assert.equal(needsFreshStart(['no red proof recorded for task t4 (run: ...)']), false);
  assert.equal(needsFreshStart(['src/a.ts changed by task t outside its declared paths']), false);
});
test('tdd: an implementation-first first commit resets the branch to its start so the next attempt can really go red first', () => {
  const d = tmp(); put(d, 'daylight.yaml', MIN_YAML + 'retries:\n  task: 1\n'); put(d, 'README.md', 'x');
  spawnSync('bash', ['-c', 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init'], { cwd: d });
  const log = join(d, '../seen-' + Math.random().toString(36).slice(2));
  const stub = put(d, '../g-' + Math.random().toString(36).slice(2), "#!/bin/bash\nif [[ \"$*\" == *daylight:evaluator* ]]; then echo '{\"result\":\"{}\"}'; else echo \"files:$(ls src 2>/dev/null | wc -l)\" >> " + log + "; mkdir -p src; echo x > src/impl-$$.ts; echo '{\"result\":\"done\"}'; fi\n"); chmodSync(stub, 0o755);
  put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 't', acs: ['AC-1'], paths: ['src/'], deps: [] }] }));
  cli(['inner', 'run', '--plan', join(d, 'plan.json')], { cwd: d, env: { DAYLIGHT_CLAUDE: stub, DAYLIGHT_RUN: 'r1' } });
  assert.deepEqual(readFileSync(log, 'utf8').trim().split('\n').map((l) => l.replace(/\s+/g, '')), ['files:0', 'files:0']); // attempt 2 started from a clean tree, not on top of the impl-first commit
  assert.equal(events(d).filter((e) => e.kind === 'x_tdd_reset').length, 1);
});
