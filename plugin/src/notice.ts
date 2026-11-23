// Reuses: Claude Code UserPromptSubmit hook (stdout is shown to the model/user). Prints the degraded-evaluator warning (AC-112).
// Vibe mode: also injects the daylight guides + outstanding sensor findings into every prompt, so the harness applies to plain vibe coding too.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modeOn, readVibeState } from './mode.ts';
try {
  const p = JSON.parse(readFileSync(0, 'utf8')), cwd = p.cwd ?? process.cwd();
  const f = join(cwd, '.daylight/state/degraded');
  if (existsSync(f)) console.log('Daylight WARNING: a degraded evaluator (fallback model) graded work in this run. Verdicts are marked degraded and cannot be the only approval; a human decision is required. ' + readFileSync(f, 'utf8').trim());
  if (modeOn(cwd)) {
    const guides = join(dirname(fileURLToPath(import.meta.url)), '..', 'rules', 'guides.md');
    const lines = existsSync(guides) ? readFileSync(guides, 'utf8').split('\n').filter((l) => l.startsWith('- ')).map((l) => '  ' + l) : [];
    console.log('[daylight vibe mode is ON — every edit is held to the factory standard]');
    if (lines.length) console.log('Daylight guides:\n' + lines.join('\n'));
    const v = readVibeState(cwd);
    if (v && !v.ok) console.log('Outstanding vibe sensor failures (fix these first):\n- ' + v.messages.join('\n- '));
  }
} catch { /* never block a prompt */ }
