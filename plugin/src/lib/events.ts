// Reuses: node:crypto (sha256 hash chain), JSONL files; no library needed.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

export interface DEvent { id: string; ts: string; run: string; kind: string; sha_prev: string; [k: string]: unknown }
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export const runId = () => process.env.DAYLIGHT_RUN || 'adhoc-' + new Date().toISOString().slice(0, 10);
export const auditFile = (cwd: string, run = runId()) => join(cwd, '.daylight', 'audit', run + '.jsonl');

export function readLines(file: string): string[] {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
}
export function append(file: string, fields: { kind: string; [k: string]: unknown }, run = runId()): DEvent {
  mkdirSync(dirname(file), { recursive: true });
  const lines = readLines(file);
  const prev = lines.length ? sha(lines[lines.length - 1]) : 'genesis';
  const ev = { id: 'e' + (lines.length + 1), ts: new Date().toISOString(), run, ...fields, sha_prev: prev } as DEvent;
  appendFileSync(file, JSON.stringify(ev) + '\n');
  return ev;
}
