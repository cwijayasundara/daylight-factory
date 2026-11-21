// Reuses: Claude Code hook payloads (PreToolUse/PostToolUse/SubagentStart/Stop). Glue only: map payload -> event.
import { existsSync, readFileSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { append, auditFile } from './lib/events.ts';

const cap = (v: unknown, n = 2000) => { const s = typeof v === 'string' ? v : JSON.stringify(v ?? null); return s.length > n ? s.slice(0, n) + '…[+' + (s.length - n) + ']' : s; };

export function sumUsage(path?: string): { input: number; output: number } | null {
  if (!path || !existsSync(path)) return null;
  let input = 0, output = 0, seen = false;
  for (const l of readFileSync(path, 'utf8').split('\n').filter(Boolean)) {
    try { const u = JSON.parse(l)?.message?.usage; if (u) { seen = true; input += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) * 0; output += u.output_tokens ?? 0; } } catch { /* skip */ }
  }
  return seen ? { input, output } : null;
}

export function handle(p: any, cwd: string) {
  const file = auditFile(cwd);
  const ev = p.hook_event_name as string;
  const model = p.model ?? process.env.ANTHROPIC_MODEL ?? process.env.DAYLIGHT_MODEL ?? 'unknown';
  const common = { actor: 'main', model, effort: p.effort?.level ?? null, session: p.session_id };
  const marker = join(cwd, '.daylight', 'state', 'open-repl.json');
  if (ev === 'SubagentStart') return append(file, { kind: 'subagent_start', role: p.agent_type, agent_id: p.agent_id, ...common, actor: p.agent_type });
  if (ev === 'SubagentStop') return append(file, { kind: 'subagent_stop', role: p.agent_type, agent_id: p.agent_id, tokens: sumUsage(p.agent_transcript_path), ...common, actor: p.agent_type });
  if (ev === 'Stop') return append(file, { kind: 'x_stop', ...common });
  if (p.tool_name === 'REPL') {
    const pre = ev === 'PreToolUse';
    const r = p.tool_response ?? {};
    const out = append(file, pre
      ? { kind: 'repl_pre', code: p.tool_input?.code ?? '', tool: 'REPL', tool_use_id: p.tool_use_id, ...common }
      : { kind: 'repl_post', code: r.code ?? p.tool_input?.code ?? '', result: r.result ?? null, stdout: r.stdout ?? null, stderr: r.stderr ?? null, toolsUsed: r.toolsUsed ?? null, error: p.error ?? null, duration_ms: p.duration_ms ?? null, tool: 'REPL', tool_use_id: p.tool_use_id, ...common });
    if (pre) { mkdirSync(join(cwd, '.daylight', 'state'), { recursive: true }); writeFileSync(marker, JSON.stringify({ id: out.id })); }
    else if (existsSync(marker)) unlinkSync(marker);
    return out;
  }
  let parent_id: string | undefined;
  if (existsSync(marker)) parent_id = JSON.parse(readFileSync(marker, 'utf8')).id;
  const base: any = { tool: p.tool_name, tool_use_id: p.tool_use_id, ...common, ...(parent_id ? { parent_id } : {}) };
  if (ev === 'PreToolUse') return append(file, { kind: 'tool_pre', ...base, summary: { input: cap(p.tool_input) } });
  return append(file, { kind: 'tool_post', ...base, summary: { input: cap(p.tool_input), output: cap(p.tool_response ?? p.error, 4000) }, duration_ms: p.duration_ms ?? null });
}
