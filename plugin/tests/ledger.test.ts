import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { cli, tmp, put, PLUGIN } from './helpers.ts';

test('AC-8 ledger --check fails when a script lacks a Reuses header', () => {
  const d = tmp();
  put(d, 'src/a.ts', 'export const a = 1;\n');
  const r = cli(['ledger', '--check', '--root', d, '--budget', '100']);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /src\/a\.ts/);
});
test('AC-8 ledger --check fails when custom lines exceed the budget', () => {
  const d = tmp();
  put(d, 'src/a.ts', '// Reuses: node stdlib\n' + 'export const a = 1;\n'.repeat(20));
  const r = cli(['ledger', '--check', '--root', d, '--budget', '5']);
  assert.notEqual(r.code, 0);
  assert.match(r.err, /budget/);
});
test('AC-8 ledger --check passes with headers and budget; prints a table', () => {
  const d = tmp();
  put(d, 'src/a.ts', '// Reuses: node stdlib\nexport const a = 1;\n');
  const r = cli(['ledger', '--check', '--root', d, '--budget', '50']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /node stdlib/);
});
test('AC-8 the real plugin passes its own ledger check', () => {
  const r = cli(['ledger', '--check', '--root', PLUGIN]);
  assert.equal(r.code, 0, r.err);
});
