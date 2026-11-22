// Reuses: the test runner's TAP output (node --test --test-reporter=tap). Glue: AC id -> test-name mapping.
import { spawnSync } from 'node:child_process';
import { acIds, acModes } from './plan.ts';

export interface Row { ac: string; tests: string[]; result: 'PASS' | 'FAIL' | 'NO TEST' | 'NO EVIDENCE' }
export const parseTap = (out: string) => [
  ...[...out.matchAll(/^\s*(not ok|ok)\s+\d+\s+-\s+(.*?)(?:\s+#.*)?$/gm)].map((m) => ({ name: m[2], pass: m[1] === 'ok' })),
  ...[...out.matchAll(/^\s*([✔✖])\s+(.*?)\s+\([\d.]+ms\)\s*$/gm)].map((m) => ({ name: m[2], pass: m[1] === '✔' })), // node spec reporter
  ...[...out.matchAll(/^\s*\S+::(\S+)\s+(PASSED|FAILED)\b/gm)].map((m) => ({ name: m[1], pass: m[2] === 'PASSED' })), // pytest -v
  ...[...out.matchAll(/^\s*test\s+(\S+)\s+\.\.\.\s+(ok|FAILED)\s*$/gm)].map((m) => ({ name: m[1], pass: m[2] === 'ok' })), // cargo test
];
export interface Evidence { delivery?: boolean; sensors?: Record<string, boolean> }
export function matrix(spec: string, results: { name: string; pass: boolean }[], ev: Evidence = {}): Row[] {
  const modes = acModes(spec);
  return [...new Set(acIds(spec))].map((ac) => {
    const m = modes.get(ac);
    if (m?.mode === 'run') return { ac, tests: ['delivery: build, health, smoke'], result: ev.delivery ? 'PASS' : 'NO EVIDENCE' } as Row;
    if (m?.mode === 'sensor') return { ac, tests: ['sensor: ' + (m.sensor ?? '?')], result: m.sensor && ev.sensors?.[m.sensor] ? 'PASS' : 'NO EVIDENCE' } as Row;
    const re = new RegExp('(^|[^a-zA-Z0-9])' + ac.replace('-', '[-_]') + '([^a-zA-Z0-9]|$)', 'i'); // matches AC-1, ac_1 (Python/Rust fn names)
    const hit = results.filter((r) => re.test(r.name));
    return { ac, tests: hit.map((h) => h.name), result: !hit.length ? 'NO TEST' : hit.every((h) => h.pass) ? 'PASS' : 'FAIL' };
  });
}
export const render = (rows: Row[]) => '| AC | Tests | Result |\n|---|---|---|\n' + rows.map((r) => '| ' + r.ac + ' | ' + (r.tests.join('; ') || '-') + ' | ' + r.result + ' |').join('\n') + '\n';
export function runTests(cwd: string, cmd: string) {
  const { NODE_TEST_CONTEXT: _ctx, ...env } = process.env; // a nested node --test would otherwise stop emitting TAP
  const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', env }); return parseTap(r.stdout + r.stderr); }
