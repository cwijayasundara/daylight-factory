// Reuses: the test runner's TAP output (node --test --test-reporter=tap). Glue: AC id -> test-name mapping.
import { spawnSync } from 'node:child_process';
import { acIds } from './plan.ts';

export interface Row { ac: string; tests: string[]; result: 'PASS' | 'FAIL' | 'NO TEST' }
export const parseTap = (out: string) => [
  ...[...out.matchAll(/^\s*(not ok|ok)\s+\d+\s+-\s+(.*?)(?:\s+#.*)?$/gm)].map((m) => ({ name: m[2], pass: m[1] === 'ok' })),
  ...[...out.matchAll(/^\s*([✔✖])\s+(.*?)\s+\([\d.]+ms\)\s*$/gm)].map((m) => ({ name: m[2], pass: m[1] === '✔' })), // spec reporter
];
export function matrix(spec: string, results: { name: string; pass: boolean }[]): Row[] {
  return [...new Set(acIds(spec))].map((ac) => {
    const hit = results.filter((r) => new RegExp('\\b' + ac + '\\b').test(r.name));
    return { ac, tests: hit.map((h) => h.name), result: !hit.length ? 'NO TEST' : hit.every((h) => h.pass) ? 'PASS' : 'FAIL' };
  });
}
export const render = (rows: Row[]) => '| AC | Tests | Result |\n|---|---|---|\n' + rows.map((r) => '| ' + r.ac + ' | ' + (r.tests.join('; ') || '-') + ' | ' + r.result + ' |').join('\n') + '\n';
export function runTests(cwd: string, cmd: string) {
  const { NODE_TEST_CONTEXT: _ctx, ...env } = process.env; // a nested node --test would otherwise stop emitting TAP
  const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', env }); return parseTap(r.stdout + r.stderr); }
