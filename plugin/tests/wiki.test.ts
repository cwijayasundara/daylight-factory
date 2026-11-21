import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, tmp, put, events, MIN_YAML } from './helpers.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
const env = { DAYLIGHT_RUN: 'r1' };
function wrepo(enabled = true) {
  const d = tmp();
  put(d, 'daylight.yaml', MIN_YAML + 'wiki:\n  enabled: ' + enabled + '\n');
  put(d, 'docs/design/spec.md', '- **AC-1** login returns a token.\n- **AC-2** store persists a row.\n');
  put(d, 'docs/design/architecture.md', '# Arch\n### ADR-001 Tokens\n- **Status** accepted\n');
  put(d, 'docs/design/intent.md', '# Intent\n## Why\nx\n## Success criteria\n- 95% ok\n');
  put(d, 'src/auth/login.ts', '// intent: AC-1, ADR-001\nexport function login(u: string) { return u; }\n');
  put(d, 'src/store/db.ts', '// intent: AC-2\nexport class Db {}\n');
  put(d, 'src/misc/util.ts', 'export const util = 1;\n');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  return d;
}
const W = (d: string, ...a: string[]) => cli(['wiki', ...a], { cwd: d, env });
const mt = (d: string, p: string) => statSync(join(d, 'docs/wiki', p)).mtimeMs;

test('AC-76 wiki has an overview and one page per module, each with a Why section linking AC/ADR', () => {
  const d = wrepo(); assert.equal(W(d, 'build').code, 0);
  assert.ok(existsSync(join(d, 'docs/wiki/overview.md')));
  for (const m of ['auth', 'store', 'misc']) assert.ok(existsSync(join(d, 'docs/wiki/modules', m + '.md')), m);
  const a = readFileSync(join(d, 'docs/wiki/modules/auth.md'), 'utf8');
  assert.match(a, /## Why/); assert.match(a, /\[AC-1\]\([^)]*spec\.md\)/); assert.match(a, /\[ADR-001\]\([^)]*architecture\.md\)/); assert.match(a, /login/);
  assert.match(readFileSync(join(d, 'docs/wiki/overview.md'), 'utf8'), /Unexplained[\s\S]*misc/);
});
test('AC-77 every wiki link to a repo file or design artefact resolves', () => {
  const d = wrepo(); W(d, 'build');
  assert.equal(W(d, 'links').code, 0);
  rmSync(join(d, 'src/auth/login.ts'));
  const r = W(d, 'links'); assert.notEqual(r.code, 0); assert.match(r.err, /login\.ts/);
});
test('AC-75 / AC-79 a merge updates only affected pages, and the recorded SHA equals the merge SHA', async () => {
  const d = wrepo(); W(d, 'build');
  const before = { auth: mt(d, 'modules/auth.md'), store: mt(d, 'modules/store.md'), ov: mt(d, 'overview.md') };
  await new Promise((r) => setTimeout(r, 30));
  put(d, 'src/auth/login.ts', '// intent: AC-1, ADR-001\nexport function login(u: string) { return u + "!"; }\nexport const extra = 1;\n');
  sh(d, 'git add -A && git -c user.name=t -c user.email=t@t commit -qm change');
  const sha = sh(d, 'git rev-parse HEAD').stdout.trim();
  assert.equal(W(d, 'update', '--sha', sha).code, 0);
  assert.ok(mt(d, 'modules/auth.md') > before.auth, 'auth page regenerated');
  assert.equal(mt(d, 'modules/store.md'), before.store, 'store page untouched');
  assert.equal(mt(d, 'overview.md'), before.ov, 'overview untouched (architecture unchanged)');
  assert.match(readFileSync(join(d, 'docs/wiki/modules/auth.md'), 'utf8'), /extra/);
  assert.equal(W(d, 'current', '--sha', sha).code, 0);
  assert.notEqual(W(d, 'current', '--sha', 'abc123').code, 0);
  put(d, 'docs/design/architecture.md', '# Arch\n### ADR-001 Tokens\n- **Status** accepted\n### ADR-002 More\n'); await new Promise((r) => setTimeout(r, 30));
  W(d, 'update', '--sha', sha); assert.ok(mt(d, 'overview.md') > before.ov, 'overview regenerated when architecture changes');
});
test('AC-78 with wiki.enabled false no wiki files are written and no wiki model calls are logged', () => {
  const d = wrepo(false);
  const r = W(d, 'build', '--summarize');
  assert.equal(r.code, 0); assert.match(r.out, /disabled/);
  assert.ok(!existsSync(join(d, 'docs/wiki')));
  const f = join(d, '.daylight/audit/r1.jsonl');
  assert.ok(!existsSync(f) || !readFileSync(f, 'utf8').includes('"phase":"wiki"'));
});
