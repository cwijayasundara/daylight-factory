// Reuses: Claude Code's own settings mechanism (we only detect and instruct; the plugin never sets the variable).
import { append, auditFile } from './lib/events.ts';

const VAR = ['CLAUDE_CODE', 'EXPERIMENTAL', 'CODE_MODE'].join('_');
export type Mode = 'on' | 'off' | 'unknown';
export function detect(v: string | undefined): Mode {
  if (v === undefined || v === '' || v === '0' || v === 'false') return 'off';
  return v === '1' || v === 'true' ? 'on' : 'unknown';
}
export const instruction = () =>
  'Code Mode is a user-level setting (project settings ignore it). Add {"env": {"' + VAR + '": "1"}} to ~/.claude/settings.json and restart Claude Code.';

export function doctor(cwd: string, env = process.env) {
  const codeMode = detect(env[VAR]);
  const result: { codeMode: Mode; node: string; instruction?: string } = { codeMode, node: process.version };
  if (codeMode !== 'on') result.instruction = instruction();
  append(auditFile(cwd), { kind: 'doctor', phase: 'setup', actor: 'daylight', summary: result });
  return result;
}
