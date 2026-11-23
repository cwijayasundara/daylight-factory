// Reuses: node:crypto (sha256 hash chain), JSONL files; secret patterns follow gitleaks-style prefixes.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';

export interface DEvent { id: string; ts: string; run: string; kind: string; sha_prev: string; [k: string]: unknown }
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

export const runId = () => (process.env.DAYLIGHT_RUN || 'adhoc-' + new Date().toISOString().slice(0, 10)).replace(/["'\s]/g, '');
// DAYLIGHT_AUDIT_ROOT lets hooks fired inside task worktrees write to the run's main log
export const auditFile = (cwd: string, run = runId()) => join(process.env.DAYLIGHT_AUDIT_ROOT || cwd, '.daylight', 'audit', run + '.jsonl');

export const SECRETS = [/AKIA[0-9A-Z]{16}/g, /gh[pousr]_[A-Za-z0-9]{30,}/g, /sk-[A-Za-z0-9_-]{20,}/g, /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, /xox[baprs]-[A-Za-z0-9-]{10,}/g, /((?:password|passwd|secret|api[_-]?key)\s*[=:]\s*)[^\s"',;]{6,}/gi];
export const redact = (s: string) => SECRETS.reduce((t, re, i) => t.replace(re, i === SECRETS.length - 1 ? '$1[REDACTED]' : '[REDACTED]'), s);

export function readLines(file: string): string[] {
  return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
}
export function append(file: string, fields: { kind: string; [k: string]: unknown }, run = runId()): DEvent {
  mkdirSync(dirname(file), { recursive: true });
  const lines = readLines(file);
  const prev = lines.length ? sha(lines[lines.length - 1]) : 'genesis';
  const ev = { id: 'e' + (lines.length + 1), ts: new Date().toISOString(), run, ...fields, sha_prev: prev } as DEvent;
  const line = redact(JSON.stringify(ev));
  appendFileSync(file, line + '\n');
  writeFileSync(file + '.head', (lines.length + 1) + ' ' + sha(line) + '\n');
  return JSON.parse(line);
}
export function verify(file: string): string[] {
  const lines = readLines(file);
  const errs: string[] = [];
  let prev = 'genesis';
  lines.forEach((l, i) => {
    let ev: DEvent;
    try { ev = JSON.parse(l); } catch { errs.push('line ' + (i + 1) + ': not JSON'); return; }
    if (ev.sha_prev !== prev) errs.push('line ' + (i + 1) + ': hash chain broken');
    prev = sha(l);
  });
  const head = existsSync(file + '.head') ? readFileSync(file + '.head', 'utf8').trim() : '';
  if (head && head !== lines.length + ' ' + prev) errs.push('head anchor mismatch (lines removed or altered at the tail)');
  return errs;
}

const COMMON = ['id', 'ts', 'run', 'kind', 'sha_prev'];
export const KINDS: Record<string, string[]> = {
  doctor: ['summary'], tool_pre: ['tool'], tool_post: ['tool'], repl_pre: ['code'], repl_post: ['code'],
  subagent_start: ['role'], subagent_stop: ['role', 'tokens'], sensor: ['name', 'ok'], verdict: ['role', 'verdict'],
  gate: ['gate', 'decision', 'source'], phase: ['name'], triage: ['work_item', 'tier', 'size', 'rationale'], degraded_evaluator: ['task', 'from', 'to'],
};
export function validateLog(file: string): string[] {
  const errs: string[] = [];
  readLines(file).forEach((l, i) => {
    const ev = JSON.parse(l);
    const need = KINDS[ev.kind];
    if (!need && !String(ev.kind).startsWith('x_')) { errs.push('line ' + (i + 1) + ': unknown kind ' + ev.kind); return; }
    for (const k of [...COMMON, ...(need ?? [])]) if (!(k in ev)) errs.push('line ' + (i + 1) + ': ' + ev.kind + ' event missing "' + k + '"');
  });
  return errs;
}
