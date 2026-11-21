// Reuses: ADR-010 (state lives in files, not the session). Plain JSON; no library.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface GateState { status: 'pending' | 'approved' | 'rejected' | 'escalated'; revision: number; rejections: number; hashes?: Record<string, string>; feedback?: string; source?: string; scores?: Record<string, number>; head?: string }
export interface State { gates: Record<string, GateState>; [k: string]: unknown }
const f = (cwd: string) => join(cwd, '.daylight', 'state.json');
export const load = (cwd: string): State => (existsSync(f(cwd)) ? JSON.parse(readFileSync(f(cwd), 'utf8')) : { gates: {} });
export function save(cwd: string, s: State) { mkdirSync(join(cwd, '.daylight'), { recursive: true }); writeFileSync(f(cwd), JSON.stringify(s, null, 2)); }
