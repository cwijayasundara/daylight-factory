// Reuses: daylight's own inner-loop and sensors commands (run as child processes), claude -p cost JSON. Glue: side-by-side cost vs quality table.
import { cpSync, mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { load } from './metrics.ts';
import { auditFile } from './lib/events.ts';

const CLI = join(dirname(fileURLToPath(import.meta.url)), 'cli.ts');
export function replay(casesDir: string, n: number, configs: string[]): string {
  const rows: string[] = [];
  for (const c of readdirSync(casesDir).sort().slice(0, n)) for (const cfg of configs) {
    const copy = mkdtempSync(join(tmpdir(), 'replay-')); cpSync(join(casesDir, c), copy, { recursive: true });
    const env = { ...process.env, DAYLIGHT_RUN: 'replay-' + c };
    const inner = spawnSync('node', [CLI, 'inner', 'run', '--plan', join(copy, 'plan.json'), '--config', cfg], { cwd: copy, env, encoding: 'utf8' });
    const sensors = spawnSync('node', [CLI, 'sensors', 'run', '--config', cfg], { cwd: copy, env, encoding: 'utf8' });
    const f = auditFile(copy, 'replay-' + c), evs = existsSync(f) ? load(f) : [];
    const cost = evs.filter((e) => e.kind === 'x_usage').reduce((s, e) => s + (e.cost_usd ?? 0), 0);
    const verdicts = evs.filter((e) => e.kind === 'verdict'), last = verdicts[verdicts.length - 1];
    rows.push('| ' + c + ' | ' + basename(cfg) + ' | $' + cost.toFixed(4) + ' | ' + (sensors.status === 0 ? 'pass' : 'FAIL') + ' | ' + (last?.verdict ?? (inner.status === 0 ? 'n/a' : 'error')) + ' |');
  }
  return '| case | config | cost | sensors | verdict |\n|---|---|---|---|---|\n' + rows.join('\n') + '\n';
}
