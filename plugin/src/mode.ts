// Reuses: config.ts defaults + sensors.ts. Glue: persistent "vibe mode" state so hooks can enforce the harness on every session, not only inside daylight runs.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export interface VibeMode { enabled: boolean; since: string; sensors: string[] }
/** Fast sensors only by default: a Stop hook must never hang the session (tests are opt-in). */
export const FAST_SENSORS = ['secrets', 'complexity', 'duplication', 'layers', 'advisories'];

export const modeFile = (cwd: string) => join(cwd, '.daylight', 'mode.json');
export const vibeState = (cwd: string) => join(cwd, '.daylight', 'state', 'vibe-last.json');

export function readMode(cwd: string): VibeMode | null {
  try { return JSON.parse(readFileSync(modeFile(cwd), 'utf8')); } catch { return null; }
}
export const modeOn = (cwd: string) => readMode(cwd)?.enabled === true;

export function setMode(cwd: string, on: boolean, sensors?: string[]): VibeMode {
  const clean = [...new Set((sensors ?? readMode(cwd)?.sensors ?? ['secrets', 'complexity', 'duplication']).filter((s) => FAST_SENSORS.includes(s)))];
  const m: VibeMode = { enabled: on, since: new Date().toISOString(), sensors: clean };
  mkdirSync(join(cwd, '.daylight'), { recursive: true });
  writeFileSync(modeFile(cwd), JSON.stringify(m, null, 2) + '\n');
  return m;
}

/** Persisted last sensor outcome so UserPromptSubmit can re-surface failures until they are fixed. */
export function writeVibeState(cwd: string, ok: boolean, messages: string[]) {
  mkdirSync(join(cwd, '.daylight', 'state'), { recursive: true });
  writeFileSync(vibeState(cwd), JSON.stringify({ ts: new Date().toISOString(), ok, messages: messages.slice(0, 10) }, null, 2) + '\n');
}
export function readVibeState(cwd: string): { ok: boolean; messages: string[] } | null {
  try { return JSON.parse(readFileSync(vibeState(cwd), 'utf8')); } catch { return null; }
}
export const exists2 = (p: string) => existsSync(p);
