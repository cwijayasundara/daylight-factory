// Reuses: claude -p --output-format json usage and the session transcript (Code Mode runs are interactive-only, so its arm is read from a transcript).
// Custom: arm extraction + an honest comparison (no savings claimed unless the data show them, AC-88).
import { readFileSync } from 'node:fs';

export interface Arm { input: number; output: number; cacheRead: number; trips: number; ms: number }
export function fromTranscript(file: string, start: string, end: string): Arm {
  const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean);
  const b = lines.length - 1 - [...lines].reverse().findIndex((l) => l.includes(end));
  const a = lines.slice(0, b + 1).map((l, i) => (l.includes(start) ? i : -1)).filter((i) => i >= 0).pop() ?? 0; // last start marker before the end marker
  const arm: Arm = { input: 0, output: 0, cacheRead: 0, trips: 0, ms: 0 };
  const seg = lines.slice(a, b + 1).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  for (const m of seg.filter((x) => x.type === 'assistant')) {
    const u = m.message?.usage ?? {};
    arm.input += (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0); arm.output += u.output_tokens ?? 0; arm.cacheRead += u.cache_read_input_tokens ?? 0;
    if ((m.message?.content ?? []).some((c: any) => c.type === 'tool_use')) arm.trips++;
  }
  const ts = seg.map((x) => Date.parse(x.timestamp)).filter(Number.isFinite);
  arm.ms = ts.length ? Math.max(...ts) - Math.min(...ts) : 0;
  return arm;
}
export function fromP(file: string): Arm {
  const j = JSON.parse(readFileSync(file, 'utf8')), u = j.usage ?? {};
  return { input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, trips: j.num_turns ?? 0, ms: j.duration_ms ?? 0 };
}
export function compare(on: Arm, off: Arm): string {
  if (!on.trips && !on.input && !on.output) return 'The Code Mode arm could not be measured from the transcript (no assistant turns or usage in the window); no comparison is made and no savings are claimed.\n';
  const tot = (a: Arm) => a.input + a.output, pct = (a: number, b: number) => Math.round((100 * (b - a)) / b);
  const rows = [['input tokens', on.input, off.input], ['output tokens', on.output, off.output], ['cache-read tokens', on.cacheRead, off.cacheRead], ['tool round trips', on.trips, off.trips], ['wall-clock (s)', (on.ms / 1000).toFixed(1), (off.ms / 1000).toFixed(1)]];
  const verdict = (name: string, a: number, b: number, word: string) => (a < b ? 'Code Mode used ' + pct(a, b) + '% ' + word + ' in this sample (' + a + ' vs ' + b + ').' : 'No ' + name + ' savings observed in this sample (on ' + a + ' vs off ' + b + ').');
  return '| metric | Code Mode on | Code Mode off |\n|---|---|---|\n' + rows.map((r) => '| ' + r.join(' | ') + ' |').join('\n') + '\n\n' +
    verdict('token', tot(on), tot(off), 'fewer tokens') + '\n' + verdict('round-trip', on.trips, off.trips, 'fewer round trips') + '\n' + verdict('wall-clock', on.ms, off.ms, 'less wall-clock time') + '\nSingle-sample result: no generalisation is claimed.\n';
}
