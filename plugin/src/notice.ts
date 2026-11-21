// Reuses: Claude Code UserPromptSubmit hook (stdout is shown to the model/user). Prints the degraded-evaluator warning (AC-112).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
try {
  const p = JSON.parse(readFileSync(0, 'utf8')), f = join(p.cwd ?? process.cwd(), '.daylight/state/degraded');
  if (existsSync(f)) console.log('Daylight WARNING: a degraded evaluator (fallback model) graded work in this run. Verdicts are marked degraded and cannot be the only approval; a human decision is required. ' + readFileSync(f, 'utf8').trim());
} catch { /* never block a prompt */ }
