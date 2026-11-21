import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmp, put } from './helpers.ts';
import { scopeCheck } from '../src/judge.ts';
import { append, auditFile } from '../src/lib/events.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
const G = 'git -c user.name=t -c user.email=t@t';
test('scopeCheck: a task branch rebased onto a later run head is measured from its latest recorded start, not its first reflog entry', () => {
  process.env.DAYLIGHT_RUN = 'r1';
  const d = tmp(); put(d, 'README.md', 'x');
  sh(d, 'git init -q -b main && git add -A && ' + G + ' commit -qm init && git checkout -qb daylight/run-1 && git branch daylight/t1');
  put(d, 'daylight.yaml', 'a: 1'); sh(d, 'git add -A && ' + G + ' commit -qm "daylight: accept ingest-proposed sensor config"'); // harness commit after the branch was created
  sh(d, 'git checkout -q daylight/t1 && git rebase -q daylight/run-1');
  const base = sh(d, 'git rev-parse HEAD').stdout.trim();
  put(d, 'Dockerfile', 'FROM x'); sh(d, 'git add -A && ' + G + ' commit -qm task');
  const p = put(d, 'plan.json', JSON.stringify({ tasks: [{ id: 't1', title: 't', acs: [], paths: ['Dockerfile'], deps: [] }] }));
  assert.match(scopeCheck(d, p, 'main').join('\n'), /daylight\.yaml/); // no start recorded: falls back to the reflog (old behaviour)
  append(auditFile(d), { kind: 'x_task_start', phase: 'inner', task: 't1', base });
  assert.deepEqual(scopeCheck(d, p, 'main'), []);
});
