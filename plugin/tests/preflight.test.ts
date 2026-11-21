import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmp, put } from './helpers.ts';
import { composePorts, preflight } from '../src/preflight.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
const okDocker = (d: string, code = 0) => { const p = put(d, '../docker-' + Math.random().toString(36).slice(2), '#!/bin/bash\nexit ' + code + '\n'); chmodSync(p, 0o755); return p; };
const repo = () => { const d = tmp(); put(d, 'README.md', 'x'); sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init'); return d; };
const cfg = { deploy: { target: 'local', compose_file: 'docker-compose.yml' }, sensors: { required: [], commands: {} } };
const run = (d: string, docker: string, o: object = {}) => preflight(d, cfg, { base: 'main', docker, runSensors: () => ({ ok: true, messages: '' }), ...o });

test('composePorts: reads published host ports', () => {
  assert.deepEqual(composePorts('services:\n  a:\n    ports:\n      - "8080:80"\n      - 9000:9000\n      - "127.0.0.1:5432:5432"\n      - "3000"\n'), [8080, 9000, 5432]);
});
test('preflight: a clean repo with docker up passes', async () => { const d = repo(); assert.deepEqual(await run(d, okDocker(d)), []); });
test('preflight: docker not running is an error', async () => { const d = repo(); assert.match((await run(d, okDocker(d, 1)))[0], /docker/i); });
test('preflight: red sensors at baseline are an error that says the baseline is broken', async () => {
  const d = repo(); const r = await run(d, okDocker(d), { runSensors: () => ({ ok: false, messages: 'tests failed' }) });
  assert.match(r[0], /baseline.*red.*tests failed/is);
});
test('preflight: a compose host port already in use is an error', async () => {
  const d = repo(); const srv = createServer(); await new Promise<void>((r) => srv.listen(0, '0.0.0.0', r));
  const port = (srv.address() as any).port; put(d, 'docker-compose.yml', 'services:\n  a:\n    ports:\n      - "' + port + ':80"\n');
  try { assert.match((await run(d, okDocker(d)))[0], new RegExp('port ' + port + ' .*in use')); } finally { srv.close(); }
});
test('preflight: base behind its remote is an error', async () => {
  const d = repo(), up = tmp(); sh(up, 'git init -q --bare -b main'); sh(d, 'git remote add origin ' + up + ' && git push -q origin main');
  const other = tmp(); sh(other, 'git clone -q ' + up + ' . && git -c user.name=t -c user.email=t@t commit -q --allow-empty -m ahead && git push -q origin main');
  assert.match((await run(d, okDocker(d)))[0], /behind origin\/main/);
});
test('ADR-023 preflight: a base that already holds this feature (a squash-merged "Daylight: <title>" commit) stops the run', async () => {
  const d = repo(); sh(d, 'git -c user.name=t -c user.email=t@t commit -q --allow-empty -m "Daylight: Notes API (#3)"');
  const e = await run(d, okDocker(d), { title: 'Notes API' });
  assert.ok(e.some((m) => /already (contains|holds)/.test(m) && /Notes API/.test(m)), e.join('|'));
  assert.deepEqual(await run(d, okDocker(d), { title: 'Billing' }), []);
  assert.deepEqual(await run(d, okDocker(d)), []);
});
