// Reuses: sensors.ts runFast, mode.ts, lib/events.ts ledger. Glue: Stop hook that keeps vibe-coding inside the daylight harness.
// Claude Code Stop protocol: JSON {"decision":"block","reason"} on stdout forces the session to address the findings instead of stopping.
import { readFileSync } from 'node:fs';
import { resolveConfig } from './config.ts';
import { runFast } from './sensors.ts';
import { modeOn, readMode, writeVibeState } from './mode.ts';
import { append, auditFile } from './lib/events.ts';

try {
  const p = JSON.parse(readFileSync(0, 'utf8')), cwd = p.cwd ?? process.cwd();
  if (modeOn(cwd)) {
    const cfg = resolveConfig(cwd, {});
    const only = readMode(cwd)?.sensors;
    const { ok, results } = runFast(cwd, cfg, only);
    const messages = results.filter((r) => !r.ok).flatMap((r) => r.messages);
    writeVibeState(cwd, ok, messages);
    append(auditFile(cwd), { kind: 'x_vibe', phase: 'vibe', ok, sensors: only ?? [], messages: messages.slice(0, 5) });
    if (!ok) console.log(JSON.stringify({ decision: 'block', reason: 'Daylight vibe sensors failed — fix these before stopping:\n- ' + messages.slice(0, 10).join('\n- ') }));
  }
} catch (e) { console.error('daylight vibe error: ' + (e as Error).message); }
