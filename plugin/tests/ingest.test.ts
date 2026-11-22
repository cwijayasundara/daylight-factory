import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { cli, tmp, put } from './helpers.ts';

const sh = (d: string, c: string) => spawnSync('bash', ['-c', c], { cwd: d, encoding: 'utf8' });
const env = { DAYLIGHT_RUN: 'r1' };
function tsRepo() {
  const d = tmp();
  put(d, 'package.json', JSON.stringify({ name: 'x', scripts: { test: 'node --test tests/', lint: 'eslint src', typecheck: 'tsc --noEmit' }, devDependencies: { typescript: '^5', eslint: '^9' } }));
  put(d, 'package-lock.json', '{}'); put(d, 'tsconfig.json', '{}');
  put(d, 'eslint.config.js', "export default [{ rules: { complexity: ['error', 8] } }];\n");
  put(d, 'README.md', '# x\n\n## Conventions\n- Functions never throw: they return a Result<T>.\n- Files are kebab-case.\n');
  put(d, 'src/result.ts', 'export type Result<T> = { ok: true; value: T };\n');
  put(d, 'src/note-store.ts', "import { type Result } from './result.ts';\nexport class NoteStore { get(): Result<number> { return { ok: true, value: 1 }; } }\n");
  put(d, 'tests/note-store.test.ts', "import test from 'node:test';\ntest('x', () => {});\n");
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  return d;
}
const ing = (d: string, ...a: string[]) => cli(['ingest', ...a], { cwd: d, env });

test('AC-30 ingest runs before planning on an existing repo and is skipped on an empty one', () => {
  const e = tmp(); sh(e, 'git init -q -b main');
  const r0 = ing(e, '--auto'); assert.equal(r0.code, 0); assert.match(r0.out, /skipping ingest/);
  const d = tsRepo(); const r1 = ing(d, '--auto');
  assert.equal(r1.code, 0, r1.err); assert.ok(existsSync(join(d, '.daylight/ingest/conventions.md')));
});
test('AC-31 conventions report lists language, runner, linter, type checker, package manager, layers with evidence', () => {
  const d = tsRepo(); ing(d);
  const c = readFileSync(join(d, '.daylight/ingest/conventions.md'), 'utf8');
  for (const s of ['TypeScript', 'node:test', 'ESLint', 'tsc', 'npm', 'Dependency layers', 'Functions never throw', 'eslint.config.js', 'tsconfig.json', 'package-lock.json']) assert.ok(c.includes(s), s);
  assert.ok((c.match(/evidence:/g) ?? []).length >= 6);
});
test('AC-32 ingest produces a starter wiki (overview + a page per module)', () => {
  const d = tsRepo(); ing(d);
  assert.ok(existsSync(join(d, 'docs/wiki/overview.md'))); assert.ok(existsSync(join(d, 'docs/wiki/modules/core.md')));
});
test('AC-33 ingest proposes sensor config as a diff and does not apply it until accepted', () => {
  const d = tsRepo(); ing(d);
  const diff = readFileSync(join(d, '.daylight/ingest/daylight.yaml.diff'), 'utf8');
  assert.match(diff, /^\+.*complexity_max: 8/m); assert.match(diff, /npm test/); assert.match(diff, /tsc --noEmit/);
  assert.ok(!existsSync(join(d, 'daylight.yaml')));
  assert.equal(ing(d, '--accept').code, 0);
  assert.equal(cli(['config', '--check'], { cwd: d }).code, 0);
  assert.match(readFileSync(join(d, 'daylight.yaml'), 'utf8'), /complexity_max: 8/);
});
test('AC-34 ingest changes no tracked source files', () => {
  const d = tsRepo(); ing(d);
  assert.equal(sh(d, 'git status --porcelain --untracked-files=no').stdout.trim(), '');
});
test('AC-35 an unsupported language repo stops with unsupported language and proposes nothing', () => {
  const d = tmp(); put(d, 'src/main.go', 'package main\n'); put(d, 'src/b.go', 'package main\n'); put(d, 'go.mod', 'module x\n');
  const r = ing(d);
  assert.notEqual(r.code, 0); assert.match(r.err + r.out, /unsupported language/);
  assert.ok(!existsSync(join(d, '.daylight/ingest/daylight.yaml.diff')));
});

test('ingest supports Python 3.14 repos (pyproject.toml, pytest, ruff, mypy, uv)', () => {
  const d = tmp();
  put(d, 'pyproject.toml', '[project]\nname = "demo"\nrequires-python = ">=3.14"\n[tool.ruff]\nline-length = 100\n[tool.mypy]\nstrict = true\n');
  put(d, 'uv.lock', '');
  put(d, 'src/app.py', 'def ping() -> str:\n    return "pong"\n');
  put(d, 'tests/test_app.py', 'def test_ac_1_ping():\n    assert True\n');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  const r = ing(d);
  assert.equal(r.code, 0, r.err + r.out);
  const conv = readFileSync(join(d, '.daylight/ingest/conventions.md'), 'utf8');
  assert.match(conv, /Python >=3\.14/); assert.match(conv, /pytest/); assert.match(conv, /ruff/); assert.match(conv, /mypy/); assert.match(conv, /uv/);
  const diff = readFileSync(join(d, '.daylight/ingest/daylight.yaml.diff'), 'utf8');
  assert.match(diff, /uv run pytest -v/); assert.match(diff, /uv run ruff check \./); assert.match(diff, /uv run mypy \./);
});

test('ingest supports Rust repos (Cargo.toml, cargo test, clippy, check)', () => {
  const d = tmp();
  put(d, 'Cargo.toml', '[package]\nname = "demo"\nversion = "0.1.0"\nedition = "2024"\n');
  put(d, 'Cargo.lock', '');
  put(d, 'src/lib.rs', 'pub fn ping() -> &\'static str { "pong" }\n');
  put(d, 'tests/ping_test.rs', '#[test]\nfn test_ac_1_ping() { assert_eq!(1, 1); }\n');
  sh(d, 'git init -q -b main && git add -A && git -c user.name=t -c user.email=t@t commit -qm init');
  const r = ing(d);
  assert.equal(r.code, 0, r.err + r.out);
  const conv = readFileSync(join(d, '.daylight/ingest/conventions.md'), 'utf8');
  assert.match(conv, /Rust/); assert.match(conv, /cargo test/); assert.match(conv, /cargo clippy/);
  const diff = readFileSync(join(d, '.daylight/ingest/daylight.yaml.diff'), 'utf8');
  assert.match(diff, /cargo test/); assert.match(diff, /cargo clippy/); assert.match(diff, /cargo check/);
});
